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

/** One row of experimental results produced by the automated harness. */
export interface ResultRow {
  testId: string;
  gridSize: number;
  intervalMs: number;
  chunkBytes: number;
  ecLevel: string;
  fileBytes: number;
  totalChunks: number;
  windowMs: number;
  framesDisplayed: number;
  capturesProcessed: number;
  qrsDetected: number;
  crcFailures: number;
  uniqueChunksDecoded: number;
  chunkSuccessRate: number; // uniqueChunksDecoded / totalChunks
  rawThroughputBps: number; // all valid detections (incl. duplicates) * bits / sec
  goodputBps: number; // unique chunks * bits / sec
  ber: number; // bit error rate (vs ground truth)
  fer: number; // frame error rate (frames missing >=1 cell)
  avgProcessingMs: number; // mean decode time per capture
  completed: boolean; // whole file reconstructed + SHA-256 matched
  timeToCompleteS: number | null;
}
