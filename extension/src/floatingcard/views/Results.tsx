import { useState } from "react";
import type { AnalysisLanguageResult } from "../../shared/types.js";
import { IconCheck, IconCopy } from "../components/Icons.js";

const LANGUAGE_LABELS: Record<string, string> = { en: "EN", zh: "中文", ja: "日本語" };
const DETAIL_LABELS: Record<string, string> = {
  subject: "Subject",
  composition: "Composition",
  style: "Style",
  lighting: "Lighting",
  mood: "Mood",
};
const DETAIL_ORDER = ["subject", "composition", "style", "lighting", "mood"];

interface ResultsProps {
  results: Record<string, AnalysisLanguageResult>;
}

export function Results({ results }: ResultsProps) {
  const languages = Object.keys(results);
  const [activeTab, setActiveTab] = useState<string>(languages[0] ?? "en");
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState<"prompt" | "json" | null>(null);

  if (languages.length === 0) {
    return <div className="view">No results for this analysis.</div>;
  }

  const active = results[activeTab] ?? results[languages[0] as string];

  async function copy(text: string, which: "prompt" | "json") {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  const jsonStructured = (active?.jsonStructured ?? {}) as Record<string, unknown>;
  const detailEntries = DETAIL_ORDER.filter((key) => key in jsonStructured);

  return (
    <div className="results-view">
      <div className="pill-tabs">
        {languages.map((lang) => (
          <button
            key={lang}
            className={lang === activeTab ? "pill-tab active" : "pill-tab"}
            onClick={() => setActiveTab(lang)}
          >
            {LANGUAGE_LABELS[lang] ?? lang.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="results-scroll">
        {active && (
          <>
            <div className="prompt-card">
              <div className="prompt-card-label">Prompt</div>
              <p className="prompt-text">{active.promptText}</p>
              <button
                className={copied === "prompt" ? "copy-btn is-copied" : "copy-btn"}
                onClick={() => copy(active.promptText, "prompt")}
              >
                {copied === "prompt" ? <IconCheck size={13} /> : <IconCopy size={13} />}
                {copied === "prompt" ? "Copied" : "Copy prompt"}
              </button>
            </div>

            {!showJson && detailEntries.length > 0 && (
              <div className="detail-grid">
                {detailEntries.map((key) => (
                  <div className="detail-row" key={key}>
                    <div className="detail-label">{DETAIL_LABELS[key] ?? key}</div>
                    <div className="detail-value">{String(jsonStructured[key])}</div>
                  </div>
                ))}
              </div>
            )}

            {showJson && (
              <>
                <pre className="json-block">{JSON.stringify(active.jsonStructured, null, 2)}</pre>
                <button
                  className={copied === "json" ? "copy-btn is-copied" : "copy-btn"}
                  onClick={() => copy(JSON.stringify(active.jsonStructured, null, 2), "json")}
                >
                  {copied === "json" ? <IconCheck size={13} /> : <IconCopy size={13} />}
                  {copied === "json" ? "Copied" : "Copy JSON"}
                </button>
              </>
            )}

            <button className="raw-json-toggle" onClick={() => setShowJson((v) => !v)}>
              {showJson ? "Hide raw JSON" : "View raw JSON"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
