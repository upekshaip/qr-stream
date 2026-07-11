import { useState } from "react";
import { PROTOCOL, segment, sha256Hex, buildFramePlan } from "@upekshaip/qr-stream";
import { useTxEngine } from "./useTxEngine";

const CHUNK_BYTES = 512;
const GRID_SIZE = 1;
const INTERVAL_MS = 300;
const EC_LEVEL = "M" as const;

export function Sender() {
  const { canvasRef, running, progress, error, start, stop } = useTxEngine();
  const [file, setFile] = useState<File | null>(null);

  async function onStart() {
    if (!file || running) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunks = segment(bytes, CHUNK_BYTES);
    const meta = {
      protocol: PROTOCOL,
      name: file.name,
      size: bytes.length,
      sha256: await sha256Hex(bytes),
      total: chunks.length,
      chunkBytes: CHUNK_BYTES,
    };
    const frames = buildFramePlan(chunks, meta, GRID_SIZE, {
      metaEvery: 16,
      ecLevel: EC_LEVEL,
    });
    start(frames, {
      intervalMs: INTERVAL_MS,
      gridSize: GRID_SIZE,
      sidePx: 768,
      ecLevel: EC_LEVEL,
      loop: true,
      rotatePerCycle: true,
    });
  }

  return (
    <div>
      <p>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button onClick={onStart} disabled={!file || running}>Start</button>
        <button onClick={stop} disabled={!running}>Stop</button>
      </p>
      <p className="status">
        {error
          ? `error: ${error}`
          : running
            ? `frames shown ${progress.slot + 1} · cycle ${progress.cycles + 1}`
            : "idle"}
      </p>
      <canvas ref={canvasRef} />
    </div>
  );
}
