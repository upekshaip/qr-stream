# API — simulation

Node-safe, no camera, no canvas. Separates **protocol** efficiency from
optics: the same cycle structure and frame ordering the real `TxEngine`
uses (shared code via `cycleOrder` / `planStructure`) plays against a
parametric receiver model. Use it for research A/B runs and as CI regression
tests for coverage claims.

## `simulateTransfer(opts): SimulationResult`

```ts
interface SimulateOptions {
  totalChunks: number;        // >= 1
  gridSize: 1 | 2 | 3;
  metaEvery?: number;         // mirrors FramePlanOptions.metaEvery
  rotatePerCycle?: boolean;   // mirrors TxEngineOptions.rotatePerCycle
  channel?: ChannelModel;
  maxCycles?: number;         // default 50
  intervalMs?: number;        // slots→ms conversion only; default 300
  random?: () => number;      // pass mulberry32(seed) for reproducibility
}

interface ChannelModel {
  cellDetectProb?: number;    // P(cell decodes on a sampled frame); default 1
  samplingPeriod?: number;    // receiver decodes every k-th slot; fractional ok; default 1
  frameLossProb?: number;     // P(whole sampled frame lost); default 0
}
```

Completion = all chunks decoded **and** META seen. Deterministic when
`random` is seeded. Throws `RangeError` for `totalChunks < 1`.

```ts
interface SimulationResult {
  completed: boolean;
  cyclesToComplete: number | null;  // 1-based
  slotsElapsed: number;
  timeToCompleteMs: number | null;  // slots × intervalMs
  uniqueChunks: number;
  duplicateDecodes: number;
  framesSampled: number;
  metaSeenAtSlot: number | null;
  perCycle: CycleStats[];           // the coverage curve
}

interface CycleStats {
  cycle: number;      // 1-based
  newChunks: number;
  coverage: number;   // cumulative fraction
  duplicates: number;
  metaSeen: boolean;  // cumulative
}
```

## `mulberry32(seed): () => number`

Deterministic 32-bit PRNG — the canonical seeded random source for
simulations, the `TxEngineOptions.random` option, and the harness's seeded
payloads.

## `planStructure(totalChunks, gridSize, metaEvery?)`

Structural mirror of `buildFramePlan`: which frames exist in one cycle and
which chunk seqs each data frame carries, without touching bytes. Pinned to
`buildFramePlan` by a unit test so they cannot drift.

## The headline experiment

```ts
const base = { totalChunks: 64, gridSize: 1, metaEvery: 16, channel: { samplingPeriod: 2 } };
simulateTransfer({ ...base, rotatePerCycle: false, random: mulberry32(1) });
// → completed: false, coverage stalls at 50% forever (phase lock)
simulateTransfer({ ...base, rotatePerCycle: true, random: mulberry32(1) });
// → completed: true within ~12 cycles
```

Run the full A/B table with `npm run simulate` in the repository (add
`--csv` for machine-readable output). See also
[../examples/node-simulation.md](../examples/node-simulation.md).
