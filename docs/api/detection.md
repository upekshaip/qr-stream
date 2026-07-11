# API — detection

Browser-only at call time (Canvas; `BarcodeDetector` when available).

## `class QrScanner`

Multi-QR frame decoder with two engines:

- **`barcode-detector`** (Chromium): the native detector finds and decodes
  *all* QR codes in one pass — grids need no hints.
- **`jsqr`** (fallback, e.g. Safari/Firefox): jsQR finds a single code per
  image, so the scanner always tries a **full-frame decode first** (the META
  frame is one full-canvas QR — slicing would cut it apart), then decodes
  each of the `gridHint × gridHint` cells; the last row/column extends to the
  canvas edge so no pixels are dropped. Results are deduplicated.

| Member | Behavior |
|---|---|
| `engine` | `"barcode-detector" \| "jsqr"` — resolved after `whenReady()` |
| `gridHint` | grid size used by the jsQR slicing path only; set it to the transmitter's grid |
| `whenReady(): Promise<void>` | resolves once engine detection finishes |
| `scan(canvas): Promise<ScanResult>` | decode every QR visible in the canvas |

```ts
interface ScanResult {
  values: string[];    // deduplicated raw payload strings
  processingMs: number; // decode time for this frame
  engine: "barcode-detector" | "jsqr";
}
```

The jsQR grid path assumes roughly axis-aligned, edge-to-edge framing (true
for screen capture; approximate for handheld cameras — prefer 1×1 there).

## `drawSourceToCanvas(source, canvas, maxDim?): HTMLCanvasElement`

Draw a capture source into a reusable scratch canvas, optionally downscaled
so the longest side ≤ `maxDim`.

- `source: CaptureSource` = `HTMLVideoElement | HTMLCanvasElement |
  HTMLImageElement | ImageBitmap` (video uses `videoWidth/Height`, images
  their natural size).
- **Pass `maxDim ≈ 1280` on phones**: jsQR time scales with pixel count and
  ≥1080p capture otherwise decodes slower than the transmit rate.
- Sizes the canvas and enables `willReadFrequently` for you; returns the same
  canvas for chaining into `scanner.scan`.
