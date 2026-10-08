import preact from "@preact/preset-vite";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// Two pages: the hub (index.html) and the first-install site (setup.html).
export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: { index: resolve(import.meta.dirname, "index.html"), setup: resolve(import.meta.dirname, "setup.html") } },
  },
});
