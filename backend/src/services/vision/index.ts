import { config } from "../../config.js";
import { GeminiVisionProvider } from "./gemini.js";
import type { VisionProvider } from "./provider.js";

let cached: VisionProvider | null = null;

/**
 * Provider selection is a config change (VISION_PROVIDER env var), not a rewrite:
 * add a new branch + implementation of VisionProvider to support GPT-4o/Claude vision later.
 */
export function getVisionProvider(): VisionProvider {
  if (cached) return cached;

  switch (config.VISION_PROVIDER) {
    case "gemini":
      cached = new GeminiVisionProvider(config.GEMINI_API_KEY);
      return cached;
    default:
      throw new Error(`unsupported VISION_PROVIDER: ${config.VISION_PROVIDER}`);
  }
}
