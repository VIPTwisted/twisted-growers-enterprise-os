/* KEYS & CONNECTIONS — the page that says "Paste service keys here" and, until today,
   had nowhere to paste.
 *
 * Owner, 12 Aug 2026: "no im not going into supa", "find other fast easy way for you to do",
 * then, with the page open in front of him: "you need to add way for me to add key and
 * secrets here right now i cant". He is right that pasting a credential into a vendor console
 * is not the owner of the company's job.
 *
 * WHY THIS IS ITS OWN FILE AND NOT A PANEL BOLTED ONTO ReportScreen.
 * `hold_the_ddc_discipline`: share primitives, NEVER layouts — "one ReportScreen behind 522
 * pages was the CAUSE of the bugs." A credential vault is not a report. Routed through the
 * report archetype it inherited a search box, a column picker, an export row (CSV / Excel /
 * PDF / Google Sheets — on a secrets page) and, worst of all, a DATE RANGE defaulted to this
 * month, with a banner reading "Filters in force: updated at from 2026-08-01 to 2026-08-31".
 * A key set in July was therefore invisible, and the operator's next move is to paste a second
 * one and never learn why. On a registry of what is configured, "only this month" is not a
 * lens, it is a way to hide configuration. None of that chrome exists here because this screen
 * is not built from it. `updated_at` survives as a FACT on every row, because rotating a key
 * with confidence needs to know when it was last set — it is just not a filter.
 *
 * WHAT THIS SCREEN CANNOT DO, BY CONSTRUCTION.
 * It cannot show you a key. Not because it chooses not to: `v_secret_status` does not
 * reference `app_secrets.value` at all, the `authenticated` role no longer holds SELECT on
 * that column, and `tg_read_secret` is no longer executable from a browser. The last four
 * characters shown here are a separate non-secret column written once at save time, and only
 * when the value is at least twelve characters long — below that, four characters is too much
 * of the secret, so nothing is shown. See
 * supabase/migrations/20260812210000_keys_and_connections_accepts_a_key_and_never_hands_one_back.sql
 * for the three read routes that were open before this and the measurements that found them.
 *
 * EVERY SUPABASE CALL HERE BINDS `error`. 117 of 142 reads in this front end bind `data` and
 * not `error`, so a permission denial, a dropped view and a statement timeout all arrive as
 * `data = null`, become `[]`, and render as a silent empty section. On a security page that
 * would be a page confidently reporting "no keys are set".
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";

const CHROME = 11;   /* DDC scale: chrome 9–11px */
const BODY = 12;     /* 12px floor for prose, and prose never goes below it */

function when(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function KeysConnections({ session }) {
  const [rows, setRows] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [draft, setDraft] = useState({});      /* key -> pasted text, never persisted */
  const [busy, setBusy] = useState(null);
  const [said, setSaid] = useState({});        /* key -> {ok, text} */
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(null);
  const live = useRef(true);

  useEffect(() => () => { live.current = false; setDraft({}); }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("v_secret_status")
      .select("key,label,help,status,masked,updated_at,last_set_at,last_set_by")
      .order("key");
    if (!live.current) return;
    if (error) { setLoadErr(error.message); setRows([]); return; }
    setLoadErr(null);
    setRows(data ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* One place where a credential leaves this component, and it goes to a SECURITY DEFINER
     function gated on owner-or-executive. There is no table write from the browser. */
  async function save(key) {
    const value = draft[key] ?? "";
    if (!value.trim()) {
      setSaid((s) => ({ ...s, [key]: { ok: false, text: "Nothing pasted yet." } }));
      return;
    }
    setBusy(key);
    const { error } = await supabase.rpc("tg_set_secret", { p_key: key, p_value: value });
    /* Clear the pasted text before anything else happens, success or failure. It has no
       reason to stay in memory and every reason not to sit in a form the browser may
       restore. */
    setDraft((d) => ({ ...d, [key]: "" }));
    setBusy(null);
    if (error) {
      setSaid((s) => ({ ...s, [key]: { ok: false, text: error.message } }));
      return;
    }
    /* Say nothing about success until the registry itself has been re-read. A screen that
       reports "saved" on the strength of having tried is the same error as stamping a
       delivery because the send was handed over. */
    await load();
    if (live.current) setSaid((s) => ({ ...s, [key]: { ok: true, text: "Stored. It cannot be read back." } }));
  }

  async function forget(key) {
    setBusy(key);
    const { error } = await supabase.rpc("tg_secret_forget", { p_key: key, p_drop_registration: false });
    setBusy(null);
    setConfirmRemove(null);
    if (error) { setSaid((s) => ({ ...s, [key]: { ok: false, text: error.message } })); return; }
    await load();
    if (live.current) setSaid((s) => ({ ...s, [key]: { ok: true, text: "Removed. The name stays so you can set it again." } }));
  }

  async function register() {
    const k = newKey.trim().toUpperCase();
    if (!k) return;
    setBusy("__new");
    const { error } = await supabase.rpc("tg_secret_register", { p_key: k, p_label: null, p_help: null });
    setBusy(null);
    if (error) { setSaid((s) => ({ ...s, __new: { ok: false, text: error.message } })); return; }
    setNewKey(""); setAdding(false);
    await load();
  }

  if (rows === null) {
    return <div className="panel" style={{ maxWidth: "none", fontSize: BODY }}>Loading the key register…</div>;
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Keys &amp; Connections</h1>
          <div className="sub" style={{ fontSize: BODY }}>
            Paste a service key here and it is stored on the server. <b>It can never be read back
            into a browser</b> — not by this page, not by a report, not by an export. All you
            will ever see afterwards is whether it is set, its last four characters, and when
            and by whom it was last set.
          </div>
        </div>
      </div>

      {/* A read that failed must say so. Silence here would read as "no keys are set". */}
      {loadErr && (
        <div className="pill err" style={{ marginBottom: 12, fontSize: CHROME }}>
          The key register could not be read: {loadErr}
        </div>
      )}

      {rows.length === 0 && !loadErr && (
        <div className="panel" style={{ maxWidth: "none", fontSize: BODY }}>
          <div className="ptitle">No keys are registered yet</div>
          <div className="note" style={{ fontSize: BODY }}>
            This list is empty because nothing has been named, not because a key is missing.
            Add one below — the name is the label the platform looks it up by, such as the alert
            email key.
          </div>
        </div>
      )}

      {rows.map((r) => {
        const set = r.status === "SET";
        const msg = said[r.key];
        return (
          <div key={r.key} className="panel"
               style={{ maxWidth: "none", marginBottom: 10, padding: 16, borderRadius: 2 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <div className="ptitle" style={{ marginBottom: 0 }}>{r.label || r.key}</div>
              <span className={`schip ${set ? "good" : "neutral"}`} style={{ fontSize: CHROME }}>
                {set ? "Set" : "Not set"}
              </span>
              <code style={{ fontSize: CHROME, color: "var(--ink-2)" }}>{r.key}</code>
              {set && r.masked && (
                <span style={{ fontSize: CHROME, color: "var(--ink-2)" }}>ends {r.masked}</span>
              )}
            </div>

            {r.help && (
              <div className="note" style={{ marginTop: 6, fontSize: BODY }}>{r.help}</div>
            )}

            {/* WHEN AND BY WHOM. A key nobody can date is a key nobody can rotate with
                confidence — which is the whole reason this page must not date-filter. */}
            <div style={{ marginTop: 6, fontSize: CHROME, color: "var(--ink-2)" }}>
              {set
                ? <>Last set {when(r.last_set_at) ?? when(r.updated_at) ?? "at an unrecorded time"}
                    {r.last_set_by && r.last_set_by !== "unknown" ? <> by {r.last_set_by}</> : null}.</>
                : <>Never set on this platform.</>}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                aria-label={`Paste a new value for ${r.label || r.key}`}
                placeholder={set ? "Paste a new value to rotate this key…" : "Paste the key…"}
                value={draft[r.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") save(r.key); }}
                style={{ flex: "1 1 320px", minWidth: 220, fontSize: BODY, borderRadius: 2 }}
              />
              <button className="btn small" disabled={busy === r.key} onClick={() => save(r.key)}>
                {busy === r.key ? "Storing…" : set ? "Replace" : "Save"}
              </button>
              {set && (confirmRemove === r.key
                ? (
                  <>
                    <button className="btn small" onClick={() => forget(r.key)}>
                      Yes, remove it
                    </button>
                    <button className="btn small ghost" onClick={() => setConfirmRemove(null)}>Cancel</button>
                  </>
                )
                : <button className="btn small ghost" onClick={() => setConfirmRemove(r.key)}>Remove</button>
              )}
            </div>

            {confirmRemove === r.key && (
              <div className="note" style={{ marginTop: 6, fontSize: BODY }}>
                Removing clears the stored value. The name and this description stay, so the key
                shows as <b>Not set</b> and you can paste a new one. Anything that uses it stops
                working until you do.
              </div>
            )}

            {msg && (
              <div className={msg.ok ? "schip good" : "pill err"}
                   style={{ marginTop: 8, fontSize: CHROME }}>{msg.text}</div>
            )}
          </div>
        );
      })}

      <div className="panel" style={{ maxWidth: "none", padding: 16, borderRadius: 2 }}>
        {adding ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              aria-label="Name of the new key"
              placeholder="NAME_OF_THE_KEY"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              style={{ flex: "1 1 260px", fontSize: BODY, borderRadius: 2 }}
            />
            <button className="btn small" disabled={busy === "__new"} onClick={register}>Add it</button>
            <button className="btn small ghost" onClick={() => { setAdding(false); setNewKey(""); }}>Cancel</button>
            <div className="note" style={{ flexBasis: "100%", fontSize: BODY }}>
              This only reserves the name. Nothing is stored until you paste a value against it
              above.
            </div>
          </div>
        ) : (
          <button className="btn small ghost" onClick={() => setAdding(true)}>Add another key</button>
        )}
        {said.__new && (
          <div className="pill err" style={{ marginTop: 8, fontSize: CHROME }}>{said.__new.text}</div>
        )}
      </div>

      <div className="note" style={{ marginTop: 12, fontSize: BODY }}>
        Only an owner or an executive can set or remove a key, and the check is made inside the
        database, not in this page. Every set and every removal is recorded in the audit log —
        the fact that it happened, never the value.
      </div>
    </>
  );
}
