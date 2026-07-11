import { describe, expect, it } from "vitest";
import {
  CHUNK_OPTIONS,
  EC_OPTIONS,
  QR_BYTE_CAPACITY,
  dataPayloadLength,
  isChunkEcValid,
  maxChunkBytesForEc,
} from "../src/config";

describe("capacity guards", () => {
  it("isChunkEcValid is consistent with the capacity table", () => {
    for (const ec of EC_OPTIONS) {
      for (const size of CHUNK_OPTIONS) {
        expect(isChunkEcValid(size, ec)).toBe(dataPayloadLength(size) <= QR_BYTE_CAPACITY[ec]);
      }
    }
  });

  it("flags the known-bad combination: 1024 bytes at EC H", () => {
    expect(isChunkEcValid(1024, "H")).toBe(false);
  });

  it("maxChunkBytesForEc returns the largest valid option", () => {
    for (const ec of EC_OPTIONS) {
      const max = maxChunkBytesForEc(ec);
      expect(isChunkEcValid(max, ec)).toBe(true);
      const larger = CHUNK_OPTIONS.filter((c) => c > max);
      for (const c of larger) expect(isChunkEcValid(c, ec)).toBe(false);
    }
  });

  it("every chunk option fits at EC L", () => {
    expect(maxChunkBytesForEc("L")).toBe(CHUNK_OPTIONS[CHUNK_OPTIONS.length - 1]);
  });
});
