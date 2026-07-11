import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  // no source maps in the published tarball (see PUBLISHING.md)
  sourcemap: false,
  clean: true,
  target: "es2020",
  platform: "browser",
  // qrcode + jsqr stay external; consumers install them via dependencies
  external: ["qrcode", "jsqr"],
});
