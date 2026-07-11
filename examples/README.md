# qr-stream — runnable examples

Three self-contained example projects. The written walkthroughs live in
[`../docs/examples/`](../docs/examples/); these folders are the same code in
runnable form. They import the library by its published name
(`@upekshaip/qr-stream`) via a local `file:../..` dependency, so they work
straight from a clone — no registry access needed.

| Example | Shows | Run |
|---|---|---|
| [`node/`](node/) | Headless use: frame planning + capacity checks, encryption round trip, channel simulation | `npm run build` (in the package root), then `node examples/node/<script>.mjs` |
| [`vanilla/`](vanilla/) | Complete sender + receiver in plain JavaScript (no framework) | `cd examples/vanilla && npm install && npm run dev` |
| [`react/`](react/) | The same pair as React hooks (`useTxEngine`, `useQrReceiver`) with correct ref/state hygiene | `cd examples/react && npm install && npm run dev` |

## Node scripts (`node/`)

No install needed — they import the built `dist/` directly:

- **`plan-inspect.mjs`** — segment a 100 KiB payload, build a frame plan
  (`metaEvery`, grid 2×2), print cycle math and capacity limits, and
  demonstrate the typed `QrCapacityError`.
- **`encrypt-roundtrip.mjs`** — AES-256-GCM encrypt → password verify
  (wrong + right) → decrypt → byte-exact check.
- **`simulate.mjs`** — reproduce the phase-lock stall: a half-speed receiver
  against a fixed frame order stalls at 50% forever; `rotatePerCycle` always
  completes.

## Browser examples (`vanilla/`, `react/`)

Both are minimal [Vite](https://vitejs.dev) projects (Vite bundles the
`jsqr`/`qrcode` dependencies that raw `<script type="module">` cannot
resolve).

To actually transfer a file you need **two ends**:

- easiest: two devices — sender page on a laptop, receiver on a phone
  (camera pointed at the laptop screen), or
- one machine: sender in one window, receiver in another, with a webcam
  aimed at the sender's screen.

Camera access requires a secure context: `localhost` is fine during `npm run
dev`; anything else must be HTTPS (`vite dev --host` + a phone on the same
network works because Chrome treats `http://<lan-ip>` as insecure — use
`npx vite --host` with the [`@vitejs/plugin-basic-ssl`](https://www.npmjs.com/package/@vitejs/plugin-basic-ssl)
plugin, or a tunnel like `ngrok`, when testing across devices).

Grid sizes 2×2 / 3×3 need Chromium's `BarcodeDetector` on the **receiver**;
the jsQR fallback used by other browsers is reliable for 1×1 (the examples
default to 1×1 for that reason).
