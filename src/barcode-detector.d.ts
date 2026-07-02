// Minimal type declarations for the experimental BarcodeDetector API
// (Chromium-based browsers). Not yet part of the standard TS DOM lib.

interface DetectedBarcodeShape {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
  cornerPoints: { x: number; y: number }[];
}

interface BarcodeDetectorOptions {
  formats?: string[];
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  static getSupportedFormats(): Promise<string[]>;
  detect(source: CanvasImageSource | ImageBitmap | ImageData | Blob): Promise<DetectedBarcodeShape[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
