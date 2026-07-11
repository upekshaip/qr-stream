// qr-stream — Adaptive QR Streaming core.
//
// Screen-camera data transfer over animated QR codes: file segmentation,
// self-describing simplex protocol (CRC32 per chunk, SHA-256 per file),
// spatial multiplexing (N x N grids), a drift-corrected transmit engine,
// multi-QR detection, optional AES-256-GCM encryption, and a headless
// channel simulator for protocol research.
//
// Browser-first: rendering/detection use Canvas and (optionally)
// BarcodeDetector at call time. Nothing touches browser APIs at import time,
// so the module is safe to import in Node/SSR — and the protocol, crypto,
// and simulation layers are fully usable there.

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
  QrCapacityError,
  type FramePlan,
  type FramePlanOptions,
} from "./qrGen";

// Transmit engine
export { TxEngine, cycleOrder, type TxEngineOptions, type TxProgress } from "./txEngine";

// QR detection (RX side)
export {
  QrScanner,
  drawSourceToCanvas,
  type ScanResult,
  type CaptureSource,
} from "./qrDetect";

// Encryption (optional)
export {
  encryptFile,
  decryptFile,
  verifyPassword,
  PBKDF2_ITERATIONS_DEFAULT,
} from "./crypto";

// Headless simulation (research + CI)
export {
  simulateTransfer,
  planStructure,
  mulberry32,
  type SimulateOptions,
  type SimulationResult,
  type CycleStats,
  type ChannelModel,
} from "./simulate";

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

// Version
export { VERSION } from "./version";

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
