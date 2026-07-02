// QR generation + spatial multiplexing (grid composition).
//
// A "frame" is an N x N tile of QR codes drawn on a single canvas. The TX
// cycles through: [META frame] -> [data frame 0] -> ... -> [data frame k] -> repeat.

import QRCode from "qrcode";
import type { EcLevel, FileMeta, GridSize } from "./types";
import { encodeDataPayload, encodeMetaPayload } from "./protocol";

export interface FramePlan {
  /** index used for scheduling/logging; -1 denotes the META frame */
  frameIndex: number;
  isMeta: boolean;
  /** payload strings for each occupied cell (length 1 for meta, up to N*N for data) */
  cells: string[];
}

/**
 * Build the ordered list of frames for one full cycle of a file.
 * Cells within a data frame carry consecutive chunk sequence numbers.
 */
export function buildFramePlan(
  chunks: Uint8Array[],
  meta: FileMeta,
  gridSize: GridSize
): FramePlan[] {
  const perFrame = gridSize * gridSize;
  const total = chunks.length;
  const frames: FramePlan[] = [{ frameIndex: -1, isMeta: true, cells: [encodeMetaPayload(meta)] }];
  let f = 0;
  for (let start = 0; start < total; start += perFrame) {
    const cells: string[] = [];
    for (let c = start; c < Math.min(start + perFrame, total); c++) {
      cells.push(encodeDataPayload(c, total, chunks[c]));
    }
    frames.push({ frameIndex: f++, isMeta: false, cells });
  }
  return frames;
}

/** Render a single QR payload onto its own square canvas. */
async function renderQr(text: string, ecLevel: EcLevel, modulePx: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: ecLevel,
    margin: 2,
    scale: modulePx,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return canvas;
}

/**
 * Compose a frame onto the supplied target canvas, sized `sidePx` x `sidePx`.
 * Empty cells (when the last frame is partially filled) are left white.
 */
export async function composeFrame(
  target: HTMLCanvasElement,
  frame: FramePlan,
  gridSize: GridSize,
  sidePx: number,
  ecLevel: EcLevel
): Promise<void> {
  const ctx = target.getContext("2d")!;
  target.width = sidePx;
  target.height = sidePx;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sidePx, sidePx);

  const n = frame.isMeta ? 1 : gridSize;
  const gap = Math.max(4, Math.floor(sidePx * 0.012));
  const cellSide = Math.floor((sidePx - gap * (n + 1)) / n);
  // module scale chosen so a dense QR still fits comfortably inside a cell
  const modulePx = Math.max(2, Math.floor(cellSide / 60));

  for (let idx = 0; idx < frame.cells.length; idx++) {
    const row = Math.floor(idx / n);
    const col = idx % n;
    const qr = await renderQr(frame.cells[idx], ecLevel, modulePx);
    const x = gap + col * (cellSide + gap);
    const y = gap + row * (cellSide + gap);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, x, y, cellSide, cellSide);
  }
}

/** Rough estimate of total cycle duration (ms) for planning/progress. */
export function estimateCycleMs(frameCount: number, intervalMs: number): number {
  return frameCount * intervalMs;
}
