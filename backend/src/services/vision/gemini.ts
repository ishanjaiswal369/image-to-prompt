import { config } from "../../config.js";
import { UpstreamProviderError } from "../../lib/errors.js";
import type { VisionAnalysisResult, VisionProvider } from "./provider.js";
import { FIELD_DESCRIPTIONS, FIELD_ORDER, buildInstructionText, ensurePromptText, type PromptFields } from "./promptSpec.js";

// Approximate Gemini flash-tier per-token pricing; not exact billing, just enough for
// the costUsd field to be a useful order-of-magnitude signal in logs/history.
const GEMINI_INPUT_PRICE_PER_1K = 0.0000375;
const GEMINI_OUTPUT_PRICE_PER_1K = 0.00015;

const REQUEST_TIMEOUT_MS = 30_000;

function buildResponseSchema(languages: string[]) {
  const perLanguage = {
    type: "OBJECT",
    properties: Object.fromEntries(FIELD_ORDER.map((field) => [field, { type: "STRING", description: FIELD_DESCRIPTIONS[field] }])),
    required: [...FIELD_ORDER],
  };
  return {
    type: "OBJECT",
    properties: Object.fromEntries(languages.map((lang) => [lang, perLanguage])),
    required: languages,
  };
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
            { text: buildInstructionText(languages) },
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

    let parsed: Record<string, PromptFields>;
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
      const { promptText: _promptText, ...jsonStructured } = entry;
      resultsByLanguage[lang] = { promptText: ensurePromptText(entry), jsonStructured };
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
