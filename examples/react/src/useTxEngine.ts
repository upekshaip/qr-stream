// React hook wrapping TxEngine. Key rule: the onProgress callback fires per
// displayed frame (up to ~10/s) — write to a ref there and flush to state on
// a 250 ms interval, never setState per frame.
import { useEffect, useRef, useState } from "react";
import { TxEngine, type FramePlan, type TxEngineOptions } from "@upekshaip/qr-stream";

export function useTxEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TxEngine | null>(null);
  const progRef = useRef({ slot: 0, cycles: 0 });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ slot: 0, cycles: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => engineRef.current?.stop(), []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setProgress({ ...progRef.current }), 250);
    return () => window.clearInterval(id);
  }, [running]);

  function start(
    frames: FramePlan[],
    opts: Omit<TxEngineOptions, "frames" | "onProgress" | "onState" | "onError">
  ) {
    if (!canvasRef.current) return;
    engineRef.current?.stop();
    const engine = new TxEngine(canvasRef.current);
    engineRef.current = engine;
    setError(null);
    setRunning(true);
    void engine.start({
      ...opts,
      frames,
      onProgress: (p) => {
        progRef.current = { slot: p.slot, cycles: p.cycles };
      },
      onState: (s) => {
        if (s === "stopped") setRunning(false);
      },
      onError: (err) => setError(err.message),
    });
  }

  return { canvasRef, running, progress, error, start, stop: () => engineRef.current?.stop() };
}
