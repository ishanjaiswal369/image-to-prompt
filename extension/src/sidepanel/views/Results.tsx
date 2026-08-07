import { useState } from "react";
import type { AnalysisLanguageResult } from "../../shared/types.js";

const LANGUAGE_LABELS: Record<string, string> = { en: "EN", zh: "ZH", ja: "JA" };

interface ResultsProps {
  results: Record<string, AnalysisLanguageResult>;
}

export function Results({ results }: ResultsProps) {
  const languages = Object.keys(results);
  const [activeTab, setActiveTab] = useState<string>(languages[0] ?? "en");
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  if (languages.length === 0) {
    return <div className="view view-empty">No results for this analysis.</div>;
  }

  const active = results[activeTab] ?? results[languages[0] as string];

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="view view-results">
      <div className="tabs">
        {languages.map((lang) => (
          <button
            key={lang}
            className={lang === activeTab && !showJson ? "tab active" : "tab"}
            onClick={() => {
              setActiveTab(lang);
              setShowJson(false);
            }}
          >
            {LANGUAGE_LABELS[lang] ?? lang.toUpperCase()}
          </button>
        ))}
        <button className={showJson ? "tab active" : "tab"} onClick={() => setShowJson(true)}>
          JSON
        </button>
      </div>

      {active && !showJson && (
        <div className="result-panel">
          <p className="prompt-text">{active.promptText}</p>
          <button onClick={() => copy(active.promptText)}>{copied ? "Copied!" : "Copy prompt"}</button>
        </div>
      )}

      {active && showJson && (
        <div className="result-panel">
          <pre className="json-block">{JSON.stringify(active.jsonStructured, null, 2)}</pre>
          <button onClick={() => copy(JSON.stringify(active.jsonStructured, null, 2))}>
            {copied ? "Copied!" : "Copy JSON"}
          </button>
        </div>
      )}
    </div>
  );
}
