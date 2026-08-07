import { useEffect, useState } from "react";
import { useAnalyze, useAuthState, useBalance, useSignOut } from "./api/hooks.js";
import { SignIn } from "./views/SignIn.js";
import { Results } from "./views/Results.js";
import { History } from "./views/History.js";
import { SUPPORTED_LANGUAGES, type PendingAnalysis } from "../shared/types.js";

type Tab = "analyze" | "history";

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
    return <div className="view view-loading">Loading…</div>;
  }

  if (!authQuery.data) {
    return <SignIn />;
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
      <header className="app-header">
        <h1>Image to Prompt</h1>
        <div className="header-right">
          <span className="balance">
            {balance.isLoading ? "…" : balance.isError ? "—" : `${balance.data?.balance ?? 0} credits`}
          </span>
          <button onClick={() => signOut.mutate()}>Sign out</button>
        </div>
      </header>

      <nav className="app-tabs">
        <button className={tab === "analyze" ? "tab active" : "tab"} onClick={() => setTab("analyze")}>
          Analyze
        </button>
        <button className={tab === "history" ? "tab active" : "tab"} onClick={() => setTab("history")}>
          History
        </button>
      </nav>

      {tab === "history" && <History />}

      {tab === "analyze" && (
        <div className="analyze-panel">
          {!pending && (
            <div className="view view-empty">
              Right-click an image, or click the toolbar icon to select a screen region.
            </div>
          )}

          {pending && !analyze.data && (
            <div className="pre-analyze">
              <p>Ready to analyze {pending.sourceType === "image_url" ? "the selected image" : "your screenshot"}.</p>
              <div className="language-picker">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <label key={lang}>
                    <input type="checkbox" checked={languages.includes(lang)} onChange={() => toggleLanguage(lang)} />
                    {lang.toUpperCase()}
                  </label>
                ))}
              </div>
              <button onClick={runAnalysis} disabled={analyze.isPending || languages.length === 0}>
                {analyze.isPending ? "Analyzing…" : "Analyze"}
              </button>
              {analyze.isError && <p className="error-text">{(analyze.error as Error).message}</p>}
            </div>
          )}

          {analyze.data && <Results results={analyze.data.results} />}
        </div>
      )}
    </div>
  );
}
