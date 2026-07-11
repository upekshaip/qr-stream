import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  // don't inherit PostCSS/Tailwind config from parent directories
  css: { postcss: {} },
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        sender: resolve(import.meta.dirname, "sender.html"),
        receiver: resolve(import.meta.dirname, "receiver.html"),
      },
    },
  },
});
