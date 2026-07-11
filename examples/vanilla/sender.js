// Minimal qr-stream sender: segment a file, build a frame plan, and play it
// as a looping QR animation on a canvas.
import {
  PROTOCOL,
  segment,
  sha256Hex,
  buildFramePlan,
  estimateCycleMs,
  TxEngine,
} from "@upekshaip/qr-stream";

const fileInput = document.getElementById("file");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const status = document.getElementById("status");
const canvas = document.getElementById("stage");

const engine = new TxEngine(canvas);

startBtn.onclick = async () => {
  const file = fileInput.files[0];
  if (!file || engine.running) return;

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Tunables — see docs/adaptive-tuning.md for how to pick these.
  const chunkBytes = 512; // bytes per QR code
  const gridSize = 1; //     1 = one QR per frame; 2/3 need a Chromium receiver
  const intervalMs = 300; // display time per frame
  const ecLevel = "M"; //    QR error-correction level

  const chunks = segment(bytes, chunkBytes);
  const meta = {
    protocol: PROTOCOL,
    name: file.name,
    size: bytes.length,
    sha256: await sha256Hex(bytes),
    total: chunks.length,
    chunkBytes,
  };

  // metaEvery repeats the META frame so slow receivers can't miss it;
  // rotatePerCycle shuffles the frame order each cycle so a slow receiver
  // can never phase-lock onto the same subset of frames.
  const frames = buildFramePlan(chunks, meta, gridSize, { metaEvery: 16, ecLevel });

  const cycleS = (estimateCycleMs(frames.length, intervalMs) / 1000).toFixed(1);
  status.textContent = `${chunks.length} chunks · ${frames.length} frames/cycle · ~${cycleS} s/cycle`;
  startBtn.disabled = true;
  stopBtn.disabled = false;

  engine.start({
    frames,
    intervalMs,
    gridSize,
    sidePx: 768,
    ecLevel,
    loop: true,
    rotatePerCycle: true,
    onProgress: (p) => {
      // p.slot counts frames shown this run (across cycles); p.frameIndex is
      // the position in the plan (-1 = META frame).
      status.textContent = `frames shown ${p.slot + 1} · cycle ${p.cycles + 1}`;
    },
    onState: (s) => {
      if (s === "stopped") {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        status.textContent = "stopped";
      }
    },
    onError: (err) => {
      // Typical cause: chunkBytes too large for the EC level (QrCapacityError).
      status.textContent = `error: ${err.message}`;
    },
  });
};

stopBtn.onclick = () => engine.stop();
