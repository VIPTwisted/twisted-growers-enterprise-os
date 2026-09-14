/* ---------------------------------------------------------------------------
   SCHEDULE — the archetype layout for every `schedule` page (Bible §12b,
   BP-12b-7). Owner, 14 Sep 2026: one exemplar per archetype, rolled to every
   page of that archetype by data. The exemplar is the 8-week HARVEST CALENDAR
   (harvest_pulls): calendar + list, drag to reschedule with the RULES
   ENFORCED, crew and rooms.

   The rules are rows the owner already holds — harvest_alert_rules
   (late_tolerance_days = 0: "harvests may finish EARLY but must NEVER run
   late … plan a weekend crew, do not slip the date"; early_allowance_days;
   weekend_warning_days; dry_target_days / dry_max_days) and cult_cycle_policy
   per room (cycle_days, stagger_days, harvest_weekday, plants). The database
   applies them in f_harvest_reschedule and answers in words; this page never
   re-implements a rule, it shows the answer. Actuals come from
   v_schedule_compliance (ordinal matching, the measured derivation).

   Every other schedule page (work-order stages, pipeline runs, demand
   forecasts …) renders on the same calendar + list from its own columns, the
   roles learned from public.column_roles (start · end · lane · head · status ·
   qty · lb). Moving is wired only where a rules-enforcing writer exists
   (harvest_pulls today); elsewhere the page says so instead of pretending.

   Shared primitives only (useDataToolbar, pills, .btn, .msg, the Sync/Findings
   strip and expand-in-place). Theme untouched. Every read binds its error.
   Keyboard and phone: every move is also a button + date field; drag is extra.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { useDataToolbar, cellView } from "./App.jsx";

const NO_ROWS = Object.freeze([]);
const label = (c) => String(c || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const num = (v, d = 0) => (v == null || v === "" || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayOf = (v) => (v ? String(v).slice(0, 10) : null);
const addDays = (isoDate, n) => { const d = new Date(`${isoDate}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const fmt = (isoDate) => (isoDate ? new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "—");
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

/* Month grid, Monday first (cult_cycle_policy.week_start = Monday). */
function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  const cells = [];
  for (let i = 0; i < 42; i += 1) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push({ iso: iso(d), inMonth: d.getMonth() === month, dow: i % 7 }); }
  return cells;
}

/* The move dialog — the same words whether it came from a drag or the Move button. */
function MoveBox({ ev, target, onDone, onCancel }) {
  const [date, setDate] = useState(target || ev.harvest_date);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const go = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("f_harvest_reschedule", { p_id: ev.id, p_new_date: date, p_reason: reason });
    setBusy(false);
    if (error || !data?.ok) { setMsg({ kind: "err", text: error?.message || "Not moved." }); return; }
    const warns = Array.isArray(data.warnings) ? data.warnings.map((w) => w.text).join(" ") : "";
    onDone({ kind: warns ? "run" : "ok", text: `Pull ${data.pull_no} (${ev.room_qualified}) moved ${fmt(data.from)} → ${fmt(data.to)} (${data.vs_plan_days === 0 ? "on its plan date" : `${Math.abs(data.vs_plan_days)} day(s) ${data.vs_plan_days < 0 ? "early" : "late"} against the plan`}).${data.next_room_pull ? ` Next ${ev.lane} pull ${data.next_room_pull.pull_no} on ${fmt(data.next_room_pull.date)} is now a ${data.next_room_pull.room_cycle_days}-day cycle.` : ""}${warns ? ` ${warns}` : ""}` });
  };
  return (
    <div className="iq-resolve">
      <label htmlFor={`sc-move-${ev.id}`}>Move pull {ev.pull_no} ({ev.room_qualified}) from {fmt(ev.harvest_date)} — the rules decide (late tolerance, early allowance, weekend, room weekday) and answer in words</label>
      <div className="syncform-row">
        <input id={`sc-move-${ev.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="New pull date" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it moves (ten characters at least) — stays in the ledger" aria-label="Reason" />
        <button type="button" className="btn small primary" disabled={busy || !date || date === ev.harvest_date || reason.trim().length < 10} onClick={go}>{busy ? "Asking the rules…" : "Move it"}</button>
        <button type="button" className="btn small" onClick={onCancel}>Cancel</button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}

function HarvestDetail({ ev, cal, onMove, mayMove }) {
  const [history, setHistory] = useState(null);
  useEffect(() => {
    let live = true;
    supabase.rpc("f_setup_history", { p_table: "harvest_pulls", p_entity_id: ev.id, p_limit: 10 }).then(({ data, error }) => { if (live) setHistory(error ? { error: error.message } : (Array.isArray(data) ? data : [])); });
    return () => { live = false; };
  }, [ev.id]);
  const rules = cal?.rules || {};
  const r = (k) => rules[k] ? `${rules[k].threshold} ${rules[k].unit}` : "—";
  return (
    <div className="cols2 syncfacts" style={{ marginTop: 10 }}>
      <table><tbody>
        <tr><td className="note">Plan</td><td className="wrap">{fmt(ev.harvest_date)}{ev.plan_date && ev.plan_date !== ev.harvest_date ? ` (plan date ${fmt(ev.plan_date)})` : ""} · {ev.room_qualified} · cycle {ev.room_cycle_no} · {num(ev.room_cycle_days)} d since the room’s last pull · {ev.facility_gap_days != null ? `${num(ev.facility_gap_days)} d since the facility’s last pull` : "first pull"}</td></tr>
        <tr><td className="note">Plants · projection</td><td className="wrap">{num(ev.plants)} plants · {num(ev.proj_lb, 1)} lb projected ({num(ev.proj_flower_lb, 1)} lb flower after fresh-frozen)</td></tr>
        <tr><td className="note">Cultivars</td><td className="wrap">{ev.cultivars || "—"}</td></tr>
        <tr><td className="note">Dry window</td><td className="wrap">{fmt(ev.dry_start)} → target day 10 {fmt(ev.dry_day_10)} → limit day 14 {fmt(ev.dry_day_14)} · replant day 2 {fmt(ev.day2_replant)}</td></tr>
        <tr><td className="note">Actual (Metrc)</td><td className="wrap">{ev.actual_date ? `${fmt(ev.actual_date)}${ev.takedown_days > 1 ? ` – ${fmt(ev.takedown_end)} (${ev.takedown_days} days)` : ""} · ${ev.compliance}` : ev.compliance || "no takedown yet"}{ev.matched_by ? <div className="note">{ev.matched_by}{ev.match_note ? ` · ${ev.match_note}` : ""}</div> : null}</td></tr>
        <tr><td className="note">Crew posted</td><td className="wrap">{Number(ev.crew?.shifts) > 0 ? `${ev.crew.people} people, ${ev.crew.shifts} shift(s): ${ev.crew.names}` : <span>none posted for {fmt(ev.harvest_date)} — <a href="/hr/ai-scheduler">post the crew in the HR scheduler</a>{ev.weekend ? " (a weekend landing: the rule asks for a weekend crew or a second shift)" : ""}</span>}</td></tr>
      </tbody></table>
      <table><tbody>
        <tr><td className="note">Rules that decide a move</td><td className="wrap">late tolerance {r("late_tolerance_days")} · early allowance {r("early_allowance_days")} · weekend warning {r("weekend_warning_days")} ahead · dry target {r("dry_target_days")} · dry limit {r("dry_max_days")} · pull overdue after {r("pull_overdue_days")}{ev.policy ? ` · room policy: ${ev.policy.cycle_days}-day cycle, ${ev.policy.stagger_days}-day stagger, ${ev.policy.harvest_weekday}s, ${num(ev.policy.target_plants)} plants` : ""}</td></tr>
        <tr><td className="note">History</td><td className="wrap">
          {history === null && "reading the ledger…"}
          {history?.error && <span className="syncdanger">{history.error}</span>}
          {Array.isArray(history) && history.length === 0 && "no move recorded"}
          {Array.isArray(history) && history.map((h) => <div key={h.id}><b>{new Date(h.at).toLocaleString()}</b> · {h.actor} · {h.action}{h.old_value?.harvest_date ? ` · ${h.old_value.harvest_date} → ${h.new_value?.harvest_date}` : ""}{h.reason ? <div className="note">{h.reason}</div> : null}</div>)}
        </td></tr>
        {mayMove && !ev.actual_date && <tr><td className="note">Move</td><td><button type="button" className="btn small" onClick={onMove}>Move this pull…</button></td></tr>}
        {ev.actual_date && <tr><td className="note">Move</td><td className="note">taken down — the plan date of a harvested pull is history</td></tr>}
      </tbody></table>
    </div>
  );
}

export default function ScheduleScreen({ entry, actions }) {
  const table = entry?.table_ref;
  const isHarvest = table === "harvest_pulls";
  const today = iso(new Date());
  const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [cal, setCal] = useState(null);
  const [calErr, setCalErr] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [move, setMove] = useState(null); // { ev, target }
  const [said, setSaid] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [laneSel, setLaneSel] = useState(null);
  const cells = useMemo(() => monthCells(ym.y, ym.m), [ym]);
  const rangeFrom = cells[0].iso; const rangeTo = cells[41].iso;

  /* harvest: one enriched read; everything else: the shared toolbar over the page's own view */
  const loadCal = useCallback(async () => {
    if (!isHarvest) return;
    const { data, error } = await supabase.rpc("f_harvest_calendar", { p_from: addDays(rangeFrom, -21), p_to: addDays(rangeTo, 21) });
    if (error) { setCalErr(error.message); return; }
    setCalErr(null); setCal(data);
  }, [isHarvest, rangeFrom, rangeTo]);
  useEffect(() => { loadCal(); }, [loadCal]);
  const { rows: fetched, toolbar, total, loadError } = useDataToolbar(isHarvest ? null : table, { limit: 500 });
  const roles = useColumnRoles();
  const generic = Array.isArray(fetched) ? fetched : null;
  const sample = generic && generic.length ? generic[0] : null;
  const col = useMemo(() => {
    const R = roles && !roles.error ? roles : {};
    return { start: pick(sample, R.start), end: pick(sample, R.end), lane: pick(sample, R.lane), head: pick(sample, R.head), status: pick(sample, R.status), qty: pick(sample, R.qty), lb: pick(sample, R.lb), id: pick(sample, R.id) };
  }, [sample, roles]);

  /* one event shape for both modes */
  const events = useMemo(() => {
    if (isHarvest) {
      return (Array.isArray(cal?.pulls) ? cal.pulls : []).map((p) => ({ ...p, key: p.id, start: p.harvest_date, end: p.dry_day_14, lane: p.room_key, head: `Pull ${p.pull_no} · ${p.room_key}`, sub: `${num(p.plants)} plants`, tone: p.actual_date ? (p.days_late > 0 ? "late" : "done") : (p.days_late > 0 ? "overdue" : "plan") }));
    }
    return (generic || NO_ROWS).map((r, i) => ({ key: (col.id && r[col.id]) || `${i}`, row: r, start: col.start ? dayOf(r[col.start]) : null, end: col.end ? dayOf(r[col.end]) : null, lane: col.lane ? r[col.lane] : null, head: col.head ? String(r[col.head]) : `row ${i + 1}`, sub: col.qty ? `${num(r[col.qty])} ${label(col.qty).toLowerCase()}` : col.lb ? `${num(r[col.lb], 1)} lb` : "", tone: col.status && /done|complete|closed|posted/i.test(String(r[col.status] ?? "")) ? "done" : "plan" })).filter((e) => e.start);
  }, [isHarvest, cal, generic, col]);
  const lanes = useMemo(() => Array.from(new Set(events.map((e) => e.lane).filter(Boolean))).sort(), [events]);
  const shown = laneSel ? events.filter((e) => e.lane === laneSel) : events;
  const inMonth = shown.filter((e) => e.start >= cells[0].iso && e.start <= cells[41].iso && cells.find((c) => c.iso === e.start)?.inMonth);
  const byDay = useMemo(() => { const m = {}; for (const e of shown) (m[e.start] ||= []).push(e); return m; }, [shown]);
  const barsByDay = useMemo(() => {
    const m = {};
    for (const e of shown) if (e.end && e.end > e.start) { let d = addDays(e.start, 1); let n = 1; while (d <= e.end && n < 60) { (m[d] ||= []).push({ e, n }); d = addDays(d, 1); n += 1; } }
    return m;
  }, [shown]);
  const mayMove = isHarvest && !!cal?.may_move;
  const weekendLandings = inMonth.filter((e) => e.weekend).length;
  const late = inMonth.filter((e) => e.tone === "late" || e.tone === "overdue").length;
  const crewPosted = isHarvest ? inMonth.filter((e) => Number(e.crew?.shifts) > 0).length : null;
  const monthName = new Date(ym.y, ym.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const shift = (n) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const afterMove = (m) => { setMove(null); setSaid(m); loadCal(); };

  return (
    <>
      <div className="pagehead synchead">
        <div>
          <h1>{entry?.label}</h1>
          <div className="sub">{entry?.description || (isHarvest ? "The 8-week harvest calendar: each pull, its room, plants and dry window, the takedown Metrc recorded against it, and the crew posted. Drag a pull to another day, or use Move — the rules decide and answer in words; every move keeps its reason." : `${label(table)} on a calendar and a list, from the view's own columns.`)}</div>
        </div>
        <div className="synchead-acts">
          <button type="button" className="btn small" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
          <button type="button" className="btn small" onClick={() => { const d = new Date(); setYm({ y: d.getFullYear(), m: d.getMonth() }); }}>Today</button>
          <button type="button" className="btn small" onClick={() => shift(1)} aria-label="Next month">›</button>
          {actions}
        </div>
      </div>

      <div className="sbtotals syncstats">
        <div><b>{inMonth.length}</b><span>{isHarvest ? "pulls" : "items"} in {monthName}</span></div>
        {lanes.map((l) => <button key={l} type="button" className={`syncstat${laneSel === l ? " on" : ""}`} onClick={() => setLaneSel(laneSel === l ? null : l)} title={`Only ${l}`}><b>{events.filter((e) => e.lane === l).length}</b><span>{l}</span></button>)}
        {late > 0 && <div className="hot"><b>{late}</b><span>late or overdue</span></div>}
        {isHarvest && <div className={weekendLandings ? "hot" : ""}><b>{weekendLandings}</b><span>weekend landings</span></div>}
        {isHarvest && <div><b>{crewPosted} / {inMonth.length}</b><span>crews posted</span></div>}
        {isHarvest && cal?.rules?.late_tolerance_days && <div><b>{cal.rules.late_tolerance_days.threshold} d</b><span title={cal.rules.late_tolerance_days.note}>late tolerance (rule)</span></div>}
        {isHarvest && cal?.rules?.early_allowance_days && <div><b>{cal.rules.early_allowance_days.threshold} d</b><span title={cal.rules.early_allowance_days.note}>early allowance (rule)</span></div>}
        {!isHarvest && total != null && <div><b>{num(total)}</b><span>rows on the view</span></div>}
        {!isHarvest && sample && !col.start && <div className="hot"><b>—</b><span title="No date column matched a start role in column_roles">no date column found</span></div>}
      </div>

      {calErr && <div className="msg err" style={{ marginTop: 8 }}>The harvest calendar could not be read: {calErr}</div>}
      {!isHarvest && loadError && <div className="msg err" style={{ marginTop: 8 }}>Nothing could be read from <code>{table}</code>: {loadError}</div>}
      {said && <div className={`msg ${said.kind}`} style={{ marginTop: 8 }}>{said.text}</div>}
      {!isHarvest && toolbar}

      <div className="panel sc-cal" style={{ maxWidth: "none", padding: 0, marginTop: 12 }} role="grid" aria-label={`${monthName} calendar`}>
        <div className="sc-head" role="row">{DOW.map((d) => <div key={d} role="columnheader">{d}</div>)}</div>
        <div className="sc-grid">
          {cells.map((c) => (
            <div key={c.iso} role="gridcell" className={`sc-cell${c.inMonth ? "" : " out"}${c.iso === today ? " today" : ""}${c.dow >= 5 ? " wk" : ""}${dragOver === c.iso ? " over" : ""}`}
                 onDragOver={(e) => { if (mayMove) { e.preventDefault(); setDragOver(c.iso); } }} onDragLeave={() => setDragOver(null)}
                 onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/pull"); const ev = events.find((x) => x.id === id); if (ev && c.iso !== ev.harvest_date) { setOpenId(ev.key); setMove({ ev, target: c.iso }); } }}>
              <div className="sc-day">{Number(c.iso.slice(8))}</div>
              {(barsByDay[c.iso] || []).slice(0, 3).map(({ e, n }) => <div key={`${e.key}-bar`} className={`sc-bar ${e.tone}`} title={isHarvest ? `${e.head}: dry day ${n} of 14` : `${e.head}: day ${n}`}>{isHarvest ? `dry ${e.lane} d${n}` : `${String(e.head).slice(0, 12)} d${n}`}</div>)}
              {(byDay[c.iso] || []).map((e) => (
                <button key={e.key} type="button" className={`sc-ev ${e.tone}${openId === e.key ? " on" : ""}`} draggable={mayMove && !e.actual_date} title={`${e.head} · ${e.sub}${e.compliance ? ` · ${e.compliance}` : ""}`}
                        onDragStart={(ev) => { ev.dataTransfer.setData("text/pull", e.id || ""); ev.dataTransfer.effectAllowed = "move"; }}
                        onClick={() => setOpenId(openId === e.key ? null : e.key)}>
                  <b>{e.head}</b><span>{e.sub}{e.weekend ? " · weekend" : ""}</span>
                </button>
              ))}
              {isHarvest && (byDay[c.iso] || []).length === 0 && shown.some((e) => e.actual_date === c.iso) && shown.filter((e) => e.actual_date === c.iso).map((e) => <div key={`${e.key}-act`} className="sc-bar late" title={`${e.head} taken down here: ${e.compliance}`}>took down {e.lane} (pull {e.pull_no})</div>)}
            </div>
          ))}
        </div>
      </div>

      <div className="mtitle" style={{ marginTop: 16 }}><span className="sq" /><h2>{monthName} — the list</h2><span className="rule" /></div>
      <div className="panel tablewrap" style={{ maxWidth: "none", padding: 0 }}>
        <table className="syncgrid iq">
          <thead><tr>
            <th>Date</th>{lanes.length > 0 && <th>{isHarvest ? "Room" : label(col.lane || "Lane")}</th>}<th>Item</th><th>{isHarvest ? "Plants · lb" : label(col.qty || col.lb || "Qty")}</th>{isHarvest && <th>Dry window</th>}{isHarvest && <th>Actual (Metrc)</th>}{isHarvest && <th>Crew</th>}<th style={{ textAlign: "right" }}>Actions</th>
          </tr></thead>
          <tbody>
            {isHarvest && cal === null && !calErr && <tr><td colSpan={8} className="note">Loading…</td></tr>}
            {!isHarvest && generic === null && !loadError && <tr><td colSpan={8} className="note">Loading…</td></tr>}
            {(isHarvest ? cal !== null : generic !== null) && inMonth.length === 0 && <tr><td colSpan={8} className="note">Nothing planned in {monthName}{laneSel ? ` for ${laneSel}` : ""}.</td></tr>}
            {inMonth.sort((a, b) => a.start.localeCompare(b.start)).map((e) => {
              const open = openId === e.key;
              const toggle = () => setOpenId(open ? null : e.key);
              return (
                <React.Fragment key={e.key}>
                  <tr className={`syncrow${open ? " on" : ""}`} onClick={toggle} role="button" tabIndex={0} aria-expanded={open}
                      onKeyDown={(k) => { if (k.target === k.currentTarget && (k.key === "Enter" || k.key === " ")) { k.preventDefault(); toggle(); } }}>
                    <td>{fmt(e.start)}{e.weekend ? <span className="pill run" style={{ marginLeft: 6 }}>weekend</span> : null}</td>
                    {lanes.length > 0 && <td>{e.lane ?? "—"}</td>}
                    <td className="wrap"><b>{e.head}</b>{isHarvest && e.cultivars ? <div className="note iq-detail">{String(e.cultivars).slice(0, 120)}</div> : null}</td>
                    <td>{isHarvest ? `${num(e.plants)} · ${num(e.proj_lb, 1)} lb` : e.sub || "—"}</td>
                    {isHarvest && <td>{fmt(e.dry_start)} → {fmt(e.dry_day_14)}</td>}
                    {isHarvest && <td className="wrap">{e.actual_date ? <span className={`pill ${e.days_late > 0 ? "err" : "ok"}`}>{e.compliance}</span> : e.days_late > 0 ? <span className="pill err">{e.compliance}</span> : <span className="pill muted">{e.compliance || "scheduled"}</span>}</td>}
                    {isHarvest && <td>{Number(e.crew?.shifts) > 0 ? `${e.crew.people} people` : <span className="note">none posted</span>}</td>}
                    <td className="syncacts">
                      {mayMove && !e.actual_date && <button type="button" className="btn small" onClick={(k) => { k.stopPropagation(); setOpenId(e.key); setMove({ ev: e, target: null }); }}>Move</button>}
                      <button type="button" className="btn ghost small" onClick={(k) => { k.stopPropagation(); toggle(); }} aria-label={open ? "Close" : "Open"}>{open ? "▴" : "▾"}</button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="syncexpand"><td colSpan={8}>
                      <div className="syncdetail">
                        {isHarvest
                          ? <HarvestDetail ev={e} cal={cal} mayMove={mayMove} onMove={() => setMove({ ev: e, target: null })} />
                          : (
                            <table className="p360-facts iq-all"><tbody>
                              {Object.keys(e.row).filter((c) => c !== "raw" && typeof e.row[c] !== "object").map((c) => <tr key={c}><td className="note">{label(c)}</td><td className="wrap">{cellView(c, e.row[c])}</td></tr>)}
                            </tbody></table>
                          )}
                        {move && move.ev.key === e.key && <MoveBox ev={move.ev} target={move.target} onDone={afterMove} onCancel={() => setMove(null)} />}
                        {!isHarvest && <div className="note" style={{ marginTop: 8 }}>Moving is not wired for this schedule yet — a move needs a rules-enforcing writer like the harvest calendar’s, and none exists for <code>{table}</code>.</div>}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {isHarvest && Array.isArray(cal?.rooms) && cal.rooms.length > 0 && (
        <div className="note" style={{ marginTop: 8 }}>Rooms (cult_cycle_policy): {cal.rooms.map((r) => `${r.room_key} ${r.cycle_days}-day cycle, ${r.stagger_days}-day stagger, ${r.harvest_weekday}s, ${num(r.target_plants)} plants`).join(" · ")}.</div>
      )}
      <div className="note" style={{ marginTop: 4 }}>Source: <code>{table}</code>{isHarvest ? " · f_harvest_calendar (rules from harvest_alert_rules and cult_cycle_policy, actuals from v_schedule_compliance, crew from hr.shifts) · moves through f_harvest_reschedule, recorded in audit_events" : ` · roles from column_roles${col.start ? ` · start = ${col.start}` : ""}${col.end ? ` · end = ${col.end}` : ""}${col.lane ? ` · lane = ${col.lane}` : ""}`}.</div>
    </>
  );
}
