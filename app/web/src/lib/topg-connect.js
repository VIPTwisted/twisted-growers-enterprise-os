/* Connect Top G — PUSH-BUTTON SETUP.
 *
 * Owner, 8 Sep 2026: "WE WANT PUSH BUTTON SETUP." The old flow was ten steps -
 * unzip, developer mode, load unpacked, find bridge/token.txt, paste it, pick a
 * provider, toggle on. Everything after installing the add-on is now one call.
 *
 * It can be one call because the add-on already trusts this origin
 * (externally_connectable in its manifest, plus fromOs() in its worker), and this
 * page already knows the bridge token. So the OS hands the add-on the token, the
 * provider and the version in a single message. The user never opens the popup
 * and never sees a token.
 *
 * The one step that cannot be automated is installing the add-on itself: Chrome
 * requires a human to load it. Everything else is this file's job.
 *
 * Paid API stays off. The token never lives in this file, in localStorage, or in
 * git - it is read from ai_settings at the moment of setup and handed straight
 * over. */
import { supabase } from "./supabase.js";

export const TG_BOTS_ID = "egdhinbnbmibdccbmncgpbmnioepoecj";
export const TOPG_KEY = "tg-topg-connected";
export const TG_BOTS_ZIP = "/tg-ai-ext.zip";
export const TG_BOTS_NEED = "1.3.0";

export const TG_BOTS_PROVIDER_KEY = "tg-bots-provider";

/* The four the add-on can drive. `grokbots` is a named Grok bot, so it also
   needs a botsUrl. Labels are what a person should see. */
export const PROVIDERS = [
  { key: "grok", label: "Grok", site: "grok.com" },
  { key: "claude", label: "Claude", site: "claude.ai" },
  { key: "gpt", label: "ChatGPT", site: "chatgpt.com" },
  { key: "grokbots", label: "Grok Bots", site: "grok.com", needsUrl: true },
];

/* OS ai_models.provider is anthropic/xai/openai. The add-on speaks grok/claude/gpt. */
const MODEL_FOR = {
  grok: { id: "grok-current", provider: "xai" },
  grokbots: { id: "grok-current", provider: "xai" },
  claude: { id: "claude-opus-5", provider: "anthropic" },
  gpt: { id: "gpt-current", provider: "openai" },
};

export function providerLabel(key) {
  return (PROVIDERS.find((p) => p.key === key) || PROVIDERS[0]).label;
}

export function extTooOld(version) {
  const n = (v) => String(v || "0").split(".").map((x) => parseInt(x, 10) || 0);
  const a = n(version);
  const b = n(TG_BOTS_NEED);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) < (b[i] || 0)) return true;
    if ((a[i] || 0) > (b[i] || 0)) return false;
  }
  return false;
}


export function extProviderNow() {
  try {
    const p = localStorage.getItem(TG_BOTS_PROVIDER_KEY);
    if (p && PROVIDERS.some((x) => x.key === p)) return p;
  } catch { /* private mode */ }
  return "grok";
}

export function extProviderFromOs(osProvider) {
  /* This computer's last tap wins. The add-on types into a tab on THIS machine,
     so a Grok tap here must not be overridden by a company-default Claude row. */
  try {
    const tapped = localStorage.getItem(TG_BOTS_PROVIDER_KEY);
    if (tapped && PROVIDERS.some((x) => x.key === tapped)) return tapped;
  } catch { /* private mode */ }
  if (osProvider === "openai") return "gpt";
  if (osProvider === "anthropic") return "claude";
  if (osProvider === "xai") return "grok";
  return "grok";
}

export function viaLine(extProvider, model) {
  const who = providerLabel(extProvider);
  const ver = model && model !== "current" ? ` · ${model}` : "";
  return `${who} (your subscription${ver})`;
}

/* Remember the tap on THIS account. Does not grant access - admin already did. */
export async function savePreferred(extProvider) {
  const m = MODEL_FOR[extProvider] || MODEL_FOR.grok;
  try { localStorage.setItem(TG_BOTS_PROVIDER_KEY, extProvider); } catch { /* private mode */ }
  const { data: u } = await supabase.auth.getUser();
  const id = u?.user?.id;
  if (!id) return;
  await supabase.from("ai_user_access").upsert({
    user_id: id,
    preferred_model: m.id,
    preferred_provider: m.provider,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

export function topGConnected() {
  try { return localStorage.getItem(TOPG_KEY) === "1"; } catch { return false; }
}

function sendExt(msg) {
  return new Promise((resolve) => {
    try {
      const ext = typeof globalThis !== "undefined" ? globalThis.chrome : null;
      if (!ext || !ext.runtime || !ext.runtime.sendMessage) {
        resolve({ installed: false });
        return;
      }
      ext.runtime.sendMessage(TG_BOTS_ID, msg, (res) => {
        const err = ext.runtime.lastError;
        if (err) resolve({ installed: false });
        else resolve({ installed: true, ...(res || {}) });
      });
    } catch {
      resolve({ installed: false });
    }
  });
}

export const pingTgBots = () => sendExt({ type: "TG_BOTS_PING" });

/* What the add-on believes right now. Render this rather than a hopeful default -
   showing "connected" when it is not is the same class of lie as a green sync
   over a frozen mirror. */
export const tgBotsStatus = () => sendExt({ type: "TG_BOTS_STATUS" });

/* The versions THIS subscription can open, read live from the provider's own
   model menu on the signed-in tab. Never a list we baked in: a baked list goes
   stale the day a provider ships a model, and would offer versions the account
   cannot open. */
export const tgBotsModels = (provider) => sendExt({ type: "TG_BOTS_MODELS", provider });

export const tgBotsSetModel = (provider, model) =>
  sendExt({ type: "TG_BOTS_SET_MODEL", provider, model });

/* Start a fresh conversation for this provider. Otherwise every OS question
   continues the same thread, which is usually what you want - it stays readable
   in your own Claude/GPT/Grok history and keeps its context. */
export const tgBotsNewThread = (provider) =>
  sendExt({ type: "TG_BOTS_NEW_THREAD", provider });

/* LIGHTNING PATH. The add-on's alarm only fires every 30 seconds, so a question
   could sit unclaimed for half a minute. Call this the instant a job is queued
   and it starts immediately; the alarm stays as the net for anything queued
   while the browser was closed. Fire and forget - never block the UI on it. */
export function wakeTgBots() {
  sendExt({ type: "TG_BOTS_WAKE" }).catch(() => {});
}

/* ── THE BUTTON ───────────────────────────────────────────────────────────────
   One call does the lot: check the add-on is there, read the bridge token, push
   token + provider + version, switch it on, and read back the versions this
   account offers.

   Returns { installed, ok, provider, model, models, error }. When `installed` is
   false the caller should show the download link and stop - there is nothing to
   configure yet. */
export async function pushButtonSetup({ provider = "grok", model = "", botsUrl = "" } = {}) {
  const alive = await pingTgBots();
  if (!alive.installed) {
    return { installed: false, ok: false, error: "TG Bots add-on is not on this computer yet." };
  }

  /* The token lives in ai_settings and is handed straight over. It is never
     written to localStorage and never rendered. */
  let token = "";
  try {
    const { data, error } = await supabase.from("ai_settings").select("bridge_token").limit(1).maybeSingle();
    if (error) throw error;
    token = (data && data.bridge_token) || "";
  } catch (e) {
    return { installed: true, ok: false, error: `Could not read the bridge token: ${e.message || e}` };
  }
  if (!token) {
    return { installed: true, ok: false, error: "No bridge token is set in AI settings, so the add-on has nothing to authenticate with." };
  }

  const set = await sendExt({ type: "TG_BOTS_SETUP", token, provider, model, botsUrl, on: true });
  if (!set.ok) {
    return { installed: true, ok: false, error: set.error || "The add-on refused the setup message." };
  }

  try { localStorage.setItem(TOPG_KEY, "1"); } catch { /* private mode */ }
  try { localStorage.setItem(TG_BOTS_PROVIDER_KEY, provider); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event("tg-topg")); } catch { /* no window */ }

  /* Best-effort: read the version list so the picker can be populated straight
     away. A failure here does NOT fail the setup - it usually just means that
     provider's tab is not signed in yet, which the caller can say plainly. */
  let models = [];
  let modelsError = "";
  try {
    const m = await tgBotsModels(provider);
    if (m && m.ok) models = m.models || [];
    else modelsError = (m && m.error) || "";
  } catch { /* leave models empty */ }

  return {
    installed: true,
    ok: true,
    provider: set.provider || provider,
    model: set.model || model,
    on: set.on !== false,
    version: set.version,
    models,
    modelsError,
  };
}

/* Old name. Used to mark "connected" even when the add-on was missing. That is
   a green light over a dead wire. One-tap setup is the only path now. */
export async function connectTopG(provider) {
  return pushButtonSetup({ provider: provider || "grok" });
}

export async function disconnectTopG() {
  try { localStorage.removeItem(TOPG_KEY); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event("tg-topg")); } catch { /* no window */ }
  return sendExt({ type: "TG_BOTS_SLEEP" });
}
