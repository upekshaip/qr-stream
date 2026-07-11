# Getting started

## Install

```bash
npm install @upekshaip/qr-stream
```

The package ships ESM (`import`) and CJS (`require`) builds with full
TypeScript types for both module systems. `qrcode` and `jsqr` are regular
dependencies and install automatically.

## Where each part runs

Nothing in `qr-stream` touches browser APIs **at import time**, so importing
it in Node, an SSR framework, or a web worker is always safe. At call time:

| Layer | Exports | Runs in |
|---|---|---|
| Protocol | `segment`, `encodeDataPayload`, `encodeMetaPayload`, `parsePayload`, `Reassembler`, `crc32`, `crc32Hex`, `bytesToBase64`, `base64ToBytes`, `bitDiff` | anywhere |
| Hashing / crypto | `sha256Hex`, `encryptFile`, `verifyPassword`, `decryptFile` | anywhere with Web Crypto (browsers; Node ≥ 20) |
| Simulation | `simulateTransfer`, `planStructure`, `mulberry32` | anywhere |
| Frame planning | `buildFramePlan`, `buildFramePlanForSeqs` | anywhere |
| Rendering | `composeFrame`, `TxEngine` | browser (Canvas, `createImageBitmap`) |
| Detection | `QrScanner`, `drawSourceToCanvas` | browser (Canvas; `BarcodeDetector` optional) |

## Next.js / React

Pages that render or scan must be client components (`"use client"`). If you
consume the package from a monorepo source checkout rather than npm, add it
to `transpilePackages` in `next.config.js`.

## Your first transfer

**1. Sender** — segment the file, describe it, build a frame plan, start the
engine (full example in the [README](../README.md#quick-start--sender)):

```ts
const chunks = segment(bytes, 512);
const meta = { protocol: PROTOCOL, name, size, sha256, total: chunks.length, chunkBytes: 512 };
const frames = buildFramePlan(chunks, meta, 1, { metaEvery: 16, ecLevel: "M" });
await new TxEngine(canvas).start({ frames, intervalMs: 300, gridSize: 1, sidePx: 768, ecLevel: "M", loop: true, rotatePerCycle: true });
```

**2. Receiver** — capture frames into a canvas, scan, parse, reassemble
(full example in the [README](../README.md#quick-start--receiver)). The
stream is cyclic: keep scanning and later passes fill whatever the camera
missed. `Reassembler.missing()` tells you (and the operator) what's left.

**3. Verify** — after `reasm.complete`, reconstruct and compare SHA-256
against `meta.sha256`. If the sender encrypted the payload,
`meta.encryption` is present — see [security.md](security.md).

## Choosing parameters

Start with `DEFAULT_CONFIG` (1×1 grid, 300 ms, 512 B chunks, EC M). Then read
[adaptive-tuning.md](adaptive-tuning.md) — the short version:

- Bigger grids and shorter intervals raise throughput but demand a better
  camera, more light, and a steadier hand.
- Higher EC levels tolerate blur but shrink per-QR capacity — validate with
  `isChunkEcValid(chunkBytes, ecLevel)` or pass `ecLevel` to `buildFramePlan`
  and catch `QrCapacityError`.
- For phone receivers always set `rotatePerCycle: true` and `metaEvery: 16`.
