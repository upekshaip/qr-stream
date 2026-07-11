# Example — React hook sketches

Two minimal hooks wrapping the engine and scanner. Key React-specific rules:

- **Hot callbacks write to refs, not state.** `onProgress` fires per frame
  (up to 10/s); calling `setState` there re-renders the whole page per frame.
  Buffer in a ref and flush on a ~250 ms interval.
- Stop the engine / camera in effect cleanup.
- The pages using these must be client components (`"use client"`).

## useTxEngine

```tsx
import { useEffect, useRef, useState } from "react";
import { TxEngine, type FramePlan, type TxEngineOptions } from "@upekshaip/qr-stream";

export function useTxEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TxEngine | null>(null);
  const progRef = useRef({ slot: 0, cycles: 0 });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ slot: 0, cycles: 0 });

  useEffect(() => () => engineRef.current?.stop(), []);

  // throttled flush: refs -> state
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setProgress({ ...progRef.current }), 250);
    return () => window.clearInterval(id);
  }, [running]);

  function start(frames: FramePlan[], opts: Omit<TxEngineOptions, "frames" | "onProgress" | "onState">) {
    if (!canvasRef.current) return;
    engineRef.current?.stop();
    const engine = new TxEngine(canvasRef.current);
    engineRef.current = engine;
    setRunning(true);
    void engine.start({
      ...opts,
      frames,
      onProgress: (p) => { progRef.current = { slot: p.slot, cycles: p.cycles }; },
      onState: (s) => { if (s === "stopped") setRunning(false); },
    });
  }

  return { canvasRef, running, progress, start, stop: () => engineRef.current?.stop() };
}
```

## useQrReceiver

```tsx
import { useEffect, useRef, useState } from "react";
import { QrScanner, Reassembler, drawSourceToCanvas, parsePayload } from "@upekshaip/qr-stream";

export function useQrReceiver(gridHint: 1 | 2 | 3 = 1) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const runningRef = useRef(false);
  const reasmRef = useRef(new Reassembler());
  const [received, setReceived] = useState(0);
  const [total, setTotal] = useState(0);
  const [result, setResult] = useState<Uint8Array | null>(null);

  useEffect(() => () => { runningRef.current = false; }, []);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1920 } },
    });
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play();

    const scanner = new QrScanner();
    scanner.gridHint = gridHint;
    await scanner.whenReady();
    const scratch = document.createElement("canvas");
    reasmRef.current = new Reassembler();
    runningRef.current = true;

    (async () => {
      const reasm = reasmRef.current;
      while (runningRef.current && !reasm.complete) {
        if (video.readyState >= 2) {
          drawSourceToCanvas(video, scratch, 1280);
          const { values } = await scanner.scan(scratch);
          for (const v of values) {
            const p = parsePayload(v);
            if (p.type === "META") reasm.setMeta(p.meta);
            else if (p.type === "DATA" && p.crcOk) reasm.add(p.seq, p.total, p.bytes);
          }
          setReceived(reasm.received); // throttle this in real apps (see rule above)
          setTotal(reasm.total);
        }
        await new Promise((r) => setTimeout(r, 0));
      }
      if (reasm.complete) setResult(reasm.reconstruct());
      stream.getTracks().forEach((t) => t.stop());
    })();
  }

  return { videoRef, received, total, result, start, stop: () => { runningRef.current = false; } };
}
```

For a production-grade implementation (chunk map, ETA, selective
retransmission, torch, wake lock, completion dialog) read the app pages in
the repository: `app/tx/tx-client.tsx` and `app/rx/rx-client.tsx`.
