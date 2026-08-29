/* ---------------------------------------------------------------------------
   THE SCHEDULE BUILDER
   A week grid: people down, days across. The shape every scheduler already
   knows, because a manager building next week should not have to learn a tool.

   Two rules from the owner, both structural rather than cosmetic:

     1. A human or an agent may DRAFT. Only a human may POST. Drafting is free;
        posting is a promise to fifteen people about their week, so it is a
        deliberate, attributable act behind f_post_schedule().

     2. Conflicts are shown BEFORE posting, not discovered after. A cell knows
        if the person is unavailable, their licence has lapsed, or the week is
        heading into overtime — and says so while it can still be changed.

   Cost updates as you build. A schedule you cannot afford should be obvious
   while you are making it, not at payroll.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
/* The one date control and the one catalogue — imported, never rebuilt. */
import { DateRangeSelect } from "./App.jsx";
import { useDefaultRange, DkFrameNote } from "./dashkit.jsx";

const VIEW_KEY = "schedule_builder";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const nameOf = (n) => { const [l = "", r = ""] = String(n || "").split(","); return r.trim() ? `${r.trim()} ${l.trim()}` : l.trim(); };
const initials = (n) => { const [l = "", r = ""] = String(n || "").split(","); return ((r.trim()[0] || "") + (l.trim()[0] || "")).toUpperCase() || "?"; };
const money = (n) => "$" + Math.round(n || 0).toLocaleString();
/* THE WEEK START IS A COMPANY POLICY, NOT A LINE IN THIS FILE.
 *
 * mondayOf() computed it here with (getDay() + 6) % 7, off the browser clock.
 * That put a policy — which day a week begins — in a page, where nobody
 * governing it would look, and made it depend on the reader's timezone: the same
 * Sunday evening produced a different week either side of midnight UTC.
 *
 * It now comes from the period bus. f_date_presets resolves the week with
 * date_trunc('week'), Monday in Postgres, computed once on the server.
 *
 * THIS PAGE DEFAULTS TO this_week, NOT this_week_td, AND THAT IS DELIBERATE.
 * A dashboard reports what happened, so it stops at today. A scheduler plans
 * what has not happened yet — a to-date window would hide the rest of the very
 * week being built. The governed default is set per page for exactly this kind
 * of reason; see the migration alongside this change.
 *
 * The grid stays seven days wide whatever the frame says. A schedule is posted
 * a week at a time by f_post_schedule, and painting shifts across a month grid
 * is not a thing anybody does. The frame chooses WHICH week; it does not stretch
 * the week. */
const addDays = (isoDate, n) => {
  const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export default function ScheduleBuilder({ go, session }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [q, setQ] = useState("");
  const weekStart = range.from || "";
  const [people, setPeople] = useState([]);
  const [zones, setZones] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [avail, setAvail] = useState([]);
  const [cells, setCells] = useState({});          /* `${empId}|${date}` → line */
  const [draft, setDraft] = useState(null);
  const [brush, setBrush] = useState(null);        /* template id being painted */
  const [zoneBrush, setZoneBrush] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const dates = useMemo(
    () => (weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : []),
    [weekStart]);

  useEffect(() => {
    Promise.all([
      supabase.from("v_schedulable").select("*").order("full_name"),
      supabase.from("zones").select("id, name").eq("active", true).order("name"),
      supabase.from("shift_templates").select("*").eq("active", true).order("name"),
      supabase.from("attendance_policy").select("*").limit(1).maybeSingle(),
      supabase.from("employee_availability").select("*"),
    ]).then(([p, z, t, pol, a]) => {
      setPeople(p.data ?? []);
      setZones(z.data ?? []);
      setTemplates(t.data ?? []);
      setPolicy(pol.data ?? null);
      setAvail(a.data ?? []);
    });
  }, []);

  /* Rates, fetched separately so a scheduler without payroll rights still gets
     a working grid — it just cannot see the money. */
  const [rates, setRates] = useState({});
  const [canSeeCost, setCanSeeCost] = useState(false);
  useEffect(() => {
    supabase.rpc("f_can_read_hr").then(({ data }) => {
      setCanSeeCost(!!data);
      if (!data) return;
      supabase.from("v_payroll_forecast").select("employee_code, rate")
        .then(({ data: r }) => setRates(Object.fromEntries((r ?? []).map(x => [x.employee_code, Number(x.rate)]))));
    });
  }, []);

  const key = (emp, d) => `${emp}|${d}`;

  /* d is an ISO day string now, so the weekday is read in UTC from that string
     rather than from a Date built in the browser's own timezone — which is what
     used to shift a Sunday-evening reader onto the wrong day. */
  const unavailable = useCallback((empId, d) => {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    return avail.some(a =>
      a.employee_id === empId && a.available === false &&
      (a.specific_date === d || a.weekday === dow));
  }, [avail]);

  /* Hours already placed this week, per person — drives the overtime warning. */
  const weekHours = useMemo(() => {
    const h = {};
    for (const k of Object.keys(cells)) {
      const [emp] = k.split("|");
      const t = templates.find(x => x.id === cells[k]?.shift_template_id);
      if (!t) continue;
      const mins = (new Date(`1970-01-01T${t.end_time}`) - new Date(`1970-01-01T${t.start_time}`)) / 60000
                 - (t.lunch_minutes ?? 0);
      h[emp] = (h[emp] ?? 0) + mins / 60;
    }
    return h;
  }, [cells, templates]);

  const otThreshold = Number(policy?.ot_weekly_threshold ?? 40);

  const totals = useMemo(() => {
    let hours = 0, cost = 0, ot = 0;
    for (const [emp, h] of Object.entries(weekHours)) {
      hours += h;
      const p = people.find(x => x.employee_id === emp);
      const rate = rates[p?.employee_code] ?? 0;
      const over = Math.max(h - otThreshold, 0);
      ot += over;
      cost += (h - over) * rate + over * rate * 1.5;
    }
    return { hours, cost, ot, filled: Object.keys(cells).length };
  }, [weekHours, people, rates, cells, otThreshold]);

  function paint(empId, d) {
    if (!brush) { setMsg("Pick a shift above first, then click cells to place it."); return; }
    const k = key(empId, d);
    setCells(c => {
      const next = { ...c };
      if (next[k]?.shift_template_id === brush) delete next[k];
      else next[k] = { shift_template_id: brush, zone: zoneBrush || null };
      return next;
    });
  }

  async function saveDraft() {
    setBusy(true); setMsg(null);
    const { data: d, error } = await supabase.from("schedule_drafts").insert({
      title: `Week of ${weekStart}`,
      covers_from: dates[0],
      covers_to: dates[6],
      drafted_by_kind: "human",
      status: "draft",
      projected_hours: Number(totals.hours.toFixed(2)),
      projected_ot_hours: Number(totals.ot.toFixed(2)),
      projected_cost_loaded: Number(totals.cost.toFixed(2)),
    }).select().maybeSingle();

    if (error) { setBusy(false); setMsg(error.message); return; }

    const lines = Object.entries(cells).map(([k, v]) => {
      const [employee_id, work_date] = k.split("|");
      const t = templates.find(x => x.id === v.shift_template_id);
      const z = zones.find(x => x.name === v.zone);
      const person = people.find(x => x.employee_id === employee_id);
      const conflicts = [];
      if (person && !person.licence_valid) conflicts.push("licence not valid");
      if (unavailable(employee_id, new Date(work_date))) conflicts.push("unavailable");
      if ((weekHours[employee_id] ?? 0) > otThreshold) conflicts.push("week exceeds overtime threshold");
      return {
        draft_id: d.id, employee_id, work_date,
        zone_id: z?.id ?? null,
        shift_template_id: v.shift_template_id,
        planned_start: t?.start_time ?? null,
        planned_end: t?.end_time ?? null,
        conflict: conflicts.length ? conflicts.join("; ") : null,
      };
    });

    if (lines.length) await supabase.from("schedule_draft_lines").insert(lines);
    setDraft(d);
    setBusy(false);
    setMsg(`Draft saved — ${lines.length} shifts. Nobody sees it until you post it.`);
  }

  async function post() {
    if (!draft) { setMsg("Save the draft first."); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("f_post_schedule", { p_draft_id: draft.id });
    setBusy(false);
    setMsg(error ? error.message
      : `Posted — ${data.posted_shifts} shifts to staff, ${data.open_shifts} left open.`);
  }

  const shiftOf = (empId, d) => {
    const c = cells[key(empId, d)];
    return c ? templates.find(t => t.id === c.shift_template_id) : null;
  };

  return (
    <div className="sb">
      <div className="sbhead">
        <div>
          <h1>Schedule builder</h1>
          <div className="sbsub">
            Draft freely. <b>Only a person can post</b> — and posting is what staff see.
          </div>
        </div>
        <div className="sbweek">
          <button className="btn ghost small" title="The week before this one" disabled={!weekStart}
            onClick={() => setRange({ from: addDays(weekStart, -7), to: addDays(weekStart, -1) })}>←</button>
          <span>{dates.length ? `${dates[0]} – ${dates[6]}` : "no week selected"}</span>
          <button className="btn ghost small" title="The week after this one" disabled={!weekStart}
            onClick={() => setRange({ from: addDays(weekStart, 7), to: addDays(weekStart, 13) })}>→</button>
          <DateRangeSelect label="Week of" from={range.from} to={range.to}
            onFrom={(v) => setRange((prev) => ({ ...prev, from: v }))}
            onTo={(v) => setRange((prev) => ({ ...prev, to: v }))}
            presetKey={dateDefault.presetKey} session={session}
            viewKey={VIEW_KEY} allowSave />
          {dateDefault.error && <span className="note bad" role="alert">{dateDefault.error}</span>}
          {/* THE GRID IS THE FRAME, AND THAT IS WORTH SAYING OUT LOUD.
              weekStart IS range.from and the seven columns are built from it,
              so this page does not merely mount the control — the control is
              the page. The arrows move the governed frame rather than a second
              week-state of their own, which is why there is no Monday
              arithmetic anywhere in this file. */}
          <DkFrameNote basis="period" range={range}
            what="The seven columns and every cell in them"
            why="The week shown is the frame resolved by the bus from nav_registry.default_range for schedule_builder, measured this_week. Moving it with the arrows or the picker rebuilds the grid; this page holds no week of its own." />
          <DkFrameNote basis="as-of" range={range}
            what="The roster, shift templates, zones and availability rules"
            why="Standing configuration, not events inside a week. v_schedulable carries a badge expiry, which is a position; templates, zones, the attendance policy and availability describe how the place runs. Narrowing them to the week would empty the grid of the people who could fill it." />
          <DkFrameNote basis="undated" range={range}
            what="The pay rates behind the cost line"
            why="v_payroll_forecast carries no date column at all, so no frame can reach it. A week is priced at today's rate, and the page does not imply it knows a rate from a past week it cannot see." />
        </div>
      </div>

      {/* Brush — pick a shift, then click cells. Faster than a dialog per cell. */}
      <div className="sbtools">
        <span className="sblab">Shift</span>
        {templates.length === 0
          ? <span className="sbnone">No shift templates yet — add one in Shift Templates and it appears here.</span>
          : templates.map(t => (
            <button key={t.id} className={`sbchip ${brush === t.id ? "on" : ""}`}
              onClick={() => setBrush(brush === t.id ? null : t.id)}>
              {t.name}<i>{String(t.start_time).slice(0,5)}–{String(t.end_time).slice(0,5)}</i>
            </button>))}
        <span className="sblab">Zone</span>
        <select value={zoneBrush} onChange={(e) => setZoneBrush(e.target.value)}>
          <option value="">No zone</option>
          {zones.map(z => <option key={z.id}>{z.name}</option>)}
        </select>
      </div>

      {/* Cost as you build. A schedule you cannot afford should be obvious now. */}
      <div className="sbtotals">
        <div><b>{totals.filled}</b><span>shifts placed</span></div>
        <div><b>{totals.hours.toFixed(1)}</b><span>hours</span></div>
        <div className={totals.ot > 0 ? "hot" : ""}><b>{totals.ot.toFixed(1)}</b><span>overtime hours</span></div>
        {canSeeCost && <div><b>{money(totals.cost)}</b><span>projected cost</span></div>}
        <div className="sbacts">
          <button className="btn ghost small" disabled={busy || !totals.filled} onClick={saveDraft}>Save draft</button>
          <button className="btn small" disabled={busy || !draft} onClick={post}>Post to staff</button>
        </div>
      </div>

      {msg && <div className="sbmsg">{msg}</div>}

      <div className="sbgridwrap">
        <div className="sbgrid" style={{ gridTemplateColumns: `220px repeat(7, minmax(96px, 1fr))` }}>
          <div className="sbcorner">Person</div>
          {dates.map((d, i) => (
            <div className="sbday" key={i}>
              <b>{DAYS[i]}</b><span>{d.getDate()}</span>
            </div>))}

          {people.filter(p => p.schedulable_state !== "not employed").map(p => (
            <React.Fragment key={p.employee_id}>
              <div className={`sbperson ${p.schedulable_state !== "schedulable" ? "warn" : ""}`}>
                <span className="sbav">{initials(p.full_name)}</span>
                <span className="sbpn">
                  <b>{nameOf(p.full_name)}</b>
                  <i>{p.department ?? "No department"}</i>
                </span>
                <span className={`sbh ${(weekHours[p.employee_id] ?? 0) > otThreshold ? "hot" : ""}`}>
                  {(weekHours[p.employee_id] ?? 0).toFixed(1)}h
                </span>
              </div>
              {dates.map((d, i) => {
                const t = shiftOf(p.employee_id, d);
                const off = unavailable(p.employee_id, d);
                const bad = !p.licence_valid;
                return (
                  <button key={i}
                    className={`sbcell ${t ? "set" : ""} ${off ? "off" : ""} ${bad && t ? "bad" : ""}`}
                    title={bad ? "Licence not valid — this person cannot legally work"
                          : off ? "Marked unavailable" : t ? t.name : "Click to place the selected shift"}
                    onClick={() => paint(p.employee_id, d)}>
                    {t ? <>
                      <b>{String(t.start_time).slice(0,5)}</b>
                      <i>{String(t.end_time).slice(0,5)}</i>
                      {cells[key(p.employee_id,d)]?.zone && <em>{cells[key(p.employee_id,d)].zone}</em>}
                    </> : off ? <span className="sbx">unavailable</span> : null}
                  </button>);
              })}
            </React.Fragment>))}
        </div>
      </div>

      {people.length === 0 && (
        <div className="sbempty">
          Nobody is schedulable yet. Staff need an active record and a valid agent
          registration before they can be placed on a week.
        </div>)}
    </div>
  );
}
