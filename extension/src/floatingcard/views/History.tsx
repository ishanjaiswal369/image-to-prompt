import { useState } from "react";
import { useHistory } from "../api/hooks.js";
import { IconAlert, IconClock } from "../components/Icons.js";

const STATUS_LABELS: Record<string, string> = {
  succeeded: "Succeeded",
  failed: "Failed",
  refunded: "Failed",
  pending: "Pending",
};

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
        {data.items.map((item) => {
          const promptText = item.results.en?.promptText;
          return (
            <div className="history-row" key={item.id}>
              <div className="history-row-head">
                <span className={`status-dot status-dot--${item.status}`} />
                <span className={`status-label status-label--${item.status}`}>{STATUS_LABELS[item.status] ?? item.status}</span>
                <span>· {new Date(item.createdAt).toLocaleString()}</span>
              </div>
              {promptText && <p className="history-prompt-line">{promptText}</p>}
            </div>
          );
        })}
      </div>

      <div className="pagination">
        <button
          className="text-link"
          aria-disabled={cursorStack.length === 0}
          onClick={() => {
            if (cursorStack.length === 0) return;
            const prev = [...cursorStack];
            const last = prev.pop();
            setCursorStack(prev);
            setCursor(last);
          }}
        >
          Previous
        </button>
        <button
          className="text-link"
          aria-disabled={!data.nextCursor}
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
