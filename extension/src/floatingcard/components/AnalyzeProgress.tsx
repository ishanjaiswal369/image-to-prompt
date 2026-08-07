import { useEffect, useState } from "react";

const STATUS_MESSAGES = [
  "Reading the image…",
  "Identifying subject and composition…",
  "Analyzing lighting and style…",
  "Writing the prompt…",
];

/**
 * There's no real progress signal from a single /analyze call, so this is a
 * deliberately-labeled simulated progress indicator: it eases toward ~92% and
 * cycles status text, then the component just unmounts when the real result
 * (or error) replaces it. Standard perceived-performance pattern for a single
 * multi-second request, not a claim of real granular progress.
 */
export function AnalyzeProgress() {
  const [progress, setProgress] = useState(6);
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const progressTimer = setInterval(() => {
      setProgress((p) => (p >= 92 ? p : p + (92 - p) * 0.08 + 0.6));
    }, 220);
    const statusTimer = setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 1600);
    return () => {
      clearInterval(progressTimer);
      clearInterval(statusTimer);
    };
  }, []);

  return (
    <div className="progress-wrap">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="progress-label">
        <span className="progress-status">{STATUS_MESSAGES[statusIndex]}</span>
        <span>{Math.round(progress)}%</span>
      </div>
    </div>
  );
}
