import { describe, expect, it } from "vitest";
import {
  estimateCycle,
  estimateTransferTimeMs,
  recommendWindowMs,
  estimateSweepDurationMs,
  expandCampaign,
  estimateCampaignDurationMs,
  type CampaignSpec,
} from "../src/estimate";
import { planStructure } from "../src/simulate";
import { SWEEP } from "../src/config";
import type { GridSize } from "../src/types";

const baseCampaign: CampaignSpec = {
  name: "test-campaign",
  grids: [1, 2],
  intervals: [150, 300],
  chunkOptions: [384],
  payloadOptions: [4096],
  ecLevel: "M",
  runsPerConfig: 3,
  windowMs: 6000,
  gapMs: 1000,
  seed: 1,
  rotatePerCycle: false,
};

describe("estimateCycle", () => {
  it("matches planStructure frame counts, META included", () => {
    for (const gridSize of [1, 2, 3] as GridSize[]) {
      for (const metaEvery of [undefined, 2, 5]) {
        const est = estimateCycle({
          payloadBytes: 4096,
          chunkBytes: 384,
          gridSize,
          intervalMs: 300,
          metaEvery,
        });
        expect(est.totalChunks).toBe(11);
        expect(est.framesPerCycle).toBe(planStructure(11, gridSize, metaEvery).length);
        expect(est.cycleMs).toBe(est.framesPerCycle * 300);
      }
    }
  });

  it("never reports zero chunks, even for payloads below one chunk", () => {
    const est = estimateCycle({ payloadBytes: 10, chunkBytes: 384, gridSize: 1, intervalMs: 300 });
    expect(est.totalChunks).toBe(1);
    expect(est.framesPerCycle).toBe(2); // META + one data frame
  });

  it("documents the under-sized-window pitfall: 1×1 @ 1000 ms needs 12 s per pass", () => {
    const est = estimateCycle({ payloadBytes: 4096, chunkBytes: 384, gridSize: 1, intervalMs: 1000 });
    expect(est.cycleMs).toBe(12000); // 11 data frames + 1 META
    expect(est.cycleMs).toBeGreaterThan(SWEEP.windowMsPerConfig);
  });
});

describe("estimateTransferTimeMs", () => {
  it("equals one cycle and is monotone in payload, interval, and grid density", () => {
    const base = { payloadBytes: 4096, chunkBytes: 384, gridSize: 2 as GridSize, intervalMs: 300 };
    const t = estimateTransferTimeMs(base);
    expect(t).toBe(estimateCycle(base).cycleMs);
    expect(estimateTransferTimeMs({ ...base, payloadBytes: 16384 })).toBeGreaterThan(t);
    expect(estimateTransferTimeMs({ ...base, intervalMs: 500 })).toBeGreaterThan(t);
    expect(estimateTransferTimeMs({ ...base, gridSize: 1 })).toBeGreaterThan(t);
    expect(estimateTransferTimeMs({ ...base, gridSize: 3 })).toBeLessThan(t);
  });
});

describe("recommendWindowMs", () => {
  it("covers at least the requested number of cycles plus slack", () => {
    const opts = { payloadBytes: 4096, chunkBytes: 384, gridSize: 1 as GridSize, intervalMs: 1000 };
    const oneCycle = estimateCycle(opts).cycleMs;
    expect(recommendWindowMs(opts)).toBe(oneCycle * 2 + 500);
    expect(recommendWindowMs(opts, { cycles: 3, slackMs: 0 })).toBe(oneCycle * 3);
  });

  it("floors the margin at one full cycle", () => {
    const opts = { payloadBytes: 4096, chunkBytes: 384, gridSize: 3 as GridSize, intervalMs: 150 };
    expect(recommendWindowMs(opts, { cycles: 0, slackMs: 0 })).toBe(estimateCycle(opts).cycleMs);
  });
});

describe("estimateSweepDurationMs", () => {
  it("bills arm delay + window per run and gaps between runs only", () => {
    expect(
      estimateSweepDurationMs({ runCount: 3, windowMs: 6000, gapMs: 1000, armDelayMs: 150 })
    ).toBe(3 * 6150 + 2 * 1000);
  });

  it("defaults the arm delay to the SWEEP constant and handles zero runs", () => {
    expect(estimateSweepDurationMs({ runCount: 1, windowMs: 6000, gapMs: 1000 })).toBe(
      SWEEP.armDelayMs + 6000
    );
    expect(estimateSweepDurationMs({ runCount: 0, windowMs: 6000, gapMs: 1000 })).toBe(0);
  });
});

describe("expandCampaign", () => {
  it("crosses all dimensions in stable order with repetitions innermost", () => {
    const runs = expandCampaign(baseCampaign);
    expect(runs).toHaveLength(2 * 2 * 3);
    expect(runs.map((r) => r.testId).slice(0, 4)).toEqual([
      "1x1@150ms#r1",
      "1x1@150ms#r2",
      "1x1@150ms#r3",
      "1x1@300ms#r1",
    ]);
    expect(runs.every((r) => r.campaign === "test-campaign")).toBe(true);
    expect(runs.every((r) => r.windowMs === 6000 && r.seed === 1)).toBe(true);
  });

  it("tags testIds with chunk/payload segments only for varied dimensions", () => {
    const runs = expandCampaign({
      ...baseCampaign,
      grids: [2],
      intervals: [300],
      chunkOptions: [256, 512],
      payloadOptions: [1024, 4096],
      runsPerConfig: 1,
    });
    expect(runs.map((r) => r.testId)).toEqual([
      "2x2@300ms/c256/p1024#r1",
      "2x2@300ms/c256/p4096#r1",
      "2x2@300ms/c512/p1024#r1",
      "2x2@300ms/c512/p4096#r1",
    ]);
  });

  it("testIds are unique within a campaign", () => {
    const runs = expandCampaign({
      ...baseCampaign,
      chunkOptions: [128, 256, 384],
      payloadOptions: [1024, 4096],
    });
    expect(new Set(runs.map((r) => r.testId)).size).toBe(runs.length);
  });

  it("rejects chunk sizes that overflow a QR at the campaign EC level", () => {
    expect(() =>
      expandCampaign({ ...baseCampaign, chunkOptions: [1024], ecLevel: "H" })
    ).toThrow(/1024 B.*EC level H/);
  });

  it("rejects empty dimensions", () => {
    expect(() => expandCampaign({ ...baseCampaign, grids: [] })).toThrow(/at least one value/);
    expect(() => expandCampaign({ ...baseCampaign, runsPerConfig: 0 })).toThrow(/at least one value/);
  });
});

describe("estimateCampaignDurationMs", () => {
  it("equals the sweep duration of the expanded run list", () => {
    const runCount = expandCampaign(baseCampaign).length;
    expect(estimateCampaignDurationMs(baseCampaign)).toBe(
      estimateSweepDurationMs({ runCount, windowMs: 6000, gapMs: 1000 })
    );
  });
});
