// QR generation + spatial multiplexing (grid composition).
//
// A "frame" is an N x N tile of QR codes drawn on a single canvas. The TX
// cycles through: [META frame] -> [data frame 0] -> ... -> [data frame k] -> repeat.

import QRCode from "qrcode";
import type { EcLevel, FileMeta, GridSize } from "./types";
import { encodeDataPayload, encodeMetaPayload } from "./protocol";
import { QR_BYTE_CAPACITY } from "./config";

export interface FramePlan {
  /** index used for scheduling/logging; -1 denotes the META frame */
  frameIndex: number;
  isMeta: boolean;
  /** payload strings for each occupied cell (length 1 for meta, up to N*N for data) */
  cells: string[];
}

export interface FramePlanOptions {
  /**
   * Repeat the META frame before every K-th data frame (in addition to the
   * one at the start of the cycle). Slow receivers — phone cameras decoding
   * below the frame rate — can miss a META that airs only once per cycle;
   * without META the receiver cannot verify or name the file. Undefined
   * keeps the original single-META-per-cycle behavior.
   */
  metaEvery?: number;
  /**
   * When set, every built payload (data AND meta) is length-checked against
   * the QR version-40 byte capacity for this EC level, and a QrCapacityError
   * is thrown at plan time instead of failing deep inside frame rendering.
   * The META check matters independently of chunk size: a long filename or
   * encryption metadata can overflow the META frame on its own.
   */
  ecLevel?: EcLevel;
}

/**
 * Thrown when a QR payload cannot fit in a single QR code at the chosen
 * error-correction level. Recover by lowering the chunk size, lowering the
 * EC level, or (for META overflow) shortening the file name.
 */
export class QrCapacityError extends Error {
  readonly code = "QR_CAPACITY_EXCEEDED";
  constructor(
    /** actual encoded payload length, in characters (= bytes in QR byte mode) */
    readonly payloadLength: number,
    /** maximum capacity of a version-40 QR at `ecLevel` */
    readonly capacity: number,
    readonly ecLevel: EcLevel,
    /** which payload overflowed: a chunk sequence number, or "meta" */
    readonly seq: number | "meta"
  ) {
    super(
      `QR payload for ${seq === "meta" ? "the META frame" : `chunk ${seq}`} is ` +
        `${payloadLength} bytes, but a QR code at EC level ${ecLevel} holds at most ` +
        `${capacity}. Use a smaller chunk size, a lower EC level, or a shorter file name.`
    );
    this.name = "QrCapacityError";
  }
}

function assertCapacity(payload: string, ecLevel: EcLevel | undefined, seq: number | "meta"): void {
  if (!ecLevel) return;
  const cap = QR_BYTE_CAPACITY[ecLevel];
  if (payload.length > cap) throw new QrCapacityError(payload.length, cap, ecLevel, seq);
}

/**
 * Build the ordered list of frames for one full cycle of a file.
 * Cells within a data frame carry consecutive chunk sequence numbers.
 *
 * @throws QrCapacityError when `opts.ecLevel` is given and any payload
 *   exceeds the QR capacity at that level.
 */
export function buildFramePlan(
  chunks: Uint8Array[],
  meta: FileMeta,
  gridSize: GridSize,
  opts: FramePlanOptions = {}
): FramePlan[] {
  const perFrame = gridSize * gridSize;
  const total = chunks.length;
  const metaPayload = encodeMetaPayload(meta);
  assertCapacity(metaPayload, opts.ecLevel, "meta");
  const metaFrame = (): FramePlan => ({ frameIndex: -1, isMeta: true, cells: [metaPayload] });
  const metaEvery = opts.metaEvery && opts.metaEvery > 0 ? opts.metaEvery : Infinity;
  const frames: FramePlan[] = [metaFrame()];
  let f = 0;
  for (let start = 0; start < total; start += perFrame) {
    if (f > 0 && f % metaEvery === 0) frames.push(metaFrame());
    const cells: string[] = [];
    for (let c = start; c < Math.min(start + perFrame, total); c++) {
      const payload = encodeDataPayload(c, total, chunks[c]);
      assertCapacity(payload, opts.ecLevel, c);
      cells.push(payload);
    }
    frames.push({ frameIndex: f++, isMeta: false, cells });
  }
  return frames;
}

/**
 * Build a frame plan carrying ONLY the given chunk sequence numbers — used
 * for operator-assisted selective retransmission. The link is simplex, so
 * the receiver's missing-chunk list travels via the human operator; the
 * sender then streams just those chunks (plus the META frame) instead of
 * cycling the whole file. Sequence numbers are deduplicated, sorted, and
 * filtered to the valid range.
 *
 * @throws QrCapacityError when `opts.ecLevel` is given and any payload
 *   exceeds the QR capacity at that level.
 */
export function buildFramePlanForSeqs(
  chunks: Uint8Array[],
  meta: FileMeta,
  gridSize: GridSize,
  seqs: number[],
  opts: Pick<FramePlanOptions, "ecLevel"> = {}
): FramePlan[] {
  const perFrame = gridSize * gridSize;
  const total = chunks.length;
  const wanted = [...new Set(seqs)].filter((s) => s >= 0 && s < total).sort((a, b) => a - b);
  const metaPayload = encodeMetaPayload(meta);
  assertCapacity(metaPayload, opts.ecLevel, "meta");
  const frames: FramePlan[] = [{ frameIndex: -1, isMeta: true, cells: [metaPayload] }];
  let f = 0;
  for (let start = 0; start < wanted.length; start += perFrame) {
    const cells: string[] = [];
    for (const seq of wanted.slice(start, start + perFrame)) {
      const payload = encodeDataPayload(seq, total, chunks[seq]);
      assertCapacity(payload, opts.ecLevel, seq);
      cells.push(payload);
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
 *
 * @throws QrCapacityError when any cell payload exceeds the QR capacity at
 *   `ecLevel` (a typed error instead of an opaque failure from the QR encoder).
 */
export async function composeFrame(
  target: HTMLCanvasElement,
  frame: FramePlan,
  gridSize: GridSize,
  sidePx: number,
  ecLevel: EcLevel
): Promise<void> {
  for (const cell of frame.cells) {
    if (cell.length > QR_BYTE_CAPACITY[ecLevel]) {
      const seq = frame.isMeta ? ("meta" as const) : Number(cell.split("|", 3)[1]);
      throw new QrCapacityError(cell.length, QR_BYTE_CAPACITY[ecLevel], ecLevel, seq);
    }
  }

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
