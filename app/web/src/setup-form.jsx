/* ---------------------------------------------------------------------------
   SETUP FORM — the archetype layout for every `data_browser` page (Bible §12b,
   BP-12b-3). Owner, 14 Sep 2026: one exemplar per archetype, rolled to every
   page of that archetype by data. 251 registry rows carry this archetype: 141
   tables of set-up data (alert recipients, valuation overrides, departments,
   KPI targets, reason codes …), 100 views and 7 materialized views.

   The page learns each table's shape from the catalog through f_setup_shape —
   columns, types, required, enum values, foreign keys, check rules, primary
   key, which views read it, which tables point at it — and:
     · lists rows with the shared toolbar (search · dates · dimensions · export)
     · edits a row IN PLACE with a written reason (≥ 10 characters, the same
       bar the Valuation Rates exemplar sets for a basis)
     · shows the IMPACT BEFORE THE SAVE — the views that will change and the
       rows in other tables that point at this row (f_setup_impact)
     · keeps HISTORY in audit_events (f_setup_history) — the ledger the
       audit_row trigger already writes for 40 tables, now with the reason
     · adds a row (f_setup_insert) when the table takes one
   A view is read-only and names the tables it reads, each a link. An
   append-only forensic table is read-only and says so. The write runs as the
   caller: row-level security decides, and a refusal is shown in words.

   Shared primitives only (useDataToolbar, pills, .btn, .msg, the Sync/Findings
   row and expand-in-place). Theme untouched. Every read binds its error.
--------------------------------------------------------------------------- */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { useDataToolbar, cellView } from "./App.jsx";

const NO_ROWS = Object.freeze([]);
const label = (c) => String(c || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString());
const when = (ts) => (ts ? new Date(ts).toLocaleString() : "—");
const isDateType = (t) => /^(date|timestamp)/.test(t);
const isTimeType = (t) => /^timestamp/.test(t);

/* An input for one column, chosen from the catalog's own description of it. */
function Field({ col, value, onChange, id }) {
  const t = col.type || "";
  const required = !col.nullable && col.default == null && !col.generated;
  const common = { id, className: "inp", "aria-required": required };
  let control;
  if (Array.isArray(col.enum_values) && col.enum_values.length) {
    control = (
      <select id={id} {...common} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
        <option value="">{required ? "— choose —" : "— none —"}</option>
        {col.enum_values.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  } else if (t === "boolean") {
    control = (
      <select id={id} {...common} value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "true")}>
        {col.nullable && <option value="">— not set —</option>}
        <option value="true">yes</option><option value="false">no</option>
      </select>
    );
  } else if (col.category === "N") {
    control = <input id={id} {...common} type="number" step="any" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
  } else if (isDateType(t)) {
    const v = value ? String(value).slice(0, isTimeType(t) ? 16 : 10) : "";
    control = <input id={id} {...common} type={isTimeType(t) ? "datetime-local" : "date"} value={v} onChange={(e) => onChange(e.target.value || null)} />;
  } else if (t === "jsonb" || t === "json") {
    control = <textarea id={id} {...common} rows={3} value={value == null ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 1)} onChange={(e) => onChange(e.target.value)} />;
  } else if (/\[\]$/.test(t)) {
    control = <input id={id} {...common} value={Array.isArray(value) ? value.join(", ") : (value ?? "")} onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="comma-separated" />;
  } else if (/text|character/.test(t) && String(value ?? "").length > 80) {
    control = <textarea id={id} {...common} rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  } else {
    control = <input id={id} {...common} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
  }
  return (
    <div className="sf-field">
      <label htmlFor={id}>{label(col.name)}{required ? <span className="hot" title="required"> *</span> : null}<span className="note"> · {t}{col.fk ? ` → ${col.fk.table}.${col.fk.column}` : ""}</span></label>
      {control}
      {Array.isArray(col.checks) && col.checks.length > 0 && <div className="note sf-check">{col.checks.map((c) => String(c).replace(/^CHECK\s*/i, "")).join(" · ")}</div>}
      {col.comment && <div className="note">{col.comment}</div>}
    </div>
  );
}

/* Coerce a form value for the RPC: jsonb text → object, numbers as strings are fine (the database casts). */
function outbound(col, v) {
  if (v == null) return null;
  if ((col.type === "jsonb" || col.type === "json") && typeof v === "string") { try { return JSON.parse(v); } catch { return v; } }
  return v;
}

function Diff({ oldV, newV }) {
  const keys = Array.from(new Set([...Object.keys(oldV || {}), ...Object.keys(newV || {})])).filter((k) => JSON.stringify(oldV?.[k]) !== JSON.stringify(newV?.[k]));
  if (!keys.length) return <span className="note">no field changed</span>;
  return <span>{keys.map((k) => <span key={k} className="sf-diff"><b>{label(k)}</b>: <s>{String(oldV?.[k] ?? "—")}</s> → {String(newV?.[k] ?? "—")}</span>)}</span>;
}

function RowEditor({ table, shape, row, onSaved }) {
  const editable = shape.columns.filter((c) => !c.is_pk && !c.generated);
  const [form, setForm] = useState(() => Object.fromEntries(editable.map((c) => [c.name, row[c.name]])));
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState(null);
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const pk = Object.fromEntries(shape.pk.map((k) => [k, row[k]]));
  const entityId = shape.pk.map((k) => String(row[k])).join("|");
  useEffect(() => {
    let live = true;
    supabase.rpc("f_setup_impact", { p_table: table, p_pk: pk }).then(({ data, error }) => { if (live) setImpact(error ? { error: error.message } : data); });
    supabase.rpc("f_setup_history", { p_table: table, p_entity_id: entityId, p_limit: 20 }).then(({ data, error }) => { if (live) setHistory(error ? { error: error.message } : (Array.isArray(data) ? data : [])); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, entityId]);
  const changed = editable.filter((c) => JSON.stringify(form[c.name] ?? null) !== JSON.stringify(row[c.name] ?? null));
  const save = async () => {
    setBusy(true); setMsg(null);
    const patch = Object.fromEntries(changed.map((c) => [c.name, outbound(c, form[c.name])]));
    const { data, error } = await supabase.rpc("f_setup_save", { p_table: table, p_pk: pk, p_patch: patch, p_reason: reason });
    setBusy(false);
    if (error || !data?.ok) { setMsg({ kind: "err", text: error?.message || "Not saved." }); return; }
    setMsg({ kind: "ok", text: `Saved with the reason — ${Object.keys(patch).length} field(s) changed, history written.` });
    onSaved(data.after);
  };
  const refs = Array.isArray(impact?.referencing_rows) ? impact.referencing_rows : [];
  return (
    <div className="sf-editor">
      <div className="cols2">
        <div>
          <div className="mtitle"><span className="sq" /><h2>Edit in place</h2><span className="rule" /></div>
          <div className="sf-grid">
            {editable.map((c) => <Field key={c.name} id={`sf-${entityId}-${c.name}`} col={c} value={form[c.name]} onChange={(v) => setForm((f) => ({ ...f, [c.name]: v }))} />)}
          </div>
          <div className="sf-field" style={{ marginTop: 10 }}>
            <label htmlFor={`sf-reason-${entityId}`}>Why — the reason kept with the change (ten characters at least)</label>
            <input id={`sf-reason-${entityId}`} className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. new rate from the September purchase order; old one expired" />
          </div>
          {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
          <div className="arow2" style={{ marginTop: 8 }}>
            <button type="button" className="btn primary" disabled={busy || changed.length === 0 || reason.trim().length < 10} onClick={save}>{busy ? "Saving…" : changed.length ? `Save ${changed.length} change(s)` : "Nothing changed yet"}</button>
            {changed.length > 0 && <button type="button" className="btn" onClick={() => setForm(Object.fromEntries(editable.map((c) => [c.name, row[c.name]])))}>Undo edits</button>}
          </div>
        </div>
        <div>
          <div className="mtitle"><span className="sq" /><h2>Impact before you save</h2><span className="rule" /></div>
          {impact === null && <div className="note">Reading what depends on this row…</div>}
          {impact?.error && <div className="msg err">Impact could not be read: {impact.error}</div>}
          {impact && !impact.error && (
            <table className="p360-facts"><tbody>
              <tr><td className="note">Views that read this table</td><td className="wrap">{shape.read_by.length ? shape.read_by.map((v) => v.view_key ? <a key={v.name} href={`#${v.view_key}`} className="sf-link">{v.label || v.name}</a> : <code key={v.name} className="sf-link">{v.name}</code>) : "none — nothing derives from this table"}</td></tr>
              <tr><td className="note">Rows pointing at this row</td><td className="wrap">{refs.length ? refs.map((r) => <span key={`${r.table}.${r.column}`} className="sf-link"><code>{r.table}.{r.column}</code> × {num(r.rows)}</span>) : shape.referenced_by.length ? "none of the referencing tables point at this row" : "no table references this one"}</td></tr>
              {changed.length > 0 && <tr><td className="note">You are changing</td><td className="wrap"><Diff oldV={row} newV={{ ...row, ...form }} /></td></tr>}
            </tbody></table>
          )}
          <div className="mtitle" style={{ marginTop: 12 }}><span className="sq" /><h2>History of this row</h2><span className="rule" /></div>
          {history === null && <div className="note">Reading the ledger…</div>}
          {history?.error && <div className="msg err">History could not be read: {history.error}</div>}
          {Array.isArray(history) && history.length === 0 && <div className="note">No change recorded for this row{shape.audited_by_trigger ? "" : " — this table gained its ledger with the setup form; earlier edits were not recorded"}.</div>}
          {Array.isArray(history) && history.length > 0 && (
            <table className="syncgrid iq"><tbody>
              {history.map((h) => (
                <tr key={h.id}><td title={when(h.at)}>{when(h.at)}</td><td>{h.actor || "—"}</td><td><span className="pill muted">{h.action}</span></td>
                  <td className="wrap">{h.reason ? <div>{h.reason}</div> : null}<Diff oldV={h.old_value} newV={h.new_value} /></td></tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}

function AddRow({ table, shape, onAdded, onClose }) {
  const cols = shape.columns.filter((c) => !c.generated && !(c.is_pk && c.default != null));
  const [form, setForm] = useState({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const missing = cols.filter((c) => !c.nullable && c.default == null && (form[c.name] == null || form[c.name] === ""));
  const add = async () => {
    setBusy(true); setMsg(null);
    const row = Object.fromEntries(cols.filter((c) => form[c.name] != null && form[c.name] !== "").map((c) => [c.name, outbound(c, form[c.name])]));
    const { data, error } = await supabase.rpc("f_setup_insert", { p_table: table, p_row: row, p_reason: reason });
    setBusy(false);
    if (error || !data?.ok) { setMsg({ kind: "err", text: error?.message || "Not added." }); return; }
    setMsg({ kind: "ok", text: "Added, with the reason in the ledger." });
    onAdded(data.row);
  };
  return (
    <div className="panel sf-editor" style={{ maxWidth: "none", marginTop: 12 }}>
      <div className="mtitle"><span className="sq" /><h2>Add a row to {label(table)}</h2><span className="rule" /><button type="button" className="btn ghost small" onClick={onClose}>Close</button></div>
      <div className="sf-grid">
        {cols.map((c) => <Field key={c.name} id={`sf-new-${c.name}`} col={c} value={form[c.name]} onChange={(v) => setForm((f) => ({ ...f, [c.name]: v }))} />)}
      </div>
      <div className="sf-field" style={{ marginTop: 10 }}>
        <label htmlFor="sf-new-reason">Why — the reason kept with the row (ten characters at least)</label>
        <input id="sf-new-reason" className="inp" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      <div className="arow2" style={{ marginTop: 8 }}>
        <button type="button" className="btn primary" disabled={busy || missing.length > 0 || reason.trim().length < 10} onClick={add}>{busy ? "Adding…" : missing.length ? `Fill in ${missing.map((c) => label(c.name)).join(", ")}` : "Add it"}</button>
      </div>
    </div>
  );
}

export default function SetupFormScreen({ entry, actions }) {
  const table = entry?.table_ref;
  const [shape, setShape] = useState(null);
  const [shapeErr, setShapeErr] = useState(null);
  const { rows: fetched, toolbar, total, loadError } = useDataToolbar(table, { limit: 300 });
  const [overlay, setOverlay] = useState({});
  const [added, setAdded] = useState([]);
  const [openKey, setOpenKey] = useState(null);
  const [adding, setAdding] = useState(false);
  const [allCols, setAllCols] = useState(false);
  useEffect(() => {
    setShape(null); setShapeErr(null); setOverlay({}); setAdded([]); setOpenKey(null); setAdding(false);
    if (!table) return undefined;
    let live = true;
    supabase.rpc("f_setup_shape", { p_table: table }).then(({ data, error }) => { if (!live) return; if (error) setShapeErr(error.message); else setShape(data); });
    return () => { live = false; };
  }, [table]);
  const pk = shape?.pk || [];
  const keyOf = (r, i) => (pk.length ? pk.map((k) => String(r[k])).join("|") : `${i}`);
  const base = Array.isArray(fetched) ? fetched : null;
  const rows = useMemo(() => {
    if (!base) return null;
    const merged = base.map((r, i) => overlay[keyOf(r, i)] || r);
    return [...added, ...merged];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, overlay, added, shape]);
  const cols = useMemo(() => (Array.isArray(shape?.columns) ? shape.columns : []), [shape]);
  const visible = useMemo(() => {
    const c = cols.filter((x) => !/^(jsonb|json)$/.test(x.type) && x.name !== "raw");
    return allCols ? c : c.slice(0, 9);
  }, [cols, allCols]);
  const required = cols.filter((c) => !c.nullable && c.default == null && !c.generated && !c.is_pk).length;
  const list = rows || NO_ROWS;

  return (
    <>
      <div className="pagehead synchead">
        <div>
          <h1>{entry?.label}</h1>
          <div className="sub">{entry?.description || `${label(table)} — set-up data the platform reads. Click a row to change it in place with a reason; the impact shows before you save; every change is in the ledger.`}</div>
        </div>
        <div className="synchead-acts">
          {shape?.editable && <button type="button" className="btn primary small" onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "＋ Add a row"}</button>}
          {actions}
        </div>
      </div>

      <div className="sbtotals syncstats">
        <div><b>{total ?? (rows ? rows.length : "…")}</b><span>{total != null && base && total > base.length ? `rows · ${base.length} loaded` : "rows"}</span></div>
        {shape && <div><b>{cols.length}</b><span>columns{required ? ` · ${required} required` : ""}</span></div>}
        {shape && <div><b>{shape.read_by.length}</b><span title={shape.read_by.map((v) => v.name).join(", ")}>views read it</span></div>}
        {shape && shape.referenced_by.length > 0 && <div><b>{shape.referenced_by.length}</b><span title={shape.referenced_by.map((v) => `${v.table}.${v.column}`).join(", ")}>tables point at it</span></div>}
        {shape && <div><b>{shape.editable ? "edit" : "read"}</b><span>{shape.editable ? "in place, with a reason" : shape.kind}</span></div>}
        {shape && <div><b>{shape.audited_by_trigger ? "yes" : "form"}</b><span title={shape.audited_by_trigger ? "every change lands in audit_events by trigger" : "changes made here land in audit_events with the reason"}>ledger</span></div>}
      </div>

      {shapeErr && <div className="msg err" style={{ marginTop: 8 }}>The shape of <code>{table}</code> could not be read: {shapeErr}</div>}
      {shape && !shape.editable && (
        <div className="note" style={{ marginTop: 8 }}>{shape.why_not}{Array.isArray(shape.reads) && shape.reads.length > 0 && <> It reads: {shape.reads.map((s) => s.view_key ? <a key={s.name} className="sf-link" href={`#${s.view_key}`}>{s.label || s.name}</a> : <code key={s.name} className="sf-link">{s.name}</code>)}</>}</div>
      )}
      {adding && shape?.editable && <AddRow table={table} shape={shape} onAdded={(r) => { setAdded((a) => [r, ...a]); setAdding(false); }} onClose={() => setAdding(false)} />}

      {toolbar}

      <div className="panel tablewrap" style={{ maxWidth: "none", padding: 0 }}>
        <table className="syncgrid iq sf-table">
          <thead><tr>
            {visible.map((c) => <th key={c.name} title={c.type}>{label(c.name)}{c.is_pk ? " ⚷" : ""}</th>)}
            {cols.length > visible.length && <th><button type="button" className="btn ghost small" onClick={() => setAllCols(true)}>+{cols.length - visible.length} more</button></th>}
            {allCols && cols.length > 9 && <th><button type="button" className="btn ghost small" onClick={() => setAllCols(false)}>fewer</button></th>}
            <th style={{ textAlign: "right" }}>{shape?.editable ? "Edit" : ""}</th>
          </tr></thead>
          <tbody>
            {rows === null && !loadError && <tr><td colSpan={visible.length + 2} className="note">Loading…</td></tr>}
            {rows === null && loadError && <tr><td colSpan={visible.length + 2} className="syncdanger">Nothing could be read from <code>{table}</code>: {loadError}</td></tr>}
            {rows !== null && list.length === 0 && <tr><td colSpan={visible.length + 2} className="note">No rows{shape?.editable ? " — add the first one above" : ""}.</td></tr>}
            {list.map((r, i) => {
              const k = keyOf(r, i);
              const open = openKey === k;
              const toggle = () => setOpenKey(open ? null : k);
              return (
                <React.Fragment key={k}>
                  <tr className={`syncrow${open ? " on" : ""}`} onClick={toggle} role="button" tabIndex={0} aria-expanded={open}
                      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); } }}>
                    {visible.map((c) => <td key={c.name} className={/text|character/.test(c.type) ? "wrap" : ""}>{cellView(c.name, typeof r[c.name] === "object" && r[c.name] !== null ? JSON.stringify(r[c.name]) : r[c.name])}</td>)}
                    {cols.length > visible.length && <td />}
                    {allCols && cols.length > 9 && <td />}
                    <td className="syncacts"><button type="button" className="btn ghost small" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-label={open ? "Close" : "Open"}>{open ? "▴" : shape?.editable ? "✎" : "▾"}</button></td>
                  </tr>
                  {open && (
                    <tr className="syncexpand"><td colSpan={visible.length + 2}>
                      <div className="syncdetail">
                        {shape?.editable
                          ? <RowEditor table={table} shape={shape} row={r} onSaved={(after) => setOverlay((o) => ({ ...o, [k]: after }))} />
                          : (
                            <table className="p360-facts iq-all"><tbody>
                              {cols.map((c) => <tr key={c.name}><td className="note">{label(c.name)}</td><td className="wrap">{cellView(c.name, typeof r[c.name] === "object" && r[c.name] !== null ? JSON.stringify(r[c.name]) : r[c.name])}</td></tr>)}
                            </tbody></table>
                          )}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="note" style={{ marginTop: 8 }}>Source: <code>{table}</code>{shape ? ` (${shape.kind})` : ""} · shape from the catalog (f_setup_shape) · edits through f_setup_save as your own role — row-level security decides · impact from f_setup_impact · history from audit_events.</div>
    </>
  );
}
