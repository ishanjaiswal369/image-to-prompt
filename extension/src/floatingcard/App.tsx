import { useEffect, useState } from "react";
import { useAnalyze, useAuthState, useBalance, useSignOut } from "./api/hooks.js";
import { SignIn } from "./views/SignIn.js";
import { Results } from "./views/Results.js";
import { History } from "./views/History.js";
import { SUPPORTED_LANGUAGES, type PendingAnalysis } from "../shared/types.js";
import { BrandMark, IconImage, IconSignOut } from "./components/Icons.js";
import { AnalyzeProgress } from "./components/AnalyzeProgress.js";

type Tab = "analyze" | "history";

const LANGUAGE_LABELS: Record<string, string> = { en: "EN", zh: "中文", ja: "日本語" };

export function App() {
  const authQuery = useAuthState();
  const [tab, setTab] = useState<Tab>("analyze");
  const [pending, setPending] = useState<PendingAnalysis | null>(null);
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const analyze = useAnalyze();
  const signOut = useSignOut();
  const balance = useBalance(!!authQuery.data);

  useEffect(() => {
    void chrome.storage.session.get("pendingAnalysis").then((res) => {
      const value = res.pendingAnalysis as PendingAnalysis | undefined;
      if (value) setPending(value);
    });

    function onStorageChange(changes: Record<string, chrome.storage.StorageChange>, area: string) {
      if (area === "session" && changes.pendingAnalysis?.newValue) {
        setPending(changes.pendingAnalysis.newValue as PendingAnalysis);
        setTab("analyze");
        analyze.reset();
      }
    }

    chrome.storage.onChanged.addListener(onStorageChange);
    return () => chrome.storage.onChanged.removeListener(onStorageChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (authQuery.isLoading) {
    return (
      <div className="app">
        <div className="state-screen">
          <BrandMark size={26} className="state-icon" />
        </div>
      </div>
    );
  }

  if (!authQuery.data) {
    return (
      <div className="app">
        <SignIn />
      </div>
    );
  }

  function toggleLanguage(lang: string) {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  }

  function runAnalysis() {
    if (!pending || languages.length === 0) return;
    analyze.mutate({ ...pending, languages });
  }

  return (
    <div className="app">
      {/* No brand/wordmark here — the outer draggable card chrome (content/floatingCard.ts)
          already shows the brand, plus collapse/close controls. This header is just
          in-app navigation and account state. */}
      <header className="app-header">
        <nav className="app-nav">
          <button className={tab === "analyze" ? "segmented-btn active" : "segmented-btn"} onClick={() => setTab("analyze")}>
            Analyze
          </button>
          <button className={tab === "history" ? "segmented-btn active" : "segmented-btn"} onClick={() => setTab("history")}>
            History
          </button>
        </nav>
        <div className="header-right">
          <span className={`credits-pill${balance.isLoading ? " is-loading" : ""}${balance.isError ? " is-error" : ""}`}>
            {balance.isLoading ? "…" : balance.isError ? "—" : balance.data?.balance ?? 0} credits
          </span>
          <button className="icon-btn" onClick={() => signOut.mutate()} title="Sign out">
            <IconSignOut size={15} />
          </button>
        </div>
      </header>

      {tab === "history" && <History />}

      {tab === "analyze" && (
        <div className="analyze-panel">
          {!pending && (
            <div className="state-screen">
              <IconImage className="state-icon" />
              <div className="state-title">Nothing selected yet</div>
              <div className="state-body">Right-click an image, or click the toolbar icon to select a screen region.</div>
            </div>
          )}

          {pending && !analyze.data && (
            <div className="source-card">
              <div className="source-badge">{pending.sourceType === "image_url" ? "Image selected" : "Screenshot captured"}</div>
              <p className="source-copy">
                Ready to analyze {pending.sourceType === "image_url" ? "the selected image" : "your screenshot"}. Choose which
                languages you want the prompt in.
              </p>
              <div className="lang-picker">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className={languages.includes(lang) ? "lang-chip active" : "lang-chip"}
                    onClick={() => toggleLanguage(lang)}
                  >
                    {LANGUAGE_LABELS[lang] ?? lang.toUpperCase()}
                  </button>
                ))}
              </div>

              {analyze.isPending ? (
                <AnalyzeProgress />
              ) : (
                <button className="primary-btn" onClick={runAnalysis} disabled={languages.length === 0}>
                  Analyze
                </button>
              )}

              {analyze.isError && <p className="error-banner">{(analyze.error as Error).message}</p>}
            </div>
          )}

          {analyze.data && <Results results={analyze.data.results} />}
        </div>
      )}
    </div>
  );
}
