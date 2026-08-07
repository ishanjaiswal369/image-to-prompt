import { regionSelectOverlay } from "../content/overlay.js";
import { isRegionSelectedMessage, type PendingAnalysis, type RegionRect } from "../shared/types.js";

const CONTEXT_MENU_ID = "analyze-with-image-to-prompt";
const SIDE_PANEL_PATH = "src/sidepanel/index.html";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Analyze with Image to Prompt",
    contexts: ["image"],
  });
});

// The service worker can be killed after ~30s idle — never keep in-flight state
// (pending idempotency key, captured screenshot) only in memory. Persist it to
// chrome.storage.session, which survives worker restarts but clears on browser close.
async function setPendingAnalysis(pending: PendingAnalysis): Promise<void> {
  await chrome.storage.session.set({ pendingAnalysis: pending });
}

async function openSidePanelForTab(tabId: number, windowId: number): Promise<void> {
  await chrome.sidePanel.setOptions({ tabId, path: SIDE_PANEL_PATH, enabled: true });
  await chrome.sidePanel.open({ tabId, windowId });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.srcUrl || tab?.id === undefined || tab.windowId === undefined) {
    return;
  }

  void (async () => {
    await setPendingAnalysis({
      idempotencyKey: crypto.randomUUID(),
      sourceType: "image_url",
      imageUrl: info.srcUrl,
      createdAt: Date.now(),
    });
    await openSidePanelForTab(tab.id as number, tab.windowId as number);
  })();
});

// Toolbar icon click starts the screen-region-selection flow. Scoped to activeTab
// (a user-gesture-triggered, single-tab, temporary permission) rather than any
// standing host_permissions — see docs/ARCHITECTURE.md.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  void chrome.scripting.executeScript({ target: { tabId: tab.id }, func: regionSelectOverlay });
});

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function cropScreenshot(dataUrl: string, rect: RegionRect): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);

  const width = Math.max(1, Math.round(rect.width * rect.devicePixelRatio));
  const height = Math.max(1, Math.round(rect.height * rect.devicePixelRatio));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("could not get OffscreenCanvas 2d context");

  ctx.drawImage(
    bitmap,
    rect.x * rect.devicePixelRatio,
    rect.y * rect.devicePixelRatio,
    rect.width * rect.devicePixelRatio,
    rect.height * rect.devicePixelRatio,
    0,
    0,
    width,
    height
  );

  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
  return arrayBufferToBase64(await croppedBlob.arrayBuffer());
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isRegionSelectedMessage(message) || sender.tab?.id === undefined || sender.tab.windowId === undefined) {
    return undefined;
  }

  const tabId = sender.tab.id;
  const windowId = sender.tab.windowId;

  void (async () => {
    try {
      // captureVisibleTab is rate-limited (~2 calls/sec) — fine for one user-initiated capture.
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      const screenshotBase64 = await cropScreenshot(dataUrl, message.rect);

      await setPendingAnalysis({
        idempotencyKey: crypto.randomUUID(),
        sourceType: "screenshot",
        screenshotBase64,
        createdAt: Date.now(),
      });

      await openSidePanelForTab(tabId, windowId);
      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: (err as Error).message });
    }
  })();

  return true; // keep the message channel open for the async sendResponse above
});
