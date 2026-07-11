// Application-layer protocol for the unidirectional (simplex) optical link.
//
// Because there is no back-channel (no ACK/NACK), every QR is self-describing.
// Two payload kinds travel over the channel, distinguished by a leading tag:
//
//   META frame:  "M|<base64(JSON FileMeta)>"
//   DATA frame:  "D|<seq>|<total>|<crc32hex>|<base64(chunk bytes)>"
//
// The pipe character "|" never appears in base64, so parsing is unambiguous.
// `seq` is the chunk's absolute index in the file, which lets the receiver
// place chunks correctly regardless of the order the detector returns them in,
// and regardless of which cycle/pass they were captured on.

import { crc32Hex } from "./crc32";
import { base64ToBytes, bytesToBase64 } from "./binary";
import type { FileMeta, ParsedPayload } from "./types";

/** Wire-protocol version tag, carried in every META frame's FileMeta. */
export const PROTOCOL = "qrstream/1";

/** Split a file's bytes into fixed-size chunks (last chunk may be smaller). */
export function segment(bytes: Uint8Array, chunkBytes: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += chunkBytes) {
    chunks.push(bytes.subarray(i, Math.min(i + chunkBytes, bytes.length)));
  }
  // An empty file still needs one (empty) chunk so the stream is well-defined.
  if (chunks.length === 0) chunks.push(new Uint8Array(0));
  return chunks;
}

/** Build a DATA payload string: `D|seq|total|crc32hex|base64(chunk)`. */
export function encodeDataPayload(seq: number, total: number, chunk: Uint8Array): string {
  return `D|${seq}|${total}|${crc32Hex(chunk)}|${bytesToBase64(chunk)}`;
}

/** Build a META payload string: `M|base64(JSON FileMeta)`. */
export function encodeMetaPayload(meta: FileMeta): string {
  return `M|${bytesToBase64(new TextEncoder().encode(JSON.stringify(meta)))}`;
}

/** Parse + validate a raw decoded QR string. */
export function parsePayload(raw: string): ParsedPayload {
  if (raw.length < 2) return { type: "INVALID", raw };
  const tag = raw[0];
  if (tag === "M") {
    try {
      const json = new TextDecoder().decode(base64ToBytes(raw.slice(2)));
      const meta = JSON.parse(json) as FileMeta;
      if (typeof meta.total === "number" && typeof meta.sha256 === "string") {
        return { type: "META", meta, raw };
      }
    } catch {
      /* fall through */
    }
    return { type: "INVALID", raw };
  }
  if (tag === "D") {
    // Split into exactly 5 parts; base64 (part 5) may contain no "|".
    const p1 = raw.indexOf("|");
    const p2 = raw.indexOf("|", p1 + 1);
    const p3 = raw.indexOf("|", p2 + 1);
    const p4 = raw.indexOf("|", p3 + 1);
    if (p1 < 0 || p2 < 0 || p3 < 0 || p4 < 0) return { type: "INVALID", raw };
    const seqStr = raw.slice(p1 + 1, p2);
    const totalStr = raw.slice(p2 + 1, p3);
    const crc = raw.slice(p3 + 1, p4);
    const b64 = raw.slice(p4 + 1);
    // Strict decimal-digit fields: Number() alone coerces "", "1e3", "0x10",
    // and padded strings into integers a corrupted frame should never yield.
    if (!/^\d+$/.test(seqStr) || !/^\d+$/.test(totalStr)) return { type: "INVALID", raw };
    const seq = Number(seqStr);
    const total = Number(totalStr);
    if (!Number.isSafeInteger(seq) || !Number.isSafeInteger(total)) return { type: "INVALID", raw };
    if (total < 1 || seq < 0 || seq >= total) return { type: "INVALID", raw };
    const bytes = base64ToBytes(b64);
    const crcOk = crc32Hex(bytes) === crc;
    return { type: "DATA", seq, total, bytes, crcOk, raw };
  }
  return { type: "INVALID", raw };
}

/**
 * Reassembly buffer. Accepts chunks as they arrive (any order, possibly
 * duplicated across cycles) and reconstructs the file once all are present.
 */
export class Reassembler {
  total = 0;
  meta: FileMeta | null = null;
  private chunks = new Map<number, Uint8Array>();

  /**
   * Record the stream's META. Its total is authoritative: it overwrites any
   * total seeded from an earlier (possibly garbled) DATA frame, and buffered
   * chunks outside the corrected range are dropped.
   */
  setMeta(meta: FileMeta) {
    this.meta = meta;
    if (Number.isInteger(meta.total) && meta.total > 0 && meta.total !== this.total) {
      this.total = meta.total;
      for (const seq of [...this.chunks.keys()]) {
        if (seq >= meta.total) this.chunks.delete(seq);
      }
    }
  }

  /** Returns true if this chunk was newly added (not a duplicate). */
  add(seq: number, total: number, bytes: Uint8Array): boolean {
    if (this.total === 0 && Number.isInteger(total) && total > 0) this.total = total;
    if (seq < 0 || (this.total && seq >= this.total)) return false;
    if (this.chunks.has(seq)) return false;
    this.chunks.set(seq, bytes);
    return true;
  }

  has(seq: number): boolean {
    return this.chunks.has(seq);
  }

  get received(): number {
    return this.chunks.size;
  }

  get complete(): boolean {
    return this.total > 0 && this.chunks.size === this.total;
  }

  missing(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.total; i++) if (!this.chunks.has(i)) out.push(i);
    return out;
  }

  reconstruct(): Uint8Array {
    let size = 0;
    for (let i = 0; i < this.total; i++) size += this.chunks.get(i)?.length ?? 0;
    const out = new Uint8Array(size);
    let off = 0;
    for (let i = 0; i < this.total; i++) {
      const c = this.chunks.get(i);
      if (c) {
        out.set(c, off);
        off += c.length;
      }
    }
    return out;
  }
}
