/**
 * A draggable floating pill injected into the page: toggle to start/stop the
 * region-select crosshair, a close button to remove the bar, and a chevron
 * that expands a one-line usage hint. Injected via chrome.scripting.executeScript's
 * `func` option, so — same rule as overlay.ts — this must be fully self-contained:
 * no references to module-scope imports/closures, only DOM/window/chrome globals.
 */
export function floatingControlBar(): void {
  const BAR_ID = "image-to-prompt-floating-bar";
  const ACCENT = "#35d0ac";

  const existingBar = document.getElementById(BAR_ID);
  if (existingBar) {
    existingBar.remove();
    return;
  }

  const bar = document.createElement("div");
  bar.id = BAR_ID;
  bar.style.cssText = [
    "position:fixed",
    "top:20px",
    "right:20px",
    "z-index:2147483647",
    "display:flex",
    "align-items:center",
    "gap:10px",
    "padding:8px 10px 8px 14px",
    "border-radius:999px",
    "background:rgba(28,30,36,0.94)",
    "backdrop-filter:blur(10px)",
    "box-shadow:0 8px 24px rgba(0,0,0,0.35)",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:13px",
    "color:#f0f0f2",
    "cursor:grab",
    "user-select:none",
  ].join(";");

  const label = document.createElement("span");
  label.textContent = "Overlay and analysis";
  label.style.cssText = "white-space:nowrap;font-weight:600;pointer-events:none;";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.setAttribute("aria-pressed", "false");
  toggleBtn.style.cssText = [
    "position:relative",
    "width:36px",
    "height:20px",
    "border-radius:999px",
    "border:none",
    "background:#4b4e57",
    "cursor:pointer",
    "padding:0",
    "flex-shrink:0",
    "transition:background 0.15s ease",
  ].join(";");

  const knob = document.createElement("span");
  knob.style.cssText = [
    "position:absolute",
    "top:2px",
    "left:2px",
    "width:16px",
    "height:16px",
    "border-radius:50%",
    "background:#fff",
    "display:block",
    "transition:transform 0.15s ease",
  ].join(";");
  toggleBtn.appendChild(knob);

  function circleBtnStyle(bg: string, color: string): string {
    return [
      "width:22px",
      "height:22px",
      "border-radius:50%",
      "border:none",
      `background:${bg}`,
      `color:${color}`,
      "font-size:11px",
      "line-height:1",
      "cursor:pointer",
      "flex-shrink:0",
      "display:flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.title = "Close";
  closeBtn.style.cssText = circleBtnStyle("rgba(240,101,107,0.18)", "#f0656b");

  const chevronBtn = document.createElement("button");
  chevronBtn.type = "button";
  chevronBtn.textContent = "▾";
  chevronBtn.title = "More";
  chevronBtn.style.cssText = circleBtnStyle("rgba(255,255,255,0.08)", "#a1a3ab");

  bar.append(label, toggleBtn, closeBtn, chevronBtn);

  const hint = document.createElement("div");
  hint.textContent = "Drag on the page to select an area, then release to capture it.";
  hint.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "max-width:220px",
    "padding:8px 12px",
    "border-radius:10px",
    "background:rgba(28,30,36,0.94)",
    "color:#a1a3ab",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:12px",
    "line-height:1.5",
    "box-shadow:0 8px 24px rgba(0,0,0,0.35)",
    "display:none",
  ].join(";");

  document.documentElement.append(bar, hint);

  let expanded = false;
  function positionHint(): void {
    const r = bar.getBoundingClientRect();
    hint.style.top = `${r.bottom + 8}px`;
    hint.style.left = `${Math.max(8, r.right - 220)}px`;
  }
  chevronBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    expanded = !expanded;
    chevronBtn.textContent = expanded ? "▴" : "▾";
    if (expanded) {
      positionHint();
      hint.style.display = "block";
    } else {
      hint.style.display = "none";
    }
  });

  // --- Dragging the pill around the viewport ---
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  bar.addEventListener("mousedown", (e) => {
    const target = e.target as Node;
    if (toggleBtn.contains(target) || closeBtn.contains(target) || chevronBtn.contains(target)) return;
    dragging = true;
    bar.style.cursor = "grabbing";
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
    if (expanded) positionHint();
  }
  function onDragEnd(): void {
    if (dragging) {
      dragging = false;
      bar.style.cursor = "grab";
    }
  }
  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);

  // --- Region-select crosshair, started/stopped by the toggle ---
  let cancelActive: (() => void) | null = null;

  function setToggleOn(on: boolean): void {
    toggleBtn.setAttribute("aria-pressed", String(on));
    toggleBtn.style.background = on ? ACCENT : "#4b4e57";
    knob.style.transform = on ? "translateX(16px)" : "translateX(0)";
  }

  function startRegionSelect(): void {
    setToggleOn(true);

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;cursor:crosshair;background:rgba(0,0,0,0.15);";
    const box = document.createElement("div");
    box.style.cssText = `position:fixed;border:2px solid ${ACCENT};background:rgba(53,208,172,0.15);display:none;pointer-events:none;`;
    overlay.appendChild(box);
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
    });
    overlay.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
      box.style.width = `${Math.abs(e.clientX - startX)}px`;
      box.style.height = `${Math.abs(e.clientY - startY)}px`;
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
    hint.remove();
  });
}
