// Minimal qr-stream receiver: capture from the webcam, decode QR codes each
// frame, reassemble chunks, verify SHA-256, and download the original file.
import {
  QrScanner,
  drawSourceToCanvas,
  parsePayload,
  Reassembler,
  sha256Hex,
} from "@upekshaip/qr-stream";

const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const status = document.getElementById("status");
const video = document.getElementById("cam");

let running = false;
let mediaStream = null;

startBtn.onclick = async () => {
  if (running) return;
  running = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;

  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: { ideal: 1920 } },
  });
  video.srcObject = mediaStream;
  await video.play();

  const scanner = new QrScanner();
  scanner.gridHint = 1; // match the sender's gridSize (2/3 need Chromium's BarcodeDetector)
  await scanner.whenReady();

  const scratch = document.createElement("canvas");
  const reasm = new Reassembler();

  while (running && !reasm.complete) {
    if (video.readyState >= 2) {
      // Downscale to ≤1280 px before decoding — much faster on phones with
      // no meaningful detection loss at typical framing.
      drawSourceToCanvas(video, scratch, 1280);
      const { values } = await scanner.scan(scratch);
      for (const v of values) {
        const p = parsePayload(v);
        if (p.type === "META") reasm.setMeta(p.meta);
        else if (p.type === "DATA" && p.crcOk) reasm.add(p.seq, p.total, p.bytes);
      }
      status.textContent = `${reasm.received}/${reasm.total || "?"} chunks · missing ${reasm.missing().length}`;
    }
    await new Promise((r) => setTimeout(r, 0)); // yield to the event loop
  }

  if (reasm.complete) {
    const bytes = reasm.reconstruct();
    const ok = (await sha256Hex(bytes)) === reasm.meta.sha256;
    status.textContent = ok
      ? `complete · ${reasm.meta.name} · SHA-256 ✓`
      : "complete · SHA-256 MISMATCH";
    if (ok) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes]));
      a.download = reasm.meta.name;
      a.click();
      // Never revoke immediately after click() — Safari may not have started
      // the download yet.
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    }
  }
  teardown();
};

stopBtn.onclick = () => {
  running = false;
  teardown();
  status.textContent = "stopped";
};

function teardown() {
  running = false;
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
}
