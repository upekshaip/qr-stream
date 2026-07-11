# Adaptive tuning

The research question behind this package: how do **grid size** (spatial
multiplexing), **frame interval** (temporal multiplexing), **chunk size**,
and **QR error correction** trade throughput against reliability on a real
screen-camera link? This page distills the practical guidance.

## The four knobs

| Knob | Raises throughput when… | Costs |
|---|---|---|
| Grid size (1×1 → 3×3) | camera resolves all cells sharply | needs higher capture resolution, precise framing; jsQR fallback struggles beyond 1×1 |
| Frame interval (1000 → 100 ms) | receiver decodes faster than the interval | slow receivers sample a subset of frames (see below); motion blur on handheld phones |
| Chunk size (128 → 1024 B) | QR stays within capacity at the chosen EC | denser modules → smaller effective module size → harder optics |
| EC level (H → L) | channel is clean | less tolerance for glare/blur/partial occlusion |

Theoretical raw rate: `N² × chunkBytes × 8 / intervalMs` bits/ms — e.g.
3×3 × 512 B @ 100 ms ≈ 369 kbps. Real goodput is bounded by the *receiver's*
decode rate and error behavior, which is exactly what the `/auto` harness
measures.

## QR capacity (version 40, byte mode)

| EC level | Capacity (bytes) | Max suggested chunk |
|---|---|---|
| L | 2953 | 1024 B |
| M | 2331 | 1024 B |
| Q | 1663 | 768 B |
| H | 1273 | 768 B |

A DATA payload is `27 + ceil(chunkBytes/3) × 4` characters (worst case, files
up to 10 M chunks) — 1024 B chunks produce ~1395 chars, which **does not fit
at EC H (1273)**. Guard in UI with `isChunkEcValid` / `maxChunkBytesForEc`,
or pass `ecLevel` to `buildFramePlan` and catch `QrCapacityError`. Note the
META frame has its own budget: very long filenames can overflow it
independently of chunk size.

## Slow receivers

A receiver that decodes slower than the frame interval (typical for phones
on the jsQR path) samples every k-th displayed frame. Two failure modes and
their fixes:

1. **Phase lock.** With a fixed frame order, even k against an even cycle
   length means the receiver sees the *same* frames every cycle — coverage
   stalls forever (observed in the field at exactly 50%). Fix:
   `rotatePerCycle: true` shuffles the order every cycle; a random order
   cannot alias with any sampling rate. Deterministic rotations were tried
   and rejected — a fixed step can itself phase-lock against some k.
   Run `npm run simulate` in the repo (or see
   [examples/node-simulation.md](examples/node-simulation.md)) to reproduce
   both behaviors headlessly.
2. **META starvation.** A META that airs once per cycle occupies ~1/117 of
   airtime on a large file; a slow receiver can miss it for minutes, and
   without META the file can't be named or verified. Fix: `metaEvery: 16`
   repeats META every 16 data frames (~6% airtime).

Interesting corollary from simulation: at *odd/co-prime* sampling periods a
fixed order actually completes faster than shuffling (deterministic full
coverage vs. coupon-collector duplicates). Rotation buys worst-case
convergence at some average-case cost — with an unknown receiver population,
take the insurance.

## Mobile receiver checklist

- Transmit: `rotatePerCycle: true`, `metaEvery: 16`, grid 1×1 unless the
  receiver is Chromium with BarcodeDetector, interval ≥ 300 ms.
- Receive: `drawSourceToCanvas(video, canvas, 1280)` — decode time scales
  with pixel count and phones capture at ≥1080p; downscaling to 1280 px is
  ~2.3× fewer pixels per pass with ample module resolution.
- Keep the QR canvas large on screen and fill the camera frame with it; the
  jsQR grid path assumes roughly axis-aligned, edge-to-edge framing.

## Measuring instead of guessing

The repository's `/auto/tx` + `/auto/rx` pages sweep grid × interval over a
seeded payload with N repetitions per configuration and export per-run and
mean±std CSVs (goodput, chunk success, post-CRC residual BER, FER, decode
percentiles). Use them to map your own device pair before committing to
parameters.
