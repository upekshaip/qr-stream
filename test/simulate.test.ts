import { describe, expect, it } from "vitest";
import { mulberry32, planStructure, simulateTransfer } from "../src/simulate";
import { buildFramePlan } from "../src/qrGen";
import { PROTOCOL } from "../src/protocol";
import type { FileMeta, GridSize } from "../src/types";

describe("planStructure ≡ buildFramePlan (drift pin)", () => {
  it("mirrors frame layout and per-frame seqs exactly", () => {
    for (const [total, grid, metaEvery] of [
      [1, 1, undefined], [37, 2, 5], [118, 1, 16], [64, 3, 4], [9, 3, undefined],
    ] as [number, GridSize, number | undefined][]) {
      const chunks = Array.from({ length: total }, () => new Uint8Array(4));
      const meta: FileMeta = {
        protocol: PROTOCOL, name: "f", size: total * 4, sha256: "00".repeat(32),
        total, chunkBytes: 4,
      };
      const real = buildFramePlan(chunks, meta, grid, { metaEvery });
      const sim = planStructure(total, grid, metaEvery);
      expect(sim.length).toBe(real.length);
      for (let i = 0; i < real.length; i++) {
        expect(sim[i].isMeta).toBe(real[i].isMeta);
        const realSeqs = real[i].isMeta ? [] : real[i].cells.map((c) => Number(c.split("|", 3)[1]));
        expect(sim[i].seqs).toEqual(realSeqs);
      }
    }
  });
});

describe("simulateTransfer", () => {
  it("is reproducible under the same seed", () => {
    const opts = () => ({
      totalChunks: 50, gridSize: 1 as GridSize, metaEvery: 16, rotatePerCycle: true,
      channel: { samplingPeriod: 2, cellDetectProb: 0.9, frameLossProb: 0.05 },
      random: mulberry32(99),
    });
    expect(simulateTransfer(opts())).toEqual(simulateTransfer(opts()));
  });

  it("perfect channel at full speed completes in one cycle with no duplicates", () => {
    const r = simulateTransfer({ totalChunks: 20, gridSize: 1 });
    expect(r.completed).toBe(true);
    expect(r.cyclesToComplete).toBe(1);
    expect(r.duplicateDecodes).toBe(0);
    expect(r.metaSeenAtSlot).toBe(0);
  });

  it("total frame loss never completes", () => {
    const r = simulateTransfer({
      totalChunks: 10, gridSize: 1, channel: { frameLossProb: 1 }, maxCycles: 5,
    });
    expect(r.completed).toBe(false);
    expect(r.uniqueChunks).toBe(0);
  });

  it("coverage is monotonically non-decreasing", () => {
    const r = simulateTransfer({
      totalChunks: 80, gridSize: 2 as GridSize, rotatePerCycle: true,
      channel: { samplingPeriod: 3, cellDetectProb: 0.8 }, random: mulberry32(3),
    });
    for (let i = 1; i < r.perCycle.length; i++) {
      expect(r.perCycle[i].coverage).toBeGreaterThanOrEqual(r.perCycle[i - 1].coverage);
    }
  });

  it("PHASE-LOCK: a half-speed receiver stalls without rotation, completes with it", () => {
    // The thesis claim behind TxEngineOptions.rotatePerCycle, as a regression test.
    const base = {
      totalChunks: 64, gridSize: 1 as GridSize, metaEvery: 16, maxCycles: 50,
      channel: { samplingPeriod: 2 },
    };
    const stuck = simulateTransfer({ ...base, rotatePerCycle: false, random: mulberry32(1) });
    expect(stuck.completed).toBe(false);
    expect(stuck.uniqueChunks).toBeLessThan(64);
    // coverage plateaus: the last 10 cycles add nothing
    const tail = stuck.perCycle.slice(-10);
    expect(tail.every((c) => c.newChunks === 0)).toBe(true);

    const rotated = simulateTransfer({ ...base, rotatePerCycle: true, random: mulberry32(1) });
    expect(rotated.completed).toBe(true);
  });

  it("rotation completes for every slow sampling period k=2..5", () => {
    for (const k of [2, 3, 4, 5]) {
      const r = simulateTransfer({
        totalChunks: 64, gridSize: 1, metaEvery: 16, rotatePerCycle: true,
        channel: { samplingPeriod: k }, maxCycles: 50, random: mulberry32(k),
      });
      expect(r.completed, `samplingPeriod ${k}`).toBe(true);
    }
  });

  it("rejects a non-positive totalChunks", () => {
    expect(() => simulateTransfer({ totalChunks: 0, gridSize: 1 })).toThrow(RangeError);
  });
});
