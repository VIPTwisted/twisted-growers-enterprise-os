import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";

const WRITE_ROLES = new Set(["owner", "executive"]);

/* One editor for every owner-set number. Supabase RLS is the authority: only
   owner/executive may write conversion_factors. A save is successful only when
   PostgREST returns the updated row; an empty RLS result is not called saved. */
export default function BusinessRuleEditor({
  session,
  keys = null,
  source = "v_business_rules",
  title = "Business Rules",
  intro = "The numbers this platform judges the business by. Change one here and every consumer reads the new value.",
  compact = false,
  onSaved = null,
}) {
  const [state, setState] = useState({ rows: null, role: null, error: null });
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState("");
  const [why, setWhy] = useState("");
  const [message, setMessage] = useState(null);
  const who = session?.user?.email ?? "unknown";
  const wanted = useMemo(() => Array.isArray(keys) ? [...keys] : null, [keys]);

  const load = useCallback(async () => {
    if (!session?.user?.id) {
      setState({ rows: [], role: null, error: "Your signed-in user could not be identified." });
      return;
    }
    let rules = supabase.from(source).select("*").order("label");
    if (wanted?.length) rules = rules.in("key", wanted);
    const [r, u] = await Promise.all([
      rules,
      supabase.from("app_users").select("role").eq("user_id", session.user.id).maybeSingle(),
    ]);
    const errors = [r.error?.message, u.error?.message].filter(Boolean);
    setState({ rows: r.data ?? [], role: u.data?.role ?? null, error: errors.join(" | ") || null });
  }, [session?.user?.id, source, wanted]);

  useEffect(() => { load(); }, [load]);

  const mayEdit = WRITE_ROLES.has(state.role);
  const save = async (key) => {
    const value = Number(draft);
    if (!Number.isFinite(value)) {
      setMessage({ tone: "bad", text: "Not saved: enter a valid number." });
      return;
    }
    if (why.trim().length < 8) {
      setMessage({ tone: "bad", text: "Not saved: state where this number comes from." });
      return;
    }
    setMessage({ tone: "neutral", text: "Saving to the rule ledger…" });
    const { data, error } = await supabase.from("conversion_factors")
      .update({
        value,
        where_it_came_from: why.trim(),
        set_by: who,
        updated_at: new Date().toISOString(),
      })
      .eq("key", key)
      .select("key,value,unit,set_by,updated_at")
      .maybeSingle();
    if (error || !data) {
      setMessage({
        tone: "bad",
        text: `Not saved: ${error?.message || "the database returned no updated rule row"}.`,
      });
      return;
    }
    setMessage({ tone: "ok", text: `Saved ${data.value} ${data.unit}. The change is now in the audited rule history.` });
    setEdit(null);
    setWhy("");
    await load();
    if (onSaved) onSaved(data);
  };

  if (state.rows === null) return <div className="loading">Reading the business rules…</div>;
  const unset = state.rows.filter((r) => String(r.set_by || "").startsWith("default")).length;

  return (
    <div className={compact ? "calc vrcompact" : "calc"}>
      <div className="pagehead">
        <h1>{title}</h1>
        <p className="dashsub">
          {intro}
          {unset > 0 && <> <b className="vrwarn">{unset} of {state.rows.length} are still defaults.</b></>}
        </p>
      </div>
      {state.error && <div className="vrmsg bad" role="alert">Rules could not be read completely: {state.error}</div>}
      {message && <div className={`vrmsg ${message.tone}`} role="status" aria-live="polite">{message.text}</div>}
      {!mayEdit && (
        <div className="vrmsg">
          Rules are read-only for {state.role || "an unresolved role"}. Supabase permits owner and executive users to change them.
        </div>
      )}

      <div className="vrgrid">
        {state.rows.map((r) => {
          const isDefault = String(r.set_by || "").startsWith("default");
          return (
            <div key={r.key} className={`vrcard ${isDefault ? "warn" : "ok"}`}>
              <div className="vrhead">
                <span className="vrname">{r.label}</span>
                <span className={`vrpill ${isDefault ? "warn" : "ok"}`}>{isDefault ? "default" : "set"}</span>
              </div>
              <div className="vrbig">{Number(r.value).toLocaleString()}<em> {r.unit}</em></div>
              <p className="vrnote">{r.what_it_means}</p>
              <div className="vrline"><em>Used in</em><b>{r.places_using_it} place{r.places_using_it === 1 ? "" : "s"}</b></div>
              <div className="vrline"><em>Set by</em><b>{r.set_by || "not recorded"}</b></div>
              <div className="vrline"><em>Set on</em><b>{r.set_on || "not recorded"}</b></div>
              <p className="vrnote">{r.where_it_came_from || "No evidence note is recorded."}</p>
              {r.places_using_it === 0 && <p className="cinpn">No registered consumer currently uses this rule.</p>}
              {mayEdit && edit !== r.key && (
                <button type="button" className="vrbtn"
                  onClick={() => { setEdit(r.key); setDraft(String(r.value)); setWhy(""); setMessage(null); }}>
                  {isDefault ? "Set the real number" : "Change it"}
                </button>
              )}
              {mayEdit && edit === r.key && (
                <div className="vrform">
                  <label>{r.label} ({r.unit})
                    <input aria-label={`${r.label} value`} autoFocus type="number" step="any" value={draft}
                      onChange={(e) => setDraft(e.target.value)} />
                  </label>
                  <label>Evidence for this change
                    <input aria-label={`Evidence for ${r.label}`} value={why}
                      placeholder="Metrc period, operating trial, or owner decision"
                      onChange={(e) => setWhy(e.target.value)} />
                  </label>
                  <div className="vractions">
                    <button type="button" className="vrbtn primary" onClick={() => save(r.key)}>Save</button>
                    <button type="button" className="vrbtn" onClick={() => { setEdit(null); setMessage(null); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
