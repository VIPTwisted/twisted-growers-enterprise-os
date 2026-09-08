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

/* The four the add-on can drive. `grokbots` is a named Grok bot, so it also
   needs a botsUrl. Labels are what a person should see. */
export const PROVIDERS = [
  { key: "claude", label: "Claude", site: "claude.ai" },
  { key: "gpt", label: "ChatGPT", site: "chatgpt.com" },
  { key: "grok", label: "Grok", site: "grok.com" },
  { key: "grokbots", label: "Grok Bots", site: "grok.com", needsUrl: true },
];

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
export async function pushButtonSetup({ provider = "claude", model = "", botsUrl = "" } = {}) {
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
    models,
    modelsError,
  };
}

/* ai_models.provider names the company; the add-on names the site. One mapping,
   here, so neither side has to know the other's vocabulary. */
export const COMPANY_TO_SITE = { anthropic: "claude", openai: "gpt", xai: "grok" };
export const SITE_TO_COMPANY = { claude: "anthropic", gpt: "openai", grok: "xai", grokbots: "xai" };

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/* Refresh ai_models from what THIS account can actually open.
 *
 * The picker is fed from ai_models, and useModels() already records why that list
 * must not be hardcoded: a baked list "was guaranteed stale, and the day it mattered
 * was the day nobody had time". So rather than typing Grok and GPT version names in
 * by hand - which would also offer versions a given subscription cannot open - we read
 * the provider's own model menu on the signed-in tab and write that back. ai_models
 * becomes a CACHE of the account, refreshed on demand, and the provider stays the one
 * source of truth.
 *
 * Versions that have stopped being offered are disabled, never deleted: a user whose
 * preferred_model points at one must keep seeing the name, or their choice silently
 * becomes something else.
 */
export async function syncModelsToOs(site) {
  const company = SITE_TO_COMPANY[site];
  if (!company) return { ok: false, error: `Unknown site "${site}".` };

  const live = await tgBotsModels(site);
  if (!live.installed) return { ok: false, error: "TG Bots add-on is not on this computer." };
  if (!live.ok) return { ok: false, error: live.error || "Could not read the model menu. Sign in to that site first." };

  const models = live.models || [];
  if (!models.length) return { ok: false, error: "That tab offered no versions to read." };

  const today = new Date().toISOString().slice(0, 10);
  const rows = models.map((label, i) => ({
    id: `${company}-${slug(label)}`,
    label,
    provider: company,
    bridge_alias: label,          /* the exact menu label - the add-on matches on it */
    why: `Read from your own ${company} account on ${today}.`,
    speed: "balanced",
    enabled: true,
    sort_order: 100 + i,
  }));

  const { error } = await supabase.from("ai_models").upsert(rows, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };

  /* Anything previously read for this company that the account no longer offers is
     switched off, so the picker stops showing a version that would be refused. The
     'current' sentinel row is never touched - it is not a discovered version. */
  const keep = rows.map((r) => r.id).concat([`${site}-current`, `${company}-current`, "grok-current", "gpt-current"]);
  await supabase.from("ai_models").update({ enabled: false })
    .eq("provider", company).not("id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);

  return { ok: true, count: rows.length, models, active: live.active || "" };
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
