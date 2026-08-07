import { config } from "../../config.js";
import { UpstreamProviderError } from "../../lib/errors.js";
import type { VisionAnalysisResult, VisionProvider } from "./provider.js";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
};

// Approximate gemini-2.5-flash per-token pricing; not exact billing, just enough for
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
      subject: { type: "STRING" },
      composition: { type: "STRING" },
      style: { type: "STRING" },
      lighting: { type: "STRING" },
      mood: { type: "STRING" },
      promptText: { type: "STRING" },
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
    "You are an expert prompt engineer for text-to-image generation models.",
    "Analyze the attached image and describe it precisely enough that a text-to-image model could regenerate a similar image.",
    `Produce your analysis separately in each of these languages: ${langList}.`,
    "For each language, return five short descriptive phrases in that language — subject, composition, style, lighting, mood — ",
    "plus promptText: a single fluent natural-language prompt in that language suitable for pasting directly into a text-to-image model.",
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
