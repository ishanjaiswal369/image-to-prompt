export const SUPPORTED_LANGUAGES = ["en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export interface VisionLanguageResult {
  promptText: string;
  jsonStructured: Record<string, unknown>;
}

export interface VisionAnalysisResult {
  resultsByLanguage: Record<string, VisionLanguageResult>;
  costUsd: number;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export interface VisionProvider {
  readonly name: string;
  readonly model: string;
  analyzeImage(imageBuffer: Buffer, mimeType: string, languages: string[]): Promise<VisionAnalysisResult>;
}
