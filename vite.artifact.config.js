// Single-file build used only for the claude.ai artifact. No service worker
// or manifest (the artifact page can't register them), and everything is
// inlined into one HTML file. Run it through `npm run build:artifact`.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  publicDir: false,
  build: {
    outDir: "dist-artifact",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
