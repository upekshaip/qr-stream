// Headless transfer simulation — no camera, no canvas, runs in Node.
//
// Separates PROTOCOL efficiency from optics: the same cycle structure and
// frame ordering the real TxEngine uses (shared via cycleOrder/planStructure)
// is played against a parametric receiver model (sampling period, per-cell
// detection probability, whole-frame loss). Used for research A/B runs
// (e.g. rotatePerCycle on/off across receiver speeds) and as CI regression
// tests for ordering/coverage claims.

import type { GridSize } from "./types";
import { cycleOrder } from "./txEngine";

/**
 * Deterministic 32-bit PRNG (mulberry32). The same seed always yields the
 * same sequence — use it for reproducible experiments and simulations.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parametric receiver/channel model for simulateTransfer. */
export interface ChannelModel {
  /**
   * Probability that an individual visible QR cell decodes on a sampled
   * frame (optics quality). Default 1 (perfect).
   */
  cellDetectProb?: number;
  /**
   * The receiver decodes every k-th displayed slot — its decode period in
   * slot units. 1 = keeps up with the frame rate; 2 = half speed (the
   * phase-lock regime); fractional values allowed. Default 1.
   */
  samplingPeriod?: number;
  /** Probability an entire sampled frame is lost (blur/tearing). Default 0. */
  frameLossProb?: number;
}

export interface SimulateOptions {
  /** number of DATA chunks in the stream (>= 1) */
  totalChunks: number;
  gridSize: GridSize;
  /** META repetition cadence (mirrors FramePlanOptions.metaEvery); default once per cycle */
  metaEvery?: number;
  /** shuffle frame order each cycle (mirrors TxEngineOptions.rotatePerCycle); default false */
  rotatePerCycle?: boolean;
  channel?: ChannelModel;
  /** stop after this many full cycles if incomplete; default 50 */
  maxCycles?: number;
  /** frame interval used only to convert slots to milliseconds; default 300 */
  intervalMs?: number;
  /** random source; pass mulberry32(seed) for reproducible runs. Default Math.random */
  random?: () => number;
}

/** Per-cycle coverage statistics (the coverage curve). */
export interface CycleStats {
  /** 1-based cycle number */
  cycle: number;
  /** unique chunks first decoded during this cycle */
  newChunks: number;
  /** cumulative unique chunks / totalChunks at the end of this cycle */
  coverage: number;
  /** decodes of already-known chunks during this cycle */
  duplicates: number;
  /** cumulative: META decoded by the end of this cycle */
  metaSeen: boolean;
}

export interface SimulationResult {
  /** all chunks decoded AND META seen within maxCycles */
  completed: boolean;
  /** 1-based cycle in which the transfer completed, or null */
  cyclesToComplete: number | null;
  /** total slots displayed until completion (or until maxCycles ran out) */
  slotsElapsed: number;
  /** slotsToComplete × intervalMs, or null when incomplete */
  timeToCompleteMs: number | null;
  uniqueChunks: number;
  duplicateDecodes: number;
  /** frames the modeled receiver actually sampled */
  framesSampled: number;
  /** slot at which META first decoded, or null */
  metaSeenAtSlot: number | null;
  /** the coverage curve, one entry per (possibly partial) cycle */
  perCycle: CycleStats[];
}

/**
 * Structural mirror of buildFramePlan: which frames exist in one cycle and
 * which chunk sequence numbers each data frame carries — without touching
 * chunk bytes or base64. Pinned to buildFramePlan by a unit test so the two
 * cannot drift. Research utility.
 */
export function planStructure(
  totalChunks: number,
  gridSize: GridSize,
  metaEvery?: number
): { isMeta: boolean; seqs: number[] }[] {
  const perFrame = gridSize * gridSize;
  const every = metaEvery && metaEvery > 0 ? metaEvery : Infinity;
  const frames: { isMeta: boolean; seqs: number[] }[] = [{ isMeta: true, seqs: [] }];
  let f = 0;
  for (let start = 0; start < totalChunks; start += perFrame) {
    if (f > 0 && f % every === 0) frames.push({ isMeta: true, seqs: [] });
    const seqs: number[] = [];
    for (let c = start; c < Math.min(start + perFrame, totalChunks); c++) seqs.push(c);
    frames.push({ isMeta: false, seqs });
    f++;
  }
  return frames;
}

/**
 * Simulate a cyclic QR stream against a modeled receiver and return coverage
 * and completion statistics. Deterministic when `random` is seeded.
 *
 * @example
 * const slow = simulateTransfer({
 *   totalChunks: 64, gridSize: 1, rotatePerCycle: true,
 *   channel: { samplingPeriod: 2 }, random: mulberry32(42),
 * });
 * console.log(slow.cyclesToComplete);
 */
export function simulateTransfer(opts: SimulateOptions): SimulationResult {
  if (!Number.isInteger(opts.totalChunks) || opts.totalChunks < 1) {
    throw new RangeError(`totalChunks must be a positive integer, got ${opts.totalChunks}`);
  }
  const rnd = opts.random ?? Math.random;
  const cellDetectProb = opts.channel?.cellDetectProb ?? 1;
  const samplingPeriod = opts.channel?.samplingPeriod ?? 1;
  const frameLossProb = opts.channel?.frameLossProb ?? 0;
  const maxCycles = opts.maxCycles ?? 50;
  const intervalMs = opts.intervalMs ?? 300;

  const structure = planStructure(opts.totalChunks, opts.gridSize, opts.metaEvery);
  const n = structure.length;

  const decoded = new Set<number>();
  const perCycle: CycleStats[] = [];
  let duplicateDecodes = 0;
  let framesSampled = 0;
  let metaSeenAtSlot: number | null = null;
  let completedAtSlot: number | null = null;
  let slot = 0;
  let nextSampleAt = 0;

  outer: for (let cycle = 0; cycle < maxCycles; cycle++) {
    const order = cycleOrder(n, cycle, !!opts.rotatePerCycle, rnd);
    let newChunks = 0;
    let cycleDuplicates = 0;

    for (let pos = 0; pos < n; pos++) {
      const frame = structure[order[pos]];
      if (slot >= nextSampleAt) {
        nextSampleAt += samplingPeriod;
        framesSampled++;
        if (rnd() >= frameLossProb) {
          if (frame.isMeta) {
            if (rnd() < cellDetectProb && metaSeenAtSlot === null) metaSeenAtSlot = slot;
          } else {
            for (const seq of frame.seqs) {
              if (rnd() < cellDetectProb) {
                if (decoded.has(seq)) {
                  duplicateDecodes++;
                  cycleDuplicates++;
                } else {
                  decoded.add(seq);
                  newChunks++;
                }
              }
            }
          }
          if (
            completedAtSlot === null &&
            decoded.size === opts.totalChunks &&
            metaSeenAtSlot !== null
          ) {
            completedAtSlot = slot;
          }
        }
      }
      slot++;
      if (completedAtSlot !== null) {
        perCycle.push({
          cycle: cycle + 1,
          newChunks,
          coverage: decoded.size / opts.totalChunks,
          duplicates: cycleDuplicates,
          metaSeen: metaSeenAtSlot !== null,
        });
        break outer;
      }
    }

    if (completedAtSlot === null) {
      perCycle.push({
        cycle: cycle + 1,
        newChunks,
        coverage: decoded.size / opts.totalChunks,
        duplicates: cycleDuplicates,
        metaSeen: metaSeenAtSlot !== null,
      });
    }
  }

  return {
    completed: completedAtSlot !== null,
    cyclesToComplete: completedAtSlot !== null ? perCycle.length : null,
    slotsElapsed: slot,
    timeToCompleteMs: completedAtSlot !== null ? (completedAtSlot + 1) * intervalMs : null,
    uniqueChunks: decoded.size,
    duplicateDecodes,
    framesSampled,
    metaSeenAtSlot,
    perCycle,
  };
}
