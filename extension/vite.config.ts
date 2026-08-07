import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  // No separate build entry for the region-selection overlay: it's injected via
  // chrome.scripting.executeScript's `func` option (a self-contained function
  // imported into the background bundle), not as a standalone content-script file.
  // That sidesteps content scripts needing classic (non-ESM) output while the rest
  // of the extension builds as ES modules.
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
});
