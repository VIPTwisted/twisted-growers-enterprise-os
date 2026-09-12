/* One-tap TG Bots. Owner 11 Sep 2026: fully, fast, easy, current subscriptions.
   Chrome still requires a human to load the add-on once. After that this panel
   is the whole setup: pick Grok / Claude / GPT, stay signed in, talk.
   Paid API stays off. Metrc stays read-only. */
import React, { useEffect, useState } from "react";
import {
  PROVIDERS, TG_BOTS_NEED, TG_BOTS_ZIP, extProviderNow, extTooOld, pingTgBots, providerLabel,
  pushButtonSetup, savePreferred, tgBotsModels, tgBotsNewThread, tgBotsSetModel,
  tgBotsStatus,
} from "./topg-connect.js";

export default function TgBotsPanel({ compact = false, onReady }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [provider, setProvider] = useState(() => extProviderNow());
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [botsUrl, setBotsUrl] = useState("");

  async function refresh() {
    const [ping, status] = await Promise.all([pingTgBots(), tgBotsStatus()]);
    const installed = !!(ping.installed || status.installed);
    const next = { installed, version: ping.version || status.version, ...(status.installed ? status : {}) };
    setSt(next);
    if (next.provider) setProvider(next.provider);
    if (typeof next.model === "string") setModel(next.model);
  }

  useEffect(() => { refresh(); }, []);

  async function tapProvider(key) {
    if (on && provider === key) {
      setMsg(`${providerLabel(key)} is already on. Leave it green. Type your question in the chat below.`);
      return;
    }
    setBusy(true);
    setMsg("");
    const r = await pushButtonSetup({
      provider: key,
      model,
      botsUrl: key === "grokbots" ? botsUrl : "",
    });
    if (!r.installed) {
      setSt({ installed: false });
      setMsg("Install the add-on once (download below), then tap again. Chrome will not let a page do that step for you.");
      setBusy(false);
      return;
    }
    if (!r.ok) {
      setMsg(r.error || "The add-on refused.");
      setBusy(false);
      await refresh();
      return;
    }
    await savePreferred(key);
    setProvider(key);
    setModels(Array.isArray(r.models) ? r.models : []);
    setSt({ installed: true, ok: true, on: true, provider: r.provider, model: r.model, hasToken: true, version: r.version || st?.version });
    setMsg(`On. ${providerLabel(key)} answers in this OS chat. Leave this button green. Type below. Do not click it again.`);
    onReady?.(r);
    setBusy(false);
  }

  async function loadVersions() {
    setBusy(true);
    const r = await tgBotsModels(provider);
    if (r && r.ok) {
      setModels(r.models || []);
      setMsg((r.models || []).length
        ? `These are the versions ${providerLabel(provider)} is offering this signed-in tab right now.`
        : "Signed in, but that tab is not showing a version menu yet. Open grok.com / claude.ai / chatgpt.com and try again.");
    } else {
      const err = (r && r.error) || "";
      setMsg(/permission|host|cannot access|Allow/i.test(err)
        ? "Press Allow on the TG Bots tab that just opened, then load versions again."
        : (err || "Open a signed-in tab for that provider, then load versions."));
    }
    setBusy(false);
  }

  function startNew() {
    const p = provider || "grok";
    const sites = {
      grok: "https://grok.com/",
      grokbots: "https://grok.com/",
      claude: "https://claude.ai/new",
      gpt: "https://chatgpt.com/",
    };
    /* Open FIRST, in this click. Awaiting the add-on first makes Chrome treat
       window.open as a popup and block it — the button looks dead. */
    const w = window.open(sites[p] || "https://grok.com/", "_blank", "noopener");
    tgBotsNewThread(p).catch(() => {});
    setMsg(w
      ? "New " + providerLabel(p) + " chat opened. Stay signed in on that tab. Type below — do not tap Grok."
      : "This browser blocked the new tab. Allow popups for the OS, or open grok.com yourself and click New chat there.");
  }

  async function pickVersion(value) {
    setModel(value);
    if (!st?.installed) return;
    await tgBotsSetModel(provider, value);
  }

  const on = !!(st && st.installed && st.on);
  const installed = !!(st && st.installed);
  const old = installed && extTooOld(st.version);

  return (
    <div className={`tgbots${compact ? " compact" : ""}`}>
      <div className="tgbots-head">
        <strong>Talk with the plan you already pay for</strong>
        <span className={`tgbots-pill ${on ? "on" : installed ? "off" : "miss"}`}>
          {st == null ? "checking…" : old ? "old add-on" : on ? `${providerLabel(st.provider || provider)} on` : installed ? "add-on idle" : "not installed"}
        </span>
      </div>
      <p className="tgbots-why">
        Grok, Claude, or ChatGPT on this computer. No API key. No extra bill.
        Every staff desk uses the same tap. Metrc stays read-only.
      </p>
      {old && (
        <ol className="tgbots-steps">
          <li>This computer has add-on {st.version || "1.2.0"}. Type HI in the chat below. Do not tap Grok — that opens grok.com and leaves the OS.</li>
          <li>Stay signed in on grok.com in another tab. If an answer says “path specified”, Task Manager → end node.exe, then ask again.</li>
        </ol>
      )}
      {!installed && (
        <ol className="tgbots-steps">
          <li><a href={TG_BOTS_ZIP} download="tg-ai-ext.zip">Download TG Bots</a> and unzip it.</li>
          <li>Chrome or Edge → Extensions → turn on Developer mode → Load unpacked → pick that folder.</li>
          <li>Come back here and tap Grok, Claude, or ChatGPT.</li>
        </ol>
      )}
      <div className="tgbots-keys" role="group" aria-label="Answer with">
        {PROVIDERS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={provider === p.key && on ? "on" : ""}
            disabled={busy}
            aria-pressed={provider === p.key && on}
            onClick={() => tapProvider(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {provider === "grokbots" && (
        <label className="tgbots-url">
          Grok Bots address
          <input
            type="url"
            value={botsUrl}
            placeholder="https://grok.com/…"
            aria-label="Grok Bots address"
            onChange={(e) => setBotsUrl(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      )}
      {installed && (
        <div className="tgbots-more">
          <label>
            Version
            <select aria-label="Version" value={model} onChange={(e) => pickVersion(e.target.value)} disabled={busy}>
              <option value="">Whatever the tab already has selected</option>
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <button type="button" className="ghost" disabled={busy} onClick={loadVersions}>Load my versions</button>
          <button type="button" className="ghost" onClick={startNew}>New conversation</button>
        </div>
      )}
      {msg ? <p className="tgbots-msg">{msg}</p> : null}
    </div>
  );
}
