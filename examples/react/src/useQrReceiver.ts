// React hook wrapping QrScanner + Reassembler: camera capture, per-frame
// decode, chunk reassembly, SHA-256 verification.
import { useEffect, useRef, useState } from "react";
import {
  QrScanner,
  Reassembler,
  drawSourceToCanvas,
  parsePayload,
  sha256Hex,
  type FileMeta,
} from "@upekshaip/qr-stream";

export interface ReceivedFile {
  meta: FileMeta;
  bytes: Uint8Array;
  shaOk: boolean;
}

export function useQrReceiver(gridHint: 1 | 2 | 3 = 1) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const runningRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const [running, setRunning] = useState(false);
  const [received, setReceived] = useState(0);
  const [total, setTotal] = useState(0);
  const [result, setResult] = useState<ReceivedFile | null>(null);

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    if (runningRef.current) return;
    setResult(null);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1920 } },
    });
    streamRef.current = stream;
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play();

    const scanner = new QrScanner();
    scanner.gridHint = gridHint;
    await scanner.whenReady();
    const scratch = document.createElement("canvas");
    const reasm = new Reassembler();
    runningRef.current = true;
    setRunning(true);

    let lastFlush = 0;
    while (runningRef.current && !reasm.complete) {
      if (video.readyState >= 2) {
        drawSourceToCanvas(video, scratch, 1280);
        const { values } = await scanner.scan(scratch);
        for (const v of values) {
          const p = parsePayload(v);
          if (p.type === "META") reasm.setMeta(p.meta);
          else if (p.type === "DATA" && p.crcOk) reasm.add(p.seq, p.total, p.bytes);
        }
        // throttle state updates to ~4/s
        const now = performance.now();
        if (now - lastFlush > 250) {
          lastFlush = now;
          setReceived(reasm.received);
          setTotal(reasm.total);
        }
      }
      await new Promise((r) => setTimeout(r, 0));
    }

    if (reasm.complete && reasm.meta) {
      const bytes = reasm.reconstruct();
      const shaOk = (await sha256Hex(bytes)) === reasm.meta.sha256;
      setReceived(reasm.received);
      setTotal(reasm.total);
      setResult({ meta: reasm.meta, bytes, shaOk });
    }
    stop();
  }

  function stop() {
    runningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRunning(false);
  }

  return { videoRef, running, received, total, result, start, stop };
}
