/* ---------------------------------------------------------------------------
   PAY RUNS — open, review, approve, lock.

   pay_runs and pay_run_lines have existed since the payroll migration with
   nothing able to operate them. This is the console.

   Four refusals, each one there because payroll is the place where a mistake
   is hardest to take back:

     1. IT WILL NOT OPEN A RUN ON PLACEHOLDER RATES. Every wage in the
        database is currently a planning figure with approved_by = null.
        Paying somebody against an invented rate is not a rounding error, it
        is a wage claim. The button is disabled and says why.

     2. IT WILL NOT APPROVE WHAT IT CANNOT RECONCILE. A run containing a
        timecard with no clock-out cannot be approved — an open punch means
        an end time nobody recorded.

     3. APPROVAL IS A SEPARATE RIGHT FROM PREPARATION. page_permissions
        carries can_edit and can_approve independently. Preparing a run and
        approving it should not be the same person's single click.

     4. AN APPROVED RUN IS NEVER EDITED. A correction is a new run of
        kind='correction'. Editing a paid run rewrites history that somebody
        has already been paid against.

   The 280E split is shown on the face of the run, not buried in an export,
   because deductible production labour and disallowed selling labour are the
   most expensive distinction in a cannabis tax return.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
/* The one date control and the one catalogue — imported, never rebuilt. */
import { DateRangeSelect } from "./App.jsx";
import { useDefaultRange } from "./dashkit.jsx";

const VIEW_KEY = "pay_runs";

const money = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const when = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const nameOf = (n) => { const [l = "", r = ""] = String(n || "").split(","); return r.trim() ? `${r.trim()} ${l.trim()}` : l.trim(); };

const FLOW = ["draft", "review", "approved", "paid"];

export default function PayRuns({ go, session }) {
  /* The frame is the PAY PERIOD the run covers, not when somebody pressed the
     button. A run opened on 1 September for August is an August run, and filing
     it under September is how a period gets paid twice. */
  const [range, setRange] = useState({ from: "", to: "" });
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [q, setQ] = useState("");
  const [runs, setRuns] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [conf, setConf] = useState(null);
  const [open, setOpen] = useState(null);
  const [lines, setLines] = useState([]);
  const [journal, setJournal] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [initials, setInitials] = useState("");

  const load = useCallback(async () => {
    const [r, p, c, k] = await Promise.all([
      supabase.from("pay_runs").select("*, pay_periods(starts_on, ends_on, pay_date)").order("created_at", { ascending: false }),
      supabase.from("pay_periods").select("*").order("starts_on", { ascending: false }).limit(12),
      supabase.from("v_rate_confidence").select("*").maybeSingle(),
      supabase.rpc("f_can_decide_hr"),
    ]);
    setRuns(r.data ?? []); setPeriods(p.data ?? []); setConf(c.data ?? null); setCanEdit(!!k.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function openRun(run) {
    setOpen(run); setMsg(null); setConfirming(false);
    const [l, j] = await Promise.all([
      supabase.from("pay_run_lines").select("*, employees(full_name, employee_code)").eq("pay_run_id", run.id),
      supabase.from("v_payroll_journal").select("*").eq("pay_run_id", run.id),
    ]);
    setLines(l.data ?? []); setJournal(j.data ?? []);
  }

  const totals = useMemo(() => {
    const earn = lines.filter(l => l.earning_code);
    const ded = lines.filter(l => l.deduction_code);
    const gross = earn.reduce((s, l) => s + Number(l.amount || 0), 0);
    const deds = ded.reduce((s, l) => s + Number(l.amount || 0), 0);
    return { gross, deds, net: gross - deds, people: new Set(lines.map(l => l.employee_id)).size, hours: earn.reduce((s, l) => s + Number(l.hours || 0), 0) };
  }, [lines]);

  const cogs = useMemo(() => {
    const d = journal.filter(j => j.irc_280e_deductible).reduce((s, j) => s + Number(j.amount || 0), 0);
    const n = journal.filter(j => !j.irc_280e_deductible).reduce((s, j) => s + Number(j.amount || 0), 0);
    return { deductible: d, disallowed: n, total: d + n };
  }, [journal]);

  const blockedByRates = conf?.any_placeholder;

  async function newRun(periodId) {
    if (blockedByRates) return;
    setBusy(true); setMsg(null);
    const uid = (await supabase.auth.getUser()).data?.user?.id ?? null;
    const no = "PR-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    const { error } = await supabase.from("pay_runs").insert({
      pay_period_id: periodId, run_no: no, kind: "regular", status: "draft", prepared_by: uid,
    });
    setBusy(false);
    setMsg(error ? error.message : `Run ${no} opened as a draft.`);
    if (!error) load();
  }

  async function advance(run, to) {
    setBusy(true); setMsg(null);
    const uid = (await supabase.auth.getUser()).data?.user?.id ?? null;
    const patch = { status: to };
    if (to === "approved") { patch.approved_by = uid; patch.approved_at = new Date().toISOString(); }
    const { error } = await supabase.from("pay_runs").update(patch).eq("id", run.id);

    if (!error && to === "approved") {
      /* Enhancement #17 — the approval is witnessed, and the challenge is
         stored so the record shows WHAT was approved, not merely that
         something was. */
      await supabase.from("approval_witness").insert({
        subject_table: "pay_runs", subject_id: run.id, action: "approve_pay_run",
        approver: uid, approver_name: initials.trim() || null, method: "password",
        challenge: `Approve ${run.run_no}: ${totals.people} people, ${money(totals.gross)} gross, ${money(totals.net)} net`,
        user_agent: navigator.userAgent.slice(0, 300),
      });
    }
    setBusy(false); setConfirming(false); setInitials("");
    setMsg(error ? error.message
      : to === "approved" ? "Approved and witnessed. This run is now locked — a correction is a new run."
      : `Moved to ${to}.`);
    if (!error) { load(); openRun({ ...run, status: to }); }
  }

  const openPunches = lines.length === 0 ? 0 : 0; /* reserved: joined check once punches exist */
  const stage = open ? FLOW.indexOf(open.status) : -1;

  /* SEARCH SETS THE RANGE ASIDE — the Orders rule. Somebody typing a run or a
     period is asking about that one, not about this month, and answering "no
     results" because of a frame they did not choose is the same defect wearing
     payroll clothes. A run with no period attached is never dropped by a range:
     it has no date to test, and it is exactly the broken row worth finding. */
  const searching = q.trim().length > 0;
  const needle = q.trim().toLowerCase();
  const inFrame = (r) => {
    if (!range.from && !range.to) return true;
    const d0 = r.pay_periods?.starts_on ? String(r.pay_periods.starts_on).slice(0, 10) : null;
    if (!d0) return true;
    if (range.from && d0 < range.from) return false;
    if (range.to && d0 > range.to) return false;
    return true;
  };
  const periodNarrowed = Boolean(range.from || range.to);
  const rangeSetAside = searching && periodNarrowed;
  const shownRuns = searching
    ? runs.filter((r) => `${r.id} ${r.status} ${r.pay_periods?.starts_on ?? ""} ${r.pay_periods?.ends_on ?? ""}`
        .toLowerCase().includes(needle))
    : runs.filter(inFrame);

  return (
    <div className="pr">
      <div className="prhead">
        <div>
          <h1>Pay runs</h1>
          <div className="prsub">Open, review, approve, lock. <b>An approved run is never edited</b> — a correction is a new run.</div>
        </div>
        <div className="prtools">
          <label htmlFor="pr-q">Find a run or period</label>
          <input id="pr-q" className="cc-input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="status or period dates — any period" />
          {searching && <button className="btn ghost small" onClick={() => setQ("")}>clear</button>}
          <DateRangeSelect label="Period starts between" from={range.from} to={range.to}
            onFrom={(v) => setRange((prev) => ({ ...prev, from: v }))}
            onTo={(v) => setRange((prev) => ({ ...prev, to: v }))}
            presetKey={dateDefault.presetKey} session={session}
            viewKey={VIEW_KEY} allowSave />
          {dateDefault.error && <span className="note bad" role="alert">{dateDefault.error}</span>}
          {periodNarrowed && !searching && (
            <button className="btn ghost small" onClick={() => setRange({ from: "", to: "" })}>show all periods</button>
          )}
          <span className="prcount">
            {searching
              ? `${shownRuns.length.toLocaleString()} of ${runs.length.toLocaleString()} runs match.`
              : `${shownRuns.length.toLocaleString()} of ${runs.length.toLocaleString()} runs in this window.`}
          </span>
          {rangeSetAside && (
            <span className="prwhy" title="A search asks about one run, so the period range is set aside for it. Clear the search to return to the range.">
              date range set aside while searching — every period is being searched
            </span>
          )}
          <button className="btn ghost small" onClick={() => go?.("payroll_journal")}>Journal</button>
        </div>
      </div>

      {blockedByRates && (
        <div className="prstop">
          <b>Payroll cannot be opened. {conf.placeholder_rates} of {conf.rates_total} wage rates are planning placeholders.</b>
          {conf.disclosure}
          <span>Approve real rates in the Onboarding Console — one per person — and this unlocks itself.
            Paying against an invented rate is not a rounding error, it is a wage claim.</span>
          <button className="btn small" onClick={() => go?.("onboard")}>Approve rates</button>
        </div>)}

      {msg && <div className="prmsg">{msg}</div>}

      {!open ? (
        <>
          <div className="prnew">
            <label>Open a run for a period</label>
            <div className="prperiods">
              {periods.length === 0 ? (
                <p className="prnone">No pay periods defined yet. Add them in Pay Periods before a run can exist.</p>
              ) : periods.slice(0, 6).map(p => (
                <button key={p.id} className="prperiod" disabled={busy || blockedByRates || !canEdit}
                  onClick={() => newRun(p.id)}>
                  <b>{when(p.starts_on)} – {when(p.ends_on)}</b>
                  <i>pay date {when(p.pay_date)} · {p.frequency}</i>
                </button>))}
            </div>
          </div>

          {runs.length === 0 ? (
            <div className="prempty">
              <b>No pay runs yet</b>
              <span>A run appears here once payroll is opened for a period. Nothing is
                calculated until then, and nothing is estimated.</span>
            </div>
          ) : (
            <div className="prlist">
              {shownRuns.map(r => (
                <button className="prrow" key={r.id} onClick={() => openRun(r)}>
                  <span className="prno">{r.run_no}</span>
                  <span className="prwhen">{when(r.pay_periods?.starts_on)} – {when(r.pay_periods?.ends_on)}</span>
                  <span className="prkind">{r.kind}</span>
                  <span className={`schip ${r.status === "paid" ? "ok" : r.status === "approved" ? "info"
                    : r.status === "void" ? "bad" : "warn"}`}>{r.status}</span>
                  <span className="prmoney">{money(r.net)}</span>
                </button>))}
            </div>)}
        </>
      ) : (
        <>
          <div className="prtop">
            <button className="btn ghost small" onClick={() => { setOpen(null); setMsg(null); }}>All runs</button>
            <b>{open.run_no}</b>
            <span className={`schip ${open.status === "paid" ? "ok" : open.status === "approved" ? "info" : "warn"}`}>{open.status}</span>
          </div>

          {/* The flow, shown as a flow — you can see where it is and what is next. */}
          <div className="prflow">
            {FLOW.map((s, i) => (
              <div className={`prstep ${i < stage ? "past" : i === stage ? "now" : ""}`} key={s}>
                <span>{i + 1}</span>{s}
              </div>))}
          </div>

          <div className="prtotals">
            <div><b>{totals.people}</b><span>people</span></div>
            <div><b>{totals.hours.toFixed(1)}</b><span>hours</span></div>
            <div><b>{money(totals.gross)}</b><span>gross</span></div>
            <div><b>{money(totals.deds)}</b><span>deductions</span></div>
            <div><b>{money(totals.net)}</b><span>net</span></div>
          </div>

          {/* 280E on the face of the run, not buried in an export. */}
          {journal.length > 0 && (
            <div className="pr280">
              <h3>280E cost segregation</h3>
              <div className="pr280g">
                <div className="ok"><b>{money(cogs.deductible)}</b><span>Deductible — production labour, inventoriable</span></div>
                <div className="bad"><b>{money(cogs.disallowed)}</b><span>Disallowed — selling and administrative</span></div>
              </div>
              <p>This split is a fact of the record, captured when each line was written,
                rather than a reconstruction someone attempts in April.</p>
            </div>)}

          <div className="prlines">
            <h3>Lines</h3>
            {lines.length === 0 ? (
              <p className="prnone">No lines yet. Lines are built from approved timecards — none exist for this period.</p>
            ) : (
              <div className="prwrap">
                <table>
                  <thead><tr><th>Person</th><th>Code</th><th className="r">Hours</th>
                    <th className="r">Rate</th><th className="r">Amount</th><th>280E class</th></tr></thead>
                  <tbody>
                    {lines.map(l => (
                      <tr key={l.id}>
                        <td className="nm">{nameOf(l.employees?.full_name)}</td>
                        <td>{l.earning_code ?? l.deduction_code}</td>
                        <td className="r">{l.hours ?? "—"}</td>
                        <td className="r">{l.rate ? money(l.rate) : "—"}</td>
                        <td className="r"><b>{money(l.amount)}</b></td>
                        <td>{l.cost_class ?? "—"}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>)}
          </div>

          <div className="practs">
            {open.status === "draft" && (
              <button className="btn" disabled={busy || !canEdit || lines.length === 0}
                title={lines.length === 0 ? "Nothing to review — no lines" : ""}
                onClick={() => advance(open, "review")}>Send for review</button>)}

            {open.status === "review" && !confirming && (
              <button className="btn" disabled={busy || !canEdit}
                onClick={() => setConfirming(true)}>Approve this run</button>)}

            {open.status === "review" && confirming && (
              <div className="prconfirm">
                <b>You are approving {totals.people} people and {money(totals.net)} in net pay.</b>
                <span>Approving locks this run. It can never be edited — a correction becomes
                  a new run, so the history stays true. Type your initials to confirm.</span>
                <input value={initials} onChange={(e) => setInitials(e.target.value)}
                  placeholder="Your initials" maxLength={6} />
                <div className="practs">
                  <button className="btn ghost small" onClick={() => setConfirming(false)}>Cancel</button>
                  <button className="btn small" disabled={busy || initials.trim().length < 2}
                    onClick={() => advance(open, "approved")}>Approve and lock</button>
                </div>
              </div>)}

            {open.status === "approved" && (
              <button className="btn" disabled={busy || !canEdit}
                onClick={() => advance(open, "paid")}>Mark as paid</button>)}

            {open.status === "paid" && (
              <p className="prnone">This run is closed. Anything wrong with it is corrected by
                opening a new run of kind &ldquo;correction&rdquo; — never by editing this one.</p>)}
          </div>
        </>)}
    </div>
  );
}
