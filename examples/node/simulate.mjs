// Headless channel simulation — the research tool behind the package's
// rotatePerCycle option. Models a cyclic QR stream against a parametric
// receiver (sampling period, per-cell detection probability, frame loss)
// with no camera, canvas, or browser.
//
// Run from the package directory:
//   npm run build
//   node examples/node/simulate.mjs
//
// In your own project: import { ... } from "@upekshaip/qr-stream";
import { simulateTransfer, mulberry32 } from "../../dist/index.js";

// The field bug this reproduces: a receiver that decodes every 2nd frame
// (samplingPeriod 2) against a transmitter that replays the identical frame
// order each cycle samples the SAME half of the chunks forever — coverage
// stalls at 50%. The per-cycle random shuffle cannot phase-lock with any
// sampling rate, so it always completes.
const base = {
  totalChunks: 64,
  gridSize: 1,
  metaEvery: 16,
  intervalMs: 300,
  maxCycles: 50,
  channel: { cellDetectProb: 0.95, samplingPeriod: 2, frameLossProb: 0 },
};

for (const rotate of [false, true]) {
  const r = simulateTransfer({
    ...base,
    rotatePerCycle: rotate,
    random: mulberry32(42), // seeded PRNG → reproducible runs
  });
  const coverage = ((r.uniqueChunks / base.totalChunks) * 100).toFixed(0);
  console.log(
    `rotatePerCycle=${String(rotate).padEnd(5)} → ` +
      (r.completed
        ? `completed in ${r.cyclesToComplete} cycles (${(r.timeToCompleteMs / 1000).toFixed(1)} s), ` +
          `${r.duplicateDecodes} duplicate decodes`
        : `STALLED at ${coverage}% coverage after ${base.maxCycles} cycles`)
  );
}
