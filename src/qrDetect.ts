// QR detection abstraction.
//
// Primary path: the native BarcodeDetector API (Chromium), which detects and
// decodes MULTIPLE QR codes in one frame -- the browser equivalent of OpenCV's
// cv2.QRCodeDetector.detectAndDecodeMulti used in the proposal.
//
// Fallback path: jsQR. It only finds a single QR per image, so for N>1 grids
// we slice the captured frame into an N x N cell array and decode each cell
// individually (this assumes a roughly axis-aligned capture, which holds for
// the getDisplayMedia screen-capture test path).

import jsQR from "jsqr";

export interface ScanResult {
  values: string[];
  processingMs: number;
  engine: "barcode-detector" | "jsqr";
}

export class QrScanner {
  private detector: BarcodeDetector | null = null;
  private ready: Promise<void>;
  engine: "barcode-detector" | "jsqr" = "jsqr";
  /** grid hint used only by the jsQR fallback to slice multi-code frames */
  gridHint = 1;

  constructor() {
    this.ready = this.init();
  }

  private async init() {
    try {
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats.includes("qr_code")) {
          this.detector = new BarcodeDetector({ formats: ["qr_code"] });
          this.engine = "barcode-detector";
        }
      }
    } catch {
      this.detector = null;
      this.engine = "jsqr";
    }
  }

  async whenReady() {
    await this.ready;
  }

  /** Decode all QR codes visible in a canvas (a single captured frame). */
  async scan(canvas: HTMLCanvasElement): Promise<ScanResult> {
    await this.ready;
    const t0 = performance.now();
    if (this.detector) {
      try {
        const codes = await this.detector.detect(canvas);
        const values = codes.map((c) => c.rawValue).filter((v) => v.length > 0);
        return { values, processingMs: performance.now() - t0, engine: "barcode-detector" };
      } catch {
        // fall through to jsQR
      }
    }
    const values = this.scanWithJsQr(canvas);
    return { values, processingMs: performance.now() - t0, engine: "jsqr" };
  }

  private scanWithJsQr(canvas: HTMLCanvasElement): string[] {
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const n = Math.max(1, this.gridHint);
    const out = new Set<string>();

    // Always try the whole frame first: META frames are a single QR filling
    // the canvas even when data frames use an N×N grid — slicing would cut
    // that QR apart and the receiver could never read the file metadata.
    const full = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const fullRes = jsQR(full.data, full.width, full.height, { inversionAttempts: "dontInvert" });
    if (fullRes && fullRes.data) out.add(fullRes.data);

    if (n > 1) {
      const cellW = Math.floor(canvas.width / n);
      const cellH = Math.floor(canvas.height / n);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const img = ctx.getImageData(c * cellW, r * cellH, cellW, cellH);
          const res = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (res && res.data) out.add(res.data);
        }
      }
    }
    return [...out];
  }
}

/**
 * Draw a video frame (or any image source) into a reusable canvas.
 * `maxDim` downscales the capture so the longest side does not exceed it —
 * jsQR decode time scales with pixel count, and phones capturing at ≥1080p
 * otherwise decode slower than the transmit frame rate.
 */
export function drawSourceToCanvas(
  source: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxDim?: number
): HTMLCanvasElement {
  const sw = source.videoWidth || 1280;
  const sh = source.videoHeight || 720;
  const scale = maxDim ? Math.min(1, maxDim / Math.max(sw, sh)) : 1;
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}
