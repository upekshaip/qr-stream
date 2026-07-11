# API — TxEngine

Browser-only (Canvas + `createImageBitmap`). Drives the on-screen animation
with a render-ahead scheduler: the next frame renders to an `ImageBitmap`
while the current one is displayed, then blits at the slot boundary with
absolute-time drift correction. Memory stays flat (≤ 2 bitmaps alive).

## Lifecycle contract

```
new TxEngine(canvas)
engine.start(options)  → resolves when the run ends
engine.stop()          → takes effect immediately
engine.running         → boolean
```

- `start()` **never rejects for runtime render errors** — they are delivered
  to `onError` and the run ends. It throws synchronously only if the engine
  is already running (programmer error; create one run at a time).
- `onState("stopped")` fires **exactly once per run**, on every exit path:
  natural completion (`loop: false`), `stop()`, or error. Reset UI there.
- `stop()` aborts the in-flight inter-frame sleep, so it takes effect in
  milliseconds, not after the remaining interval. After `stop()` a stale run
  can never touch the canvas again — safe to `start()` a new run immediately.

## `TxEngineOptions`

| Option | Type | Meaning |
|---|---|---|
| `frames` | `FramePlan[]` | one cycle, from `buildFramePlan`/`buildFramePlanForSeqs` |
| `intervalMs` | number | display time per frame |
| `gridSize` | `1 \| 2 \| 3` | grid used for data frames |
| `sidePx` | number | square canvas size |
| `ecLevel` | `"L" \| "M" \| "Q" \| "H"` | QR error correction |
| `loop` | boolean | repeat cycles until `stop()` |
| `rotatePerCycle?` | boolean | shuffle frame order each cycle (frame 0 always first). Prevents slow-receiver phase lock — see [adaptive-tuning](../adaptive-tuning.md#slow-receivers) |
| `random?` | `() => number` | random source for the shuffle; pass `mulberry32(seed)` for reproducible experiments |
| `onProgress?` | `(p: TxProgress) => void` | per displayed frame — keep it cheap (write to a ref, not React state) |
| `onCycle?` | `(cycles: number) => void` | after each completed cycle |
| `onState?` | `(s) => void` | `"rendering" → "running" → "stopped"` |
| `onError?` | `(err: Error) => void` | render/blit failure (e.g. `QrCapacityError`); run ends afterwards |

```ts
interface TxProgress {
  frameIndex: number; // plan index currently shown (-1 = META)
  slot: number;       // 0-based frames shown this run (shown count = slot + 1)
  cycles: number;     // completed full passes
}
```

## `cycleOrder(n, cycle, rotate, random?): number[]`

The engine's per-cycle play order (index 0 first, rest Fisher–Yates shuffled
when `rotate`). Exported so the simulation module provably shares the
engine's ordering logic; useful directly for research.

## Timing notes

Scheduling is absolute (`slotStart + intervalMs` targets), so error does not
accumulate. If rendering is slower than the interval, frames emit
back-to-back at the maximum achievable rate. Backgrounded tabs are throttled
by the browser; keep the transmitting tab in the foreground (the demo app
also takes a screen wake lock).
