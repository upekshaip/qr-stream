import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // don't inherit PostCSS/Tailwind config from parent directories
  css: { postcss: {} },
});
