import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  // No separate build entry for the region-select pill or the floating card's outer
  // draggable chrome: both are injected via chrome.scripting.executeScript's `func`
  // option (self-contained functions bundled into the background), not standalone
  // content-script files — sidesteps content scripts needing classic (non-ESM)
  // output while the rest of the extension builds as ES modules.
  //
  // The floating card's *inner* app (floatingcard/index.html) is a real extension
  // page though, loaded via iframe — declaring it in manifest.json's
  // web_accessible_resources is what crxjs uses to discover it as a build entry,
  // but it's listed explicitly here too as a safety net.
  build: {
    rollupOptions: {
      input: {
        floatingcard: "src/floatingcard/index.html",
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
});
