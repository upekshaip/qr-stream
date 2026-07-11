// Shared types for the Adaptive QR Streaming Framework.

export type GridSize = 1 | 2 | 3;
export type EcLevel = "L" | "M" | "Q" | "H";

/** Transmission configuration (the independent variables in the experiment). */
export interface TxConfig {
  gridSize: GridSize; // N, producing an N x N grid (1, 4 or 9 codes per frame)
  intervalMs: number; // how long each frame is displayed (temporal multiplexing)
  chunkBytes: number; // raw payload bytes carried by a single QR code
  ecLevel: EcLevel; // QR error-correction level
  loop: boolean; // cyclically repeat the sequence (reliability via redundancy)
}

/** Encryption metadata embedded in FileMeta when a password is used. */
export interface EncryptionMeta {
  salt: string;         // base64 — 16-byte PBKDF2 salt
  iv: string;           // base64 — 12-byte AES-GCM IV
  passwordHash: string; // hex SHA-256 of raw PBKDF2 key bytes (password verifier)
  /**
   * PBKDF2-HMAC-SHA256 iteration count used to derive the key. Absent on
   * legacy (pre-0.1.0) streams, which used 100 000; readers fall back to
   * that value so old captures keep decrypting.
   */
  iterations?: number;
}

/** File-level metadata, transmitted in a dedicated META frame each cycle. */
export interface FileMeta {
  protocol: string; // "qrstream/1"
  name: string;
  size: number; // bytes (of the transmitted payload — ciphertext if encrypted)
  sha256: string; // hex digest of the transmitted payload
  total: number; // number of DATA chunks
  chunkBytes: number; // raw bytes per chunk (last chunk may be smaller)
  encryption?: EncryptionMeta; // present only when the file was encrypted with a password
}

/** A single decoded QR payload after parsing + CRC validation. */
export type ParsedPayload =
  | { type: "DATA"; seq: number; total: number; bytes: Uint8Array; crcOk: boolean; raw: string }
  | { type: "META"; meta: FileMeta; raw: string }
  | { type: "INVALID"; raw: string };

/**
 * One row of experimental results produced by the automated harness
 * (schema v2 — adds repetition, reproducibility, environment, and
 * verification columns; v1 CSVs predate these fields).
 */
export interface ResultRow {
  testId: string;
  /** 0-based repetition index of this config within the sweep */
  runIndex: number;
  /** PRNG seed that generated the synthetic payload */
  seed: number;
  gridSize: number;
  intervalMs: number;
  chunkBytes: number;
  ecLevel: string;
  /** whether the transmitter shuffled frame order each cycle */
  rotatePerCycle: boolean;
  /** META repetition cadence used by the transmitter (null = once per cycle) */
  metaEvery: number | null;
  fileBytes: number;
  totalChunks: number;
  windowMs: number;
  framesDisplayed: number;
  capturesProcessed: number;
  qrsDetected: number;
  crcFailures: number;
  uniqueChunksDecoded: number;
  chunkSuccessRate: number; // uniqueChunksDecoded / totalChunks
  rawThroughputBps: number; // all valid detections (incl. duplicates), actual bytes / sec
  goodputBps: number; // unique chunks, actual bytes / sec
  /**
   * Residual bit error rate measured on CRC-ACCEPTED chunks against ground
   * truth. This is a post-CRC residual (chunks with bit errors almost always
   * fail CRC-32 and are excluded), NOT a raw channel BER.
   */
  ber: number;
  fer: number; // frame error rate (frames missing >=1 cell)
  avgProcessingMs: number; // mean decode time per capture
  p50ProcessingMs: number; // median decode time per capture
  p95ProcessingMs: number; // 95th-percentile decode time per capture
  /** all chunks decoded (count-complete) */
  completed: boolean;
  /** reconstructed bytes SHA-256-verified against ground truth */
  shaVerified: boolean;
  timeToCompleteS: number | null;
  /** "barcode-detector" or "jsqr" */
  scannerEngine: string;
  userAgent: string;
  platform: string;
  /** receiver screen resolution, e.g. "2560x1440" */
  screenRes: string;
  /** receiver devicePixelRatio */
  dpr: number;
  /** capture canvas resolution fed to the decoder, e.g. "1280x720" */
  captureRes: string;
  /** qr-stream package version that produced the row */
  pkgVersion: string;
}
