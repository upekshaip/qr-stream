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
  onProgress?: (p: TxProgress) => void;
  onState?: (s: "rendering" | "running" | "stopped") => void;
  onCycle?: (cycles: number) => void;
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

    let idx = 0;
    let slot = 0;
    let cycles = 0;
    let nextBmp = this.renderBitmap(o.frames[0], o);
    o.onState?.("running");
    let slotStart = performance.now();

    while (!this.stopped) {
      const cur = await nextBmp;
      if (this.stopped) {
        cur.close?.();
        break;
      }
      const ni = (idx + 1) % n;
      nextBmp = this.renderBitmap(o.frames[ni], o); // render-ahead (no await)

      this.blit(cur);
      cur.close?.();
      o.onProgress?.({ frameIndex: o.frames[idx].frameIndex, slot, cycles });

      const targetEnd = slotStart + o.intervalMs;
      await sleep(Math.max(0, targetEnd - performance.now()));
      slotStart = targetEnd;
      slot++;
      idx = ni;
      if (ni === 0) {
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
