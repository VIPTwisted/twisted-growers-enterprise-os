/* TG Bots — service worker.
   Claims jobs the same way the desktop bridge does. Token lives only in
   chrome.storage.local (this computer). Never sync. Never logged. Never
   sent except as x-tg-token to the one OS queue URL. Question text is
   typed into a tab you already signed into — never executed. */
const QUEUE = "https://fxetuqjryttnypgepsru.supabase.co/functions/v1/bridge-queue";
const ALLOWED_HOSTS = new Set(["grok.com", "claude.ai", "chatgpt.com"]);
const PROVIDERS = {
  grok: { host: "grok.com", url: "https://grok.com/" },
  grokbots: { host: "grok.com", url: "https://grok.com/" },
  claude: { host: "claude.ai", url: "https://claude.ai/new" },
  gpt: { host: "chatgpt.com", url: "https://chatgpt.com/" },
};

function safeUrl(raw, fallbackHost) {
  try {
    const u = new URL(String(raw || ""));
    if (u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^www\./, "");
    if (!ALLOWED_HOSTS.has(host)) return null;
    if (fallbackHost && host !== fallbackHost) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function cfg() {
  const s = await chrome.storage.local.get(["token", "provider", "botsUrl", "on"]);
  const provider = PROVIDERS[s.provider] ? s.provider : "grok";
  return {
    token: String(s.token || ""),
    provider,
    botsUrl: safeUrl(s.botsUrl, "grok.com") || PROVIDERS.grok.url,
    on: s.on === true,
  };
}

async function queue(token, action, extra = {}) {
  const r = await fetch(QUEUE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tg-token": token,
    },
    body: JSON.stringify({ action, machine: "tg-bots-ext", version: "1.0.0", ...extra }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String(out.error || r.status));
  return out;
}

async function findOrOpenTab(url, host) {
  const tabs = await chrome.tabs.query({ url: `https://${host}/*` });
  const live = tabs.find((t) => t.id && !t.discarded);
  if (live) {
    await chrome.tabs.update(live.id, { active: false }).catch(() => {});
    return live.id;
  }
  const created = await chrome.tabs.create({ url, active: false });
  return created.id;
}

function waitTab(id) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(), 12000);
    const on = (tabId, info) => {
      if (tabId === id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(on);
        clearTimeout(t);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(on);
  });
}

async function askTab(tabId, question) {
  const q = String(question || "").slice(0, 20000);
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "TG_BOTS_ASK", question: q });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return await chrome.tabs.sendMessage(tabId, { type: "TG_BOTS_ASK", question: q });
  }
}

async function tick() {
  const c = await cfg();
  if (!c.on || !c.token) return;
  let job = null;
  try {
    const claim = await queue(c.token, "claim");
    job = claim.job;
    if (!job) {
      await queue(c.token, "heartbeat").catch(() => {});
      return;
    }
    const spec = PROVIDERS[c.provider] || PROVIDERS.grok;
    const openUrl = c.provider === "grokbots" ? c.botsUrl : spec.url;
    const tabId = await findOrOpenTab(openUrl, spec.host);
    await waitTab(tabId);
    const started = Date.now();
    const out = await askTab(tabId, job.question);
    const seconds = Math.round((Date.now() - started) / 1000);
    const ok = !!(out && out.ok && out.reply);
    await queue(c.token, "answer", {
      id: job.id,
      ok,
      answer: ok ? out.reply : String((out && out.error) || "TG Bots got no reply. Stay signed in on the Grok/Claude/GPT tab."),
      seconds,
    });
  } catch (e) {
    if (job) {
      try {
        await queue(c.token, "answer", {
          id: job.id,
          ok: false,
          answer: "TG Bots failed: " + String(e && e.message ? e.message : e).slice(0, 300),
        });
      } catch { /* already reported */ }
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("tg-bots-poll", { periodInMinutes: 0.5 });
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "tg-bots-poll") tick();
});
chrome.storage.onChanged.addListener(() => tick());

function fromOs(sender) {
  try {
    const raw = sender.url || sender.origin || "";
    return new URL(raw).origin === "https://twisted-growers-enterprise-os.netlify.app";
  } catch {
    return false;
  }
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!fromOs(sender)) {
    sendResponse({ ok: false, error: "refused" });
    return;
  }
  if (msg && msg.type === "TG_BOTS_PING") {
    sendResponse({ ok: true });
    return;
  }
  if (msg && msg.type === "TG_BOTS_CONNECT") {
    const provider = PROVIDERS[msg.provider] ? msg.provider : "grok";
    chrome.storage.local.set({ on: true, provider }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === "TG_BOTS_SLEEP") {
    chrome.storage.local.set({ on: false }).then(() => sendResponse({ ok: true }));
    return true;
  }
  sendResponse({ ok: false });
});
