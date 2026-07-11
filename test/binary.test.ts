import { describe, expect, it } from "vitest";
import { base64ToBytes, bitDiff, bytesToBase64, sha256Hex } from "../src/binary";

describe("base64", () => {
  it("matches Buffer for all remainder classes (len % 3 = 0/1/2)", () => {
    for (const len of [0, 1, 2, 3, 4, 5, 6, 31, 32, 33, 255]) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 37 + len) & 0xff);
      const b64 = bytesToBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString("base64"));
      expect([...base64ToBytes(b64)]).toEqual([...bytes]);
    }
  });

  it("tolerates embedded whitespace when decoding", () => {
    const b64 = Buffer.from("hello world").toString("base64");
    const spaced = b64.slice(0, 4) + " \n" + b64.slice(4);
    expect(new TextDecoder().decode(base64ToBytes(spaced))).toBe("hello world");
  });
});

describe("sha256Hex", () => {
  it("hashes the empty input to the well-known digest", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("hashes 'abc' to the FIPS 180-2 test vector", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

describe("bitDiff", () => {
  it("identical arrays differ by zero bits", () => {
    const a = new Uint8Array([1, 2, 3]);
    expect(bitDiff(a, a)).toEqual({ diff: 0n, compared: 24n });
  });

  it("counts a single flipped bit", () => {
    const a = new Uint8Array([0b0000]);
    const b = new Uint8Array([0b0100]);
    expect(bitDiff(a, b).diff).toBe(1n);
  });

  it("bills missing bytes as fully errored", () => {
    const a = new Uint8Array([0xff, 0xff]);
    const b = new Uint8Array([0xff]);
    const r = bitDiff(a, b);
    expect(r.diff).toBe(8n);
    expect(r.compared).toBe(16n);
  });
});
