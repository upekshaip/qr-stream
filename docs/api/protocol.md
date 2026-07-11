# API — protocol & reassembly

Everything on this page runs anywhere (no browser APIs).

## `PROTOCOL: "qrstream/1"`

Wire-protocol version tag; put it in `FileMeta.protocol`.

## `segment(bytes, chunkBytes): Uint8Array[]`

Split a file into fixed-size chunks; the last chunk may be smaller. An empty
file yields one empty chunk so the stream is well-defined. The returned
arrays are **subarray views** onto `bytes` (no copy).

## `encodeDataPayload(seq, total, chunk): string`

Build `D|seq|total|crc32hex|base64(chunk)`.

## `encodeMetaPayload(meta): string`

Build `M|base64(JSON(FileMeta))`. Unicode names round-trip (UTF-8).

## `parsePayload(raw): ParsedPayload`

Parse and validate one decoded QR string. **Never throws.** Returns a tagged
union:

```ts
| { type: "DATA"; seq; total; bytes; crcOk; raw }
| { type: "META"; meta: FileMeta; raw }
| { type: "INVALID"; raw }
```

Strictness: `seq`/`total` must be plain decimal digits with `total ≥ 1` and
`0 ≤ seq < total`; malformed META JSON is INVALID. `crcOk` reports whether
the chunk's CRC-32 matched — **always check it before `Reassembler.add`**.

## `class Reassembler`

Order-independent chunk buffer.

| Member | Behavior |
|---|---|
| `setMeta(meta)` | records META; its `total` is authoritative (overwrites a garbled seed, drops out-of-range chunks) |
| `add(seq, total, bytes): boolean` | buffers a chunk; `true` if newly added, `false` for duplicates/out-of-range |
| `has(seq)` / `received` / `total` / `meta` | inspection |
| `complete` | `total > 0 && received === total` |
| `missing(): number[]` | ascending list of absent seqs (feed to `formatSeqRanges`-style UI + `buildFramePlanForSeqs`) |
| `reconstruct(): Uint8Array` | concatenates chunks in order |

## Binary helpers

- `bytesToBase64(bytes)` — RFC 4648 with padding.
- `base64ToBytes(b64)` — tolerant: skips whitespace/invalid characters
  instead of throwing (a garbled decode yields wrong bytes, caught by CRC).
- `sha256Hex(bytes): Promise<string>` — Web Crypto SHA-256, lowercase hex.
- `crc32(bytes): number` / `crc32Hex(bytes): string` — IEEE 802.3; hex form
  is always 8 zero-padded lowercase chars (the wire format).
- `bitDiff(a, b): { diff: bigint; compared: bigint }` — Hamming distance;
  length mismatch counts missing bytes as fully errored (research metric).
