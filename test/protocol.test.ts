import { describe, expect, it } from "vitest";
import {
  PROTOCOL,
  Reassembler,
  encodeDataPayload,
  encodeMetaPayload,
  parsePayload,
  segment,
} from "../src/protocol";
import type { FileMeta } from "../src/types";

function meta(overrides: Partial<FileMeta> = {}): FileMeta {
  return {
    protocol: PROTOCOL,
    name: "test.bin",
    size: 10,
    sha256: "ab".repeat(32),
    total: 1,
    chunkBytes: 512,
    ...overrides,
  };
}

describe("segment", () => {
  it("splits into fixed chunks with a smaller last chunk", () => {
    const bytes = new Uint8Array(1000).map((_, i) => i & 0xff);
    const chunks = segment(bytes, 256);
    expect(chunks.map((c) => c.length)).toEqual([256, 256, 256, 232]);
  });

  it("exact multiple produces no runt chunk", () => {
    expect(segment(new Uint8Array(1024), 256)).toHaveLength(4);
  });

  it("empty file still yields one empty chunk", () => {
    const chunks = segment(new Uint8Array(0), 256);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].length).toBe(0);
  });

  it("1-byte file round-trips", () => {
    const chunks = segment(new Uint8Array([42]), 256);
    expect(chunks).toHaveLength(1);
    const parsed = parsePayload(encodeDataPayload(0, 1, chunks[0]));
    expect(parsed.type).toBe("DATA");
    if (parsed.type === "DATA") {
      expect(parsed.crcOk).toBe(true);
      expect([...parsed.bytes]).toEqual([42]);
    }
  });
});

describe("parsePayload — DATA", () => {
  it("round-trips a data payload", () => {
    const chunk = new Uint8Array([1, 2, 3, 250, 251, 252]);
    const parsed = parsePayload(encodeDataPayload(5, 10, chunk));
    expect(parsed.type).toBe("DATA");
    if (parsed.type === "DATA") {
      expect(parsed.seq).toBe(5);
      expect(parsed.total).toBe(10);
      expect(parsed.crcOk).toBe(true);
      expect([...parsed.bytes]).toEqual([...chunk]);
    }
  });

  it("flags CRC mismatch but still parses", () => {
    const good = encodeDataPayload(0, 1, new Uint8Array([1, 2, 3]));
    const tampered = good.replace(/\|([0-9a-f]{8})\|/, "|00000000|");
    const parsed = parsePayload(tampered);
    expect(parsed.type).toBe("DATA");
    if (parsed.type === "DATA") expect(parsed.crcOk).toBe(false);
  });

  it.each([
    ["scientific notation seq", "D|1e3|2000|00000000|AAAA"],
    ["hex seq", "D|0x10|20|00000000|AAAA"],
    ["negative seq", "D|-1|5|00000000|AAAA"],
    ["empty seq", "D||5|00000000|AAAA"],
    ["padded seq", "D| 5 |9|00000000|AAAA"],
    ["seq >= total", "D|5|5|00000000|AAAA"],
    ["zero total", "D|0|0|00000000|AAAA"],
    ["missing pipes", "D|1|2|00000000"],
    ["empty string", ""],
    ["unknown tag", "X|whatever"],
  ])("rejects %s", (_name, raw) => {
    expect(parsePayload(raw).type).toBe("INVALID");
  });
});

describe("parsePayload — META", () => {
  it("round-trips unicode filenames", () => {
    const m = meta({ name: "üñïçødé-文件名 📄.pdf", total: 7 });
    const parsed = parsePayload(encodeMetaPayload(m));
    expect(parsed.type).toBe("META");
    if (parsed.type === "META") {
      expect(parsed.meta.name).toBe(m.name);
      expect(parsed.meta.total).toBe(7);
    }
  });

  it("carries encryption metadata intact", () => {
    const m = meta({ encryption: { salt: "c2FsdA==", iv: "aXY=", passwordHash: "ff".repeat(32), iterations: 600000 } });
    const parsed = parsePayload(encodeMetaPayload(m));
    expect(parsed.type).toBe("META");
    if (parsed.type === "META") expect(parsed.meta.encryption?.iterations).toBe(600000);
  });

  it("rejects garbage after the M tag", () => {
    expect(parsePayload("M|%%%not-base64-json%%%").type).toBe("INVALID");
  });
});

describe("Reassembler", () => {
  it("accepts out-of-order chunks, rejects duplicates, reconstructs in order", () => {
    const r = new Reassembler();
    expect(r.add(1, 3, new Uint8Array([4, 5]))).toBe(true);
    expect(r.add(0, 3, new Uint8Array([1, 2, 3]))).toBe(true);
    expect(r.add(1, 3, new Uint8Array([9, 9]))).toBe(false); // duplicate
    expect(r.complete).toBe(false);
    expect(r.missing()).toEqual([2]);
    expect(r.add(2, 3, new Uint8Array([6]))).toBe(true);
    expect(r.complete).toBe(true);
    expect([...r.reconstruct()]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("setMeta total is authoritative over a garbled DATA seed", () => {
    const r = new Reassembler();
    r.add(5, 999, new Uint8Array([1])); // bogus total seeded first
    expect(r.total).toBe(999);
    r.setMeta(meta({ total: 3 }));
    expect(r.total).toBe(3);
    expect(r.has(5)).toBe(false); // out-of-range chunk dropped
    r.add(0, 3, new Uint8Array([1]));
    r.add(1, 3, new Uint8Array([2]));
    r.add(2, 3, new Uint8Array([3]));
    expect(r.complete).toBe(true);
  });

  it("never completes on a zero total", () => {
    const r = new Reassembler();
    r.add(0, 0, new Uint8Array([1]));
    expect(r.total).toBe(0);
    expect(r.complete).toBe(false);
  });
});
