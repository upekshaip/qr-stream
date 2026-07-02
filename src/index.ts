// qr-stream — Adaptive QR Streaming core.
//
// Screen-camera data transfer over animated QR codes: file segmentation,
// self-describing simplex protocol (CRC32 per chunk, SHA-256 per file),
// spatial multiplexing (N x N grids), a drift-corrected transmit engine,
// multi-QR detection, and optional AES-256-GCM encryption.
//
// Browser-only: uses Canvas, Web Crypto, and (optionally) BarcodeDetector.
// Import it in client-side code; nothing runs at import time in Node/SSR.

// Protocol + reassembly
export {
  PROTOCOL,
  segment,
  encodeDataPayload,
  encodeMetaPayload,
  parsePayload,
  Reassembler,
} from "./protocol";

// Binary helpers
export { bytesToBase64, base64ToBytes, sha256Hex, bitDiff } from "./binary";

// Integrity
export { crc32, crc32Hex } from "./crc32";

// QR generation + frame composition (TX side)
export {
  buildFramePlan,
  buildFramePlanForSeqs,
  composeFrame,
  estimateCycleMs,
  type FramePlan,
} from "./qrGen";

// Transmit engine
export { TxEngine, type TxEngineOptions, type TxProgress } from "./txEngine";

// QR detection (RX side)
export { QrScanner, drawSourceToCanvas, type ScanResult } from "./qrDetect";

// Encryption (optional)
export { encryptFile, decryptFile, verifyPassword } from "./crypto";

// Configuration presets + capacity guards
export {
  DEFAULT_CONFIG,
  GRID_OPTIONS,
  INTERVAL_OPTIONS,
  EC_OPTIONS,
  CHUNK_OPTIONS,
  SWEEP,
  QR_BYTE_CAPACITY,
  dataPayloadLength,
  isChunkEcValid,
  maxChunkBytesForEc,
} from "./config";

// Types
export type {
  GridSize,
  EcLevel,
  TxConfig,
  FileMeta,
  EncryptionMeta,
  ParsedPayload,
  ResultRow,
} from "./types";
