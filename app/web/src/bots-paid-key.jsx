/* Optional Anthropic key for Bots paid fallback.
   Grok / ChatGPT / Claude pills still use signed-in tabs with no key.
   Same vault as Assistant settings: app_secrets.ANTHROPIC_API_KEY via f_set_ai_key. */
import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";

export default function BotsPaidKey({ role }) {
  const can = ["owner", "executive"].includes(role);
  const [keySet, setKeySet] = useState(false);
  const [paidOn, setPaidOn] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const [{ data: present }, { data: cfg }] = await Promise.all([
        supabase.rpc("f_ai_key_present"),
        supabase.from("ai_settings").select("id, paid_model_enabled").limit(1).maybeSingle(),
      ]);
      if (!live) return;
      setKeySet(!!present);
      setPaidOn(!!cfg?.paid_model_enabled);
    })();
    return () => { live = false; };
  }, []);

  async function saveKey() {
    const key = draft.trim();
    if (!key || busy) return;
    setBusy(true);
    setMsg("");
    const { data, error } = await supabase.rpc("f_set_ai_key", { p_key: key });
    if (error || data?.ok === false) {
      setMsg(error?.message || data?.message || "The key was not stored.");
      setBusy(false);
      return;
    }
    const { error: sw } = await supabase.from("ai_settings")
      .update({ paid_model_enabled: true, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setKeySet(true);
    setPaidOn(true);
    setDraft("");
    setMsg(sw ? "Key stored. The paid switch could not be turned on: " + sw.message : "Saved. Bots can use the paid Claude API when the free path is down.");
    setBusy(false);
  }

  async function removeKey() {
    if (busy) return;
    if (!window.confirm("Remove the Bots paid key? Questions go back to the signed-in tab. No per-question bill.")) return;
    setBusy(true);
    setMsg("");
    await supabase.rpc("f_clear_ai_key");
    await supabase.from("ai_settings")
      .update({ paid_model_enabled: false, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setKeySet(false);
    setPaidOn(false);
    setMsg("Removed. Bots use the signed-in tab again.");
    setBusy(false);
  }

  async function togglePaid() {
    if (busy) return;
    setBusy(true);
    const next = !paidOn;
    const { error } = await supabase.from("ai_settings")
      .update({ paid_model_enabled: next, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (!error) setPaidOn(next);
    setMsg(error ? error.message : (next ? "Paid fallback on." : "Paid fallback off."));
    setBusy(false);
  }

  return (
    <div className="panel" style={{ maxWidth: "none" }}>
      <div className="ptitle">Bots — paid AI (optional) {keySet ? <span className="pill ok" style={{ marginLeft: 8 }}>set</span> : <span className="pill" style={{ marginLeft: 8 }}>not set</span>}</div>
      <div className="note" style={{ marginBottom: 10 }}>
        Grok, Claude, and ChatGPT in Bots run from your signed-in tabs with no key.
        Paste an Anthropic key only if you want the paid Claude API as a fallback.
        One key for the company. Never shown again. Does not touch Metrc or Apex.
      </div>
      {!can ? (
        <div className="note">Owner or executive pastes this key. Your role is <b>{role || "unknown"}</b>.</div>
      ) : (
        <>
          <label htmlFor="bots-paid-key">Anthropic API key</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              id="bots-paid-key"
              className="inp"
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveKey(); } }}
              placeholder={keySet ? "Paste to replace…" : "Paste the key from console.anthropic.com"}
              style={{ flex: "1 1 240px", minWidth: 200 }}
              aria-label="Anthropic API key for Bots"
            />
            <button type="button" className="btn primary" disabled={busy || !draft.trim()} onClick={saveKey}>
              {busy ? "Saving…" : "Save bot key"}
            </button>
            {keySet ? (
              <button type="button" className="btn ghost" disabled={busy} onClick={removeKey}>Remove</button>
            ) : null}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={busy} onClick={togglePaid}>
              Paid fallback is {paidOn ? "ON" : "OFF"}
            </button>
            <span className="note">{paidOn ? "Metered Claude API runs when the free path is down." : "Off means Bots will not spend."}</span>
          </div>
        </>
      )}
      {msg ? <div className="msg" style={{ marginTop: 10 }}>{msg}</div> : null}
    </div>
  );
}
