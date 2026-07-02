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

/**
 * Maximum byte-mode capacity of a QR code (version 40) per error-correction
 * level. Payload strings use mixed-case base64, which forces byte mode.
 */
export const QR_BYTE_CAPACITY: Record<EcLevel, number> = {
  L: 2953,
  M: 2331,
  Q: 1663,
  H: 1273,
};

/**
 * Worst-case length of an encoded DATA payload string for a given chunk size:
 * "D|seq|total|crc32hex|base64(chunk)". Sequence numbers and totals are
 * budgeted at 7 digits each (files up to 10M chunks).
 */
export function dataPayloadLength(chunkBytes: number): number {
  const b64 = Math.ceil(chunkBytes / 3) * 4;
  return 1 + 1 + 7 + 1 + 7 + 1 + 8 + 1 + b64;
}

/** Whether a chunk size fits in a single QR at the given EC level. */
export function isChunkEcValid(chunkBytes: number, ec: EcLevel): boolean {
  return dataPayloadLength(chunkBytes) <= QR_BYTE_CAPACITY[ec];
}

/** Largest CHUNK_OPTIONS entry that fits at the given EC level. */
export function maxChunkBytesForEc(ec: EcLevel): number {
  let max = CHUNK_OPTIONS[0];
  for (const c of CHUNK_OPTIONS) if (isChunkEcValid(c, ec)) max = c;
  return max;
}

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
