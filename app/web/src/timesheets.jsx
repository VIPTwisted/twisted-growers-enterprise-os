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

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const iso = (d) => d.toISOString().slice(0, 10);
const nameOf = (n) => { const [l = "", r = ""] = String(n || "").split(","); return r.trim() ? `${r.trim()} ${l.trim()}` : l.trim(); };
const initials = (n) => { const [l = "", r = ""] = String(n || "").split(","); return ((r.trim()[0] || "") + (l.trim()[0] || "")).toUpperCase() || "?"; };
const hrs = (n) => (n == null ? "—" : Number(n).toFixed(2));

function mondayOf(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export default function Timesheets({ go }) {
  const [tab, setTab] = useState("all");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [entries, setEntries] = useState([]);
  const [cap, setCap] = useState([]);
  const [me, setMe] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [canApprove, setCanApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  }), [weekStart]);

  const load = useMemo(() => async () => {
    const from = iso(dates[0]), to = iso(dates[6]);
    const [t, c, m, p, a] = await Promise.all([
      supabase.from("time_entries").select("*, employees(full_name, employee_code, weekly_target_hours)")
        .gte("work_date", from).lte("work_date", to).order("work_date"),
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
  }, [dates]);

  useEffect(() => { load(); }, [load]);

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

  const visible = tab === "my" ? rows.filter(r => r.id === me)
                : tab === "approvals" ? rows.filter(r => r.unapproved > 0 || r.open > 0)
                : rows;

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
          <button className="btn ghost small" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}>←</button>
          <span>{dates[0].toLocaleDateString(undefined,{day:"numeric",month:"short"})} – {dates[6].toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}</span>
          <button className="btn ghost small" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}>→</button>
        </div>
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
          <table className="tstable">
            <thead>
              <tr>
                <th className="tsname">Person</th>
                {dates.map((d,i) => <th key={i} className="r">{DAYS[i]}<i>{d.getDate()}</i></th>)}
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
                  {dates.map((d,i) => {
                    const h = r.days[iso(d)];
                    return <td key={i} className={`r ${h ? "" : "dim"}`}>{h ? hrs(h) : "·"}</td>;
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
