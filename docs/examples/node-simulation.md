# Example — Node simulation

The simulation module runs entirely in Node (no camera, canvas, or DOM), so
protocol experiments are scriptable and CI-testable.

## Reproduce the phase-lock bug and its fix

```js
// simulate-rotation.mjs — node simulate-rotation.mjs
import { simulateTransfer, mulberry32 } from "@upekshaip/qr-stream";

const rows = [];
for (const k of [1, 1.5, 2, 3, 4, 5]) {
  for (const rotate of [false, true]) {
    const r = simulateTransfer({
      totalChunks: 64,
      gridSize: 1,
      metaEvery: 16,
      rotatePerCycle: rotate,
      channel: { samplingPeriod: k, cellDetectProb: 0.95 },
      maxCycles: 50,
      random: mulberry32(42),
    });
    rows.push({
      samplingPeriod: k,
      rotate,
      completed: r.completed,
      cycles: r.cyclesToComplete ?? ">50",
      coverage: `${r.uniqueChunks}/64`,
      duplicates: r.duplicateDecodes,
    });
  }
}
console.table(rows);
```

Typical output: at sampling periods 2 and 4 the fixed order (`rotate: false`)
stalls at 32/64 and 16/64 **forever** — the phase-lock failure observed on
real phones — while the per-cycle shuffle always completes.

## Sweep a channel-quality surface

```js
import { simulateTransfer, mulberry32 } from "@upekshaip/qr-stream";

console.log("p,grid,cyclesToComplete");
for (const p of [1, 0.95, 0.9, 0.8, 0.6]) {
  for (const grid of [1, 2, 3]) {
    const r = simulateTransfer({
      totalChunks: 128, gridSize: grid, metaEvery: 16, rotatePerCycle: true,
      channel: { cellDetectProb: p, samplingPeriod: 1.5 },
      maxCycles: 200, random: mulberry32(7),
    });
    console.log(`${p},${grid},${r.cyclesToComplete ?? ""}`);
  }
}
```

Pipe to a file and plot — the coverage curves per cycle are in
`result.perCycle` if you want convergence shapes rather than end points.

## Reproducibility

Pass `random: mulberry32(seed)` everywhere. The same seed yields identical
results across runs and machines; the package's own test suite pins the
slow-receiver claims this way (`test/simulate.test.ts`).

The repository wraps the first experiment as `npm run simulate`
(`scripts/simulate.mjs`, `--csv` for CSV output).
