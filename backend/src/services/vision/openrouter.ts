import { config } from "../../config.js";
import { UpstreamProviderError } from "../../lib/errors.js";
import type { VisionAnalysisResult, VisionProvider } from "./provider.js";
import { FIELD_DESCRIPTIONS, FIELD_ORDER, buildInstructionText, ensurePromptText, type PromptFields } from "./promptSpec.js";

const REQUEST_TIMEOUT_MS = 45_000; // free-tier endpoints can be noticeably slower than paid ones

function buildJsonSchema(languages: string[]) {
  const perLanguage = {
    type: "object",
    properties: Object.fromEntries(FIELD_ORDER.map((field) => [field, { type: "string", description: FIELD_DESCRIPTIONS[field] }])),
    required: [...FIELD_ORDER],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: Object.fromEntries(languages.map((lang) => [lang, perLanguage])),
    required: languages,
    additionalProperties: false,
  };
}

/**
 * response_format's strict json_schema mode isn't honored by every model/endpoint
 * on OpenRouter — support is per-endpoint and varies especially among free-tier
 * models (see openrouter.ai/docs/features/structured-outputs). Requesting it is
 * still worthwhile where it's supported, but parsing has to tolerate a model that
 * ignores it and wraps its JSON in prose or a markdown code fence anyway.
 */
function extractJsonText(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }
  return raw.trim();
}

export class OpenRouterVisionProvider implements VisionProvider {
  readonly name = "openrouter";
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    model?: string
  ) {
    this.model = model ?? config.OPENROUTER_MODEL;
  }

  async analyzeImage(imageBuffer: Buffer, mimeType: string, languages: string[]): Promise<VisionAnalysisResult> {
    const start = Date.now();

    const body = {
      model: this.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildInstructionText(languages) },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBuffer.toString("base64")}` } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "image_prompt_analysis", strict: true, schema: buildJsonSchema(languages) },
      },
      // Reasoning models spend a meaningful chunk of the completion budget on their
      // internal reasoning trace before writing the answer (observed 750-1200
      // reasoning tokens alone in testing) — capping reasoning leaves a reliable
      // budget for the six-field answer itself, which was the actual cause of
      // promptText sometimes coming back empty (not FIELD_ORDER, which was tried
      // and made it worse — see promptSpec.ts).
      reasoning: { max_tokens: 600 },
      max_tokens: 8192,
      // Free-tier reasoning models showed real run-to-run variance in testing (the
      // same image/prompt sometimes producing rich detail, sometimes bare labels)
      // — a lower temperature measurably reduces that without needing a paid model.
      temperature: 0.35,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          // Recommended by OpenRouter for attribution on their public rankings; not required.
          "HTTP-Referer": "https://github.com/ishanjaiswal369/image-to-prompt",
          "X-Title": "Image to Prompt",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new UpstreamProviderError(`openrouter request failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new UpstreamProviderError(`openrouter returned HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new UpstreamProviderError("openrouter response missing content");
    }

    let parsed: Record<string, PromptFields>;
    try {
      parsed = JSON.parse(extractJsonText(rawContent));
    } catch {
      throw new UpstreamProviderError("openrouter response was not valid JSON");
    }

    const resultsByLanguage: VisionAnalysisResult["resultsByLanguage"] = {};
    for (const lang of languages) {
      const entry = parsed[lang];
      if (!entry) {
        throw new UpstreamProviderError(`openrouter response missing language: ${lang}`);
      }
      const { promptText: _promptText, ...jsonStructured } = entry;
      resultsByLanguage[lang] = { promptText: ensurePromptText(entry), jsonStructured };
    }

    return {
      resultsByLanguage,
      // Free-tier models (the intended use of this provider) cost $0; OpenRouter's
      // chat/completions response doesn't return per-request cost, and computing it
      // for paid models would need per-model pricing lookups this doesn't do yet.
      costUsd: 0,
      latencyMs: Date.now() - start,
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
    };
  }
}
