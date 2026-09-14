/* ---------------------------------------------------------------------------
   ISSUE QUEUE — the archetype layout for every "queue of things needing a
   decision" page (Bible §12b, BP-12b-2). Owner, 14 Sep 2026: "major design and
   user functionality majorly improved … one exemplar per archetype, rolled to
   every page of that archetype by data."

   Sixty registry rows carry archetype = issue_queue (Inventory Alerts, Open
   Issues, Watchdog sweeps, Harvest Alerts, Aging Stock, COA Gap, Loss
   Register, Time Off Requests …). They read sixty different views, so this
   screen learns each view's shape from its own columns — severity, status,
   when, owner, money, weight, headline, detail, action, evidence — and says
   plainly when a column is not there. Nothing is invented to fill a gap.

   Shared primitives only: useDataToolbar (search · date range · dimensions ·
   export, server-side), cellView (a tag is a link to its 360), AssignTask (a
   task carries the number as it stood — dashboard rule 2), the pill / chip /
   strip / expand-in-place row from the Sync page. Theme untouched.

   Functional floor (Bible §12b): filters and counts that are buttons · a row
   opens in place to everything behind it · actions on the row (assign, resolve
   with words, report an issue) · detection anatomy where the view carries it
   (detected by · why · evidence · recommended action · owner · audit state) ·
   honest empty states · keyboard and phone.
--------------------------------------------------------------------------- */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { useRole, useDataToolbar, cellView, AssignTask } from "./App.jsx";

const NO_ROWS = Object.freeze([]);
/* WHICH COLUMN PLAYS WHICH ROLE IS DATA (rule G1; report-contract §7): public.column_roles,
   read once per session. A view is matched on its own columns against those rows; the
   owner adds a name there and every page of the archetype learns it on next load. */
let ROLE_CACHE = null;
function useColumnRoles() {
  const [roles, setRoles] = useState(ROLE_CACHE);
  useEffect(() => {
    if (ROLE_CACHE) return undefined;
    let live = true;
    supabase.from("column_roles").select("role, column_name, priority").order("priority").then(({ data, error }) => {
      if (!live) return;
      if (error || !Array.isArray(data)) { setRoles({ error: error?.message || "column_roles returned nothing" }); return; }
      const m = {};
      for (const r of data) (m[r.role] ||= []).push(r.column_name);
      ROLE_CACHE = m; setRoles(m);
    });
    return () => { live = false; };
  }, []);
  return roles;
}
const pick = (sample, names) => (names || []).find((n) => sample && n in sample) || null;
const SEV_RANK = { critical: 0, "no-go": 0, high: 1, urgent: 1, elevated: 2, medium: 2, watch: 3, low: 4, info: 5, ok: 6, go: 6 };
const sevRank = (v) => { const k = String(v ?? "").toLowerCase(); for (const [n, r] of Object.entries(SEV_RANK)) if (k.includes(n)) return r; return 3; };
const sevTone = (v) => { const r = sevRank(v); return r <= 1 ? "err" : r <= 3 ? "run" : "ok"; };
const rpLabel = (c) => String(c).replace(/^v_/, "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const ago = (ts) => {
  if (!ts) return "—";
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  return `${Math.round(s / 86400)} d`;
};
const num = (v, d = 2) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }));
const usd = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v).toLocaleString(undefined, { style: "currency", currency: "USD" }));

/* Resolve a finding with words — only where the row is an agent finding (has an id and an agent). */
function ResolveBox({ id, onDone }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const go = async () => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("f_finding_resolve", { p_id: id, p_resolution: text });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: error.message }); return; }
    setMsg({ kind: "ok", text: "Resolved — attributed to you with the time." }); onDone();
  };
  return (
    <div className="iq-resolve">
      <label htmlFor={`iq-res-${id}`}>Decide — what was decided and why</label>
      <div className="syncform-row">
        <input id={`iq-res-${id}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Metrc is right; sheet annotated; no action" />
        <button type="button" className="btn small" disabled={busy || !text.trim()} onClick={go}>{busy ? "Saving…" : "Resolve"}</button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}

export default function IssueQueueScreen({ entry, actions, session }) {
  const { role } = useRole(session);
  const table = entry?.table_ref;
  /* Two-step load, on purpose: the first fetch teaches the shape; once the "when" column
     is known the same hook re-fetches newest-first, so a 500-row window of a 1,389-row
     queue is the most recent 500 — and the strip says "500 loaded of 1,389". */
  const [orderCol, setOrderCol] = useState(null);
  const { rows: fetched, toolbar, total, loadError } = useDataToolbar(table, { limit: 500, orderBy: orderCol, ascending: false });
  const rows = Array.isArray(fetched) ? fetched : null;
  const sample = rows && rows.length ? rows[0] : null;
  const roles = useColumnRoles();
  const col = useMemo(() => {
    const R = roles && !roles.error ? roles : {};
    const out = {};
    for (const role of ["sev", "status", "when", "resolved", "owner", "money", "lb", "head", "detail", "action", "evidence", "agent", "id"]) out[role] = pick(sample, R[role]);
    return out;
  }, [sample, roles]);
  useEffect(() => { if (col.when && col.when !== orderCol) setOrderCol(col.when); }, [col.when, orderCol]);
  useEffect(() => { setOrderCol(null); }, [table]);
  const isFinding = !!(col.id && col.agent && table && (table === "agent_findings" || /finding|issue|briefing|watchdog|recommend/.test(table)));
  const [sevSel, setSevSel] = useState(null);
  const [openOnly, setOpenOnly] = useState(true);
  const [openKey, setOpenKey] = useState(null);
  const [resolvedLocal, setResolvedLocal] = useState({});
  const canAct = ["owner", "executive", "admin", "manager", "dept_head", "cfo", "hr"].includes(role);

  const list = rows || NO_ROWS;
  const isOpen = (r) => !(col.resolved && r[col.resolved]) && !resolvedLocal[r[col.id]];
  const sevValues = useMemo(() => Array.from(new Set(list.map((r) => col.sev && r[col.sev]).filter(Boolean))).sort((a, b) => sevRank(a) - sevRank(b)), [list, col.sev]);
  const shown = useMemo(() => {
    let x = list;
    if (col.resolved && openOnly) x = x.filter(isOpen);
    if (sevSel && col.sev) x = x.filter((r) => r[col.sev] === sevSel);
    x = [...x].sort((a, b) => {
      const s = col.sev ? sevRank(a[col.sev]) - sevRank(b[col.sev]) : 0;
      if (s !== 0) return s;
      if (col.when) return String(b[col.when] ?? "").localeCompare(String(a[col.when] ?? ""));
      return 0;
    });
    return x;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, sevSel, openOnly, col, resolvedLocal]);
  const openCount = col.resolved ? list.filter(isOpen).length : null;
  const money = col.money ? shown.reduce((a, r) => a + (Number(r[col.money]) || 0), 0) : null;
  const lb = col.lb ? shown.reduce((a, r) => a + (Number(r[col.lb]) || 0), 0) : null;
  const oldest = col.when ? shown.reduce((a, r) => (r[col.when] && (!a || r[col.when] < a) ? r[col.when] : a), null) : null;
  const keyOf = (r, i) => (col.id && r[col.id]) || `${i}`;
  const hidden = new Set([col.head, col.detail].filter(Boolean));

  return (
    <>
      <div className="pagehead synchead">
        <div>
          <h1>{entry.label}</h1>
          <div className="sub">{entry.description || `${rpLabel(table || "")} — every item needing a decision, oldest and most severe first. Click a number to filter, a row to open it, Assign to hand it to someone with the figure as it stands.`}</div>
        </div>
        {actions ? <div className="synchead-acts">{actions}</div> : null}
      </div>

      <div className="sbtotals syncstats">
        <div><b>{total ?? (rows ? rows.length : "…")}</b><span>{total != null && rows && total > rows.length ? `in the queue · ${rows.length} loaded` : "in the queue"}</span></div>
        {col.resolved && <button type="button" className={`syncstat${openOnly ? " on" : ""}`} onClick={() => setOpenOnly((v) => !v)} title={openOnly ? "Show resolved too" : "Open only"}><b>{openCount}</b><span>open{openOnly ? " · showing" : ""}</span></button>}
        {sevValues.map((v) => (
          <button key={v} type="button" className={`syncstat${sevSel === v ? " on" : ""}${sevRank(v) <= 1 ? " hot" : ""}`} onClick={() => setSevSel(sevSel === v ? null : v)} title={`Show only ${v}`}>
            <b>{list.filter((r) => r[col.sev] === v && (!col.resolved || !openOnly || isOpen(r))).length}</b><span>{String(v)}</span>
          </button>
        ))}
        {money != null && <div className={money > 0 ? "hot" : ""}><b>{usd(money)}</b><span>{rpLabel(col.money)} · shown</span></div>}
        {lb != null && <div><b>{num(lb, 1)}</b><span>lb · shown</span></div>}
        {oldest && <div><b>{ago(oldest)}</b><span>oldest open</span></div>}
        {!col.sev && rows && <div><b>—</b><span title="This view has no severity column">no severity on this view</span></div>}
        {roles && roles.error && <div className="hot"><b>!</b><span title={roles.error}>column roles could not be read</span></div>}
      </div>

      {toolbar}

      <div className="panel tablewrap" style={{ maxWidth: "none", padding: 0 }}>
        <table className="syncgrid iq">
          <thead><tr>
            {col.when && <th>Age</th>}
            {col.sev && <th>Severity</th>}
            <th>Item</th>
            {col.owner && <th>Owner</th>}
            {col.money && <th>{rpLabel(col.money)}</th>}
            {col.lb && <th>lb</th>}
            {col.status && <th>Status</th>}
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr></thead>
          <tbody>
            {rows === null && !loadError && <tr><td colSpan={8} className="note">Loading…</td></tr>}
            {rows === null && loadError && <tr><td colSpan={8} className="syncdanger">Nothing could be read from <code>{table}</code>: {/timeout/i.test(loadError) ? "the view took longer than the database allows for a signed-in user. This is a defect on the view, not on your account — it is filed for materialising (Bible §16.5)." : loadError}</td></tr>}
            {rows !== null && shown.length === 0 && <tr><td colSpan={8} className="note">{list.length === 0 ? "Nothing in this queue — nothing open, nothing hidden." : "Nothing matches the filter."}</td></tr>}
            {shown.map((r, i) => {
              const k = keyOf(r, i);
              const open = openKey === k;
              const toggle = () => setOpenKey(open ? null : k);
              const head = col.head ? r[col.head] : Object.values(r).find((v) => typeof v === "string") || "(no headline column)";
              const closed = col.resolved && !isOpen(r);
              return (
                <React.Fragment key={k}>
                  <tr className={`syncrow${open ? " on" : ""}${closed ? " off" : ""}`} onClick={toggle} role="button" tabIndex={0} aria-expanded={open}
                      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); } }}>
                    {col.when && <td title={String(r[col.when])}>{ago(r[col.when])}</td>}
                    {col.sev && <td><span className={`pill ${sevTone(r[col.sev])}`}>{String(r[col.sev])}</span></td>}
                    <td className="wrap"><b>{cellView(col.head || "item", head)}</b>{col.detail && r[col.detail] && <div className="note iq-detail">{String(r[col.detail]).slice(0, 220)}</div>}</td>
                    {col.owner && <td>{r[col.owner] ?? <span className="note">unassigned</span>}</td>}
                    {col.money && <td>{usd(r[col.money]) ?? "—"}</td>}
                    {col.lb && <td>{num(r[col.lb], 2) ?? "—"}</td>}
                    {col.status && <td>{cellView(col.status, closed ? "resolved" : r[col.status])}</td>}
                    <td className="syncacts">
                      {canAct && <AssignTask dept={entry.category || "Command"} kpi={String(head).slice(0, 80)} value={Number(col.money ? r[col.money] : col.lb ? r[col.lb] : 0) || 0} unit={col.money ? "USD" : col.lb ? "lb" : ""} drill={entry.view_key} />}
                      <button type="button" className="btn ghost small" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-label={open ? "Close" : "Open"}>{open ? "▴" : "▾"}</button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="syncexpand"><td colSpan={8}>
                      <div className="syncdetail">
                        <div className="syncdetail-head">
                          <div><div className="ptitle" style={{ margin: 0 }}>{String(head)}</div>
                            <div className="note">{col.agent && r[col.agent] ? `detected by ${r[col.agent]}` : ""}{col.when && r[col.when] ? ` · ${new Date(r[col.when]).toLocaleString()}` : ""}{col.owner && r[col.owner] ? ` · owner ${r[col.owner]}` : ""}</div></div>
                          {col.sev && <span className={`pill ${sevTone(r[col.sev])}`}>{String(r[col.sev])}</span>}
                          <div className="syncdetail-acts"><button type="button" className="btn ghost small" onClick={toggle}>Close</button></div>
                        </div>
                        {(col.detail || col.action || col.evidence) && (
                          <div className="cols2 syncfacts" style={{ marginTop: 10 }}>
                            <table><tbody>
                              {col.detail && <tr><td className="note">Why it matters</td><td className="wrap">{String(r[col.detail] ?? "—")}</td></tr>}
                              {col.action && <tr><td className="note">Recommended</td><td className="wrap">{String(r[col.action] ?? "—")}</td></tr>}
                              {col.evidence && <tr><td className="note">Evidence</td><td className="wrap">{String(r[col.evidence] ?? "—")}</td></tr>}
                            </tbody></table>
                            <table><tbody>
                              {col.resolved && <tr><td className="note">Audit state</td><td>{isOpen(r) ? <span className="pill run">open</span> : <span className="pill ok">resolved {r[col.resolved] ? ago(r[col.resolved]) + " ago" : ""}</span>}</td></tr>}
                              {"resolution" in r && r.resolution && <tr><td className="note">Resolution</td><td className="wrap">{String(r.resolution)}</td></tr>}
                              {"fingerprint" in r && <tr><td className="note">Fingerprint</td><td><code>{String(r.fingerprint ?? "—")}</code></td></tr>}
                              {"drill_to" in r && r.drill_to && <tr><td className="note">Drill</td><td><a href={`#${r.drill_to}`}>{String(r.drill_to)}</a></td></tr>}
                            </tbody></table>
                          </div>
                        )}
                        <div className="mtitle" style={{ marginTop: 12 }}><span className="sq" /><h2>Every column</h2><span className="rule" /></div>
                        <table className="p360-facts iq-all"><tbody>
                          {Object.keys(r).filter((c) => !hidden.has(c) && c !== "raw" && typeof r[c] !== "object").map((c) => (
                            <tr key={c}><td className="note">{rpLabel(c)}</td><td className="wrap">{cellView(c, r[c])}</td></tr>
                          ))}
                        </tbody></table>
                        {isFinding && canAct && isOpen(r) && <ResolveBox id={r[col.id]} onDone={() => setResolvedLocal((m) => ({ ...m, [r[col.id]]: true }))} />}
                        {isFinding && !canAct && <div className="note" style={{ marginTop: 8 }}>Resolving is limited to owner, executive, admin, manager, department head, CFO and HR. Your role is {role || "…"}.</div>}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="note" style={{ marginTop: 8 }}>Source: <code>{table}</code> · {rows ? `${rows.length} loaded` : "loading"}{total != null ? ` of ${total}` : ""} · shape read from the view&rsquo;s own columns and the column_roles rows{col.sev ? ` · severity = ${col.sev}` : ""}{col.when ? ` · age = ${col.when}` : ""}{col.owner ? ` · owner = ${col.owner}` : ""}.</div>
    </>
  );
}
