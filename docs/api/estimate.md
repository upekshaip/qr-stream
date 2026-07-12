# API — time estimation & campaigns

Pure arithmetic over the protocol's frame-plan structure — no DOM, no
timers, fully usable in Node. Frame counting delegates to
[`planStructure`](simulation.md), so META accounting matches the simulator
and the transmit engine exactly.

Research-utility caveat: like the rest of [research-utils.md](research-utils.md),
the campaign primitives are instrumentation first; the timing estimators
(`estimateCycle`, `estimateTransferTimeMs`, `recommendWindowMs`) are also
useful in product UIs ("this file will take ~8 s per pass").

## `estimateCycle(opts): CycleEstimate`

`opts: { payloadBytes, chunkBytes, gridSize, intervalMs, metaEvery? }` →
`{ totalChunks, framesPerCycle, cycleMs }`. One cycle = one full pass over
the file, META frame(s) included.

## `estimateTransferTimeMs(opts): number`

Theoretical minimum transfer time: one clean pass in which the receiver
decodes every frame on first airing. Real transfers only take longer (a
missed frame costs a whole extra cycle on a simplex link), which makes this
the natural baseline model for predicted-vs-measured analysis.

```ts
estimateTransferTimeMs({ payloadBytes: 4096, chunkBytes: 384, gridSize: 1, intervalMs: 1000 });
// → 12000  (11 data frames + 1 META) × 1000 ms
```

## `recommendWindowMs(opts, { cycles = 2, slackMs = 500 }?): number`

Recommended capture window for a measurement run: `cycles` full passes plus
slack (margin floors at one cycle). Guards against windows that cannot
complete by construction — the example above can never finish inside the
historical 6 s default window.

## `estimateSweepDurationMs({ runCount, windowMs, gapMs, armDelayMs? }): number`

Wall-clock cost of a sweep: each run bills `armDelayMs + windowMs`
(`armDelayMs` defaults to `SWEEP.armDelayMs`), with `gapMs` between runs
(none after the last).

## `CampaignSpec` / `expandCampaign(spec): RunSpec[]`

A campaign is a named sweep over the cross product `grids × intervals ×
chunkOptions × payloadOptions`, each combination repeated `runsPerConfig`
times, with shared `ecLevel`, `windowMs`, `gapMs`, `seed`, `rotatePerCycle`,
`metaEvery`. Expansion order is stable: grids → intervals → chunk sizes →
payload sizes → repetitions.

Each `RunSpec` carries the full per-run configuration plus a `testId` such
as `2x2@300ms/c512/p4096#r3` — the `/cNNN` and `/pNNNN` segments appear only
for dimensions the campaign actually varies, so single-value campaigns keep
the historical `1x1@150ms#r1` id format (CSV schema v2 is unchanged; chunk
and payload sizes are dedicated columns regardless).

Throws on empty dimensions and on chunk sizes that overflow a single QR at
the campaign's EC level (see `isChunkEcValid` in [config.md](config.md)).

## `estimateCampaignDurationMs(spec): number`

`estimateSweepDurationMs` applied to the expanded run list — drive ETA
displays from this.
