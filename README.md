# qr-stream

Adaptive QR streaming for **offline screen-to-camera file transfer**. Encode any file into a looping animation of QR codes on one device's screen, and reconstruct it bit-perfectly on another device using only its camera — no network, no cables, no pairing.

Built as the core artifact of the research project *"An Adaptive QR Streaming Framework for Offline Screen–Camera Data Transmission"* (NSBM Green University). Live demo: [qr.upekshaip.com](https://qr.upekshaip.com).

## Features

- **Spatial multiplexing** — 1×1, 2×2, or 3×3 QR grids per frame (1–9 codes at once)
- **Temporal multiplexing** — configurable frame interval (100–1000 ms)
- **Self-describing simplex protocol** — every QR carries its own sequence index; frames can arrive in any order, across any cycle, with no back-channel
- **Integrity built in** — CRC32 per chunk, SHA-256 over the whole file
- **Cyclic redundancy** — loop the stream; the receiver fills gaps on later passes
- **Optional encryption** — AES-256-GCM with PBKDF2 key derivation (100k iterations)
- **Drift-corrected TX engine** — render-ahead scheduler keeps frame timing precise with flat memory use
- **Multi-QR detection** — native `BarcodeDetector` where available, jsQR fallback elsewhere

## Install

```bash
npm install qr-stream
```

> **Browser-only.** The library uses Canvas, Web Crypto, `MediaDevices`, and (optionally) `BarcodeDetector`. Importing it in Node/SSR is safe — nothing touches browser APIs at import time — but every function must run client-side (e.g. inside a `"use client"` component or behind a dynamic import).

## Quick start

### Sender (TX)

```ts
import {
  segment, sha256Hex, buildFramePlan, TxEngine, PROTOCOL,
} from "qr-stream";

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

const frames = buildFramePlan(chunks, meta, 2); // 2 → 2×2 grid

const engine = new TxEngine(canvasEl); // your on-screen <canvas>
await engine.start({
  frames,
  intervalMs: 300,
  gridSize: 2,
  sidePx: 768,
  ecLevel: "M",
  loop: true, // cycle until the receiver has every chunk
  onProgress: ({ frameIndex, slot, cycles }) => { /* update UI */ },
});
// engine.stop() to end
```

### Receiver (RX)

```ts
import {
  QrScanner, drawSourceToCanvas, parsePayload, Reassembler, sha256Hex,
} from "qr-stream";

const stream = await navigator.mediaDevices.getUserMedia({ video: true });
videoEl.srcObject = stream;
await videoEl.play();

const scanner = new QrScanner();
await scanner.whenReady();

const reasm = new Reassembler();
const scratch = document.createElement("canvas");

while (!reasm.complete) {
  drawSourceToCanvas(videoEl, scratch);
  const { values } = await scanner.scan(scratch);
  for (const raw of values) {
    const p = parsePayload(raw);
    if (p.type === "META") reasm.setMeta(p.meta);
    else if (p.type === "DATA" && p.crcOk) reasm.add(p.seq, p.total, p.bytes);
  }
  await new Promise((r) => setTimeout(r, 0)); // yield to the UI
}

const bytes = reasm.reconstruct();
const ok = reasm.meta && (await sha256Hex(bytes)) === reasm.meta.sha256;
```

### Encryption (optional)

```ts
import { encryptFile, verifyPassword, decryptFile } from "qr-stream";

// TX: encrypt before segmenting; put encMeta into FileMeta.encryption
const { ciphertext, encMeta } = await encryptFile(bytes, password);

// RX: after reassembly
if (meta.encryption) {
  if (await verifyPassword(password, meta.encryption)) {
    const plain = await decryptFile(cipherBytes, password, meta.encryption);
  }
}
```

## Wire protocol

Every QR payload is a self-describing pipe-delimited string (`|` never occurs in base64, so parsing is unambiguous):

| Frame | Format |
|---|---|
| META | `M\|<base64(JSON FileMeta)>` |
| DATA | `D\|<seq>\|<total>\|<crc32hex>\|<base64(chunk)>` |

`FileMeta` carries name, size, SHA-256, chunk count/size, and optional encryption parameters (PBKDF2 salt, AES-GCM IV, password verifier hash).

## API surface

| Export | Kind | Purpose |
|---|---|---|
| `segment(bytes, chunkBytes)` | fn | Split a file into chunks |
| `encodeMetaPayload` / `encodeDataPayload` | fn | Build QR payload strings |
| `parsePayload(raw)` | fn | Parse + CRC-validate a decoded QR string |
| `Reassembler` | class | Order-independent chunk buffer → file |
| `buildFramePlan(chunks, meta, gridSize)` | fn | Plan one full TX cycle |
| `composeFrame(canvas, frame, gridSize, sidePx, ec)` | fn | Draw an N×N QR grid frame |
| `TxEngine` | class | Drift-corrected frame scheduler |
| `QrScanner` | class | Multi-QR detect (BarcodeDetector → jsQR) |
| `drawSourceToCanvas(video, canvas)` | fn | Capture a video frame |
| `crc32` / `crc32Hex` / `sha256Hex` | fn | Integrity primitives |
| `bytesToBase64` / `base64ToBytes` | fn | Binary codec |
| `encryptFile` / `verifyPassword` / `decryptFile` | fn | AES-256-GCM helpers |
| `DEFAULT_CONFIG`, `GRID_OPTIONS`, `INTERVAL_OPTIONS`, `CHUNK_OPTIONS`, `EC_OPTIONS` | const | Sensible presets |
| `GridSize`, `EcLevel`, `TxConfig`, `FileMeta`, `ParsedPayload`, … | types | Full TypeScript types |

## How it performs

Throughput scales with grid density and frame rate until the camera's resolving power becomes the bottleneck. As a rule of thumb: dense grids + short intervals for good cameras at close range; a 1×1 grid at a slower rate for webcams, distance, or poor light. See the research for the measured throughput/reliability envelope.

## License

MIT © Upeksha Perera
