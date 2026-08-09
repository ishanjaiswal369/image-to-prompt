import { config } from "../../config.js";
import { GeminiVisionProvider } from "./gemini.js";
import { OpenRouterVisionProvider } from "./openrouter.js";
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
      if (!config.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is required when VISION_PROVIDER=gemini");
      }
      cached = new GeminiVisionProvider(config.GEMINI_API_KEY);
      return cached;
    case "openrouter":
      if (!config.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY is required when VISION_PROVIDER=openrouter");
      }
      cached = new OpenRouterVisionProvider(config.OPENROUTER_API_KEY);
      return cached;
    default:
      throw new Error(`unsupported VISION_PROVIDER: ${config.VISION_PROVIDER}`);
  }
}
