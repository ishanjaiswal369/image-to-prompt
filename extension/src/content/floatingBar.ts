/**
 * A draggable floating pill injected into the page: toggle to start/stop the
 * region-select crosshair, a close button to remove the bar, and a chevron
 * that expands a one-line usage hint inline within the same pill (not a
 * separate floating box). Injected via chrome.scripting.executeScript's
 * `func` option, so — same rule as the other content scripts — this must be
 * fully self-contained: no references to module-scope imports/closures, only
 * DOM/window/chrome globals.
 */
export function floatingControlBar(): void {
  const BAR_ID = "image-to-prompt-floating-bar";

  const existingBar = document.getElementById(BAR_ID);
  if (existingBar) {
    existingBar.remove();
    return;
  }

  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = isDark
    ? {
        bg: "rgba(23,24,29,0.96)",
        text: "#f0f0f2",
        textTertiary: "#a1a3ab",
        border: "rgba(255,255,255,0.08)",
        accent: "#3b82f6",
        toggleOff: "#3a3c44",
        closeBg: "rgba(240,101,107,0.18)",
        closeColor: "#f0656b",
        neutralBg: "rgba(255,255,255,0.08)",
        shadow: "0 8px 24px rgba(0,0,0,0.4)",
        boxFill: "rgba(59,130,246,0.15)",
      }
    : {
        bg: "rgba(250,250,249,0.97)",
        text: "#18181b",
        textTertiary: "#71717a",
        border: "rgba(0,0,0,0.08)",
        accent: "#2563eb",
        toggleOff: "#d4d4d8",
        closeBg: "rgba(220,38,38,0.12)",
        closeColor: "#dc2626",
        neutralBg: "rgba(0,0,0,0.05)",
        shadow: "0 8px 24px rgba(0,0,0,0.18)",
        boxFill: "rgba(37,99,235,0.12)",
      };

  const bar = document.createElement("div");
  bar.id = BAR_ID;
  bar.style.cssText = [
    "position:fixed",
    "top:20px",
    "right:20px",
    "z-index:2147483647",
    "display:flex",
    "flex-direction:column",
    "border-radius:16px",
    `background:${theme.bg}`,
    "backdrop-filter:blur(10px)",
    `box-shadow:${theme.shadow}`,
    `border:1px solid ${theme.border}`,
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:13px",
    `color:${theme.text}`,
    "user-select:none",
  ].join(";");

  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:10px;padding:9px 10px 9px 14px;cursor:grab;";

  const label = document.createElement("span");
  label.textContent = "Overlay and analysis";
  label.style.cssText = "white-space:nowrap;font-weight:600;pointer-events:none;";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.setAttribute("aria-pressed", "false");
  toggleBtn.style.cssText = [
    "position:relative",
    "width:34px",
    "height:19px",
    "border-radius:999px",
    "border:none",
    `background:${theme.toggleOff}`,
    "cursor:pointer",
    "padding:0",
    "flex-shrink:0",
    "transition:background 0.15s ease",
  ].join(";");
  const knob = document.createElement("span");
  knob.style.cssText = "position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;display:block;transition:transform 0.15s ease;";
  toggleBtn.appendChild(knob);

  function ghostBtn(symbol: string, bg: string, color: string, title: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = symbol;
    b.title = title;
    b.style.cssText = [
      "width:20px",
      "height:20px",
      "border-radius:50%",
      "border:none",
      `background:${bg}`,
      `color:${color}`,
      "font-size:10px",
      "line-height:1",
      "cursor:pointer",
      "flex-shrink:0",
      "display:flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");
    return b;
  }

  const chevronBtn = ghostBtn("›", theme.neutralBg, theme.textTertiary, "More");
  const closeBtn = ghostBtn("✕", theme.closeBg, theme.closeColor, "Close");

  row.append(label, toggleBtn, chevronBtn, closeBtn);

  const hintRow = document.createElement("div");
  hintRow.textContent = "Drag anywhere on the page to select a region, or right-click any image.";
  hintRow.style.cssText = [
    "display:none",
    "max-width:230px",
    "padding:0 14px 12px",
    `color:${theme.textTertiary}`,
    "font-size:12px",
    "line-height:1.5",
  ].join(";");

  bar.append(row, hintRow);
  document.documentElement.appendChild(bar);

  let expanded = false;
  chevronBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    expanded = !expanded;
    chevronBtn.textContent = expanded ? "‹" : "›";
    hintRow.style.display = expanded ? "block" : "none";
  });

  // --- Dragging the pill around the viewport ---
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  row.addEventListener("mousedown", (e) => {
    const target = e.target as Node;
    if (toggleBtn.contains(target) || closeBtn.contains(target) || chevronBtn.contains(target)) return;
    dragging = true;
    row.style.cursor = "grabbing";
    const r = bar.getBoundingClientRect();
    dragOffsetX = e.clientX - r.left;
    dragOffsetY = e.clientY - r.top;
    e.preventDefault();
  });

  function onDragMove(e: MouseEvent): void {
    if (!dragging) return;
    const x = Math.min(Math.max(0, e.clientX - dragOffsetX), window.innerWidth - bar.offsetWidth);
    const y = Math.min(Math.max(0, e.clientY - dragOffsetY), window.innerHeight - bar.offsetHeight);
    bar.style.left = `${x}px`;
    bar.style.top = `${y}px`;
    bar.style.right = "auto";
  }
  function onDragEnd(): void {
    if (dragging) {
      dragging = false;
      row.style.cursor = "grab";
    }
  }
  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);

  // --- Region-select crosshair, started/stopped by the toggle ---
  let cancelActive: (() => void) | null = null;

  function setToggleOn(on: boolean): void {
    toggleBtn.setAttribute("aria-pressed", String(on));
    toggleBtn.style.background = on ? theme.accent : theme.toggleOff;
    knob.style.transform = on ? "translateX(15px)" : "translateX(0)";
  }

  function startRegionSelect(): void {
    setToggleOn(true);

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;cursor:crosshair;background:rgba(0,0,0,0.15);";

    const box = document.createElement("div");
    box.style.cssText = `position:fixed;border:2px solid ${theme.accent};background:${theme.boxFill};display:none;pointer-events:none;`;

    const dimLabel = document.createElement("div");
    dimLabel.style.cssText = [
      "position:fixed",
      "display:none",
      "pointer-events:none",
      `background:${theme.accent}`,
      "color:#fff",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "font-size:11px",
      "font-weight:700",
      "padding:2px 6px",
      "border-radius:4px",
      "white-space:nowrap",
    ].join(";");

    overlay.append(box, dimLabel);
    document.documentElement.appendChild(overlay);

    let startX = 0;
    let startY = 0;
    let isDragging = false;

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") cleanup();
    }
    function cleanup(): void {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      setToggleOn(false);
      cancelActive = null;
    }
    cancelActive = cleanup;
    document.addEventListener("keydown", onKeyDown);

    overlay.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      box.style.left = `${startX}px`;
      box.style.top = `${startY}px`;
      box.style.width = "0px";
      box.style.height = "0px";
      box.style.display = "block";
      dimLabel.style.display = "block";
    });
    overlay.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const width = Math.abs(e.clientX - startX);
      const height = Math.abs(e.clientY - startY);
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;

      dimLabel.textContent = `${Math.round(width)} × ${Math.round(height)}`;
      dimLabel.style.left = `${x}px`;
      dimLabel.style.top = `${Math.max(0, y - 22)}px`;
    });
    overlay.addEventListener("mouseup", (e) => {
      if (!isDragging) return;
      isDragging = false;

      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const width = Math.abs(e.clientX - startX);
      const height = Math.abs(e.clientY - startY);

      cleanup();
      if (width < 4 || height < 4) return; // ignore accidental clicks/taps

      chrome.runtime.sendMessage({
        type: "REGION_SELECTED",
        rect: { x, y, width, height, devicePixelRatio: window.devicePixelRatio || 1 },
      });
    });
  }

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (cancelActive) {
      cancelActive();
    } else {
      startRegionSelect();
    }
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    cancelActive?.();
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    bar.remove();
  });
}
