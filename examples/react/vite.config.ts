import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // don't inherit the monorepo's PostCSS/Tailwind config from parent dirs
  css: { postcss: {} },
});
