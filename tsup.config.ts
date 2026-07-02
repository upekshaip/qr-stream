import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  platform: "browser",
  // qrcode + jsqr stay external; consumers install them via dependencies
  external: ["qrcode", "jsqr"],
});
