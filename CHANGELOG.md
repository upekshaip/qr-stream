# Changelog

All notable changes to `@upekshaip/qr-stream` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-07-11

Private preview release on GitHub Packages (`@upekshaip/qr-stream`). The
public npmjs.com release follows once the accompanying research article is
published.

### Added

- Headless simulation module: `simulateTransfer`, `planStructure`, `mulberry32`,
  and the `ChannelModel` / `SimulateOptions` / `SimulationResult` / `CycleStats`
  types — model a cyclic stream against a parametric receiver (sampling period,
  cell detection probability, frame loss) with no camera or canvas.
- `TxEngineOptions.onError` — render failures (e.g. oversized payloads) are
  delivered to the caller; `start()` never rejects for runtime render errors
  and `onState("stopped")` is guaranteed on every exit path.
- `TxEngineOptions.random` — inject a seeded PRNG for reproducible per-cycle
  shuffles; `cycleOrder` is exported so simulations share the engine's exact
  ordering logic.
- `TxEngine.running` getter.
- `QrCapacityError` + plan-time validation: `buildFramePlan` /
  `buildFramePlanForSeqs` accept `ecLevel` and length-check every actual
  payload (data **and** META — a long filename can overflow META on its own)
  against QR v40 capacity; `composeFrame` performs the same check pre-render.
- `EncryptionMeta.iterations` — the PBKDF2 iteration count now travels with
  the stream; `encryptFile` accepts an `iterations` override.
- `PBKDF2_ITERATIONS_DEFAULT` (600 000) exported.
- `VERSION` constant (pinned to package.json by a unit test).
- `drawSourceToCanvas` accepts canvas/image/ImageBitmap sources
  (`CaptureSource`), matching its documented behavior.
- Unit test suite (vitest) covering protocol, CRC, base64, plan building,
  capacity validation, cycle ordering, simulation properties, and crypto
  round-trips.

### Changed

- **PBKDF2 default iterations: 100 000 → 600 000** (OWASP guidance).
  Backward compatible for reading: streams without `iterations` in their
  meta decrypt with the legacy 100 000. Note: receivers running a pre-0.1.0
  build cannot decrypt new streams (they assume 100 000) — update both ends.
- `parsePayload` is strict: seq/total must be plain decimal digits with
  `total >= 1` and `0 <= seq < total` (previously `Number()` coercion
  accepted forms like `"1e3"`).
- `Reassembler.setMeta` treats META's total as authoritative — it overwrites
  a total seeded by a garbled DATA frame and drops out-of-range buffered chunks.
- `verifyPassword` uses a constant-time digest comparison.
- `SWEEP` (research harness matrix): `warmupMs` removed (was never applied);
  added `armDelayMs` and `runsPerConfig`.
- `ResultRow` (research type) schema v2: adds `runIndex`, `seed`,
  `rotatePerCycle`, `metaEvery`, `p50ProcessingMs`, `p95ProcessingMs`,
  `shaVerified`, and receiver environment fields.

### Fixed

- `TxEngine` restart race: `stop()` followed by `start()` could resurrect the
  previous loop, leaving two animation loops on one canvas. Runs now carry a
  generation token checked after every await.
- `TxEngine.stop()` latency: the in-flight inter-frame sleep is aborted
  immediately (previously the stop waited out the remaining interval; the
  `raf` cancellation was dead code).
- `TxEngine` leaked one render-ahead `ImageBitmap` per stop and per
  single-cycle completion.
- BarcodeDetector results are deduplicated (jsQR path already was).
- jsQR grid slicing no longer drops the remainder-pixel column/row at the
  right/bottom edge of the capture.
