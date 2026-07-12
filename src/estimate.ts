// Time estimation + experiment-campaign expansion. Research utilities:
// pure arithmetic over the protocol's frame-plan structure — no DOM, no
// timers — so everything here runs in Node and is unit-testable.
//
// The transfer-time estimate doubles as the theoretical baseline model the
// research compares measured transfer times against (predicted vs measured).

import { estimateCycleMs } from "./qrGen";
import { planStructure } from "./simulate";
import { SWEEP, isChunkEcValid } from "./config";
import type { EcLevel, GridSize } from "./types";

/** Inputs shared by the per-stream timing estimators. */
export interface StreamTimingOptions {
  /** File / payload size in bytes. */
  payloadBytes: number;
  /** Data bytes carried per QR code. */
  chunkBytes: number;
  gridSize: GridSize;
  intervalMs: number;
  /** META repetition cadence (undefined/null = once per cycle). */
  metaEvery?: number | null;
}

/** Structural + timing breakdown of one full transmission cycle. */
export interface CycleEstimate {
  totalChunks: number;
  /** Frames in one cycle, META frame(s) included. */
  framesPerCycle: number;
  /** Duration of one full cycle at the given frame interval. */
  cycleMs: number;
}

/**
 * Estimate the structure and duration of one full cycle. Frame counting
 * delegates to `planStructure`, the same model the simulator and the
 * transmit engine ordering share, so META accounting cannot drift.
 */
export function estimateCycle(opts: StreamTimingOptions): CycleEstimate {
  const totalChunks = Math.max(1, Math.ceil(opts.payloadBytes / opts.chunkBytes));
  const framesPerCycle = planStructure(
    totalChunks,
    opts.gridSize,
    opts.metaEvery ?? undefined
  ).length;
  return {
    totalChunks,
    framesPerCycle,
    cycleMs: estimateCycleMs(framesPerCycle, opts.intervalMs),
  };
}

/**
 * Theoretical minimum transfer time (ms): one clean pass in which the
 * receiver decodes every frame on first airing. Real transfers only ever
 * take longer (missed frames cost whole extra cycles on a simplex link),
 * which is what makes this the natural baseline for predicted-vs-measured
 * analysis.
 */
export function estimateTransferTimeMs(opts: StreamTimingOptions): number {
  return estimateCycle(opts).cycleMs;
}

/** Tuning knobs for `recommendWindowMs`. */
export interface WindowRecommendationOptions {
  /** Full cycles the window should cover (default 2: one clean pass + one retry pass). */
  cycles?: number;
  /** Fixed settling margin added on top (default 500 ms). */
  slackMs?: number;
}

/**
 * Recommended capture window for a measurement run of this configuration.
 * A window shorter than one full cycle can never complete — e.g. 4096 B in
 * 384 B chunks on a 1×1 grid @ 1000 ms needs ~12 s/pass, so the historical
 * 6 s default window made that cell fail by construction. Default margin is
 * two full cycles plus slack.
 */
export function recommendWindowMs(
  opts: StreamTimingOptions,
  rec: WindowRecommendationOptions = {}
): number {
  const { cycles = 2, slackMs = 500 } = rec;
  return Math.ceil(estimateCycle(opts).cycleMs * Math.max(1, cycles) + slackMs);
}

/** Inputs for whole-sweep wall-clock estimation. */
export interface SweepDurationOptions {
  runCount: number;
  /** Capture window per run (ms). */
  windowMs: number;
  /** Idle gap between consecutive runs (ms). */
  gapMs: number;
  /** Arm delay before each run (default: the harness SWEEP arm delay). */
  armDelayMs?: number;
}

/**
 * Wall-clock duration (ms) of a measurement sweep: every run costs
 * arm delay + capture window, with a gap between runs (none after the last).
 */
export function estimateSweepDurationMs(opts: SweepDurationOptions): number {
  const { runCount, windowMs, gapMs, armDelayMs = SWEEP.armDelayMs } = opts;
  if (runCount <= 0) return 0;
  return runCount * (armDelayMs + windowMs) + (runCount - 1) * gapMs;
}

/**
 * A named measurement campaign: the cross product of every listed grid,
 * frame interval, chunk size, and payload size, each repeated
 * `runsPerConfig` times. Generic instrumentation — concrete campaign
 * presets belong to the consuming application.
 */
export interface CampaignSpec {
  /** Machine-friendly name; ends up in export filenames — keep it slug-like. */
  name: string;
  grids: GridSize[];
  intervals: number[];
  chunkOptions: number[];
  payloadOptions: number[];
  ecLevel: EcLevel;
  runsPerConfig: number;
  /** Capture window per run (ms). */
  windowMs: number;
  /** Idle gap between runs (ms). */
  gapMs: number;
  /** PRNG seed for the synthetic payload. */
  seed: number;
  rotatePerCycle: boolean;
  /** META repetition cadence (null = once per cycle). */
  metaEvery?: number | null;
}

/** One concrete measurement run produced by `expandCampaign`. */
export interface RunSpec {
  /**
   * Unique within the campaign: `1x1@300ms#r1`, gaining `/cNNN` / `pNNNN`
   * segments only for dimensions the campaign actually varies
   * (e.g. `2x2@300ms/c512#r3`).
   */
  testId: string;
  campaign: string;
  gridSize: GridSize;
  intervalMs: number;
  chunkBytes: number;
  payloadBytes: number;
  ecLevel: EcLevel;
  /** 0-based repetition index. */
  runIndex: number;
  seed: number;
  windowMs: number;
  gapMs: number;
  rotatePerCycle: boolean;
  metaEvery: number | null;
}

/**
 * Expand a campaign into its ordered run list (grids → intervals → chunk
 * sizes → payload sizes → repetitions).
 *
 * @throws Error when the spec is empty in any dimension or contains a chunk
 *   size that cannot fit in a single QR at the campaign's EC level.
 */
export function expandCampaign(spec: CampaignSpec): RunSpec[] {
  const { grids, intervals, chunkOptions, payloadOptions } = spec;
  if (
    grids.length === 0 ||
    intervals.length === 0 ||
    chunkOptions.length === 0 ||
    payloadOptions.length === 0 ||
    spec.runsPerConfig <= 0
  ) {
    throw new Error(`campaign "${spec.name}": every dimension needs at least one value`);
  }
  for (const c of chunkOptions) {
    if (!isChunkEcValid(c, spec.ecLevel)) {
      throw new Error(
        `campaign "${spec.name}": chunk size ${c} B does not fit in a single QR at EC level ${spec.ecLevel}`
      );
    }
  }
  const tagChunk = chunkOptions.length > 1;
  const tagPayload = payloadOptions.length > 1;
  const runs: RunSpec[] = [];
  for (const gridSize of grids) {
    for (const intervalMs of intervals) {
      for (const chunkBytes of chunkOptions) {
        for (const payloadBytes of payloadOptions) {
          for (let runIndex = 0; runIndex < spec.runsPerConfig; runIndex++) {
            let testId = `${gridSize}x${gridSize}@${intervalMs}ms`;
            if (tagChunk) testId += `/c${chunkBytes}`;
            if (tagPayload) testId += `/p${payloadBytes}`;
            testId += `#r${runIndex + 1}`;
            runs.push({
              testId,
              campaign: spec.name,
              gridSize,
              intervalMs,
              chunkBytes,
              payloadBytes,
              ecLevel: spec.ecLevel,
              runIndex,
              seed: spec.seed,
              windowMs: spec.windowMs,
              gapMs: spec.gapMs,
              rotatePerCycle: spec.rotatePerCycle,
              metaEvery: spec.metaEvery ?? null,
            });
          }
        }
      }
    }
  }
  return runs;
}

/** Wall-clock duration (ms) of one whole campaign. */
export function estimateCampaignDurationMs(spec: CampaignSpec): number {
  return estimateSweepDurationMs({
    runCount: expandCampaign(spec).length,
    windowMs: spec.windowMs,
    gapMs: spec.gapMs,
  });
}
