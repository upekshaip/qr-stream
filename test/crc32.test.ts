import { describe, expect, it } from "vitest";
import { crc32, crc32Hex } from "../src/crc32";

const enc = (s: string) => new TextEncoder().encode(s);

describe("crc32", () => {
  it("matches the IEEE 802.3 check value for '123456789'", () => {
    expect(crc32Hex(enc("123456789"))).toBe("cbf43926");
  });

  it("empty input yields 00000000", () => {
    expect(crc32Hex(new Uint8Array(0))).toBe("00000000");
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("is always 8 lowercase hex chars (leading zeros preserved)", () => {
    // brute-force a value whose CRC has a leading zero nibble
    for (let i = 0; i < 64; i++) {
      const h = crc32Hex(new Uint8Array([i]));
      expect(h).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it("detects single-bit corruption", () => {
    const a = enc("the quick brown fox");
    const b = Uint8Array.from(a);
    b[3] ^= 0x01;
    expect(crc32(a)).not.toBe(crc32(b));
  });
});
