import { useState } from "react";
import { useHistory } from "../api/hooks.js";

export function History() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const query = useHistory(true, cursor);

  if (query.isLoading) {
    return <div className="view view-loading">Loading history…</div>;
  }

  if (query.isError) {
    return <div className="view view-error">Could not load history: {(query.error as Error).message}</div>;
  }

  const data = query.data;
  if (!data || data.items.length === 0) {
    return <div className="view view-empty">No analyses yet — right-click an image to get started.</div>;
  }

  return (
    <div className="view view-history">
      <ul className="history-list">
        {data.items.map((item) => (
          <li key={item.id} className="history-item">
            <div className="history-item-meta">
              <span>{new Date(item.createdAt).toLocaleString()}</span>
              <span className={`status status-${item.status}`}>{item.status}</span>
            </div>
            {Object.entries(item.results).map(([lang, r]) => (
              <p key={lang} className="history-item-prompt">
                <strong>{lang.toUpperCase()}:</strong> {r.promptText}
              </p>
            ))}
          </li>
        ))}
      </ul>

      <div className="pagination">
        <button
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
