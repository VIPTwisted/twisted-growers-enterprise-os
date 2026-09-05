/* Connect Top G — one click on Command Center wakes Staff, Budz, and the
   TG Bots add-on on this computer. Paid API stays off. Token never lives here. */
export const TG_BOTS_ID = "egdhinbnbmibdccbmncgpbmnioepoecj";
export const TOPG_KEY = "tg-topg-connected";
export const TG_BOTS_ZIP = "/tg-ai-ext.zip";

export function topGConnected() {
  try { return localStorage.getItem(TOPG_KEY) === "1"; } catch { return false; }
}

function sendExt(msg) {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve({ installed: false });
        return;
      }
      chrome.runtime.sendMessage(TG_BOTS_ID, msg, (res) => {
        const err = chrome.runtime.lastError;
        if (err) resolve({ installed: false });
        else resolve({ installed: true, ...(res || {}) });
      });
    } catch {
      resolve({ installed: false });
    }
  });
}

export function pingTgBots() {
  return sendExt({ type: "TG_BOTS_PING" });
}

export async function connectTopG(provider) {
  try { localStorage.setItem(TOPG_KEY, "1"); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event("tg-topg")); } catch { /* no window */ }
  return sendExt({ type: "TG_BOTS_CONNECT", provider: provider || "grok" });
}

export async function disconnectTopG() {
  try { localStorage.removeItem(TOPG_KEY); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event("tg-topg")); } catch { /* no window */ }
  return sendExt({ type: "TG_BOTS_SLEEP" });
}
