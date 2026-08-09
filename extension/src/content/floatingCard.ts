/**
 * Injects the floating results card: a draggable outer chrome (title bar +
 * collapse/close controls, all vanilla DOM) wrapping an iframe that loads the
 * extension's own floatingcard/index.html page (a full React app — sign-in,
 * analyze, results, history). The iframe is a real extension page (declared in
 * manifest.json's web_accessible_resources), so it has full chrome.* API access
 * exactly like the old side panel did; only the outer drag/collapse/close chrome
 * needed to be hand-written here.
 *
 * The outer chrome reads prefers-color-scheme directly (matching the inner React
 * app's CSS, which does the same) so the card doesn't look like two different
 * products stitched together in either theme.
 *
 * Drag tracking deliberately lives out here at the document level, not inside the
 * iframe — mouse events stop reaching an iframe once the cursor leaves its bounds,
 * which would break dragging on a fast pointer move.
 *
 * Injected via chrome.scripting.executeScript's `func` option, so — same rule as
 * the other content scripts — this must be fully self-contained: no references to
 * module-scope imports/closures, only DOM/window/chrome globals.
 */
export function injectFloatingCard(): void {
  const CONTAINER_ID = "image-to-prompt-card";
  if (document.getElementById(CONTAINER_ID)) return; // already open — it'll pick up new state via chrome.storage

  // The region-select toggle pill's job is done once a selection completes and
  // this card takes over — remove it if it's still on screen.
  document.getElementById("image-to-prompt-floating-bar")?.remove();

  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = isDark
    ? {
        cardBg: "#0e0f12",
        titleBarBg: "#111318",
        titleBarBorder: "rgba(255,255,255,0.06)",
        cardBorder: "1px solid rgba(255,255,255,0.08)",
        shadow: "0 20px 50px rgba(0,0,0,0.45)",
        label: "#6c6e77",
        accent: "#3b82f6",
        collapseBg: "rgba(255,255,255,0.08)",
        collapseColor: "#a1a3ab",
        closeBg: "rgba(240,101,107,0.18)",
        closeColor: "#f0656b",
      }
    : {
        cardBg: "#fafaf9",
        titleBarBg: "#f5f5f4",
        titleBarBorder: "rgba(0,0,0,0.06)",
        cardBorder: "1px solid rgba(0,0,0,0.08)",
        shadow: "0 20px 50px rgba(0,0,0,0.18)",
        label: "#8f9096",
        accent: "#2563eb",
        collapseBg: "rgba(0,0,0,0.05)",
        collapseColor: "#52525b",
        closeBg: "rgba(220,38,38,0.12)",
        closeColor: "#dc2626",
      };

  const CARD_WIDTH = 368;
  const CARD_HEIGHT = 500;

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.style.cssText = [
    "position:fixed",
    "top:20px",
    "right:20px",
    `width:${CARD_WIDTH}px`,
    `height:${CARD_HEIGHT}px`,
    "z-index:2147483647",
    "display:flex",
    "flex-direction:column",
    "border-radius:16px",
    "overflow:hidden",
    `background:${theme.cardBg}`,
    `box-shadow:${theme.shadow}`,
    `border:${theme.cardBorder}`,
  ].join(";");

  const titleBar = document.createElement("div");
  titleBar.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "padding:10px 12px",
    "cursor:grab",
    "user-select:none",
    "flex-shrink:0",
    `background:${theme.titleBarBg}`,
    `border-bottom:1px solid ${theme.titleBarBorder}`,
  ].join(";");

  const brandGroup = document.createElement("div");
  brandGroup.style.cssText = "display:flex;align-items:center;gap:7px;pointer-events:none;";

  const brandDot = document.createElement("span");
  brandDot.style.cssText = `width:9px;height:9px;border-radius:3px;background:${theme.accent};flex-shrink:0;`;

  const brandLabel = document.createElement("span");
  brandLabel.textContent = "IMAGE TO PROMPT";
  brandLabel.style.cssText = [
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:10.5px",
    "font-weight:700",
    "letter-spacing:0.09em",
    `color:${theme.label}`,
  ].join(";");

  brandGroup.append(brandDot, brandLabel);

  function circleBtn(symbol: string, bg: string, color: string, title: string): HTMLButtonElement {
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
      "display:flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");
    return b;
  }

  const collapseBtn = circleBtn("−", theme.collapseBg, theme.collapseColor, "Collapse");
  const closeBtn = circleBtn("✕", theme.closeBg, theme.closeColor, "Close");

  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;align-items:center;gap:6px;";
  controls.append(collapseBtn, closeBtn);

  titleBar.append(brandGroup, controls);

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("src/floatingcard/index.html");
  iframe.style.cssText = "flex:1;border:none;width:100%;";
  iframe.setAttribute("allow", "clipboard-write");

  container.append(titleBar, iframe);
  document.documentElement.appendChild(container);

  // --- Dragging ---
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  titleBar.addEventListener("mousedown", (e) => {
    const target = e.target as Node;
    if (collapseBtn.contains(target) || closeBtn.contains(target)) return;
    dragging = true;
    titleBar.style.cursor = "grabbing";
    const r = container.getBoundingClientRect();
    offsetX = e.clientX - r.left;
    offsetY = e.clientY - r.top;
    e.preventDefault();
  });

  function onMove(e: MouseEvent): void {
    if (!dragging) return;
    const x = Math.min(Math.max(0, e.clientX - offsetX), window.innerWidth - container.offsetWidth);
    const y = Math.min(Math.max(0, e.clientY - offsetY), window.innerHeight - container.offsetHeight);
    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
    container.style.right = "auto";
  }
  function onUp(): void {
    if (dragging) {
      dragging = false;
      titleBar.style.cursor = "grab";
    }
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);

  // --- Collapse / close ---
  let collapsed = false;
  collapseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    collapsed = !collapsed;
    iframe.style.display = collapsed ? "none" : "block";
    container.style.height = collapsed ? "auto" : `${CARD_HEIGHT}px`;
    collapseBtn.textContent = collapsed ? "▢" : "−";
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    container.remove();
  });
}
