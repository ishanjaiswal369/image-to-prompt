import { useState } from "react";
import { useHistory } from "../api/hooks.js";
import { IconAlert, IconClock } from "../components/Icons.js";

const LANGUAGE_LABELS: Record<string, string> = { en: "EN", zh: "中文", ja: "日本語" };

export function History() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const query = useHistory(true, cursor);

  if (query.isLoading) {
    return (
      <div className="state-screen">
        <IconClock className="state-icon" />
        <div className="state-title">Loading history…</div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="state-screen is-error">
        <IconAlert />
        <div className="state-title">Couldn't load history</div>
        <div className="state-body">{(query.error as Error).message}</div>
      </div>
    );
  }

  const data = query.data;
  if (!data || data.items.length === 0) {
    return (
      <div className="state-screen">
        <IconClock className="state-icon" />
        <div className="state-title">No analyses yet</div>
        <div className="state-body">Right-click an image on any page to get started.</div>
      </div>
    );
  }

  return (
    <div className="history-view">
      <div className="history-scroll">
        {data.items.map((item) => (
          <div className="history-card" key={item.id}>
            <div className="history-card-head">
              <span className="history-date">{new Date(item.createdAt).toLocaleString()}</span>
              <span className={`status-pill status-pill--${item.status}`}>{item.status}</span>
            </div>
            {Object.entries(item.results).map(([lang, r]) => (
              <p className="history-prompt-line" key={lang}>
                <strong>{LANGUAGE_LABELS[lang] ?? lang.toUpperCase()}</strong>
                {r.promptText}
              </p>
            ))}
          </div>
        ))}
      </div>

      <div className="pagination">
        <button
          className="ghost-btn"
          disabled={cursorStack.length === 0}
          onClick={() => {
            const prev = [...cursorStack];
            const last = prev.pop();
            setCursorStack(prev);
            setCursor(last);
          }}
        >
          Previous
        </button>
        <button
          className="ghost-btn"
          disabled={!data.nextCursor}
          onClick={() => {
            if (!data.nextCursor) return;
            setCursorStack((s) => [...s, cursor ?? ""]);
            setCursor(data.nextCursor as string);
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
