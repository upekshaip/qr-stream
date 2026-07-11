# Wire protocol — `qrstream/1`

The link is **simplex**: light travels from a screen to a camera and nothing
travels back. There is no handshake, no ACK, and no ordering guarantee, so
every QR payload must be independently meaningful. Reliability comes from
cyclic repetition (the sender loops; the receiver fills gaps on later passes)
plus per-chunk and per-file integrity checks.

## Payload grammar

Every decoded QR string is one of two frames, distinguished by its first
character:

```
meta-payload  = "M|" base64( JSON(FileMeta) )
data-payload  = "D|" seq "|" total "|" crc32hex "|" base64(chunk-bytes)

seq       = 1*DIGIT          ; 0-based chunk index, 0 <= seq < total
total     = 1*DIGIT          ; number of chunks, >= 1
crc32hex  = 8HEXDIG          ; lowercase, zero-padded CRC-32 (IEEE 802.3) of chunk-bytes
```

`|` never occurs in base64, so splitting on the first four pipes is
unambiguous. Parsers must be strict: non-digit `seq`/`total`, `total = 0`, or
`seq >= total` make the payload INVALID (`parsePayload` enforces this and
never throws).

## FileMeta

Carried by the META frame as base64-encoded JSON:

| Field | Type | Meaning |
|---|---|---|
| `protocol` | string | `"qrstream/1"` |
| `name` | string | file name (UTF-8; any unicode) |
| `size` | number | bytes of the **transmitted** payload (ciphertext size when encrypted) |
| `sha256` | string | hex SHA-256 of the transmitted payload |
| `total` | number | number of DATA chunks |
| `chunkBytes` | number | chunk size; the last chunk may be smaller |
| `encryption?` | EncryptionMeta | present only for password-protected streams |

META's `total` is **authoritative**: a receiver that seeded its total from a
(possibly corrupted) DATA frame must adopt META's value and drop
out-of-range chunks (`Reassembler.setMeta` does this).

## EncryptionMeta — v1 vs v2

| Field | v1 (legacy) | v2 (current) |
|---|---|---|
| `salt` | base64, 16 bytes | same |
| `iv` | base64, 12 bytes | same |
| `passwordHash` | hex SHA-256 of the raw derived key | same |
| `iterations` | *absent* → readers assume **100 000** | PBKDF2-SHA256 iteration count (default **600 000**) |

Compatibility matrix:

| Stream | Old reader (pre-0.1.0) | New reader |
|---|---|---|
| v1 (no `iterations`) | ✅ | ✅ (falls back to 100 000) |
| v2 | ❌ derives with 100 000 → password check fails | ✅ |

## Cycle structure

One cycle of `buildFramePlan(chunks, meta, gridSize, { metaEvery })`:

```
[META] [D0..] [D..] … (META again before every metaEvery-th data frame) … repeat
```

- A **frame** is an N×N grid of QR codes; cells within a data frame carry
  consecutive `seq` values. The META frame is always a single full-canvas QR
  regardless of grid size.
- `framesPerCycle = dataFrames + 1 + floor((dataFrames − 1) / metaEvery)`
  where `dataFrames = ceil(total / N²)`.
- With `rotatePerCycle`, the transmitter plays frame 0 (META) first and the
  remaining frames in a fresh random order each cycle. Chunk order is
  protocol-irrelevant (every payload is self-describing) — the shuffle exists
  so a receiver decoding slower than the frame rate cannot phase-lock onto
  the same subset of frames forever.

## Selective retransmission

The human operator is the back-channel. The receiver formats its missing
list compactly (e.g. `5,12,33-37`); the sender builds a subset stream with
`buildFramePlanForSeqs(chunks, meta, gridSize, seqs)` — META plus only those
chunks. The subset stream is protocol-identical, so the receiver merges it
into the same `Reassembler`. **Encrypted streams must reuse the original
ciphertext chunks** — re-encrypting changes salt/IV and produces chunks the
receiver cannot merge.

## Versioning policy

`FileMeta.protocol` names the wire version. Additive, optional JSON fields
(like `iterations`) do not bump the version; any change to the payload
grammar or field semantics becomes `qrstream/2`. Receivers should accept
unknown extra fields silently.
