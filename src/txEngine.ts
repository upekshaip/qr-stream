// Transmit engine: drives the on-screen QR animation with a render-ahead
// scheduler so frame timing stays close to the requested interval.
//
// The proposal flags that naive GUI loops have imprecise timing (their reason
// for choosing pygame). Here we render the NEXT frame into an ImageBitmap while
// the CURRENT frame is on screen, then blit instantly at the slot boundary and
// correct for drift using performance.now(). Only two bitmaps are ever alive,
// so memory stays flat regardless of file size.

import type { EcLevel, GridSize } from "./types";
import { composeFrame, type FramePlan } from "./qrGen";

export interface TxProgress {
  frameIndex: number; // plan index currently shown (-1 = meta)
  slot: number; // 0-based count of frames shown this run
  cycles: number; // completed full passes
}

export interface TxEngineOptions {
  frames: FramePlan[];
  intervalMs: number;
  gridSize: GridSize;
  sidePx: number;
  ecLevel: EcLevel;
  loop: boolean;
  /**
   * Shuffle the frame order every cycle (frame 0 always plays first). A
   * receiver that decodes slower than the frame interval phase-locks onto
   * the same frames when every cycle replays the identical order — the same
   * gaps then never fill. Randomizing the order each cycle cannot alias
   * with ANY receiver sampling rate, so gaps fill within a few cycles.
   * (Deterministic rotations were tried first, but a fixed rotation step
   * can itself phase-lock against some sampling rates.)
   */
  rotatePerCycle?: boolean;
  onProgress?: (p: TxProgress) => void;
  onState?: (s: "rendering" | "running" | "stopped") => void;
  onCycle?: (cycles: number) => void;
}

/** Frame play order for a cycle: index 0 first, the rest shuffled. */
function cycleOrder(n: number, cycle: number, rotate: boolean): number[] {
  const rest = Array.from({ length: n - 1 }, (_, i) => i + 1);
  if (!rotate || rest.length < 2 || cycle === 0) return [0, ...rest];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [0, ...rest];
}

export class TxEngine {
  private stopped = false;
  private raf = 0;

  constructor(private canvas: HTMLCanvasElement) {}

  private async renderBitmap(plan: FramePlan, o: TxEngineOptions): Promise<ImageBitmap> {
    const tmp = document.createElement("canvas");
    await composeFrame(tmp, plan, o.gridSize, o.sidePx, o.ecLevel);
    return createImageBitmap(tmp);
  }

  private blit(bmp: ImageBitmap) {
    if (this.canvas.width !== bmp.width) this.canvas.width = bmp.width;
    if (this.canvas.height !== bmp.height) this.canvas.height = bmp.height;
    const ctx = this.canvas.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
  }

  async start(o: TxEngineOptions) {
    this.stopped = false;
    const n = o.frames.length;
    if (n === 0) return;
    o.onState?.("rendering");

    let pos = 0; // position within the current cycle's order
    let slot = 0;
    let cycles = 0;
    let order = cycleOrder(n, 0, !!o.rotatePerCycle);
    let nextBmp = this.renderBitmap(o.frames[order[0]], o);
    o.onState?.("running");
    let slotStart = performance.now();

    while (!this.stopped) {
      const cur = await nextBmp;
      if (this.stopped) {
        cur.close?.();
        break;
      }
      const curIdx = order[pos];
      const nextPos = (pos + 1) % n;
      const nextOrder = nextPos === 0 ? cycleOrder(n, cycles + 1, !!o.rotatePerCycle) : order;
      nextBmp = this.renderBitmap(o.frames[nextOrder[nextPos]], o); // render-ahead (no await)

      this.blit(cur);
      cur.close?.();
      o.onProgress?.({ frameIndex: o.frames[curIdx].frameIndex, slot, cycles });

      const targetEnd = slotStart + o.intervalMs;
      await sleep(Math.max(0, targetEnd - performance.now()));
      slotStart = targetEnd;
      slot++;
      pos = nextPos;
      order = nextOrder;
      if (pos === 0) {
        cycles++;
        o.onCycle?.(cycles);
        if (!o.loop) {
          this.stopped = true;
        }
      }
    }
    o.onState?.("stopped");
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
