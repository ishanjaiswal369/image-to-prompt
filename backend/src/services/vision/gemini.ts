import { config } from "../../config.js";
import { UpstreamProviderError } from "../../lib/errors.js";
import type { VisionAnalysisResult, VisionProvider } from "./provider.js";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
};

// Approximate Gemini flash-tier per-token pricing; not exact billing, just enough for
// the costUsd field to be a useful order-of-magnitude signal in logs/history.
const GEMINI_INPUT_PRICE_PER_1K = 0.0000375;
const GEMINI_OUTPUT_PRICE_PER_1K = 0.00015;

const REQUEST_TIMEOUT_MS = 30_000;

interface GeminiPromptFields {
  subject: string;
  composition: string;
  style: string;
  lighting: string;
  mood: string;
  promptText: string;
}

function buildResponseSchema(languages: string[]) {
  const perLanguage = {
    type: "OBJECT",
    properties: {
      subject: {
        type: "STRING",
        description:
          "Every visible subject in precise physical detail: species/type, exact colors and textures, precise pose (position of each visible limb/part, facing direction), and every object it's holding, wearing, or touching, with exact spatial relationships (e.g. 'holding X in its right paw', 'Y resting on its belly'). 2-4 full sentences, not a label.",
      },
      composition: {
        type: "STRING",
        description:
          "Camera angle (eye-level/high/low), shot type (close-up/medium/wide), where the subject sits in the frame (centered, rule-of-thirds, etc.), and how the frame is divided between foreground/subject/background (e.g. 'sofa occupying the bottom half, curtains filling the top half'). 1-3 full sentences.",
      },
      style: {
        type: "STRING",
        description:
          "Medium and rendering style (photograph/illustration/3D render/painting), color treatment (full color/monochrome/high-contrast/muted), grain or texture quality, and sharpness/focus characteristics. 1-3 full sentences.",
      },
      lighting: {
        type: "STRING",
        description:
          "Light direction (e.g. upper-left front, backlit), quality (soft/hard), color temperature if notable, and the resulting shadow behavior and tonal separation on surfaces. 1-2 full sentences.",
      },
      mood: {
        type: "STRING",
        description: "The emotional or thematic atmosphere the image conveys, and why (what specifically creates it). 1-2 full sentences.",
      },
      promptText: {
        type: "STRING",
        description:
          "A single dense, flowing paragraph (at least 80-120 words) that synthesizes subject, composition, style, lighting, and mood into one natural-language prompt ready to paste directly into a text-to-image model. No bullet points, no labels — continuous prose as specific and detailed as a professional prompt engineer would write, comparable in density to: 'A white rabbit lying on its back on a dark gray fabric sofa, wearing black sunglasses, holding a black remote control in its right front paw, left front paw extended outward, with a small pizza slice resting on its belly and a glass of dark beer with foam beside its right hind leg. Background features patterned leaf-vein curtains hanging vertically, with deep shadow on the right side. Monochrome high-contrast photographic style, light coming from upper-left front, creating soft shadows and clear tonal separation on fur and upholstery. Medium eye-level shot, subject centered slightly lower, sofa occupying bottom half, curtains filling top half. Film-like grainy texture, sharp focus on fur and fabric weave, emphasizing anthropomorphic humor and cozy domestic leisure atmosphere.'",
      },
    },
    required: ["subject", "composition", "style", "lighting", "mood", "promptText"],
  };
  return {
    type: "OBJECT",
    properties: Object.fromEntries(languages.map((lang) => [lang, perLanguage])),
    required: languages,
  };
}

function buildPrompt(languages: string[]): string {
  const langList = languages.map((l) => LANGUAGE_NAMES[l] ?? l).join(", ");
  return [
    "You are an expert prompt engineer for text-to-image generation models, writing prompts detailed enough to precisely regenerate the attached image.",
    "Examine every visible detail before writing: exact colors, materials, textures, poses, spatial relationships between objects, background elements, camera framing, light direction and quality, and overall atmosphere.",
    "Be exhaustive and specific — never summarize with a short label or a single generic sentence. Prefer concrete, visually-grounded description over vague adjectives.",
    `Produce this analysis separately in each of these languages: ${langList}, following the field-by-field detail level described in the schema.`,
    "Do not shorten or simplify the non-English versions relative to the English one — match the same level of density and specificity in every language.",
  ].join(" ");
}

export class GeminiVisionProvider implements VisionProvider {
  readonly name = "gemini";
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    model?: string
  ) {
    this.model = model ?? config.GEMINI_MODEL;
  }

  async analyzeImage(imageBuffer: Buffer, mimeType: string, languages: string[]): Promise<VisionAnalysisResult> {
    const start = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const body = {
      contents: [
        {
          parts: [
            { text: buildPrompt(languages) },
            { inlineData: { mimeType, data: imageBuffer.toString("base64") } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: buildResponseSchema(languages),
        // Detailed multi-field, multi-language descriptions run well past the
        // default limit for some models — avoid silent truncation.
        maxOutputTokens: 4096,
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new UpstreamProviderError(`gemini request failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Never echo the API key (it's in the URL) back into an error message.
      throw new UpstreamProviderError(`gemini returned HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new UpstreamProviderError("gemini response missing content");
    }

    let parsed: Record<string, GeminiPromptFields>;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new UpstreamProviderError("gemini response was not valid JSON");
    }

    const resultsByLanguage: VisionAnalysisResult["resultsByLanguage"] = {};
    for (const lang of languages) {
      const entry = parsed[lang];
      if (!entry) {
        throw new UpstreamProviderError(`gemini response missing language: ${lang}`);
      }
      const { promptText, ...jsonStructured } = entry;
      resultsByLanguage[lang] = { promptText, jsonStructured };
    }

    const tokensIn = data.usageMetadata?.promptTokenCount ?? 0;
    const tokensOut = data.usageMetadata?.candidatesTokenCount ?? 0;
    const costUsd = (tokensIn / 1000) * GEMINI_INPUT_PRICE_PER_1K + (tokensOut / 1000) * GEMINI_OUTPUT_PRICE_PER_1K;

    return {
      resultsByLanguage,
      costUsd,
      latencyMs: Date.now() - start,
      tokensIn,
      tokensOut,
    };
  }
}
