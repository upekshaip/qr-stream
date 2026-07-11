import { describe, expect, it } from "vitest";
import { QrCapacityError, buildFramePlan, buildFramePlanForSeqs } from "../src/qrGen";
import { encodeDataPayload, PROTOCOL } from "../src/protocol";
import { CHUNK_OPTIONS, QR_BYTE_CAPACITY, dataPayloadLength, isChunkEcValid } from "../src/config";
import type { FileMeta, GridSize } from "../src/types";

function dummyChunks(total: number, size = 4): Uint8Array[] {
  return Array.from({ length: total }, (_, i) => new Uint8Array(size).fill(i & 0xff));
}

function meta(total: number, overrides: Partial<FileMeta> = {}): FileMeta {
  return {
    protocol: PROTOCOL,
    name: "file.bin",
    size: total * 4,
    sha256: "00".repeat(32),
    total,
    chunkBytes: 4,
    ...overrides,
  };
}

describe("buildFramePlan", () => {
  it("assigns consecutive seqs to grid cells", () => {
    const plan = buildFramePlan(dummyChunks(10), meta(10), 2);
    expect(plan[0].isMeta).toBe(true);
    const seqs = plan
      .filter((f) => !f.isMeta)
      .map((f) => f.cells.map((c) => Number(c.split("|", 3)[1])));
    expect(seqs).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9]]);
  });

  it("metaEvery cadence matches the app's framesPerCycle formula", () => {
    const META_EVERY = 16;
    for (const [total, grid] of [
      [1, 1], [16, 1], [17, 1], [118, 1], [463, 1], [463, 2], [463, 3],
    ] as [number, GridSize][]) {
      const plan = buildFramePlan(dummyChunks(total), meta(total), grid, { metaEvery: META_EVERY });
      const dataFrames = Math.ceil(total / (grid * grid));
      const metaFrames = 1 + Math.floor(Math.max(0, dataFrames - 1) / META_EVERY);
      expect(plan.length).toBe(dataFrames + metaFrames);
      expect(plan.filter((f) => f.isMeta).length).toBe(metaFrames);
    }
  });

  it("without metaEvery there is exactly one META frame, first", () => {
    const plan = buildFramePlan(dummyChunks(100), meta(100), 1);
    expect(plan.filter((f) => f.isMeta)).toHaveLength(1);
    expect(plan[0].isMeta).toBe(true);
  });

  it("throws QrCapacityError for 1024-byte chunks at EC H", () => {
    const chunks = dummyChunks(2, 1024);
    expect(isChunkEcValid(1024, "H")).toBe(false);
    expect(() =>
      buildFramePlan(chunks, meta(2, { chunkBytes: 1024 }), 1, { ecLevel: "H" })
    ).toThrow(QrCapacityError);
    // same chunks are fine at EC L
    expect(() =>
      buildFramePlan(chunks, meta(2, { chunkBytes: 1024 }), 1, { ecLevel: "L" })
    ).not.toThrow();
  });

  it("throws QrCapacityError when a huge filename overflows the META frame", () => {
    const m = meta(1, { name: "x".repeat(3000) });
    expect(() => buildFramePlan(dummyChunks(1), m, 1, { ecLevel: "L" })).toThrow(QrCapacityError);
    try {
      buildFramePlan(dummyChunks(1), m, 1, { ecLevel: "L" });
    } catch (err) {
      expect((err as QrCapacityError).seq).toBe("meta");
      expect((err as QrCapacityError).code).toBe("QR_CAPACITY_EXCEEDED");
    }
  });

  it("skips validation when ecLevel is not given (legacy behavior)", () => {
    expect(() => buildFramePlan(dummyChunks(2, 1024), meta(2, { chunkBytes: 1024 }), 1)).not.toThrow();
  });
});

describe("buildFramePlanForSeqs", () => {
  it("dedupes, sorts, and filters out-of-range seqs", () => {
    const plan = buildFramePlanForSeqs(dummyChunks(10), meta(10), 1, [7, 3, 3, -1, 42, 5]);
    expect(plan[0].isMeta).toBe(true);
    const seqs = plan.filter((f) => !f.isMeta).flatMap((f) => f.cells.map((c) => Number(c.split("|", 3)[1])));
    expect(seqs).toEqual([3, 5, 7]);
  });

  it("validates capacity when ecLevel is provided", () => {
    expect(() =>
      buildFramePlanForSeqs(dummyChunks(2, 1024), meta(2, { chunkBytes: 1024 }), 1, [0], { ecLevel: "H" })
    ).toThrow(QrCapacityError);
  });
});

describe("dataPayloadLength estimate", () => {
  it("is an upper bound for every CHUNK_OPTIONS size", () => {
    for (const size of CHUNK_OPTIONS) {
      const actual = encodeDataPayload(0, 1, new Uint8Array(size)).length;
      expect(actual).toBeLessThanOrEqual(dataPayloadLength(size));
    }
  });

  it("is exact at 7-digit seq/total", () => {
    for (const size of CHUNK_OPTIONS) {
      const actual = encodeDataPayload(9999998, 9999999, new Uint8Array(size)).length;
      expect(actual).toBe(dataPayloadLength(size));
    }
  });

  it("capacity table sanity: every chunk option fits at EC L", () => {
    for (const size of CHUNK_OPTIONS) {
      expect(dataPayloadLength(size)).toBeLessThanOrEqual(QR_BYTE_CAPACITY.L);
    }
  });
});
