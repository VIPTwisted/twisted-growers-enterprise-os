/* TG Bots — service worker.
   Claims jobs the same way the desktop bridge does. Token lives only in
   chrome.storage.local (this computer). Never sync. Never logged. Never
   sent except as x-tg-token to the one OS queue URL. Question text is
   typed into a tab you already signed into — never executed.

   11 Sep 2026: Chrome was refusing the signed-in Grok tab with
   "Extension manifest must request permission to access the respective host."
   Two real causes, both now handled:
   1. grok.com signs in / redirects through x.ai, grok.x.ai, x.com. Those
      hosts were not in the manifest, so executeScript died before a single
      keystroke. Manifest 1.2.0 names them.
   2. waitTab fired on about:blank / a login bounce, then injected into a
      URL Chrome will not let an add-on read. We now wait until the tab is
      HTTPS on an allowed host, and if inject still fails we say Site access
      in English instead of leaking Chrome's own sentence. */
const QUEUE = "https://fxetuqjryttnypgepsru.supabase.co/functions/v1/bridge-queue";
const VERSION = "1.3.3";
const ALLOWED_HOSTS = new Set([
  "grok.com", "grok.x.ai", "x.ai", "accounts.x.ai", "x.com",
  "claude.ai",
  "chatgpt.com", "chat.openai.com",
]);
const GROK_FAMILY = new Set(["grok.com", "grok.x.ai", "x.ai", "accounts.x.ai", "x.com"]);
const PROVIDERS = {
  grok: { host: "grok.com", url: "https://grok.com/" },
  grokbots: { host: "grok.com", url: "https://grok.com/" },
  claude: { host: "claude.ai", url: "https://claude.ai/new" },
  gpt: { host: "chatgpt.com", url: "https://chatgpt.com/" },
};

function bareHost(hostname) {
  return String(hostname || "").replace(/^www\./, "");
}

function hostOf(url) {
  try { return bareHost(new URL(url).hostname); } catch { return ""; }
}

function isAllowedUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" && ALLOWED_HOSTS.has(bareHost(u.hostname));
  } catch {
    return false;
  }
}

function isLoginUrl(url) {
  const h = hostOf(url);
  const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ""; } })();
  if (h === "accounts.x.ai") return true;
  if (/\/(login|sign-?in|auth)\b/.test(path)) return true;
  return false;
}

function sameFamily(host, fallbackHost) {
  const a = bareHost(host);
  const b = bareHost(fallbackHost);
  if (a === b) return true;
  if (GROK_FAMILY.has(a) && GROK_FAMILY.has(b)) return true;
  if ((a === "chatgpt.com" || a === "chat.openai.com") &&
      (b === "chatgpt.com" || b === "chat.openai.com")) return true;
  return false;
}

function safeUrl(raw, fallbackHost) {
  try {
    const u = new URL(String(raw || ""));
    if (u.protocol !== "https:") return null;
    const host = bareHost(u.hostname);
    if (!ALLOWED_HOSTS.has(host)) return null;
    if (fallbackHost && !sameFamily(host, fallbackHost)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function siteAccessError(url) {
  const host = hostOf(url) || "that site";
  return `Chrome is blocking this add-on from ${host}. A TG Bots tab just opened — press Allow. Then ask again.`;
}

async function openGrant() {
  const url = chrome.runtime.getURL("grant.html");
  const existing = await chrome.tabs.query({ url }).catch(() => []);
  if (existing && existing[0] && existing[0].id) {
    await chrome.tabs.update(existing[0].id, { active: true }).catch(() => {});
    return;
  }
  await chrome.tabs.create({ url, active: true }).catch(() => {});
}

function humanize(err, url) {
  const msg = String(err && err.message ? err.message : err);
  if (/permission|host|cannot access|respective host/i.test(msg)) return siteAccessError(url);
  return msg.slice(0, 300);
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
    /* the whole map, so a per-job provider can resolve ITS own chosen version
       rather than inheriting the one belonging to the popup's provider */
    models,
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
    body: JSON.stringify({ action, machine: "tg-bots-ext", version: VERSION, ...extra }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String(out.error || r.status));
  return out;
}

function queryPatterns(host) {
  const h = bareHost(host);
  const out = [`https://${h}/*`, `https://www.${h}/*`];
  if (GROK_FAMILY.has(h)) {
    out.push(
      "https://grok.com/*", "https://www.grok.com/*",
      "https://grok.x.ai/*",
      "https://x.ai/*",
      "https://x.com/*", "https://www.x.com/*",
    );
  }
  return [...new Set(out)];
}

async function stayOnOs() {
  const os = await chrome.tabs.query({ url: "https://twisted-growers-enterprise-os.netlify.app/*" }).catch(() => []);
  const tab = (os || []).find((t) => t && t.id);
  if (tab && tab.id) await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
}

async function findOrOpenTab(url, host, { focus = false } = {}) {
  const seen = new Set();
  const tabs = [];
  for (const pattern of queryPatterns(host)) {
    const found = await chrome.tabs.query({ url: pattern });
    for (const t of found) {
      if (!t.id || t.discarded || seen.has(t.id)) continue;
      seen.add(t.id);
      tabs.push(t);
    }
  }
  /* Prefer a signed-in chat tab over a login bounce. */
  const live = tabs.find((t) => isAllowedUrl(t.url) && !isLoginUrl(t.url))
            || tabs.find((t) => isAllowedUrl(t.url));
  if (live) {
    if (focus) await chrome.tabs.update(live.id, { active: true }).catch(() => {});
    return live.id;
  }
  /* Create the provider tab so it can finish loading, then put the OS back in
     front. Tapping Grok used to yank the owner onto grok.com. */
  const created = await chrome.tabs.create({ url, active: true });
  await waitAllowed(created.id, 15000);
  await stayOnOs();
  return created.id;
}

async function waitAllowed(tabId, ms = 20000) {
  const deadline = Date.now() + ms;
  const snap = async () => {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) return null;
    if (t.status === "complete" && isAllowedUrl(t.url)) return t;
    return false;
  };
  const first = await snap();
  if (first) return first;
  return new Promise((resolve) => {
    const finish = async () => {
      chrome.tabs.onUpdated.removeListener(on);
      clearTimeout(timer);
      const last = await snap();
      resolve(last || null);
    };
    const timer = setTimeout(finish, Math.max(0, deadline - Date.now()));
    const on = (id, info, tab) => {
      if (id !== tabId) return;
      if ((info.status === "complete" || info.url) && tab && isAllowedUrl(tab.url) && tab.status === "complete") {
        chrome.tabs.onUpdated.removeListener(on);
        clearTimeout(timer);
        resolve(tab);
      }
    };
    chrome.tabs.onUpdated.addListener(on);
  });
}

async function inject(tabId) {
  /* Top frame only. allFrames:true fails the WHOLE inject if any iframe
     (analytics, captcha, payment) is a host we did not name. That was a
     second way to get Chrome's host-permission sentence on a grok.com tab. */
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
    injectImmediately: true,
  });
}

async function send(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch {
    /* Tab was open before the add-on loaded, or content.js has not run yet. */
  }
  const tab = await waitAllowed(tabId, 8000);
  if (!tab) {
    const now = await chrome.tabs.get(tabId).catch(() => null);
    if (now && isLoginUrl(now.url)) {
      throw new Error("That tab is on a sign-in page. Sign in to Grok / Claude / ChatGPT, leave the chat open, then ask again.");
    }
    await openGrant();
    throw new Error(siteAccessError(now && now.url));
  }
  try {
    await inject(tabId);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (/permission|host|cannot access/i.test(msg)) {
      await openGrant();
      throw new Error(siteAccessError(tab.url));
    }
    throw new Error(msg.slice(0, 300));
  }
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (e) {
    throw new Error(humanize(e, tab.url));
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
  const tabId = await findOrOpenTab(openUrl, spec.host, { focus: false });
  await waitAllowed(tabId);
  await stayOnOs();
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
    /* The site to open. If the OS names one in context, it wins - otherwise a
       user who picks a Grok version in the app while this add-on is set to
       Claude would have that version hunted for in Claude's menu and refused.
       context is jsonb and passes through `claim` untouched, which is the same
       route the model already takes, so this needs no edge-function change.
       Until the OS sends it, the add-on's own setting is used, exactly as now. */
    const wantedProvider = (job.context && PROVIDERS[job.context.provider]) ? job.context.provider : c.provider;
    const spec = PROVIDERS[wantedProvider] || PROVIDERS.grok;
    /* Reuse the thread we used last time for this provider. Keeps the whole OS
       conversation in ONE chat in your own Claude/GPT/Grok history - readable on
       desktop or web - instead of littering it with a new chat per question, and
       the model keeps the context of what it already answered. */
    const remembered = safeUrl((c.threads || {})[wantedProvider], spec.host);
    const openUrl = remembered || (wantedProvider === "grokbots" ? c.botsUrl : spec.url);
    const tabId = await findOrOpenTab(openUrl, spec.host);
    await waitAllowed(tabId);
    const started = Date.now();
    /* THE MODEL RIDES IN context, not in a top-level column. bridge-queue's
       `claim` deliberately returns only id, question and context - its own header
       says so and says not to widen that select - so a top-level job.model is
       written for the audit trail and never arrives here. Reading it would have
       meant the per-user model choice silently never reached this add-on, and
       every question would have run on whatever the popup happened to be set to.
       Falls back to the add-on's own setting when the OS sends nothing. */
    const wanted = (job.context && job.context.model) || job.model || c.models[wantedProvider] || "";
    const out = await askTab(tabId, job.question, wanted);
    const seconds = Math.round((Date.now() - started) / 1000);
    const ok = !!(out && out.ok && out.reply);
    /* Remember where that conversation lives, so the next question lands in it. */
    if (ok && out.threadUrl && safeUrl(out.threadUrl, spec.host)) {
      const threads = { ...c.threads, [wantedProvider]: out.threadUrl };
      await chrome.storage.local.set({ threads });
    }
    /* provider and model travel WITH the answer. An answer you cannot attribute
       to a named model is not auditable, and this OS does not accept those. */
    await queue(c.token, "answer", {
      id: job.id,
      ok,
      answer: ok ? out.reply : String((out && out.error) || "TG Bots got no reply. Stay signed in on the Grok/Claude/GPT tab."),
      seconds,
      provider: wantedProvider,
      model: (out && out.model) || wanted || "",
      completion: (out && out.completion) || "",
      partial: (out && out.partial) || "",
    });
  } catch (e) {
    if (job) {
      try {
        await queue(c.token, "answer", {
          id: job.id,
          ok: false,
          answer: "TG Bots failed: " + humanize(e),
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
  if (msg && msg.type === "TG_BOTS_GRANTED") {
    tick();
    sendResponse({ ok: true });
    return;
  }
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
    sendResponse({ ok: true, version: VERSION });
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
    }).then(() => cfg()).then(async (c) => {
      /* Do not jump the owner onto grok.com. Stay on the live OS. */
      try {
        const spec = PROVIDERS[c.provider] || PROVIDERS.grok;
        const openUrl = c.provider === "grokbots" ? c.botsUrl : spec.url;
        await findOrOpenTab(openUrl, spec.host, { focus: false });
        await stayOnOs();
      } catch { /* setup still succeeded; the next ask will open the tab */ }
      sendResponse({ ok: true, provider: c.provider, model: c.model, on: c.on, hasToken: !!c.token, version: VERSION });
    }).catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 200) }));
    return true;
  }
  /* What the add-on currently believes, so the OS can render real state instead
     of a hopeful default. The token is never returned - only whether one is set. */
  if (msg && msg.type === "TG_BOTS_STATUS") {
    cfg().then((c) => sendResponse({
      ok: true, provider: c.provider, model: c.model, on: c.on, hasToken: !!c.token, version: VERSION,
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
  if (msg && msg.type === "TG_BOTS_ASK_NOW") {
    (async () => {
      try {
        const c = await cfg();
        if (!c.on) {
          sendResponse({ ok: false, error: "Tap Grok on Bots desk first." });
          return;
        }
        const wantedProvider = (PROVIDERS[msg.provider] ? msg.provider : c.provider) || "grok";
        const spec = PROVIDERS[wantedProvider] || PROVIDERS.grok;
        const remembered = safeUrl((c.threads || {})[wantedProvider], spec.host);
        const openUrl = remembered || (wantedProvider === "grokbots" ? c.botsUrl : spec.url);
        const tabId = await findOrOpenTab(openUrl, spec.host, { focus: false });
        await waitAllowed(tabId);
        await stayOnOs();
        const wanted = String(msg.model || c.models[wantedProvider] || "");
        const out = await askTab(tabId, String(msg.question || "").slice(0, 20000), wanted);
        const ok = !!(out && out.ok && out.reply);
        if (ok && out.threadUrl && safeUrl(out.threadUrl, spec.host)) {
          await chrome.storage.local.set({ threads: { ...c.threads, [wantedProvider]: out.threadUrl } });
        }
        sendResponse({
          ok,
          reply: ok ? out.reply : "",
          error: ok ? "" : String((out && out.error) || "No reply. Stay signed in on Grok."),
          provider: wantedProvider,
          model: (out && out.model) || wanted || "",
        });
      } catch (e) {
        sendResponse({ ok: false, error: humanize(e) });
      }
    })();
    return true;
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

