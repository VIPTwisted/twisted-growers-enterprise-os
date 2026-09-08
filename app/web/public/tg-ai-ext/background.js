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
  const s = await chrome.storage.local.get(["token", "provider", "botsUrl", "on", "models", "threads"]);
  const provider = PROVIDERS[s.provider] ? s.provider : "grok";
  /* Chosen version, per provider. Empty means "whatever the tab already has
     selected" - we still report which model answered either way. */
  const models = (s.models && typeof s.models === "object") ? s.models : {};
  return {
    token: String(s.token || ""),
    provider,
    model: String(models[provider] || ""),
    botsUrl: safeUrl(s.botsUrl, "grok.com") || PROVIDERS.grok.url,
    threads: (s.threads && typeof s.threads === "object") ? s.threads : {},
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
    body: JSON.stringify({ action, machine: "tg-bots-ext", version: "1.1.0", ...extra }),
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

async function send(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch {
    /* The tab was open before the extension loaded, or was discarded. Inject and retry. */
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return await chrome.tabs.sendMessage(tabId, payload);
  }
}

async function askTab(tabId, question, model) {
  return send(tabId, {
    type: "TG_BOTS_ASK",
    question: String(question || "").slice(0, 20000),
    model: String(model || ""),
  });
}

/* The versions THIS account can actually open, read off the provider's own model
   menu. Never a list baked in here: a baked list goes stale the day a provider
   ships a model, and it would offer versions the subscription cannot open. */
async function modelsFor(provider) {
  const spec = PROVIDERS[provider] || PROVIDERS.grok;
  const c = await cfg();
  const openUrl = provider === "grokbots" ? c.botsUrl : spec.url;
  const tabId = await findOrOpenTab(openUrl, spec.host);
  await waitTab(tabId);
  return send(tabId, { type: "TG_BOTS_MODELS" });
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
    /* Reuse the thread we used last time for this provider. Keeps the whole OS
       conversation in ONE chat in your own Claude/GPT/Grok history - readable on
       desktop or web - instead of littering it with a new chat per question, and
       the model keeps the context of what it already answered. */
    const remembered = safeUrl((c.threads || {})[c.provider], spec.host);
    const openUrl = remembered || (c.provider === "grokbots" ? c.botsUrl : spec.url);
    const tabId = await findOrOpenTab(openUrl, spec.host);
    await waitTab(tabId);
    const started = Date.now();
    const out = await askTab(tabId, job.question, job.model || c.model);
    const seconds = Math.round((Date.now() - started) / 1000);
    const ok = !!(out && out.ok && out.reply);
    /* Remember where that conversation lives, so the next question lands in it. */
    if (ok && out.threadUrl && safeUrl(out.threadUrl, spec.host)) {
      const threads = { ...c.threads, [c.provider]: out.threadUrl };
      await chrome.storage.local.set({ threads });
    }
    /* provider and model travel WITH the answer. An answer you cannot attribute
       to a named model is not auditable, and this OS does not accept those. */
    await queue(c.token, "answer", {
      id: job.id,
      ok,
      answer: ok ? out.reply : String((out && out.error) || "TG Bots got no reply. Stay signed in on the Grok/Claude/GPT tab."),
      seconds,
      provider: c.provider,
      model: (out && out.model) || c.model || "",
      completion: (out && out.completion) || "",
      partial: (out && out.partial) || "",
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

/* From the popup (same extension). Lists the versions this account can open. */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "TG_BOTS_LIST_MODELS") return;
  const provider = PROVIDERS[msg.provider] ? msg.provider : "grok";
  modelsFor(provider)
    .then((r) => sendResponse(r || { ok: false, error: "no response from the tab" }))
    .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 200) }));
  return true;
});

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
  /* ONE-CLICK SETUP FROM THE OS. The whole point: the user should never have to
     open this popup, find a token file, or paste anything. The OS already knows
     the bridge token and the user is already signed in there, so it hands the
     add-on everything in a single call. Only this origin can do it -
     externally_connectable in the manifest and fromOs() above both enforce that.

     Anything omitted is left alone, so the OS can push just a model change later
     without resending the token. */
  if (msg && msg.type === "TG_BOTS_SETUP") {
    const patch = {};
    if (typeof msg.token === "string" && msg.token.trim()) patch.token = msg.token.trim();
    if (PROVIDERS[msg.provider]) patch.provider = msg.provider;
    if (typeof msg.on === "boolean") patch.on = msg.on;
    const url = safeUrl(msg.botsUrl, "grok.com");
    if (url) patch.botsUrl = url;

    chrome.storage.local.get(["models"]).then((s) => {
      if (typeof msg.model === "string") {
        const models = (s.models && typeof s.models === "object") ? s.models : {};
        models[patch.provider || msg.provider || "grok"] = msg.model.slice(0, 60);
        patch.models = models;
      }
      return chrome.storage.local.set(patch);
    }).then(() => cfg()).then((c) => {
      /* Report back what is now true, so the OS can show it rather than assume it. */
      sendResponse({ ok: true, provider: c.provider, model: c.model, on: c.on, hasToken: !!c.token });
    }).catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 200) }));
    return true;
  }
  /* What the add-on currently believes, so the OS can render real state instead
     of a hopeful default. The token is never returned - only whether one is set. */
  if (msg && msg.type === "TG_BOTS_STATUS") {
    cfg().then((c) => sendResponse({
      ok: true, provider: c.provider, model: c.model, on: c.on, hasToken: !!c.token, version: "1.1.0",
    }));
    return true;
  }
  /* The OS asks which versions this account has, so the picker in the app shows
     the same list the provider itself offers - not a list we guessed. */
  if (msg && msg.type === "TG_BOTS_MODELS") {
    const provider = PROVIDERS[msg.provider] ? msg.provider : "grok";
    modelsFor(provider)
      .then((r) => sendResponse(r || { ok: false, error: "no response from the tab" }))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 200) }));
    return true;
  }
  /* The OS sets the chosen version for a provider. Stored per provider, so
     switching back and forth keeps each choice. */
  if (msg && msg.type === "TG_BOTS_SET_MODEL") {
    const provider = PROVIDERS[msg.provider] ? msg.provider : "grok";
    const model = String(msg.model || "").slice(0, 60);
    chrome.storage.local.get(["models"]).then((s) => {
      const models = (s.models && typeof s.models === "object") ? s.models : {};
      models[provider] = model;
      return chrome.storage.local.set({ models });
    }).then(() => sendResponse({ ok: true, provider, model }));
    return true;
  }
  /* LIGHTNING PATH. The alarm only fires every 30s, so a question could sit
     waiting before it was even claimed. The OS pokes this the instant it queues
     one, and the job starts immediately. The alarm stays as the safety net for
     anything queued while the browser was shut. */
  if (msg && msg.type === "TG_BOTS_WAKE") {
    tick();
    sendResponse({ ok: true });
    return;
  }
  if (msg && msg.type === "TG_BOTS_NEW_THREAD") {
    chrome.storage.local.get(["threads"]).then((s2) => {
      const threads = (s2.threads && typeof s2.threads === "object") ? s2.threads : {};
      delete threads[PROVIDERS[msg.provider] ? msg.provider : "grok"];
      return chrome.storage.local.set({ threads });
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === "TG_BOTS_SLEEP") {
    chrome.storage.local.set({ on: false }).then(() => sendResponse({ ok: true }));
    return true;
  }
  sendResponse({ ok: false });
});
