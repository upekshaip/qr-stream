import type { EcLevel, GridSize, TxConfig } from "./types";

export const DEFAULT_CONFIG: TxConfig = {
  gridSize: 1,
  intervalMs: 300,
  chunkBytes: 512,
  ecLevel: "M",
  loop: true,
};

export const GRID_OPTIONS: GridSize[] = [1, 2, 3];
export const INTERVAL_OPTIONS = [100, 150, 200, 300, 500, 700, 1000];
export const EC_OPTIONS: EcLevel[] = ["L", "M", "Q", "H"];
export const CHUNK_OPTIONS = [128, 256, 384, 512, 768, 1024];

// Sweep matrix used by the automated harness (RQ1 / RQ2).
export const SWEEP = {
  grids: [1, 2, 3] as GridSize[],
  intervals: [150, 300, 500, 1000],
  chunkBytes: 384,
  ecLevel: "M" as EcLevel,
  // how long to capture each configuration before logging a result row
  windowMsPerConfig: 6000,
  // settle time before metrics start (lets RX lock onto the stream)
  warmupMs: 1200,
  // synthetic test payload size (bytes)
  payloadBytes: 4096,
};
