/* ---------------------------------------------------------------------------
   TODAY — the decision stream (Bible §8, BP-8; the door is BP-7: one child of
   Command Center). Owner, 14 Sep 2026.

   A decision is the class, not the row. 3,662 open findings are 121 decisions
   (one family of headline per severity); 327 watchdog issues are ~60 (one class
   of fingerprint per severity); plus the open questions, page enhancements,
   correction proposals and the "would be better" reports people and bots file
   from any page (BP-17-1 / BP-17-5). f_today_feed ranks them severity × money
   × age for the person signed in and caps the list at 25 — the acceptance line
   is an owner's routine day ≤ 25 decisions. What is behind the 25 is counted,
   never hidden.

   One tap takes the decision THROUGH THE MECHANISM THAT ALREADY EXISTS
   (findings resolve under f_finding_resolve's rule, issues land in
   issue_decisions, a question is answered in open_questions, proposals go
   through tg_decide_issue, a task through tg_task_from_dashboard) and f_decide
   records a decisions row: the figure as it stood, the option, the effect with
   its ids, who and when. Reversible with a reason (f_reverse_decision).

   Shared primitives only: the Findings-queue strip / row / expand-in-place,
   AssignTask (dashboard rule 2 — the task carries the number as it stood),
   pills, .btn, .msg. Theme untouched. Every read binds its error.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { useRole, AssignTask } from "./App.jsx";

const SOURCE_LABEL = {
  finding_group: "finding family", report: "reported defect", issue_group: "watchdog issue", question: "open question",
  enhancement: "page enhancement", correction: "correction proposal", qa_enhancement: "reported enhancement",
  onboarding: "onboarding step", schedule_draft: "schedule draft",
};
const OPTION_LABEL = {
  resolve: "Resolve", assign: "Assign", defer: "Defer", fix: "Fix", leave: "Leave as is", ignore: "Ignore",
  answer: "Answer", approved: "Approve", rejected: "Reject", deferred: "Defer", build_now: "Build now", build_later: "Build later", no: "No",
  post: "Post the schedule", discard: "Discard",
};
/* Options that the database refuses without written words (≥ 15 characters), so the form asks first. */
const NEEDS_WORDS = new Set(["resolve", "leave", "ignore", "answer", "rejected", "deferred", "no", "discard"]);
const NEEDS_DATE = new Set(["defer"]);
const sevTone = (s) => (s === "critical" ? "err" : s === "elevated" ? "run" : "ok");
const usd = (v) => (v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const num = (v) => (v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString());
const when = (ts) => (ts ? new Date(ts).toLocaleString() : "—");
const days = (n) => (n == null ? "—" : n === 0 ? "today" : `${n} d`);

function DecideForm({ item, option, onDone, onCancel }) {
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const words = NEEDS_WORDS.has(option);
  const date = NEEDS_DATE.has(option);
  const go = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("f_decide", { p: { key: item.key, option, note, due_on: due || null } });
    setBusy(false);
    if (error || !data?.ok) { setMsg({ kind: "err", text: error?.message || "Not recorded." }); return; }
    onDone(data);
  };
  return (
    <div className="iq-resolve">
      <label htmlFor={`td-note-${item.rank}`}>{OPTION_LABEL[option]} — {words ? "what was decided and why (the database refuses fewer than fifteen characters)" : date ? "come back on" : "a note, if any"}</label>
      <div className="syncform-row">
        {date && <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Come back on" />}
        <input id={`td-note-${item.rank}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={words ? "e.g. Metrc is right; the sheet is annotated; nothing else to do" : "optional"} />
        <button type="button" className="btn small primary" disabled={busy || (words && note.trim().length < 15) || (date && !due)} onClick={go}>{busy ? "Recording…" : `${OPTION_LABEL[option]} it`}</button>
        <button type="button" className="btn small" onClick={onCancel}>Cancel</button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}

function ReverseBox({ decision, onDone }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const go = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("f_reverse_decision", { p_id: decision.id, p_reason: reason });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: error.message }); return; }
    setMsg({ kind: "ok", text: `Reversed — ${data?.rows_restored ?? 0} record(s) restored.` }); onDone();
  };
  return (
    <div className="syncform-row" style={{ marginTop: 6 }}>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it is reversed (fifteen characters or more)" aria-label="Reversal reason" />
      <button type="button" className="btn small" disabled={busy || reason.trim().length < 15} onClick={go}>{busy ? "Reversing…" : "Reverse"}</button>
      {msg && <span className={`msg ${msg.kind}`}>{msg.text}</span>}
    </div>
  );
}

export default function TodayScreen({ entry, actions, session }) {
  const { role } = useRole(session);
  const [feed, setFeed] = useState(null);
  const [err, setErr] = useState(null);
  const [srcSel, setSrcSel] = useState(null);
  const [openKey, setOpenKey] = useState(null);
  const [form, setForm] = useState(null); // { key, option }
  const [said, setSaid] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("f_today_feed", { p_limit: 25 });
    if (error) { setErr(error.message); return; }
    setErr(null); setFeed(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => (Array.isArray(feed?.items) ? feed.items : []), [feed]);
  const shown = useMemo(() => (srcSel ? items.filter((i) => i.source === srcSel) : items), [items, srcSel]);
  const bySource = feed?.behind?.by_source || {};
  const decided = Array.isArray(feed?.decided_today) ? feed.decided_today : [];
  const canReverse = ["owner", "executive", "admin", "cfo"].includes(role);

  const afterDecide = (item, data) => {
    setForm(null); setOpenKey(null);
    const eff = data?.effect || {};
    const what = eff.resolved_findings != null ? `${eff.resolved_findings} finding(s) resolved`
      : eff.issue_decisions != null ? `${eff.issue_decisions} issue decision(s) recorded`
      : eff.task_id ? "task raised and linked"
      : eff.hidden_until ? `deferred to ${eff.hidden_until}`
      : eff.mark ? `marked "${eff.mark}" on ${eff.view_key}`
      : eff.answered ? "question answered"
      : eff.status ? `proposal ${eff.status}` : "recorded";
    setSaid({ kind: "ok", text: `${OPTION_LABEL[data?.outcome] || data?.outcome}: ${what} — decision ${String(data?.id || "").slice(0, 8)} with the figure as it stood.` });
    load();
  };

  return (
    <>
      <div className="pagehead synchead">
        <div>
          <h1>{entry?.label || "Today"}</h1>
          <div className="sub">Your decisions, ranked severity × money × age, with the number as it stands. One tap takes the decision through the platform&rsquo;s own mechanism and records who, when and what changed — reversible with a reason. {feed?.as_of ? `As of ${when(feed.as_of)} · you are ${feed.role}${feed.sees_all ? " (sees every decision)" : " (your role's decisions only)"}.` : ""}</div>
        </div>
        {actions ? <div className="synchead-acts">{actions}</div> : null}
      </div>

      <div className="sbtotals syncstats">
        <div><b>{feed ? num(feed.behind?.shown) : "…"}</b><span>{feed ? `top of ${num(feed.behind?.total)} decisions${items.length > Number(feed.behind?.shown) ? ` + ${items.length - Number(feed.behind?.shown)} top of their kind` : ""}` : "loading"}</span></div>
        {feed && <div><b>{num(feed.behind?.rows_total)}</b><span>rows behind them</span></div>}
        {feed && <div className={Number(feed.behind?.dollars_total) > 0 ? "hot" : ""}><b>{usd(feed.behind?.dollars_total)}</b><span>at stake</span></div>}
        {Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
          <button key={s} type="button" className={`syncstat${srcSel === s ? " on" : ""}`} onClick={() => setSrcSel(srcSel === s ? null : s)} title={`Show only ${SOURCE_LABEL[s] || s}`}><b>{num(n)}</b><span>{SOURCE_LABEL[s] || s}</span></button>
        ))}
        {feed && Number(feed.deferred) > 0 && <div><b>{num(feed.deferred)}</b><span>deferred</span></div>}
        {feed && Number(feed.not_mine) > 0 && <div><b>{num(feed.not_mine)}</b><span title="Decisions another role takes">not yours</span></div>}
        {feed && <div><b>{num(decided.length)}</b><span>decided today</span></div>}
        {feed && <div><b>{num(feed.push?.recipients)}</b><span title={feed.push?.last_sent ? `last digest ${when(feed.push.last_sent)}` : "no digest sent yet"}>digest recipients</span></div>}
      </div>

      {said && <div className={`msg ${said.kind}`} style={{ marginTop: 8 }}>{said.text}</div>}

      <div className="panel tablewrap" style={{ maxWidth: "none", padding: 0, marginTop: 12 }}>
        <table className="syncgrid iq">
          <thead><tr>
            <th>#</th><th>Severity</th><th>Decision</th><th>Rows</th><th>$ at stake</th><th>Oldest</th><th>Recommended</th><th style={{ textAlign: "right" }}>One tap</th>
          </tr></thead>
          <tbody>
            {!feed && !err && <tr><td colSpan={8} className="note">Loading…</td></tr>}
            {err && <tr><td colSpan={8} className="syncdanger">Today could not be read: {err}</td></tr>}
            {feed && shown.length === 0 && <tr><td colSpan={8} className="note">{items.length === 0 ? "Nothing waiting for you — nothing open, nothing hidden." : "Nothing of that kind in the top 25."}</td></tr>}
            {shown.map((it) => {
              const open = openKey === it.key;
              const toggle = () => { setOpenKey(open ? null : it.key); if (open) setForm(null); };
              const mine = feed.sees_all || (Array.isArray(it.may_take) && it.may_take.includes(role));
              const opts = Array.isArray(it.options) ? it.options : [];
              return (
                <React.Fragment key={it.key}>
                  <tr className={`syncrow${open ? " on" : ""}`} onClick={toggle} role="button" tabIndex={0} aria-expanded={open}
                      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); } }}>
                    <td>{it.rank}{it.in_top === false ? <div className="note" title="Outside the top 25 by score, shown because it is one of the top three of its kind">top of kind</div> : null}</td>
                    <td><span className={`pill ${sevTone(it.severity)}`}>{it.severity}</span></td>
                    <td className="wrap"><b>{it.what}</b><div className="note iq-detail">{SOURCE_LABEL[it.source] || it.source} · {it.why}{it.who ? ` · ${it.who}` : ""}</div></td>
                    <td>{num(it.n)}</td>
                    <td className={Number(it.dollars) > 0 ? "hot" : ""}>{usd(it.dollars)}</td>
                    <td title={when(it.oldest)}>{days(it.age_days)}</td>
                    <td className="wrap"><span className="note">{it.recommendation ? String(it.recommendation).slice(0, 140) : "—"}</span></td>
                    <td className="syncacts">
                      {mine && opts.filter((o) => o !== "assign").map((o) => (
                        <button key={o} type="button" className={`btn small${o === "resolve" || o === "fix" || o === "approved" || o === "build_now" || o === "answer" ? " primary" : ""}`}
                                onClick={(e) => { e.stopPropagation(); setOpenKey(it.key); setForm({ key: it.key, option: o }); }}>{OPTION_LABEL[o] || o}</button>
                      ))}
                      {mine && opts.includes("assign") && (
                        <AssignTask dept={entry?.category || "Command"} kpi={String(it.what).slice(0, 80)} value={Number(it.dollars) || Number(it.n) || 0} unit={Number(it.dollars) > 0 ? "USD" : "rows"} drill={it.drill_to || "today"}
                                    onDone={async (taskId) => {
                                      const { data, error } = await supabase.rpc("f_decide", { p: { key: it.key, option: "assign", task_id: taskId || null, note: "" } });
                                      if (error || !data?.ok) { setSaid({ kind: "err", text: `The task exists but the decision was not recorded: ${error?.message || "no id came back"}` }); return; }
                                      afterDecide(it, data);
                                    }} />
                      )}
                      <button type="button" className="btn ghost small" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-label={open ? "Close" : "Open"}>{open ? "▴" : "▾"}</button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="syncexpand"><td colSpan={8}>
                      <div className="syncdetail">
                        <div className="syncdetail-head">
                          <div><div className="ptitle" style={{ margin: 0 }}>{it.what}</div>
                            <div className="note">{SOURCE_LABEL[it.source] || it.source} · raised by {it.why} · oldest {when(it.oldest)} · newest {when(it.newest)} · score {it.score}</div></div>
                          <span className={`pill ${sevTone(it.severity)}`}>{it.severity}</span>
                          <div className="syncdetail-acts">{it.drill_to && <a className="btn ghost small" href={`#${it.drill_to}`}>Open the page</a>}<button type="button" className="btn ghost small" onClick={toggle}>Close</button></div>
                        </div>
                        <div className="cols2 syncfacts" style={{ marginTop: 10 }}>
                          <table><tbody>
                            <tr><td className="note">The figure as it stands</td><td className="wrap">{num(it.n)} row(s) · {usd(it.dollars)} · {num(it.pounds)} lb · {days(it.age_days)} old</td></tr>
                            <tr><td className="note">Recommended</td><td className="wrap">{it.recommendation || "—"}</td></tr>
                            {it.who && <tr><td className="note">Accountable</td><td className="wrap">{it.who}</td></tr>}
                            <tr><td className="note">Who may take it</td><td className="wrap">{Array.isArray(it.may_take) ? it.may_take.join(", ") : "—"}</td></tr>
                          </tbody></table>
                          <table><tbody>
                            {(Array.isArray(it.members) ? it.members : []).map((m, i) => (
                              <tr key={m.id || m.issue_key || i}><td className="note">{i === 0 ? `Behind it (${Math.min(it.n, 5)} of ${num(it.n)})` : ""}</td>
                                <td className="wrap">{m.drill_to ? <a href={`#${m.drill_to}`}>{m.headline}</a> : m.headline}{m.dollars != null ? ` · ${usd(m.dollars)}` : ""}</td></tr>
                            ))}
                            {(!Array.isArray(it.members) || it.members.length === 0) && <tr><td className="note">Behind it</td><td className="wrap">this is a single record</td></tr>}
                          </tbody></table>
                        </div>
                        {form && form.key === it.key && <DecideForm item={it} option={form.option} onDone={(d) => afterDecide(it, d)} onCancel={() => setForm(null)} />}
                        {!mine && <div className="note" style={{ marginTop: 8 }}>This decision belongs to {Array.isArray(it.may_take) ? it.may_take.join(", ") : "another role"}. Your role is {role || "…"}.</div>}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mtitle" style={{ marginTop: 18 }}><span className="sq" /><h2>Decided today</h2><span className="rule" /></div>
      <div className="panel tablewrap" style={{ maxWidth: "none", padding: 0 }}>
        <table className="syncgrid iq">
          <thead><tr><th>When</th><th>Decision</th><th>Outcome</th><th>Effect</th><th>By</th><th style={{ textAlign: "right" }}>Reverse</th></tr></thead>
          <tbody>
            {feed && decided.length === 0 && <tr><td colSpan={6} className="note">No decision taken yet today.</td></tr>}
            {decided.map((d) => (
              <tr key={d.id} className={d.reversed_at ? "syncrow off" : ""}>
                <td title={when(d.decided_at)}>{new Date(d.decided_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                <td className="wrap"><b>{d.what}</b><div className="note iq-detail">{SOURCE_LABEL[d.source] || d.source} · figure as it stood: {num(d.figure?.members)} row(s){d.figure?.dollars != null ? ` · ${usd(d.figure.dollars)}` : ""}</div></td>
                <td><span className={`pill ${d.reversed_at ? "muted" : "ok"}`}>{OPTION_LABEL[d.outcome] || d.outcome}</span>{d.outcome_note ? <div className="note iq-detail">{d.outcome_note}</div> : null}{d.due_by ? <div className="note">until {d.due_by}</div> : null}</td>
                <td className="wrap"><code style={{ fontSize: 11 }}>{JSON.stringify(d.effect)}</code></td>
                <td>{d.decided_role}</td>
                <td className="syncacts">{d.reversed_at ? <span className="note">reversed {when(d.reversed_at)} — {d.reversal_reason}</span> : canReverse ? <ReverseBox decision={d} onDone={load} /> : <span className="note">owner / executive / admin / CFO</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note" style={{ marginTop: 8 }}>Source: <code>f_today_feed</code> over agent_findings (one family per severity), v_open_issues (one class per severity), open_questions, page_enhancement, correction_proposal and qa: reports · effects through f_finding_resolve&rsquo;s rule, issue_decisions, open_questions, tg_decide_issue, tg_task_from_dashboard · record in <code>decisions</code> · digest to alert_recipient rows daily at 07:00 ET.</div>
    </>
  );
}
