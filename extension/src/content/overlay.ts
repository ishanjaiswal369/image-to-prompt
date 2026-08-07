/**
 * Draws a screen-region selection overlay and reports the selected rect back to the
 * background service worker. Injected via chrome.scripting.executeScript's `func`
 * option (not a static content_script), so this function must be fully self-contained:
 * no references to module-scope imports/closures, only DOM/window/chrome globals.
 */
export function regionSelectOverlay(): void {
  const OVERLAY_ID = "image-to-prompt-region-overlay";

  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.15);";

  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;border:2px solid #4f46e5;background:rgba(79,70,229,0.15);display:none;pointer-events:none;";
  overlay.appendChild(box);

  document.documentElement.appendChild(overlay);

  let startX = 0;
  let startY = 0;
  let dragging = false;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") cleanup();
  };

  function cleanup() {
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
  }

  document.addEventListener("keydown", onKeyDown);

  overlay.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = "0px";
    box.style.height = "0px";
    box.style.display = "block";
  });

  overlay.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.width = `${Math.abs(e.clientX - startX)}px`;
    box.style.height = `${Math.abs(e.clientY - startY)}px`;
  });

  overlay.addEventListener("mouseup", (e) => {
    if (!dragging) return;
    dragging = false;

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
