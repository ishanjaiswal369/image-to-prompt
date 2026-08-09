import { useState } from "react";
import type { AnalysisLanguageResult } from "../../shared/types.js";

const DETAIL_LABELS: Record<string, string> = {
  subject: "Subject",
  composition: "Composition",
  style: "Style",
  lighting: "Lighting",
  mood: "Mood",
};
const DETAIL_ORDER = ["subject", "composition", "style", "lighting", "mood"];

interface ResultsProps {
  result: AnalysisLanguageResult | undefined;
}

export function Results({ result }: ResultsProps) {
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState<"prompt" | "json" | null>(null);

  if (!result) {
    return <div className="view">No result for this analysis.</div>;
  }

  async function copy(text: string, which: "prompt" | "json") {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  const jsonStructured = result.jsonStructured as Record<string, unknown>;
  const detailEntries = DETAIL_ORDER.filter((key) => key in jsonStructured);

  return (
    <div className="results-view">
      <div className="results-scroll">
        <div className="result-section">
          <div className="result-section-head">
            <span className="result-label">Prompt</span>
            <button className="text-link copy-link" onClick={() => copy(result.promptText, "prompt")}>
              {copied === "prompt" ? "Copied" : "Copy prompt"}
            </button>
          </div>
          <p className="result-text">{result.promptText}</p>
        </div>

        {!showJson &&
          detailEntries.map((key) => (
            <div className="result-section" key={key}>
              <div className="result-section-head">
                <span className="result-label">{DETAIL_LABELS[key] ?? key}</span>
              </div>
              <p className="detail-value">{String(jsonStructured[key])}</p>
            </div>
          ))}

        {showJson && (
          <div className="result-section">
            <pre className="json-block">{JSON.stringify(result.jsonStructured, null, 2)}</pre>
            <button className="text-link copy-link" onClick={() => copy(JSON.stringify(result.jsonStructured, null, 2), "json")}>
              {copied === "json" ? "Copied" : "Copy JSON"}
            </button>
          </div>
        )}

        <button className="text-link raw-json-toggle" onClick={() => setShowJson((v) => !v)}>
          {showJson ? "Hide raw JSON" : "View raw JSON"}
        </button>
      </div>
    </div>
  );
}
