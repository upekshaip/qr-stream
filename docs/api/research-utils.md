# API — research utilities

These exports exist for the thesis experiment harness. They are shipped
because the harness consumes the package like any other app, but they are
**instrumentation, not product API — stability across versions is not
guaranteed.**

## `SWEEP`

The harness's default sweep matrix: grids `[1,2,3]`, intervals
`[150,300,500,1000]` ms, fixed `chunkBytes: 384`, `ecLevel: "M"`,
`windowMsPerConfig: 6000`, `armDelayMs: 150` (receiver arming delay before
streaming — never billed into throughput), `runsPerConfig: 3`,
`payloadBytes: 4096`.

## `ResultRow` (CSV schema v2)

One measured run. Key columns beyond the config echoes:

| Column | Meaning |
|---|---|
| `runIndex`, `seed` | repetition number and payload PRNG seed (reproducibility) |
| `rotatePerCycle`, `metaEvery` | transmitter options in effect |
| `rawThroughputBps` | bits of ALL CRC-valid detections (incl. duplicates) / s — actual chunk bytes |
| `goodputBps` | bits of unique chunks / s |
| `ber` | **post-CRC residual** bit error rate: only CRC-accepted chunks are compared against ground truth, so chunks with bit errors are almost always excluded by CRC-32 first. This is NOT raw channel BER — expect ~0; a nonzero value means errors slipped past CRC. |
| `fer` | fraction of data frames with ≥ 1 undecoded cell |
| `avgProcessingMs`, `p50ProcessingMs`, `p95ProcessingMs` | per-capture decode-time stats |
| `completed` | all chunks decoded (count-complete) |
| `shaVerified` | reconstruction is byte-identical to ground truth (complete + zero flipped bits across every unique chunk — equivalent to a SHA-256 match) |
| `scannerEngine`, `userAgent`, `platform`, `screenRes`, `dpr`, `captureRes`, `pkgVersion` | receiver environment |

The measurement clock starts at the transmitter's `stream-start` signal, so
arm delays are excluded. Rows from the pre-v2 schema (no `runIndex`…) must
not be mixed with v2 rows in one analysis.

## `bitDiff(a, b)`

Hamming distance between byte arrays (missing bytes count as fully errored).
Feeds `ber`.

## `cycleOrder(n, cycle, rotate, random?)`

The transmit engine's per-cycle frame order — exported so simulations and
analyses share the exact production ordering logic.

## `planStructure(totalChunks, gridSize, metaEvery?)`

Byte-free mirror of `buildFramePlan` (see [simulation.md](simulation.md)).
