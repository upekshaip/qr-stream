// Transmit engine: drives the on-screen QR animation with a render-ahead
// scheduler so frame timing stays close to the requested interval.
//
// The proposal flags that naive GUI loops have imprecise timing (their reason
// for choosing pygame). Here we render the NEXT frame into an ImageBitmap while
// the CURRENT frame is on screen, then blit instantly at the slot boundary and
// correct for drift using performance.now(). Only two bitmaps are ever alive,
// so memory stays flat regardless of file size.
//
// Lifecycle: each start() creates a "run" holding an AbortController. stop()
// detaches the run and aborts its sleep, so (a) a parked loop wakes instantly
// instead of after up to one interval, and (b) a stale loop can never touch
// the canvas again after a stop()/start() restart — every await is followed
// by a liveness check against the current run token.

import type { EcLevel, GridSize } from "./types";
import { composeFrame, type FramePlan } from "./qrGen";

export interface TxProgress {
  /** plan index currently shown (-1 = meta) */
  frameIndex: number;
  /** 0-based count of frames shown this run */
  slot: number;
  /** completed full passes */
  cycles: number;
}

export interface TxEngineOptions {
  /** frames for one cycle, from buildFramePlan / buildFramePlanForSeqs */
  frames: FramePlan[];
  /** how long each frame stays on screen (temporal multiplexing) */
  intervalMs: number;
  gridSize: GridSize;
  /** side length of the square output canvas, in pixels */
  sidePx: number;
  ecLevel: EcLevel;
  /** cyclically repeat the sequence (reliability via redundancy) */
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
  /**
   * Random source for the per-cycle shuffle. Defaults to Math.random; inject
   * a seeded PRNG (e.g. `mulberry32(seed)`) to make experiment runs
   * reproducible.
   */
  random?: () => number;
  onProgress?: (p: TxProgress) => void;
  /**
   * State transitions: "rendering" (building the first frame), "running"
   * (animating), "stopped". "stopped" is ALWAYS emitted exactly once per run —
   * on natural completion (loop: false), on stop(), and after an error.
   */
  onState?: (s: "rendering" | "running" | "stopped") => void;
  onCycle?: (cycles: number) => void;
  /**
   * Called when a frame fails to render or blit — most commonly a payload
   * exceeding QR capacity at the chosen EC level (QrCapacityError). The run
   * then ends and onState("stopped") fires; start() itself never rejects for
   * runtime render errors.
   */
  onError?: (err: Error) => void;
}

/**
 * Frame play order for a cycle: index 0 (the META frame) always first, the
 * rest shuffled via Fisher–Yates when `rotate` is set. Exported so the
 * simulation module provably shares the engine's ordering logic.
 */
export function cycleOrder(
  n: number,
  cycle: number,
  rotate: boolean,
  random: () => number = Math.random
): number[] {
  const rest = Array.from({ length: n - 1 }, (_, i) => i + 1);
  if (!rotate || rest.length < 2 || cycle === 0) return [0, ...rest];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [0, ...rest];
}

interface Run {
  abort: AbortController;
}

export class TxEngine {
  private run: Run | null = null;

  constructor(private canvas: HTMLCanvasElement) {}

  /** Whether a transmission run is currently active. */
  get running(): boolean {
    return this.run !== null;
  }

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

  /**
   * Start transmitting. Resolves when the run ends (natural completion with
   * loop: false, stop(), or a render error routed to onError). Throws
   * synchronously only if the engine is already running.
   */
  async start(o: TxEngineOptions): Promise<void> {
    if (this.run) throw new Error("TxEngine is already running; call stop() first");
    const n = o.frames.length;
    if (n === 0) return;

    const run: Run = { abort: new AbortController() };
    this.run = run;
    const live = () => this.run === run;
    const rnd = o.random ?? Math.random;

    let nextBmp: Promise<ImageBitmap> | null = null;
    o.onState?.("rendering");
    try {
      let pos = 0; // position within the current cycle's order
      let slot = 0;
      let cycles = 0;
      let done = false;
      let order = cycleOrder(n, 0, !!o.rotatePerCycle, rnd);
      nextBmp = this.renderBitmap(o.frames[order[0]], o);
      o.onState?.("running");
      let slotStart = performance.now();

      while (!done && live()) {
        const cur = await nextBmp;
        nextBmp = null;
        if (!live()) {
          cur.close?.();
          break;
        }
        const curIdx = order[pos];
        const nextPos = (pos + 1) % n;
        const nextOrder = nextPos === 0 ? cycleOrder(n, cycles + 1, !!o.rotatePerCycle, rnd) : order;
        nextBmp = this.renderBitmap(o.frames[nextOrder[nextPos]], o); // render-ahead (no await)

        this.blit(cur);
        cur.close?.();
        o.onProgress?.({ frameIndex: o.frames[curIdx].frameIndex, slot, cycles });

        const targetEnd = slotStart + o.intervalMs;
        await sleep(Math.max(0, targetEnd - performance.now()), run.abort.signal);
        slotStart = targetEnd;
        slot++;
        pos = nextPos;
        order = nextOrder;
        if (pos === 0) {
          cycles++;
          o.onCycle?.(cycles);
          if (!o.loop) done = true;
        }
      }
    } catch (err) {
      o.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      // Close the in-flight render-ahead bitmap once it materializes; swallow
      // its rejection so an orphaned render can't become an unhandled one.
      nextBmp?.then(
        (b) => b.close?.(),
        () => {}
      );
      if (this.run === run) this.run = null;
      o.onState?.("stopped");
    }
  }

  /**
   * Stop the current run. Takes effect immediately: the parked inter-frame
   * sleep is aborted and no further frame is blitted. Safe to call when idle.
   */
  stop(): void {
    const run = this.run;
    if (!run) return;
    this.run = null; // invalidate the generation before waking the loop
    run.abort.abort();
  }
}

/** Abortable sleep: resolves after `ms`, or immediately when `signal` fires. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || ms <= 0) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}
