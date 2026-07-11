// Segment a payload, build a frame plan, and inspect what would be
// transmitted — entirely headless (no canvas, no camera).
//
// Run from the package directory:
//   npm run build
//   node examples/node/plan-inspect.mjs
//
// Imports the built dist directly so the example works without installing
// the package. In your own project simply:
//   import { segment, buildFramePlan, ... } from "@upekshaip/qr-stream";
import {
  PROTOCOL,
  segment,
  sha256Hex,
  buildFramePlan,
  estimateCycleMs,
  dataPayloadLength,
  maxChunkBytesForEc,
  isChunkEcValid,
  QrCapacityError,
} from "../../dist/index.js";

// A synthetic 100 KiB payload standing in for a real file.
const bytes = new Uint8Array(100 * 1024).map((_, i) => i % 251);
const chunkBytes = 512;
const ecLevel = "M";
const gridSize = 2;

const chunks = segment(bytes, chunkBytes);
const meta = {
  protocol: PROTOCOL,
  name: "example.bin",
  size: bytes.length,
  sha256: await sha256Hex(bytes),
  total: chunks.length,
  chunkBytes,
};

const frames = buildFramePlan(chunks, meta, gridSize, { metaEvery: 16, ecLevel });
const metaFrames = frames.filter((f) => f.isMeta).length;

console.log("payload             ", `${bytes.length} bytes`);
console.log("chunks              ", `${chunks.length} × ${chunkBytes} B`);
console.log("frames per cycle    ", `${frames.length} (${metaFrames} META + ${frames.length - metaFrames} DATA)`);
console.log("grid size           ", `${gridSize}×${gridSize} (${gridSize * gridSize} codes per displayed frame)`);
console.log("QR payload length   ", `${dataPayloadLength(chunkBytes)} chars per DATA frame`);
console.log("est. cycle time     ", `${(estimateCycleMs(frames.length, 300) / 1000).toFixed(1)} s at 300 ms/frame`);
console.log("capacity check      ", `chunk ${chunkBytes} B at EC ${ecLevel}: ${isChunkEcValid(chunkBytes, ecLevel) ? "fits" : "TOO BIG"}`);
console.log("max chunk at EC H   ", `${maxChunkBytesForEc("H")} B`);

// Plan-time validation: oversized payloads throw a typed error instead of
// failing mid-render.
try {
  const bigChunks = segment(bytes, 2048);
  buildFramePlan(bigChunks, { ...meta, chunkBytes: 2048, total: bigChunks.length }, 1, { ecLevel: "H" });
} catch (err) {
  if (err instanceof QrCapacityError) {
    console.log("expected error      ", `${err.code}: ${err.message}`);
  } else {
    throw err;
  }
}
