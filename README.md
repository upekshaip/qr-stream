# @upekshaip/qr-stream

**Offline screen-to-camera file transfer over animated QR codes.**

One device plays a file as a looping animation of QR codes; another points a
camera at the screen and reassembles the file — no network, no cables, no
pairing. The link is strictly one-way light, which makes it useful for
air-gapped machines, kiosk provisioning, data diodes, and anywhere radios are
unavailable or unwelcome.

`qr-stream` is the protocol and engine behind the research project
*"An Adaptive QR Streaming Framework for Offline Screen–Camera Data
Transmission"* — try the live demo at **[qr.upekshaip.com](https://qr.upekshaip.com)**.

## Features

- **Self-describing simplex protocol** — every QR carries its own sequence
  metadata, so chunks arrive in any order across any number of cycles
- **Spatial multiplexing** — 1×1, 2×2, or 3×3 QR grids per frame
- **Temporal multiplexing** — configurable frame interval (100–1000 ms)
- **Integrity built in** — CRC-32 per chunk, SHA-256 per file
- **Phase-lock-proof cycling** — optional per-cycle frame shuffle so slow
  receivers converge instead of stalling ([why](docs/adaptive-tuning.md#slow-receivers))
- **Selective retransmission** — build a stream carrying only the chunks a
  receiver reports missing
- **Optional AES-256-GCM encryption** — PBKDF2 key derivation with the
  iteration count carried in-stream
- **Two detection engines** — native `BarcodeDetector` (Chromium) with a jsQR
  fallback everywhere else
- **Headless simulation** — model receivers and channel loss in Node, no
  camera required ([docs](docs/api/simulation.md))
- **Capacity guards** — typed `QrCapacityError` at plan time instead of a
  silent render failure
- **Time estimation & campaigns** — theoretical transfer-time baseline,
  capture-window recommendation, and experiment-campaign expansion with
  wall-clock ETAs ([docs](docs/api/estimate.md))

## Install

```bash
npm install @upekshaip/qr-stream
```

> **Private preview.** Until the accompanying research article is published,
> the package is hosted privately on **GitHub Packages**, so installing needs
> a GitHub personal access token with the `read:packages` scope. Put these
> two lines in your project's (or user) `.npmrc`, then install normally:
>
> ```ini
> @upekshaip:registry=https://npm.pkg.github.com
> //npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
> ```
>
> The runnable [examples](examples/) skip the registry entirely (local
> `file:` dependency), so a repo clone is enough to try everything. The
> public npmjs.com release will need no token.

Requires Node ≥ 20 for Node-side use (global Web Crypto). Rendering
(`TxEngine`, `composeFrame`) and detection (`QrScanner`) need a browser;
the protocol, crypto, and simulation layers run anywhere. Nothing touches
browser APIs at import time, so the package is SSR-safe.

## Quick start — sender

```ts
import {
  PROTOCOL, segment, sha256Hex, buildFramePlan, TxEngine,
} from "@upekshaip/qr-stream";

const bytes = new Uint8Array(await file.arrayBuffer());
const chunkBytes = 512;
const chunks = segment(bytes, chunkBytes);

const meta = {
  protocol: PROTOCOL,
  name: file.name,
  size: bytes.length,
  sha256: await sha256Hex(bytes),
  total: chunks.length,
  chunkBytes,
};

const frames = buildFramePlan(chunks, meta, 2 /* 2×2 grid */, {
  metaEvery: 16,   // repeat META so slow receivers catch it fast
  ecLevel: "M",    // validate every payload against QR capacity now
});

const engine = new TxEngine(document.querySelector("canvas")!);
await engine.start({
  frames,
  intervalMs: 300,
  gridSize: 2,
  sidePx: 768,
  ecLevel: "M",
  loop: true,
  rotatePerCycle: true, // shuffle each cycle — slow receivers can't phase-lock
  onError: (err) => console.error(err),
});
// engine.stop() ends the run instantly; onState("stopped") always fires
```

## Quick start — receiver

```ts
import {
  QrScanner, drawSourceToCanvas, parsePayload, Reassembler, sha256Hex,
} from "@upekshaip/qr-stream";

const scanner = new QrScanner();
scanner.gridHint = 2;          // used only by the jsQR fallback
await scanner.whenReady();
const reasm = new Reassembler();
const scratch = document.createElement("canvas");

while (!reasm.complete) {
  drawSourceToCanvas(video, scratch, 1280); // downscale: faster mobile decode
  const { values } = await scanner.scan(scratch);
  for (const value of values) {
    const p = parsePayload(value);
    if (p.type === "META") reasm.setMeta(p.meta);
    else if (p.type === "DATA" && p.crcOk) reasm.add(p.seq, p.total, p.bytes);
  }
  await new Promise((r) => setTimeout(r, 0));
}

const bytes = reasm.reconstruct();
const ok = (await sha256Hex(bytes)) === reasm.meta!.sha256;
```

## Encryption (optional)

```ts
import { encryptFile, verifyPassword, decryptFile } from "@upekshaip/qr-stream";

// sender: stream `ciphertext` instead of the plaintext and put `encMeta`
// into FileMeta.encryption
const { ciphertext, encMeta } = await encryptFile(bytes, password);

// receiver: cheap password pre-check, then authenticated decryption
if (await verifyPassword(password, meta.encryption!)) {
  const plain = await decryptFile(assembled, password, meta.encryption!);
}
```

The PBKDF2 iteration count (default 600 000) travels inside `encMeta`, so
future changes never break old captures. Read the threat model in
[docs/security.md](docs/security.md) before relying on it.

## Simulation (no camera needed)

```ts
import { simulateTransfer, mulberry32 } from "@upekshaip/qr-stream";

// a receiver decoding every 2nd frame, 95% per-cell detection
const r = simulateTransfer({
  totalChunks: 64, gridSize: 1, metaEvery: 16, rotatePerCycle: true,
  channel: { samplingPeriod: 2, cellDetectProb: 0.95 },
  random: mulberry32(42), // reproducible
});
console.log(r.cyclesToComplete, r.perCycle);
```

## Recipes

**Selective retransmission** — the receiver reports what's missing (a human
can relay it: read it aloud, type it in); the sender streams only those
chunks. The stream is one-way, so the operator *is* the back-channel:

```ts
// receiver side: which chunks are still missing?
const missing = reasm.missing(); // e.g. [5, 12, 33, 34, 35]

// sender side: stream META + just those chunks (reuse the SAME chunks/meta
// as the original run — re-segmenting with other settings would shift
// chunk boundaries)
import { buildFramePlanForSeqs } from "@upekshaip/qr-stream";
const frames = buildFramePlanForSeqs(chunks, meta, 1, missing, { ecLevel: "M" });
await engine.start({ frames, intervalMs: 300, gridSize: 1, sidePx: 768, ecLevel: "M", loop: true });
```

**Validate settings before streaming** — chunk size and EC level trade off
against QR capacity; check combinations up front instead of catching
`QrCapacityError` later:

```ts
import { isChunkEcValid, maxChunkBytesForEc, QR_BYTE_CAPACITY } from "@upekshaip/qr-stream";

isChunkEcValid(1024, "H");   // false — 1024 B never fits at EC H
maxChunkBytesForEc("H");     // largest chunk that fits at EC H
QR_BYTE_CAPACITY.M;          // raw v40 byte capacity at EC M
```

**Reproducible runs** — inject a seeded PRNG anywhere randomness appears, so
an experiment (or a bug report) can be replayed exactly:

```ts
import { mulberry32 } from "@upekshaip/qr-stream";

await engine.start({ ...opts, rotatePerCycle: true, random: mulberry32(42) });
simulateTransfer({ ...simOpts, random: mulberry32(42) });
```

**Estimate transfer time before starting**:

```ts
import { estimateCycleMs } from "@upekshaip/qr-stream";

const cycleMs = estimateCycleMs(frames.length, intervalMs);
// a clean capture completes in ~1 cycle; slow/occluded receivers need a few
```

## Wire protocol (qrstream/1)

| Frame | Payload |
|---|---|
| META | `M\|<base64(JSON FileMeta)>` |
| DATA | `D\|<seq>\|<total>\|<crc32hex>\|<base64(chunk)>` |

The pipe character never occurs in base64, so parsing is unambiguous. Full
grammar, field tables, and compatibility rules: [docs/protocol.md](docs/protocol.md).

## Browser support

| Capability | Chromium (desktop/Android) | Safari / Firefox |
|---|---|---|
| Transmit (Canvas) | ✅ | ✅ |
| Detect — 1×1 grid | ✅ native BarcodeDetector | ✅ jsQR fallback |
| Detect — 2×2 / 3×3 grids | ✅ native, all codes per frame | ⚠️ jsQR slices by `gridHint`; slower, needs aligned framing |
| Encryption (Web Crypto) | ✅ | ✅ |

For phone receivers on jsQR, prefer 1×1 grids, pass `maxDim ≈ 1280` to
`drawSourceToCanvas`, and transmit with `rotatePerCycle` + `metaEvery`. More
tuning guidance: [docs/adaptive-tuning.md](docs/adaptive-tuning.md).

## Documentation

- [Getting started](docs/getting-started.md) — install, environments, first transfer
- [Wire protocol spec](docs/protocol.md)
- [Adaptive tuning](docs/adaptive-tuning.md) — grid × interval × EC × chunk, capacity tables
- [Security](docs/security.md) — threat model and crypto details
- API reference: [protocol](docs/api/protocol.md) ·
  [framing](docs/api/framing.md) · [tx-engine](docs/api/tx-engine.md) ·
  [detection](docs/api/detection.md) · [crypto](docs/api/crypto.md) ·
  [config](docs/api/config.md) · [simulation](docs/api/simulation.md) ·
  [estimation & campaigns](docs/api/estimate.md) ·
  [research utils](docs/api/research-utils.md)
- Written examples: [vanilla JS](docs/examples/vanilla.md) ·
  [React hooks](docs/examples/react-hooks.md) ·
  [Node simulation](docs/examples/node-simulation.md)
- **Runnable examples** ([examples/](examples/)): [Node scripts](examples/node/) ·
  [vanilla + Vite](examples/vanilla/) · [React + Vite](examples/react/) —
  clone, `npm install`, run; no registry token needed
- [CHANGELOG](CHANGELOG.md)

## Research

This package is the Phase-2 deliverable of a BSc (Hons) Computer Science
research project at NSBM Green University studying the throughput-vs-
reliability surface of spatial × temporal QR multiplexing. Until the
accompanying article is published the package ships as a **private preview on
GitHub Packages**; the public npmjs.com release follows. The experiment
harness lives in the [app repository](https://github.com/upekshaip/QR) at
`/auto/tx` + `/auto/rx`.

## License

[MIT](LICENSE) © Upeksha Indeewara Perera
