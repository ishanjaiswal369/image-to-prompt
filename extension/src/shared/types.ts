export const SUPPORTED_LANGUAGES = ["en", "zh", "ja"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export interface PendingAnalysis {
  idempotencyKey: string;
  sourceType: "image_url" | "screenshot";
  imageUrl?: string;
  screenshotBase64?: string;
  createdAt: number;
}

export interface AnalysisLanguageResult {
  promptText: string;
  jsonStructured: Record<string, unknown>;
}

export interface AnalyzeSuccessResponse {
  requestId: string;
  status: "succeeded";
  replay: boolean;
  results: Record<string, AnalysisLanguageResult>;
  balance?: number;
}

export interface HistoryItem {
  id: string;
  sourceType: string;
  status: string;
  languages: string[];
  createdAt: string;
  results: Record<string, AnalysisLanguageResult>;
}

export interface HistoryResponse {
  items: HistoryItem[];
  nextCursor: string | null;
}

export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface RegionSelectedMessage {
  type: "REGION_SELECTED";
  rect: RegionRect;
}

export function isRegionSelectedMessage(msg: unknown): msg is RegionSelectedMessage {
  return typeof msg === "object" && msg !== null && (msg as { type?: unknown }).type === "REGION_SELECTED";
}
