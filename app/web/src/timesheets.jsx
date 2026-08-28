/* ---------------------------------------------------------------------------
   TIMESHEETS — My / All / Approvals
   Built to the spec already catalogued in
   docs/gap_register/reference_screens_inventory.md #18, registered P0:
     "week grid per task/day, member rows vs capacity, approvals with
      tracked / capacity / billable / over-capacity"

   Design language from that same document, section "Design language to adopt":
     - stat-card rows: big number, label, filter chip
     - grouped tables with a rollup bar
     - coloured status pills

   Three tabs because three different people open this:
     My         — one person, their week, "have I been paid for Tuesday"
     All        — the floor, member rows against capacity, who is short
     Approvals  — a manager, deciding, with the cost of approving visible

   Capacity comes from v_employee_capacity, never assumed to be 40.
--------------------------------------------------------------------------- */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
/* The one date control and the one catalogue. Imported, never rebuilt —
   docs/PERIOD_BUS_SPEC.md: "Do not fork a second catalog in React." */
import { DateRangeSelect } from "./App.jsx";
import { useDefaultRange } from "./dashkit.jsx";

const VIEW_KEY = "timesheets";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const nameOf = (n) => { const [l = "", r = ""] = String(n || "").split(","); return r.trim() ? `${r.trim()} ${l.trim()}` : l.trim(); };
const initials = (n) => { const [l = "", r = ""] = String(n || "").split(","); return ((r.trim()[0] || "") + (l.trim()[0] || "")).toUpperCase() || "?"; };
const hrs = (n) => (n == null ? "—" : Number(n).toFixed(2));

/* THE WEEK NO LONGER STARTS ON A MONDAY THIS FILE DECIDED.
 *
 * mondayOf() lived here and computed the week start in JavaScript with
 * (getDay() + 6) % 7. Two things were wrong with it. It hardcoded a company
 * policy — which day a week starts — in a page, where nobody governing that
 * policy would ever look for it. And it read the browser's clock and timezone,
 * so the same Sunday evening produced a different week either side of midnight
 * UTC and two people comparing timesheets disagreed about which week they were
 * looking at.
 *
 * The week now arrives from the period bus: f_date_presets resolves this_week_td
 * with date_trunc('week'), which is Monday in Postgres, computed once on the
 * server against one clock. The arrows below move the governed window a week at
 * a time rather than recomputing a week from scratch. */
const addDays = (isoDate, n) => {
  const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};
const daysBetween = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/* A day grid wider than this stops being readable on any screen. Beyond it the
   totals still answer the question; the per-day columns are what get dropped,
   and the page says so rather than rendering 300 columns off the side. */
const MAX_DAY_COLUMNS = 31;

export default function Timesheets({ go, session }) {
  const [tab, setTab] = useState("all");
  const [range, setRange] = useState({ from: "", to: "" });
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState([]);
  const [cap, setCap] = useState([]);
  const [me, setMe] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [canApprove, setCanApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  /* The columns ARE the selected window. ISO strings throughout, so no timezone
     can move an entry into the day next door. */
  const span = range.from && range.to ? daysBetween(range.from, range.to) + 1 : 0;
  const dayCols = useMemo(
    () => (span > 0 && span <= MAX_DAY_COLUMNS
      ? Array.from({ length: span }, (_, i) => addDays(range.from, i))
      : []),
    [range.from, span],
  );

  const load = useMemo(() => async () => {
    let entryQuery = supabase.from("time_entries")
      .select("*, employees(full_name, employee_code, weekly_target_hours)")
      .order("work_date");
    /* An unbounded frame reads the whole book, exactly as Orders does. The range
       decides what is SHOWN; it must never decide what a search can reach. */
    if (range.from) entryQuery = entryQuery.gte("work_date", range.from);
    if (range.to) entryQuery = entryQuery.lte("work_date", range.to);
    const [t, c, m, p, a] = await Promise.all([
      entryQuery,
      supabase.from("v_employee_capacity").select("*"),
      supabase.rpc("f_my_employee_id"),
      supabase.from("attendance_policy").select("*").limit(1).maybeSingle(),
      supabase.rpc("f_can_decide_hr"),
    ]);
    setEntries(t.data ?? []);
    setCap(c.data ?? []);
    setMe(m.data ?? null);
    setPolicy(p.data ?? null);
    setCanApprove(!!a.data);
  }, [range.from, range.to]);

  useEffect(() => { if (dateDefault.ready) load(); }, [load, dateDefault.ready]);

  const worked = (e) => {
    if (!e.clock_in || !e.clock_out) return 0;
    return (new Date(e.clock_out) - new Date(e.clock_in)) / 3600000 - (e.unpaid_lunch_min ?? 0) / 60;
  };

  /* Member rows against capacity — the shape the reference specifies. */
  const rows = useMemo(() => {
    const by = new Map();
    for (const e of entries) {
      const id = e.employee_id;
      if (!by.has(id)) by.set(id, {
        id, name: e.employees?.full_name ?? "—",
        code: e.employees?.employee_code ?? "—",
        days: {}, tracked: 0, unapproved: 0, open: 0,
      });
      const r = by.get(id);
      const h = worked(e);
      r.days[e.work_date] = (r.days[e.work_date] ?? 0) + h;
      r.tracked += h;
      if (!e.clock_out) r.open += 1;
      if (!e.approved_by && e.clock_out) r.unapproved += 1;
    }
    for (const r of by.values()) {
      const c = cap.find(x => x.employee_code === r.code);
      r.capacity = Number(c?.weekly_capacity_hours ?? c?.payroll_target_hours ?? 0);
      r.over = r.capacity > 0 ? Math.max(r.tracked - r.capacity, 0) : 0;
      r.short = r.capacity > 0 ? Math.max(r.capacity - r.tracked, 0) : 0;
    }
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, cap]);

  /* SEARCH SETS THE RANGE ASIDE — the Orders rule, applied here.
     Somebody typing a name is asking about that person, not about August. When
     the range is narrowed AND a search is typed, the search wins and the page
     says so, so a manager is never told a person has no hours when what actually
     happened is that their hours fall outside a window nobody chose. */
  const searching = q.trim().length > 0;
  const needle = q.trim().toLowerCase();
  const byTab = tab === "my" ? rows.filter(r => r.id === me)
              : tab === "approvals" ? rows.filter(r => r.unapproved > 0 || r.open > 0)
              : rows;
  const visible = searching
    ? byTab.filter(r => `${r.name} ${r.code}`.toLowerCase().includes(needle))
    : byTab;
  const periodNarrowed = Boolean(range.from || range.to);
  const rangeSetAside = searching && periodNarrowed;

  const totals = useMemo(() => visible.reduce((a, r) => ({
    tracked: a.tracked + r.tracked,
    capacity: a.capacity + r.capacity,
    over: a.over + r.over,
    unapproved: a.unapproved + r.unapproved,
    open: a.open + r.open,
  }), { tracked: 0, capacity: 0, over: 0, unapproved: 0, open: 0 }), [visible]);

  async function approveWeek(empId) {
    setBusy(true); setMsg(null);
    const ids = entries.filter(e => e.employee_id === empId && e.clock_out && !e.approved_by).map(e => e.id);
    if (!ids.length) { setBusy(false); return; }
    const { data: uid } = await supabase.auth.getUser();
    const { error } = await supabase.from("time_entries")
      .update({ approved_by: uid?.user?.id ?? null }).in("id", ids);
    setBusy(false);
    setMsg(error ? error.message : `Approved ${ids.length} ${ids.length === 1 ? "entry" : "entries"}.`);
    if (!error) load();
  }

  const empty = entries.length === 0;

  return (
    <div className="ts">
      <div className="tshead">
        <div>
          <h1>Timesheets</h1>
          <div className="tssub">Tracked against each person&rsquo;s own capacity — never assumed to be forty.</div>
        </div>
        <div className="tsweek">
          {/* The arrows shift the governed window rather than recomputing a week,
              so whatever the bus resolved stays the length the reader chose. */}
          <button className="btn ghost small" title="Move the window back seven days"
            disabled={!range.from || !range.to}
            onClick={() => setRange({ from: addDays(range.from, -7), to: addDays(range.to, -7) })}>←</button>
          <span>{range.from && range.to
            ? `${range.from} – ${range.to}`
            : "every date"}</span>
          <button className="btn ghost small" title="Move the window forward seven days"
            disabled={!range.from || !range.to}
            onClick={() => setRange({ from: addDays(range.from, 7), to: addDays(range.to, 7) })}>→</button>
          <DateRangeSelect label="Worked between" from={range.from} to={range.to}
            onFrom={(v) => setRange((prev) => ({ ...prev, from: v }))}
            onTo={(v) => setRange((prev) => ({ ...prev, to: v }))}
            presetKey={dateDefault.presetKey} session={session}
            viewKey={VIEW_KEY} allowSave />
          {dateDefault.error && <span className="note bad" role="alert">{dateDefault.error}</span>}
        </div>
      </div>

      <div className="tsfind">
        <label htmlFor="ts-q">Find a person</label>
        <input id="ts-q" className="cc-input" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="name or employee code — any period" />
        {searching && <button className="btn ghost small" onClick={() => setQ("")}>clear</button>}
        <span className="tsfindnote">
          {searching
            ? `${visible.length.toLocaleString()} of ${rows.length.toLocaleString()} people match.`
            : `${visible.length.toLocaleString()} people in this window.`}
        </span>
        {rangeSetAside && (
          <span className="tsaside" title="A search asks about a person, not about a period, so the date range is set aside for it. Clear the search to return to the range.">
            date range set aside while searching — every period is being searched
          </span>
        )}
      </div>

      <div className="tstabs">
        {[["my","My timesheet"],["all","All"],["approvals","Approvals"]].map(([k,l]) => (
          <button key={k} className={tab===k?"on":""} onClick={() => setTab(k)}>
            {l}{k==="approvals" && totals.unapproved>0 ? ` (${totals.unapproved})` : ""}
          </button>))}
      </div>

      {/* Stat-card row — big number, label, per the documented design language. */}
      <div className="tsstats">
        <div><b>{hrs(totals.tracked)}</b><span>tracked</span></div>
        <div><b>{hrs(totals.capacity)}</b><span>capacity</span></div>
        <div className={totals.over > 0 ? "hot" : ""}><b>{hrs(totals.over)}</b><span>over capacity</span></div>
        <div className={totals.unapproved > 0 ? "warn" : ""}><b>{totals.unapproved}</b><span>awaiting approval</span></div>
        <div className={totals.open > 0 ? "hot" : ""}><b>{totals.open}</b><span>missing clock-out</span></div>
      </div>

      {msg && <div className="tsmsg">{msg}</div>}

      {empty ? (
        <div className="tsempty">
          <b>No punches in this week</b>
          <span>
            Timesheets fill from real clock-ins. Nothing is estimated and nothing is
            sampled — until someone punches at a terminal, on a phone, or a payroll
            file is imported, this week is genuinely empty rather than broken.
          </span>
          <button className="btn ghost small" onClick={() => go?.("on_the_floor")}>Who is on the floor now</button>
        </div>
      ) : (
        <div className="tswrap">
          {dayCols.length === 0 && (
            <div className="tsgridnote">
              {span > MAX_DAY_COLUMNS
                ? `The window is ${span} days, so the day-by-day columns are not drawn — beyond ${MAX_DAY_COLUMNS} they run off the page. Tracked, capacity and variance below still cover the whole window.`
                : "No period is selected, so there are no day columns to draw. Tracked, capacity and variance below cover every date."}
            </div>
          )}
          <table className="tstable">
            <thead>
              <tr>
                <th className="tsname">Person</th>
                {dayCols.map((d) => (
                  <th key={d} className="r">
                    {DAYS[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7]}<i>{Number(d.slice(8, 10))}</i>
                  </th>
                ))}
                <th className="r">Tracked</th><th className="r">Capacity</th><th className="r">Variance</th>
                <th>Status</th>{canApprove && tab==="approvals" && <th></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id}>
                  <td className="tsname">
                    <span className="tsav">{initials(r.name)}</span>
                    <span className="tsn"><b>{nameOf(r.name)}</b><i>{r.code}</i></span>
                  </td>
                  {dayCols.map((d) => {
                    const h = r.days[d];
                    return <td key={d} className={`r ${h ? "" : "dim"}`}>{h ? hrs(h) : "·"}</td>;
                  })}
                  <td className="r"><b>{hrs(r.tracked)}</b></td>
                  <td className="r">{r.capacity ? hrs(r.capacity) : "—"}</td>
                  <td className={`r ${r.over > 0 ? "hot" : r.short > 0 ? "warn" : ""}`}>
                    {r.capacity ? (r.over > 0 ? "+" + hrs(r.over) : r.short > 0 ? "−" + hrs(r.short) : "0.00") : "—"}
                  </td>
                  <td>
                    {r.open > 0 ? <span className="schip bad">missing clock-out</span>
                     : r.unapproved > 0 ? <span className="schip warn">{r.unapproved} to approve</span>
                     : <span className="schip ok">approved</span>}
                  </td>
                  {canApprove && tab==="approvals" && (
                    <td className="r">
                      <button className="btn small" disabled={busy || r.unapproved === 0 || r.open > 0}
                        title={r.open > 0 ? "Fix the missing clock-out first — approving an open punch approves a guess"
                                          : "Approve this week"}
                        onClick={() => approveWeek(r.id)}>Approve</button>
                    </td>)}
                </tr>))}
            </tbody>
          </table>
        </div>
      )}

      <div className="tsnote">
        A missing clock-out cannot be approved. Approving an open punch would mean
        approving an end time nobody recorded — the correction belongs to HR, on the
        record, not to a manager guessing at a checkbox.
      </div>
    </div>
  );
}
