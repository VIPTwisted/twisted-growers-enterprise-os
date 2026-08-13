/* ═══════════════════════════════════════════════════════════════════════════
   SCHEDULE ADHERENCE AND THE COST OF A LATE PULL — Agent B, 13 Aug 2026.

   Owner, 13 Aug 2026, relayed by Agent I: "WE NEED KPI'S, DRILL DOWNS AND FULL
   DETAILED REPORTS ON THIS CRITICAL VERY IMPORTANT FACTOR OF OUR OPERATIONS
   THIS MUST BE WATCHED CLOSELY TO STOP THE BLEED."

   And the rule the whole page is shaped around, which is deliberately
   asymmetric: a harvest may come down a few days EARLY and needs no
   explanation. It may never come down LATE. "EVERYTHING MUST STRICLY FOLLOW
   THIS." A page reporting "days off schedule" as one absolute number would hide
   the only distinction that matters, so early and late are never summed here,
   never netted against each other, and never share a colour.

   WHY LATE COSTS MORE THAN IT LOOKS. A late take-down holds the room, and the
   room is the constraint. Every day late is a day the next cycle does not
   start, so lateness compounds down the calendar while earliness does not.

   ── THIS FILE COMPUTES NO BUSINESS FIGURE ──────────────────────────────────
   Every number on this page is read from a view and rendered as served. The
   page decides which period to show and how to lay it out; it never decides
   what a figure is. Reads:

     v_schedule_cost_by_period  the period figures behind the key-figure strip
     v_schedule_cost_detail     one row per pull HARVESTED LATE — cost and drill
     v_schedule_compliance      every scheduled pull and how it actually landed
     v_schedule_adherence       the drying rows and the sentence explaining them
     v_harvest_takedown         what physically came down, per room, per takedown
     v_schedule_variance        the recorded reason, the accountable person
     v_schedule_revisions       every date change and the disruption behind it
     v_room_turn_audit          observed room cycle against the planned one
     v_room_board_complete      the department that qualifies every room name
     conversion_factors         the planned cycle, its provenance and who set it
     reason_code_catalog        the reason list — never free text
     kpi_targets                the owner-set target the rails are driven from
     correction_proposal        corrections OPEN against the views above
     v_tile_drill_status        whether the database re-derives these tiles yet
     v_dashboard_tasks          work raised from these tiles

   Writes, both already built by the data layer and neither invented here:
     tg_record_schedule_variance        record or edit WHY a pull ran late
     tg_shift_schedule_after_disruption rebaseline a room after a lights-out

   ── THE TWO POPULATIONS, WHICH ARE NOT THE SAME AND ARE NEVER MERGED ───────
   The cost views answer "what did a late take-down cost", and by their own
   definition they carry a row only where a pull HAS come down and came down
   after its date. A pull that has not come down at all is therefore absent from
   every cost figure on this page — and those are the worst ones, because their
   lateness is open-ended and grows every night at midnight.

   So the strip carries them as their own figure, beside the cost figures and
   explicitly OUTSIDE them, and the adherence band gives them their own state
   rather than filing them under "not yet happened" next to a pull scheduled for
   December. A room that is months overdue and a room that is not due until the
   winter are opposite facts; one word for both would be the whole page failing
   quietly.

   ── DRIFT, NOT SCATTER ─────────────────────────────────────────────────────
   Agent I, 13 Aug 2026: "This is cumulative drift, not scattered misses, and
   the page should read that way. A tile showing a per-pull average hides the
   only thing that matters." Nothing on this page averages days late. The drift
   section draws one bar per pull IN SCHEDULE ORDER so the shape is visible,
   and the figures beside it are sums the database served, never means this
   page worked out.

   ── FIGURES UNDER CORRECTION ARE DECLARED, NOT DESCRIBED ───────────────────
   The banner at the top reads correction_proposal and renders the register's
   own words for anything open against these views. Nothing about any specific
   defect is written into this file: a warning typed into a component goes
   stale, and a stale warning on a corrected figure is its own defect. The
   banner appears while a correction is open and disappears when it is applied.

   ── SHARE PRIMITIVES, NEVER LAYOUTS ────────────────────────────────────────
   The chips, panels, drill, way-back, tables, buttons, inputs and empty states
   are dashkit's and the Command Center's — one definition each, used here. The
   KEY-FIGURE STRIP is this page's own, deliberately: DkKpiStrip states on its
   face that its figures come from mv_department_dashboard and cover "all data,
   all time", and both claims would be false here. A shared primitive that
   asserts something untrue about a page's data is worse than a second layout,
   so the strip is local and every atom inside it is the shared one.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { DateRangeSelect, AssignTask } from "./App.jsx";
import {
  grab, listOf, DkTag, DkErr, DkEmpty, DkDrill, DrillRoot, DkCaret, DkHead, dkFmt,
  dkRoomQualified, useWidgetLayout, Widget, WidgetBoard, WidgetBarControls,
  useSectionStore, DkNarrative, DkTasks, DkReports,
} from "./dashkit.jsx";
import "./dash-schedule.css";

const DEPT = "Cultivation";
const VIEW_KEY = "schedule_adherence";
const PAGE_KEY = "schedule_adherence";
/* The event type the cost views are built on. v_schedule_cost_detail is
   Pull-only by its own definition, so the variance join is keyed with it. */
const PULL = "Pull";
/* Every schedule object on this page descends from one root view, so an open
   correction naming any schedule object is a correction against these figures. */
const CORRECTION_TARGET = "%schedule%";

/* ═══════════════════════════════════════════════════════════════════════════
   THE MEASURES. One entry per column this page knows how to render.

   IT IS A REGISTRY, AND IT ANNOUNCES WHAT IT DOES NOT KNOW. Agent I, 13 Aug
   2026: "There will be TWO money figures, and the owner must choose which the
   dollar tile shows … build the tile so the label is data-driven, because I do
   not yet know which he will pick."

   So a tile renders only if its column is actually present on the served row,
   its label is the view's own `<column>_basis` wherever the view serves one,
   and any column the view serves that this registry does not know about is
   NAMED ON SCREEN as unrendered. Four fixed tiles would let a new money figure
   land in the view and never reach a screen with nothing saying so, and a
   figure that can disappear in silence is the defect this platform keeps
   paying for.
   ═══════════════════════════════════════════════════════════════════════════ */
const MEASURES = [
  {
    col: "late_pulls", label: "Pulls harvested late", unit: "pulls",
    /* The one owner-set target that exists for this page, matched by the name
       it carries in kpi_targets. The tile names the target it reports against,
       so nobody has to trust an unstated mapping. */
    targetKpi: "Schedule violations",
    what: "Pulls that came down AFTER their scheduled date. A pull that has not come down at all is not in here — it is the figure at the end of this strip.",
  },
  {
    col: "days_late", label: "Days late", unit: "days",
    what: "Every late day added together across those pulls. This is room-time the constraint lost, and it is a sum, never an average — an average across pulls would hide drift, which is the shape this actually has.",
  },
  {
    col: "pounds_at_risk", label: "Pounds at risk", unit: "lb",
    what: "That room-time expressed in pounds, at the target dried yield per room-day. This is the DISCIPLINE measure and it is true whatever the calendar later absorbs.",
    pair: "whole_cycles_lost",
  },
  {
    col: "dollars_at_risk", label: "Dollars at risk", unit: "$",
    what: "Those pounds at the cost per pound in force on the day of the pull. It is a cost basis, not a lost sale.",
  },
];
/* The columns that identify a row rather than measure anything. */
const SHAPE_COLS = ["period_type", "period_start", "cost_per_lb_used"];
const KNOWN_COLS = new Set([
  ...MEASURES.map((m) => m.col),
  ...MEASURES.map((m) => m.pair).filter(Boolean),
  ...SHAPE_COLS,
]);

const PERIODS = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
];

/* Which period each chip means, resolved from this device's clock. It picks
   WHICH SERVED ROW to show and computes no figure. The three period columns on
   v_schedule_cost_detail are truncated to the first of the month, of the
   quarter and of the year, so the same three keys address both views. */
const MONTHS_IN_QUARTER = 3;
function currentPeriodStarts(now) {
  const yr = now.getFullYear();
  const mo = now.getMonth();
  const first = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return {
    month: first(yr, mo),
    quarter: first(yr, Math.floor(mo / MONTHS_IN_QUARTER) * MONTHS_IN_QUARTER),
    year: first(yr, 0),
  };
}

const D = (v) => (v === null || v === undefined || v === "" ? null : String(v).slice(0, 10));
const NUM1 = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 });
const MONEY = (v) => `$${Math.round(Number(v)).toLocaleString()}`;
/* A period start rendered for a human FROM THE SERVED STRING ALONE — never
   parsed into a date object, because a bare date parsed as UTC and printed in
   local time slips a day and would relabel a whole quarter. */
const MONTH_NAME = { "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
  "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec" };
const QUARTER_NAME = { "01": "Q1", "04": "Q2", "07": "Q3", "10": "Q4" };
function periodText(periodType, start) {
  const s = D(start);
  if (!s) return "period not served";
  const y = s.slice(0, 4);
  const m = s.slice(5, 7);
  if (periodType === "year") return y;
  if (periodType === "quarter") return `${QUARTER_NAME[m] ?? `quarter from ${s}`} ${y}`;
  return `${MONTH_NAME[m] ?? m} ${y}`;
}

/* Room identity is licence plus name — eleven names exist in both buildings, so
   a bare name is the wrong room roughly two thirds of the time. One helper, so
   no call site on this page can forget (J7). */
const qualify = (deptOf, name) => dkRoomQualified({ room: name, department: deptOf.get(name) });
/* A stable row key that never interpolates a room name into a template. */
const rowKey = (...parts) => parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("|");

/* ═══════════════════════════════════════════════════════════════════════════
   OPEN CORRECTIONS AGAINST THE VIEWS THIS PAGE READS.

   Rendered VERBATIM and above every figure — a reader who sees the number
   before the correction has already formed a view. Filtered on `applied_at is
   null`, a real column, rather than on a list of status words this page would
   have to keep in step with the register.
   ═══════════════════════════════════════════════════════════════════════════ */
function OpenCorrections({ rows, err }) {
  if (err) return <DkErr what="Open corrections against these views" err={err} />;
  if (!rows.length) {
    return (
      <DkEmpty
        why="No correction is open against the schedule views right now."
        fills="This panel reads correction_proposal for anything raised against a schedule object and not yet applied. It is empty because nothing is filed — not because nothing was checked."
      />
    );
  }
  return (
    <div className="cc-inst-list">
      {rows.map((c) => (
        <div key={c.id} className={`cc-inst ${c.severity === "critical" ? "crit" : c.severity === "elevated" ? "warn" : "attn"}`}>
          <div className="cc-inst-what">
            These figures are under correction — {c.severity} — raised by {c.raised_by} on {D(c.raised_at)}, status {c.status}
          </div>
          <div className="cc-inst-line"><b>What it targets:</b> {c.target_object}</div>
          <div className="cc-inst-line"><b>The issue, in the register&rsquo;s own words:</b> {c.the_issue}</div>
          {c.the_evidence && <div className="cc-inst-line"><b>Evidence:</b> {c.the_evidence}</div>}
          {c.what_needs_fixing && <div className="cc-inst-line"><b>What needs fixing:</b> {c.what_needs_fixing}</div>}
          {c.the_proposal && <div className="cc-inst-line"><b>The proposal:</b> {c.the_proposal}</div>}
          {c.how_it_never_repeats && <div className="cc-inst-line dim"><b>How it never repeats:</b> {c.how_it_never_repeats}</div>}
          <div className="cc-inst-meta">
            {c.rows_affected != null && <span>{Number(c.rows_affected).toLocaleString()} rows affected</span>}
            {c.pounds_affected != null && <span>{NUM1(c.pounds_affected)} lb affected</span>}
            {c.dollars_affected != null && <span>{MONEY(c.dollars_affected)} affected</span>}
            {c.reversible != null && <span>{c.reversible ? "reversible" : "not reversible"}</span>}
          </div>
          <div className="sch-said crit">
            Every figure on this page is still shown exactly as the view serves it. Nothing here is
            adjusted to compensate — a front end that quietly corrects a number puts a second
            authority on it, and then neither can be trusted. The correction belongs in the view.
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE KEY FIGURES — rule 10, every clause, for a period-scoped view.

   Large number · unit · plain-language label · the OWNER-SET target where one
   exists and an honest "no target set" where none does · the exact records in
   place on one press · assign to a named person capturing the value as it
   stood · and, where a period carries no row at all, the WORD for that rather
   than a zero this page made up.
   ═══════════════════════════════════════════════════════════════════════════ */
function KeyFigures({ row, periodKey, periodStart, targets, openKey, onOpen, onAssigned, pastDue }) {
  const present = MEASURES.filter((m) => row === null || Object.prototype.hasOwnProperty.call(row, m.col));
  /* Anything the view serves that this page cannot render. Named, never dropped. */
  const unrendered = row
    ? Object.keys(row).filter((k) => !KNOWN_COLS.has(k) && !k.endsWith("_basis"))
    : [];
  const noTarget = present.filter((m) => !m.targetKpi || !targets[m.targetKpi] || targets[m.targetKpi].target == null).length;
  const periodName = periodText(periodKey, periodStart);
  return (
    <div className="cc-kpiwrap">
      <div className="cc-striphead">
        <span className="cc-striplabel">Key figures — {periodName}</span>
        <DkTag tone="neutral">{present.length + 1} figures</DkTag>
        <DkTag tone="info"
          title="Read from v_schedule_cost_by_period, one row per period, computed by the database at the moment this page asked for it. They honour the period picked above. Nothing on this page is aggregated in the browser.">
          period-scoped, computed by the database ⓘ
        </DkTag>
        {noTarget > 0 && (
          <DkTag tone="attn"
            title="A figure with no owner-set target cannot show a red rail, because there is nothing to breach. Targets are rows in kpi_targets set by a person; this platform never invents one. Set them on the Goals and Targets page.">
            {noTarget} with no owner-set target ⓘ
          </DkTag>
        )}
        {unrendered.map((k) => (
          <DkTag key={k} tone="crit"
            title={`v_schedule_cost_by_period now serves a column called “${k}” and this page has no tile for it, so its figure is NOT on screen. Nothing was dropped quietly — this chip is the reason it is missing. Add it to the MEASURES registry in dash-schedule.jsx.`}>
            served but not rendered: “{k}” ⓘ
          </DkTag>
        ))}
      </div>
      <div className="cc-kpi-strip">
        {present.map((m) => {
          const tg = m.targetKpi ? targets[m.targetKpi] : null;
          const served = row ? row[m.col] : null;
          const missing = row === null || served === null || served === undefined;
          const offTarget = !missing && tg && tg.target != null &&
            (tg.direction === "at_most" ? Number(served) > Number(tg.target) : Number(served) < Number(tg.target));
          const basis = row ? row[`${m.col}_basis`] : null;
          const open = openKey === m.col;
          const pairVal = m.pair && row ? row[m.pair] : null;
          return (
            <div key={m.col} className={`cc-kpi ${open ? "on" : ""}`}>
              <button className="cc-kpi-open" type="button" onClick={() => onOpen(open ? null : m.col)} aria-expanded={open}
                title={`${m.what} ${open ? "Press again to close; the records are listed below the strip." : "Press for the exact records behind this figure, in place, below the strip."}`}>
                <span className="cc-kpi-lbl">{basis ?? m.label}</span>
                <span className="cc-kpi-line">
                  {missing ? (
                    <b className="cc-kpi-val plain">none recorded</b>
                  ) : (
                    <>
                      <b className={`cc-kpi-val ${offTarget ? "crit" : "plain"}`}>{dkFmt(served, m.unit)}</b>
                      {m.unit !== "$" && <em className="cc-kpi-unit">{m.unit}</em>}
                    </>
                  )}
                  <em className="cc-kpi-nohist"
                    title="A trend line is drawn only from real repeated snapshots of the same figure. None is held for these figures, so no line is drawn on the tile and none is invented. Period-to-period movement is in the trend section below, drawn from the served period rows themselves.">
                    no daily history — trend is below
                  </em>
                </span>
                {tg && tg.target != null ? (
                  <span className={`cc-kpi-target ${offTarget ? "crit" : ""}`}
                    title={`This tile reports against the owner-set target named “${tg.kpi}” in kpi_targets. Set by ${tg.set_by ?? "a person, not recorded"}.`}>
                    target {tg.direction === "at_most" ? "no more than" : "at least"} {Number(tg.target).toLocaleString()}
                    {missing ? " — nothing to breach" : offTarget ? " — OVER" : " — within"}
                    {" "}· measured against “{tg.kpi}”
                  </span>
                ) : (
                  <span className="cc-kpi-target none"
                    title="Nobody has set a target for this figure, so there is no rail to breach and this page offers no judgement of its own. Set one on the Goals and Targets page.">
                    no target set
                  </span>
                )}
                <span className="cc-kpi-ctx">
                  {missing
                    ? `No pull was harvested late in ${periodName}. v_schedule_cost_by_period carries a row only for a period in which one was, so this is an ABSENCE OF ROWS and not a zero this page worked out. Press to see that for yourself.`
                    : m.what}
                </span>
                {m.unit === "$" && !basis && (
                  <span className="cc-kpi-ctx"
                    title="Two money measures are under consideration for this tile and the owner has not ruled between them. Until the view serves a basis column beside the figure, this page will not assert which one it is showing — naming it would be this page deciding a question that is not its to decide.">
                    <b>The view serves this money figure with no basis beside it</b>, so which measure of
                    money it is has not been stated by the database and is not asserted here.
                  </span>
                )}
                <span className="cc-kpi-pair-go">
                  {open ? "Close — the records are below" : "Open the exact records →"}
                </span>
              </button>
              {m.pair && (
                <div className="sch-pair">
                  <span className="sch-pair-rule">never added to the figure above — a different question</span>
                  <span className="cc-kpi-lbl">Whole cycles lost</span>
                  <span className="cc-kpi-line">
                    <b className="cc-kpi-val plain">
                      {pairVal === null || pairVal === undefined ? "none recorded" : dkFmt(pairVal, "")}
                    </b>
                  </span>
                  <span className="cc-kpi-ctx">
                    A whole cycle is lost only once a pull slips a complete room cycle, so this figure
                    moves in steps and sits still in between. <b>A low figure here is not
                    reassurance</b> — it has been flagged as close to a measure that can almost never
                    fire, and it may be replaced. Pounds at risk above is the measure that is true
                    every day.
                  </span>
                </div>
              )}
              <span className="cc-kpi-assign">
                <AssignTask dept={DEPT} kpi={`${basis ?? m.label} — ${periodName}`}
                  value={missing ? null : served} unit={m.unit} drill={VIEW_KEY} onDone={onAssigned} />
              </span>
            </div>
          );
        })}

        {/* THE FIGURE THE COST VIEWS CANNOT SEE. It sits in the strip because it
            is the most urgent number on the page, and it carries the rule line
            saying it is outside every figure beside it. */}
        <div className={`cc-kpi ${openKey === "pastdue" ? "on" : ""}`}>
          <button className="cc-kpi-open" type="button" onClick={() => onOpen(openKey === "pastdue" ? null : "pastdue")}
            aria-expanded={openKey === "pastdue"}
            title="Pulls whose scheduled date has passed and which have not come down at all. Their lateness has no end date yet, so it is measured from today and grows every night.">
            <span className="sch-pair-rule">counted in none of the figures beside this one</span>
            <span className="cc-kpi-lbl">Past due, not harvested</span>
            <span className="cc-kpi-line">
              <b className={`cc-kpi-val ${pastDue.count > 0 ? "crit" : "plain"}`}>{pastDue.count.toLocaleString()}</b>
              <em className="cc-kpi-unit">pulls</em>
            </span>
            <span className={`cc-kpi-target ${pastDue.days > 0 ? "crit" : ""}`}>
              {pastDue.days.toLocaleString()} days past schedule and still counting
            </span>
            <span className="cc-kpi-ctx">
              A pull that has not come down is absent from every cost figure on this page, because
              those views carry a row only once a take-down exists to measure. These are the worst
              ones: their lateness is open-ended, it is measured from today, and it grows every night
              at midnight whether or not anyone looks.
            </span>
            <span className="cc-kpi-pair-go">
              {openKey === "pastdue" ? "Close — the rooms are below" : "Open every room that is standing →"}
            </span>
          </button>
          <span className="cc-kpi-assign">
            <AssignTask dept={DEPT} kpi="Past due, not harvested" value={pastDue.count} unit="pulls"
              drill={VIEW_KEY} onDone={onAssigned} />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ONE DEFINITION OF THE COST LIST, used by every cost tile drill AND by the
   full detail report. A tile that opened a different table from the report
   would be two answers to one question.

   Reason and accountability come from v_schedule_variance, joined on the same
   three keys the write function uses. Where no reason has been recorded the row
   shows the VIEW'S OWN sentence saying so — never a blank and never a dash.
   ═══════════════════════════════════════════════════════════════════════════ */
const DETAIL_PAGE = 100;
function useLatePulls(filterCol, filterVal) {
  const [state, setState] = useState({ rows: null, total: null, err: null });
  const [pages, setPages] = useState(1);
  useEffect(() => { setPages(1); }, [filterCol, filterVal]);
  useEffect(() => {
    let live = true;
    let q = supabase.from("v_schedule_cost_detail").select("*", { count: "exact" });
    if (filterCol && filterVal) q = q.eq(filterCol, filterVal);
    q.order("scheduled_date", { ascending: false })
      .range(0, pages * DETAIL_PAGE - 1)
      .then(({ data, error, count }) => {
        if (!live) return;
        if (error) { setState({ rows: null, total: null, err: error.message }); return; }
        setState({ rows: listOf(data), total: count === null ? null : Number(count), err: null });
      });
    return () => { live = false; };
  }, [filterCol, filterVal, pages]);
  const more = useCallback(() => setPages((p) => p + 1), []);
  return { rows: state.rows, total: state.total, err: state.err, more };
}

function LatePullTable({ rows, total, err, onMore, deptOf, variance, onRecord, what }) {
  if (err) return <DkErr what={`Every pull harvested late in ${what}`} err={err} />;
  if (rows === null) return <div className="cc-fine">Reading every pull harvested late in {what}…</div>;
  if (!rows.length) {
    return (
      <DkEmpty
        why={`No pull was harvested late in ${what}.`}
        fills="v_schedule_cost_detail carries one row per pull whose take-down began after its scheduled date, and it returned none for this population."
        action={<span className="sch-said">This says nothing about pulls that have NOT come down. Those are counted separately in the strip above, because a view that measures a take-down cannot see a take-down that never happened.</span>}
      />
    );
  }
  const more = total !== null && rows.length < total;
  return (
    <>
      <div className="cc-fine">
        {total !== null
          ? <>Showing <b>{rows.length.toLocaleString()}</b> of <b>{total.toLocaleString()}</b> late pulls
              in <b>{what}</b>, most recent first. Every one is listed individually; nothing is grouped
              away and nothing is capped.</>
          : <>Showing <b>{rows.length.toLocaleString()}</b> late pulls in <b>{what}</b>. The database served no
              exact count with them, so this list cannot promise to be complete and will not present what
              arrived as the total.</>}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Room</th><th>Cultivars</th><th>Planned</th><th>Came down</th><th>Days late</th>
            <th>Pounds at risk</th><th>Cost per pound then</th><th>Dollars at risk</th>
            <th>Whole cycles lost</th><th>Planned pounds for this pull</th>
            <th>Reason recorded</th><th>Accountable</th><th>Record or edit the reason</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const name = r.room;
              const key = rowKey(name, D(r.scheduled_date));
              const v = variance.get(key);
              return (
                <tr key={key}>
                  <td>{qualify(deptOf, name)}</td>
                  <td className="note">{r.cultivars || "no cultivar recorded against this pull"}</td>
                  <td>{D(r.scheduled_date)}</td>
                  <td>{D(r.actual_date)}</td>
                  <td className="bad">{Number(r.days_late).toLocaleString()}</td>
                  <td>{NUM1(r.pounds_at_risk)} lb</td>
                  <td>{r.cost_per_lb_then == null ? "no cost rate in force on that date" : `$${NUM1(r.cost_per_lb_then)}`}</td>
                  <td>{MONEY(r.dollars_at_risk)}</td>
                  <td>{Number(r.whole_cycles_lost).toLocaleString()}</td>
                  <td>{v && v.planned_lbs != null ? `${NUM1(v.planned_lbs)} lb` : "not served for this pull"}</td>
                  <td className="note">
                    {v && v.reason
                      ? <>{v.reason}{v.note ? <> — {v.note}</> : null}</>
                      : v && v.what_is_missing
                        ? v.what_is_missing
                        : "No variance row exists for this pull at all, so not even the absence has been written down. Recording a reason here creates the row."}
                  </td>
                  <td>{v && v.accountable ? v.accountable : "Nobody named yet — a violation with no owner cannot be closed."}</td>
                  <td>
                    <button className="cc-btn" type="button" onClick={() => onRecord({
                      event_type: PULL, room: name, scheduled_date: D(r.scheduled_date),
                      cultivars: r.cultivars, days_late: r.days_late, existing: v,
                    })}>
                      {v && v.reason ? "Edit the reason" : "Record why"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {more && (
        <button className="cc-btn" type="button" onClick={onMore}>
          Show the next {Math.min(DETAIL_PAGE, total - rows.length).toLocaleString()} late pulls
          ({(total - rows.length).toLocaleString()} still unread)
        </button>
      )}
    </>
  );
}

function LatePulls({ filterCol, filterVal, what, deptOf, variance, onRecord }) {
  const q = useLatePulls(filterCol, filterVal);
  return (
    <LatePullTable rows={q.rows} total={q.total} err={q.err} onMore={q.more}
      deptOf={deptOf} variance={variance} onRecord={onRecord} what={what} />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE SCHEDULE TABLE — a different question from the cost table, so a different
   table. This one answers "where does every scheduled pull stand", including
   the ones with no take-down at all, which the cost table cannot represent.
   ═══════════════════════════════════════════════════════════════════════════ */
function PullStateTable({ rows, deptOf, onRecord }) {
  return (
    <>
      <div className="cc-fine">
        Showing <b>{rows.length.toLocaleString()}</b> of <b>{rows.length.toLocaleString()}</b> scheduled
        events in this state — the whole set, read in one go and not paged.
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Pull</th><th>Room</th><th>Cultivars</th><th>Scheduled</th><th>Take-down began</th>
            <th>Take-down ended</th><th>Days it ran</th><th>Days late</th><th>Days early</th>
            <th>Planned pounds</th><th>How it was matched</th><th>What the database says</th>
            <th>Record or edit the reason</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const name = r.room;
              return (
                <tr key={rowKey(r.event_type, name, D(r.scheduled_date), i)}>
                  <td>{r.pull_no == null ? "not numbered" : r.pull_no}</td>
                  <td>{qualify(deptOf, name)}</td>
                  <td className="note">{r.cultivars || "no cultivar recorded"}</td>
                  <td>{D(r.scheduled_date)}</td>
                  <td>{D(r.actual_date) ?? "has not come down"}</td>
                  <td>{D(r.takedown_end) ?? "has not come down"}</td>
                  <td>{r.takedown_days == null ? "not applicable" : `${Number(r.takedown_days).toLocaleString()} days`}</td>
                  <td className={Number(r.days_late) > 0 ? "bad" : undefined}>
                    {r.days_late == null ? "not measurable for this row" : Number(r.days_late).toLocaleString()}
                  </td>
                  <td>{r.days_early == null ? "not measurable for this row" : Number(r.days_early).toLocaleString()}</td>
                  <td>{r.planned_lbs == null ? "not planned" : `${NUM1(r.planned_lbs)} lb`}</td>
                  <td className="note">{r.matched_by || "the view served no matching basis for this row"}</td>
                  <td className="note">
                    {r.compliance || "the view served no verdict on this row, which is itself a gap and is filed rather than filled in here"}
                    {r.match_note ? <> — {r.match_note}</> : null}
                  </td>
                  <td>
                    <button className="cc-btn" type="button" onClick={() => onRecord({
                      event_type: r.event_type, room: name, scheduled_date: D(r.scheduled_date),
                      cultivars: r.cultivars, days_late: r.days_late, existing: null,
                    })}>Record why</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOW EVERY SCHEDULED EVENT LANDED.

   PAST DUE AND NOT HARVESTED IS ITS OWN STATE. A room months overdue and a room
   not due until the winter are opposite facts, and filing both under "not yet
   happened" is the whole page failing quietly. The two are separated by
   whether the database put a number in days_late, not by reading its prose.

   DRYING IS UNMEASURED, NOT COMPLIANT. A dry event's actual date is computed
   as harvest start plus the drying window, so it can never differ from plan —
   the window itself ends up wearing the word "late". No verdict is offered on
   those rows. Rendering them as a zero would be a lie; rendering them green
   would be worse.

   EVERY BRANCH IS ON A REAL COLUMN — event_type, actual_date, days_late,
   days_early — never on a match against the prose in `compliance`.
   ═══════════════════════════════════════════════════════════════════════════ */
const BANDS = [
  { key: "pastdue", label: "Past due, not harvested", tone: "crit",
    test: (r) => r.event_type === PULL && r.actual_date === null && Number(r.days_late) > 0,
    why: "The scheduled date has passed and nothing has come down. Lateness here has no end date: it is measured from today and grows every night. These rooms are also invisible to every cost figure on this page." },
  { key: "late", label: "Came down late — violation", tone: "crit",
    test: (r) => r.event_type === PULL && r.actual_date !== null && Number(r.days_late) > 0,
    why: "The one direction the owner's rule forbids. Each of these needs a reason, an owner and a corrective action." },
  { key: "onday", label: "On the day", tone: "ok",
    test: (r) => r.event_type === PULL && r.actual_date !== null && Number(r.days_late) === 0 && Number(r.days_early) === 0,
    why: "Came down on the scheduled date." },
  { key: "early", label: "Early — acceptable", tone: "ok",
    test: (r) => r.event_type === PULL && r.actual_date !== null && Number(r.days_early) > 0,
    why: "Acceptable and needs no explanation. Early is never added to late and never nets it off." },
  { key: "ahead", label: "Still ahead of us", tone: "info",
    test: (r) => r.event_type === PULL && r.actual_date === null && !(Number(r.days_late) > 0),
    why: "Scheduled, and its date has not arrived. Nothing to judge yet." },
  { key: "unmeasured", label: "Not measured at all", tone: "attn",
    test: (r) => r.event_type !== PULL,
    why: "A drying event's completion is computed rather than observed, so it cannot disagree with plan and no verdict is offered on it. Not measured is not the same as compliant, and it is never shown as a zero and never shown as green." },
];

function bandOf(row) {
  const b = BANDS.find((x) => x.test(row));
  return b ? b.key : null;
}

function AdherenceBand({ rows, err, deptOf, said, onRecord, openBand, setOpenBand }) {
  if (err) return <DkErr what="How every scheduled event landed" err={err} />;
  if (!rows.length) {
    return <DkEmpty why="No scheduled event carries a date."
      fills="v_schedule_compliance reads the harvest schedule; with nothing scheduled there is nothing to measure." />;
  }
  const grouped = BANDS.map((b) => ({ ...b, rows: rows.filter(b.test) }));
  const unclassified = rows.filter((r) => bandOf(r) === null);
  const shown = grouped.find((b) => b.key === openBand);
  return (
    <>
      <div className="cc-minitiles">
        {grouped.map((b) => (
          <button key={b.key} className={`cc-mini ${openBand === b.key ? "on" : ""}`} type="button"
            onClick={() => setOpenBand(openBand === b.key ? null : b.key)} aria-expanded={openBand === b.key}
            title={`${b.why} ${openBand === b.key ? "Press again to close." : "Press for every event in this state."}`}>
            <span className="cc-mini-lbl"><DkCaret open={openBand === b.key} />{b.label}</span>
            <span className={`cc-mini-val ${b.tone === "crit" ? "crit" : b.tone === "attn" ? "warn" : ""}`}>
              {b.rows.length.toLocaleString()}<em>events</em>
            </span>
            <span className="cc-mini-sub">{b.why}</span>
            <span className="cc-mini-go">{openBand === b.key ? "Close — the events are below" : "Open every event →"}</span>
          </button>
        ))}
      </div>
      {unclassified.length > 0 && (
        <div className="sch-said crit">
          {unclassified.length.toLocaleString()} event{unclassified.length === 1 ? " falls" : "s fall"} into
          none of the states above. That is a gap in this page&rsquo;s reading of the view, not an empty
          category, and it is shown rather than swallowed into the nearest band.
        </div>
      )}
      {shown && (
        <DkDrill label={`Every event that is ${shown.label.toLowerCase()}`} onClose={() => setOpenBand(null)}>
          <div className="sch-said">{shown.why}</div>
          {shown.key === "unmeasured" && said.length > 0 && (
            <div className="sch-said attn">
              The adherence view writes its own explanation for these rows and it is reproduced here word
              for word: {said[0]}
            </div>
          )}
          <PullStateTable rows={shown.rows} deptOf={deptOf} onRecord={onRecord} />
        </DkDrill>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DRIFT — one bar per pull, in schedule order.

   Agent I, 13 Aug 2026: "A tile showing a per-pull average hides the only thing
   that matters." Nothing here is averaged. The bars are the served days-late
   figure for each pull in the order the pulls were scheduled, so a schedule
   that is drifting looks like a staircase and a schedule with scattered misses
   looks like scatter — which is a distinction no single number can carry.
   ═══════════════════════════════════════════════════════════════════════════ */
const PCT = 100;
function DriftBars({ rows, deptOf }) {
  const pulls = rows
    .filter((r) => r.event_type === PULL && r.days_late != null)
    .sort((a, b) => Number(a.pull_no) - Number(b.pull_no));
  if (pulls.length < 2) {
    return (
      <DkEmpty
        why={`Nothing is drawn: ${pulls.length === 0 ? "no pull" : "only one pull"} carries a days-late figure.`}
        fills="A shape needs more than one point. One bar drawn as a trend would be a picture of something that was never measured."
      />
    );
  }
  const max = Math.max(...pulls.map((r) => Number(r.days_late)), 1);
  return (
    <>
      <div className="sch-trend">
        {pulls.map((r) => {
          const v = Number(r.days_late);
          const open = r.actual_date === null;
          return (
            <div key={rowKey(r.pull_no, D(r.scheduled_date))} className="sch-bar">
              <span className="sch-bar-lbl">{qualify(deptOf, r.room)}</span>
              <span className="sch-track">
                <span className={`sch-fill ${v > 0 ? (open ? "crit" : "warn") : ""}`}
                  style={{ width: `${((v / max) * PCT).toFixed(1)}%` }} />
              </span>
              <span className="sch-bar-val">
                {v.toLocaleString()}<em>{open ? "days and growing" : "days late"}</em>
              </span>
            </div>
          );
        })}
      </div>
      <div className="sch-direction">
        <b>Read the shape, not an average.</b> Each bar is one scheduled pull, in the order the year
        plans them, showing the days-late figure the database serves for it. A staircase means the
        schedule is drifting and every later pull inherits the drift ahead of it; scatter would mean
        isolated misses. Those need different answers from a manager, and a single average across
        these bars would look identical for both. The bars drawn in the strongest tone are pulls that
        have <b>not come down at all</b> — their figure is measured from today and is not final.
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE TREND — period against period. Q1 to Q2 must read as a DIRECTION, not
   two numbers to compare by eye. Bars at one scale do that; a line over two
   points does not.

   UNDER TWO REAL POINTS NOTHING IS DRAWN AND THE PAGE SAYS WHY. No
   interpolation, no zero-filling of periods the view did not serve, no line
   invented from a single figure.
   ═══════════════════════════════════════════════════════════════════════════ */
function TrendBars({ rows, periodType, measure, err }) {
  if (err) return <DkErr what="The period figures behind the trend" err={err} />;
  const series = rows
    .filter((r) => r.period_type === periodType && r[measure.col] != null)
    .sort((a, b) => String(a.period_start).localeCompare(String(b.period_start)));
  if (series.length < 2) {
    return (
      <DkEmpty
        why={`Nothing is drawn: ${series.length === 0 ? "no period" : "only one period"} carries a figure for ${measure.label.toLowerCase()}.`}
        fills="A direction needs two real points. One point drawn as a line, or a period the view did not serve drawn as a zero, would be a picture of something that was never measured — and a fabricated trend line is forbidden outright. The moment a second period carries a figure the bars appear here on their own."
      />
    );
  }
  const max = Math.max(...series.map((r) => Number(r[measure.col])), 1);
  const first = series[0];
  const last = series[series.length - 1];
  const a = Number(first[measure.col]);
  const b = Number(last[measure.col]);
  const multiple = a > 0 ? b / a : null;
  const fmt = (v) => (measure.unit === "$" ? MONEY(v) : `${NUM1(v)} ${measure.unit}`);
  return (
    <>
      <div className="sch-trend">
        {series.map((r) => {
          const v = Number(r[measure.col]);
          return (
            <div key={rowKey(r.period_type, r.period_start)} className="sch-bar">
              <span className="sch-bar-lbl">{periodText(r.period_type, r.period_start)}</span>
              <span className="sch-track">
                <span className={`sch-fill ${r === last ? "crit" : "warn"}`}
                  style={{ width: `${((v / max) * PCT).toFixed(1)}%` }} />
              </span>
              <span className="sch-bar-val">
                {measure.unit === "$" ? MONEY(v) : NUM1(v)}
                {measure.unit !== "$" && <em>{measure.unit}</em>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="sch-direction">
        {b === a ? (
          <>
            <b>Flat.</b> {measure.label} stands at the same figure in {periodText(last.period_type, last.period_start)} as
            in {periodText(first.period_type, first.period_start)}. Both figures are served; neither is adjusted.
          </>
        ) : (
          <>
            <b>{b > a ? "Getting worse." : "Getting better."}</b> {measure.label} moved
            from <b>{fmt(a)}</b> in {periodText(first.period_type, first.period_start)} to
            {" "}<b>{fmt(b)}</b> in {periodText(last.period_type, last.period_start)}
            {multiple !== null && <> — <b>{NUM1(multiple)} times</b> the earlier figure</>}.
            {" "}Both figures are served by the database. The multiple between them is the only thing
            worked out on this page, and it is one served number divided by the other.
          </>
        )}
        {series.length === 2 && (
          <> Only two periods carry a figure, so this is a direction between two points and not yet a trend.</>
        )}
      </div>
      <div className="sch-said">
        A period the view did not serve is <b>not drawn as a zero</b>. v_schedule_cost_by_period carries a
        row only where a pull was harvested late, so a gap in this picture is a period with no such
        pull on the record — a different statement from a measured zero, and the two are never merged
        here. Pulls that have not come down at all are in none of these bars.
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WHAT ACTUALLY CAME DOWN — v_harvest_takedown, one row per room take-down.

   The schedule says what was meant to happen; this says what did. A take-down
   runs across more than one day, and the difference between the first cut and
   the last is real room-time that no single date can carry.
   ═══════════════════════════════════════════════════════════════════════════ */
function Takedowns({ rows, err, deptOf }) {
  if (err) return <DkErr what="Every take-down on the record" err={err} />;
  if (!rows.length) {
    return <DkEmpty why="No take-down is on the record."
      fills="v_harvest_takedown groups the harvest mirror by room and by take-down. An empty list means the mirror holds no harvest for a flower room." />;
  }
  return (
    <>
      <div className="cc-fine">
        Showing <b>{rows.length.toLocaleString()}</b> of <b>{rows.length.toLocaleString()}</b> take-downs,
        most recent first. Each is one room coming down, with every harvest record inside it named.
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Room</th><th>Take-down</th><th>First cut</th><th>Last cut</th><th>Days it ran</th>
            <th>Harvest records</th><th>Fresh frozen records</th><th>Wet pounds</th><th>The harvests</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={rowKey(r.takedown_seq_all_time, D(r.takedown_start), i)}>
                <td>{qualify(deptOf, r.flower_room)}</td>
                <td>{r.takedown_seq_all_time == null ? "not numbered" : r.takedown_seq_all_time}</td>
                <td>{D(r.takedown_start)}</td>
                <td>{D(r.takedown_end)}</td>
                <td>{r.takedown_days == null ? "not served" : `${Number(r.takedown_days).toLocaleString()} days`}</td>
                <td>{r.harvest_records == null ? "not served" : Number(r.harvest_records).toLocaleString()}</td>
                <td>{r.fresh_frozen_records == null ? "not served" : Number(r.fresh_frozen_records).toLocaleString()}</td>
                <td>{r.wet_lb == null ? "not recorded" : `${NUM1(r.wet_lb)} lb wet`}</td>
                <td className="note">{r.harvests || "no harvest name served for this take-down"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sch-said">
        Wet pounds are wet. They are never added to a dry figure and never converted here — the
        conversion belongs to the view that owns it.
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PLANNED CYCLE AGAINST OBSERVED CYCLE.

   If the plan assumes a cycle the rooms have never achieved, a share of what
   reads as execution lateness is a PLANNING defect — and that changes who is
   accountable. Nothing is derived here: v_room_turn_audit already serves the
   observed turn, the required days and its own verdict per cycle, and
   conversion_factors serves the planned cycle with its provenance.

   THE VIEW IS RENDERED WHOLE. It carries rows where a take-down spanned two
   calendar days and the "turn" is therefore a day rather than a cycle. Those
   are counted and named on screen rather than filtered out: a page that
   silently drops the rows that look wrong is deciding what the data means.
   ═══════════════════════════════════════════════════════════════════════════ */
const HALF = 2;
function CycleReality({ rows, err, planned, plannedErr, deptOf }) {
  const [open, setOpen] = useState(false);
  if (err) return <DkErr what="The observed room cycle" err={err} />;
  const req = rows.find((r) => r.required_days != null);
  const shortTurns = req
    ? rows.filter((r) => Number(r.room_turn_days) < Number(req.required_days) / HALF).length
    : 0;
  return (
    <>
      {plannedErr && <DkErr what="The planned room cycle" err={plannedErr} />}
      <div className="sch-cmp">
        <div className="sch-cmp-cell">
          <span className="sch-cmp-lbl">Planned room cycle</span>
          <span className="sch-cmp-val">
            {planned ? Number(planned.value).toLocaleString() : "not served"}<em>{planned ? planned.unit : ""}</em>
          </span>
          <span className="cc-mini-sub">{planned ? planned.what_it_means : "conversion_factors serves no planned cycle, so there is nothing to compare against."}</span>
          {planned && <span className="sch-said">{planned.where_it_came_from}</span>}
          <span className="sch-said">Set by {planned ? planned.set_by : "not recorded"}.</span>
        </div>
        <div className="sch-cmp-cell">
          <span className="sch-cmp-lbl">Room cycles on the record</span>
          <span className="sch-cmp-val">{rows.length.toLocaleString()}<em>observed</em></span>
          <span className="cc-mini-sub">
            Each row is one harvest in a flower room measured against the previous harvest in the same
            room, with the view&rsquo;s own verdict on it.
          </span>
        </div>
        <div className="sch-cmp-cell">
          <span className="sch-cmp-lbl">Turns shorter than half the plan</span>
          <span className="sch-cmp-val">{shortTurns.toLocaleString()}<em>rows</em></span>
          <span className="cc-mini-sub">
            A room taken down across two calendar days produces a second row a day later. Those are not
            cycles, and this view does not separate them from cycles that are. They are counted here and
            left in the list rather than quietly removed — that distinction belongs in the view and is
            filed rather than fixed on screen.
          </span>
        </div>
      </div>
      <button className="cc-btn" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        <DkCaret open={open} />{open ? "Close — the cycles are below" : `Open every observed cycle (${rows.length.toLocaleString()})`}
      </button>
      {open && (
        <DkDrill label="Every observed room cycle, against the planned one" onClose={() => setOpen(false)}>
          <div className="cc-fine">
            Showing <b>{rows.length.toLocaleString()}</b> of <b>{rows.length.toLocaleString()}</b> observed
            cycles, most recent first. The verdict on each row is the view&rsquo;s own sentence, word for word.
          </div>
          <div className="tablewrap">
            <table>
              <thead><tr>
                <th>Room</th><th>Harvest started</th><th>Previous harvest</th><th>Observed cycle</th>
                <th>Planned cycle</th><th>Plants</th><th>Cultivars</th><th>Wet pounds</th><th>The view&rsquo;s verdict</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={rowKey(r.room, D(r.harvest_started), i)}>
                    <td>{qualify(deptOf, r.room)}</td>
                    <td>{D(r.harvest_started)}</td>
                    <td>{D(r.prev) ?? "no earlier harvest in this room"}</td>
                    <td className={req && Number(r.room_turn_days) > Number(req.required_days) ? "bad" : undefined}>
                      {r.room_turn_days == null ? "not measurable" : `${Number(r.room_turn_days).toLocaleString()} days`}
                    </td>
                    <td>{r.required_days == null ? "not served" : `${NUM1(r.required_days)} days`}</td>
                    <td>{r.plants == null ? "not recorded" : Number(r.plants).toLocaleString()}</td>
                    <td>{r.cultivars == null ? "not recorded" : Number(r.cultivars).toLocaleString()}</td>
                    <td>{r.wet_lb == null ? "not recorded" : `${NUM1(r.wet_lb)} lb wet`}</td>
                    <td className="note">{r.verdict || "The view served no verdict on this row, which is itself a gap and is filed with the database team."}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DkDrill>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WRITE ONE — record or edit WHY a pull ran late.

   tg_record_schedule_variance. Every field is editable and PASSING NULL LEAVES
   A VALUE ALONE, so the form starts from whatever is already recorded and sends
   only what the person actually changed.

   THE REASON LIST IS reason_code_catalog AND NOTHING ELSE. A free-text reason
   cannot be counted, and counting is the entire point of recording it. The
   function refuses an unknown code and refuses a short note where the code
   demands one; both refusals are shown in the database's own words rather than
   being second-guessed by a browser rule that could drift from them.
   ═══════════════════════════════════════════════════════════════════════════ */
function VarianceForm({ target, codes, codesErr, deptOf, onSaved, onCancel }) {
  const existing = target.existing;
  const [code, setCode] = useState(existing && existing.reason_code ? existing.reason_code : "");
  const [note, setNote] = useState(existing && existing.note ? existing.note : "");
  const [who, setWho] = useState(existing && existing.accountable ? existing.accountable : "");
  const [action, setAction] = useState(existing && existing.corrective_action ? existing.corrective_action : "");
  const [resolved, setResolved] = useState(Boolean(existing && existing.resolved === true));
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const picked = listOf(codes).find((c) => c.code === code);
  const roomQ = qualify(deptOf, target.room);
  const was = (k) => (existing && existing[k] !== null && existing[k] !== undefined ? String(existing[k]) : "");

  const save = async () => {
    setBusy(true);
    setMsg(null);
    /* Only what changed is sent. The function coalesces a null onto whatever is
       already stored, so an untouched field keeps exactly what it had. */
    const changed = (v, k) => (v === was(k) ? null : (String(v).trim() || null));
    const { data, error } = await supabase.rpc("tg_record_schedule_variance", {
      p_event_type: target.event_type,
      p_room: target.room,
      p_scheduled_date: target.scheduled_date,
      p_reason_code: changed(code, "reason_code"),
      p_note: changed(note, "note"),
      p_accountable: changed(who, "accountable"),
      p_corrective_action: changed(action, "corrective_action"),
      p_resolved: resolved === Boolean(existing && existing.resolved === true) ? null : resolved,
    });
    setBusy(false);
    if (error) { setMsg({ bad: true, text: `Refused by the database: ${error.message}` }); return; }
    setMsg({ bad: false, text: `Recorded — variance ${data === null || data === undefined ? "saved" : data}. The rows below refresh from the view, not from this form.` });
    onSaved();
  };

  return (
    <div className="sch-form">
      <div className="cc-fine">
        <b>{roomQ}</b> · {target.event_type} planned for {target.scheduled_date}
        {target.days_late != null ? <> · {Number(target.days_late).toLocaleString()} days late</> : null}
        {target.cultivars ? <> · {target.cultivars}</> : null}
      </div>
      {codesErr && <DkErr what="The reason list" err={codesErr} />}
      <div className="sch-fgrid">
        <div className="sch-field">
          <label htmlFor="sch-code">Reason — chosen from the catalogue, never typed</label>
          <select id="sch-code" className="cc-input" value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">{existing && existing.reason_code ? "leave the recorded reason unchanged" : "pick a reason…"}</option>
            {listOf(codes).map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
          <span className="sch-help">
            {picked
              ? picked.description
              : "A free-text reason cannot be counted, and counting is why this is recorded at all. Every code here is a row in reason_code_catalog that an owner can add to."}
          </span>
        </div>
        <div className="sch-field">
          <label htmlFor="sch-who">Who is accountable</label>
          <input id="sch-who" className="cc-input" value={who} onChange={(e) => setWho(e.target.value)}
            placeholder="a named person" />
          <span className="sch-help">A violation with nobody named against it cannot be closed and cannot be followed up.</span>
        </div>
        <div className="sch-field">
          <label htmlFor="sch-action">Corrective action</label>
          <input id="sch-action" className="cc-input" value={action} onChange={(e) => setAction(e.target.value)}
            placeholder="what changes so this does not repeat" />
          <span className="sch-help">A reason without a corrective action explains the slip and prevents nothing.</span>
        </div>
      </div>
      <div className="sch-field">
        <label htmlFor="sch-note">What actually happened</label>
        <textarea id="sch-note" className="cc-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="In your own words. Only the grower knows why this slipped; the platform will never invent it." />
        <span className={`sch-help ${picked && picked.requires_note ? "crit" : ""}`}>
          {picked && picked.requires_note
            ? "This reason needs a note. It was chosen because the code alone does not explain it, and the database will refuse the entry without one."
            : "Optional for this reason, and always worth writing — the code says what kind of thing happened, the note says what happened."}
        </span>
      </div>
      <label className="cc-check" htmlFor="sch-resolved">
        <input id="sch-resolved" type="checkbox" aria-label="Mark this variance resolved"
          checked={resolved} onChange={(e) => setResolved(e.target.checked)} />
        Mark this variance resolved
      </label>
      <div className="cc-row">
        <button className="cc-btn primary" type="button" onClick={save} disabled={busy}>
          {busy ? "saving…" : existing && existing.reason_code ? "Save the changes" : "Record this reason"}
        </button>
        <button className="cc-btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <span className="sch-help">
          A field left alone is sent as nothing at all, so it keeps whatever is already recorded.
          Nothing here overwrites a value you did not touch.
        </span>
      </div>
      {msg && <div className={`sch-help ${msg.bad ? "crit" : "ok"}`}>{msg.text}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WRITE TWO — lights out. Shift this pull and every later one in the room.

   tg_shift_schedule_after_disruption. It REBASELINES what every downstream pull
   is measured against, which is the most consequential thing anyone can do to
   this page: done without a reason it is indistinguishable from moving the
   goalposts, and the function says exactly that and refuses a short note.

   THE DATABASE IS THE AUTHORITY ON WHO MAY DO THIS. The function reads the
   caller's role and raises a permission error naming the roles it requires.
   That refusal is shown here word for word rather than pre-empted by a role
   list typed into the browser, which would be a second copy of an
   authorisation rule and would drift from the first.
   ═══════════════════════════════════════════════════════════════════════════ */
function DisruptionForm({ rooms, codes, codesErr, deptOf, onShifted }) {
  const [room, setRoom] = useState("");
  const [from, setFrom] = useState("");
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [cascade, setCascade] = useState(true);
  const [msg, setMsg] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  /* Built before the markup so no room name is ever interpolated into a render
     without the department already attached to it (J7). */
  const roomOptions = rooms.map((r) => ({ value: r.room, label: dkRoomQualified(r) }));

  const run = async () => {
    setBusy(true); setMsg(null); setResult(null);
    const { data, error } = await supabase.rpc("tg_shift_schedule_after_disruption", {
      p_room: room, p_from_date: from || null, p_shift_days: Number(days),
      p_note: note, p_reason_code: code || null, p_cascade: cascade,
    });
    setBusy(false);
    if (error) { setMsg(`Refused by the database: ${error.message}`); return; }
    setResult(listOf(data));
    onShifted();
  };

  return (
    <div className="sch-form">
      <div className="sch-said attn">
        This rewrites the date every later pull in the room is measured against. Everything above on
        this page is measured against the schedule, so a shift made without a reason turns a violation
        into a clean record with nothing left to show why. The database refuses a short note for
        exactly that reason.
      </div>
      {codesErr && <DkErr what="The reason list" err={codesErr} />}
      <div className="sch-fgrid">
        <div className="sch-field">
          <label htmlFor="sch-room">Room</label>
          <select id="sch-room" className="cc-input" value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">pick a room…</option>
            {roomOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="sch-help">
            Room identity is licence plus name — eleven names exist in both buildings — so every room
            here carries its department.
          </span>
        </div>
        <div className="sch-field">
          <label htmlFor="sch-from">Shift from this planned date onward</label>
          <input id="sch-from" className="cc-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="sch-help">The planned harvest date the disruption hit. It must match a date already on the schedule.</span>
        </div>
        <div className="sch-field">
          <label htmlFor="sch-days">Days to move it by</label>
          <input id="sch-days" className="cc-input" type="number" value={days} onChange={(e) => setDays(e.target.value)}
            placeholder="positive is later, negative is earlier" />
          <span className="sch-help">A shift of no days changes nothing and is refused.</span>
        </div>
        <div className="sch-field">
          <label htmlFor="sch-dcode">Reason</label>
          <select id="sch-dcode" className="cc-input" value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">pick a reason…</option>
            {listOf(codes).map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
          <span className="sch-help">The same catalogue the variance form uses. One vocabulary, so the two can be counted together.</span>
        </div>
      </div>
      <div className="sch-field">
        <label htmlFor="sch-dnote">Say what happened</label>
        <textarea id="sch-dnote" className="cc-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="The reason is the only thing separating a rebaseline from moving the goalposts." />
      </div>
      <label className="cc-check" htmlFor="sch-cascade">
        <input id="sch-cascade" type="checkbox" aria-label="Cascade the shift to every later pull in this room"
          checked={cascade} onChange={(e) => setCascade(e.target.checked)} />
        Cascade — move every later pull in this room too, not only this one
      </label>
      <div className="cc-row">
        <button className="cc-btn primary" type="button" onClick={run} disabled={busy}>
          {busy ? "shifting…" : "Shift the schedule"}
        </button>
        <span className="sch-help">
          The database decides whether you may do this and refuses in its own words if not. This page
          keeps no second copy of that rule.
        </span>
      </div>
      {msg && <div className="sch-help crit">{msg}</div>}
      {result && (
        result.length === 0 ? (
          <div className="sch-help">
            The shift was accepted and moved nothing: no planned pull in that room falls on or after
            that date. Nothing has been rebaselined.
          </div>
        ) : (
          <>
            <div className="sch-help ok">
              {result.length.toLocaleString()} planned date{result.length === 1 ? "" : "s"} moved. Each one is now on the record below.
            </div>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Room</th><th>Was</th><th>Now planned</th><th>Revision</th></tr></thead>
                <tbody>
                  {result.map((r) => (
                    <tr key={r.revision_id}>
                      <td>{qualify(deptOf, r.room)}</td>
                      <td>{D(r.was)}</td>
                      <td>{D(r.now_planned)}</td>
                      <td>{r.revision_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE REVISION FEED — every date change, who made it, and what it did to the
   baseline. This is the page's activity feed and the audit trail behind the
   write action above: a schedule that can be moved with no visible record of
   the move is a schedule nobody can be held to.
   ═══════════════════════════════════════════════════════════════════════════ */
function Revisions({ rows, err, deptOf, canWrite }) {
  if (err) return <DkErr what="Schedule revisions" err={err} />;
  if (!rows.length) {
    return (
      <DkEmpty
        why="No schedule has ever been shifted after a disruption. This feed has no entries at all."
        fills="Every planned date on the record is still the date it was first planned for, so nothing has been rebaselined and nothing has moved out from under a measurement. The first shift anyone makes with the action beside this appears here immediately, with the note, the reason, who made it and what it did to the baseline."
        action={canWrite
          ? <span className="sch-said">Open “Lights out — rebaseline a room” to record the first one.</span>
          : <span className="sch-said">Recording a shift needs a role the database checks. Ask an owner, executive, administrator or manager.</span>}
      />
    );
  }
  return (
    <div className="sch-revlist">
      {rows.map((r, i) => (
        <div key={rowKey(r.room, D(r.original_date), i)} className="sch-rev">
          <div className="sch-rev-head">
            <b>{qualify(deptOf, r.room)}</b>
            <span>{r.event_type}</span>
            <span>{D(r.original_date)} → {D(r.current_planned_date)}</span>
            {r.days_moved_from_original != null && (
              <DkTag tone={Number(r.days_moved_from_original) > 0 ? "crit" : "info"}>
                {Number(r.days_moved_from_original) > 0 ? "+" : ""}{Number(r.days_moved_from_original)} days from the original plan
              </DkTag>
            )}
            {r.resets_baseline && <DkTag tone="attn">resets the baseline</DkTag>}
            {r.superseded && <DkTag tone="neutral">superseded by a later revision</DkTag>}
          </div>
          <div className="sch-said">{r.what_this_means || "The view served no explanation for this revision, which is itself a gap and is filed rather than filled in here."}</div>
          <div className="sch-said">
            <b>Reason:</b> {r.reason || "none recorded"} · <b>Note:</b> {r.note || "none written"}
            {" "}· by {r.revised_by || "not recorded"} on {D(r.revised_at) ?? "a date not recorded"}
            {r.times_this_date_moved != null && <> · this date has moved {Number(r.times_this_date_moved).toLocaleString()} times</>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOES THE DATABASE RE-DERIVE THESE TILES FROM THEIR OWN ROWS?

   tile_drill_contract is what stops a tile and the list it opens drifting
   apart. Whether this page is registered in it is stated plainly rather than
   assumed — the platform's own root-cause ledger records that guards watched
   the database and never the screen, and a page claiming a contract it does not
   have would be exactly that failure repeated.
   ═══════════════════════════════════════════════════════════════════════════ */
function DrillContract({ rows, err }) {
  if (err) return <DkErr what="The tile-to-drill contract" err={err} />;
  if (!rows.length) {
    return (
      <DkEmpty
        why="No tile on this page is registered in the tile-to-drill contract yet."
        fills="Every figure above opens the exact rows it is computed from, and both are read from the same views — but nothing in the database re-derives one from the other on a schedule, so a drift between them would raise no finding on its own. Registering these tiles is the data layer's work, and it is named here rather than assumed."
      />
    );
  }
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th>Contract</th><th>Tile</th><th>The tile says</th><th>Its own rows say</th><th>Gap</th><th>Verdict</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.contract_key}>
              <td>{r.contract_key}</td>
              <td>{r.tile_label}</td>
              <td>{r.tile_value == null ? "not served" : NUM1(r.tile_value)}</td>
              <td>{r.drill_value == null ? "not served" : NUM1(r.drill_value)}</td>
              <td className={r.verdict && r.verdict !== "AGREE" ? "bad" : undefined}>{r.gap == null ? "not served" : NUM1(r.gap)}</td>
              <td className={r.verdict && r.verdict !== "AGREE" ? "bad" : undefined}>{r.verdict}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ the page ══════════════ */
export default function ScheduleAdherenceDashboard({ go, session, reports, role, viewAs, onViewAs, isAdmin, viewRoles }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, VIEW_KEY);
  const [range, setRange] = useState({ from: "", to: "" });
  const [period, setPeriod] = useState("year");
  const [trendPeriod, setTrendPeriod] = useState("quarter");
  const [trendMeasure, setTrendMeasure] = useState("days_late");
  const [openKey, setOpenKey] = useState(null);
  const [openBand, setOpenBand] = useState(null);
  const [recordTarget, setRecordTarget] = useState(null);
  const [ver, setVer] = useState(0);
  const [d, setD] = useState(null);

  const WIDGETS = useMemo(() => [
    { key: "drift", title: "Drift — every scheduled pull in order, so the shape is visible", span: 2 },
    { key: "adherence", title: "How every scheduled event landed, including the ones that have not", span: 2 },
    { key: "report", title: "Every late pull in full — room, cultivar, dates, pounds, dollars, reason, who is accountable", span: 2 },
    { key: "trend", title: "The direction — period against period, drawn only from real periods", span: 2 },
    { key: "takedowns", title: "What actually came down — every take-down, per room", span: 2 },
    { key: "cycle", title: "The plan against the rooms — planned cycle versus observed cycle", span: 2 },
    { key: "disrupt", title: "Lights out — rebaseline a room after a disruption", span: 1 },
    { key: "revisions", title: "Every schedule change on the record", span: 1 },
    { key: "corrections", title: "Corrections open against these views", span: 2 },
    { key: "contract", title: "Does the database re-derive these tiles from their own rows?", span: 1 },
    { key: "tasks", title: "Work raised from these figures", span: 1 },
    { key: "words", title: "In plain words — the period, the platform, and signed notes", span: 2 },
    { key: "reports", title: "Reports — by group", span: 2 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const starts = useMemo(() => currentPeriodStarts(new Date()), []);
  const reload = useCallback(() => setVer((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    (async () => {
      const [periods, compliance, adherence, variance, revisions, rooms, turns, takedowns,
        codes, targets, corrections, contract, tasks, planned] = await Promise.all([
        supabase.from("v_schedule_cost_by_period").select("*"),
        supabase.from("v_schedule_compliance").select("*").order("scheduled_date", { ascending: false }),
        supabase.from("v_schedule_adherence").select("adherence").eq("is_unmeasured", true).limit(1),
        supabase.from("v_schedule_variance").select("*"),
        supabase.from("v_schedule_revisions").select("*").order("revised_at", { ascending: false, nullsFirst: false }),
        supabase.from("v_room_board_complete").select("room, department, licence, is_flower_room"),
        supabase.from("v_room_turn_audit").select("*").order("harvest_started", { ascending: false }),
        supabase.from("v_harvest_takedown").select("*").order("takedown_start", { ascending: false }),
        supabase.from("reason_code_catalog").select("*").contains("applies_to", ["schedule_variance"]).eq("active", true).order("sort_order"),
        supabase.from("kpi_targets").select("*").eq("department", DEPT),
        supabase.from("correction_proposal").select("*").ilike("target_object", CORRECTION_TARGET).is("applied_at", null).order("raised_at", { ascending: false }),
        supabase.from("v_tile_drill_status").select("*").eq("page", VIEW_KEY),
        supabase.from("v_dashboard_tasks").select("*"),
        supabase.from("conversion_factors").select("*").eq("key", "room_cycle_days").maybeSingle(),
      ]);
      if (!live) return;
      setD({
        periods: grab(periods), compliance: grab(compliance), adherence: grab(adherence),
        variance: grab(variance), revisions: grab(revisions), rooms: grab(rooms),
        turns: grab(turns), takedowns: grab(takedowns), codes: grab(codes), targets: grab(targets),
        corrections: grab(corrections), contract: grab(contract), tasks: grab(tasks),
        planned: planned.error ? { row: null, err: planned.error.message } : { row: planned.data, err: null },
      });
    })();
    return () => { live = false; };
  }, [ver]);

  if (d === null) {
    return (
      <div className="ccpage">
        <div className="cc-fine" style={{ padding: 16 }}>
          Reading the harvest schedule, how every pull actually landed, and what the late ones cost…
        </div>
      </div>
    );
  }

  const deptOf = new Map(d.rooms.rows.map((r) => [r.room, r.department]));
  const flowerRooms = d.rooms.rows.filter((r) => r.is_flower_room === true);
  const varianceByKey = new Map(d.variance.rows.map((r) => [rowKey(r.room, D(r.scheduled_date)), r]));
  const targetByKpi = Object.fromEntries(d.targets.rows.map((r) => [r.kpi, r]));
  const periodStart = starts[period];
  const periodRow = d.periods.rows.find((r) => r.period_type === period && D(r.period_start) === periodStart);
  const openMeasure = MEASURES.find((m) => m.col === openKey);
  const trendM = MEASURES.find((m) => m.col === trendMeasure);
  const openTasks = d.tasks.rows.filter((t) => t.department === DEPT);
  const overdueTasks = openTasks.filter((t) => t.position && t.position.startsWith("OVERDUE"));

  /* The two populations, counted from real columns on the same served view so
     they cannot drift from the bands below them. */
  const pastDueRows = d.compliance.rows.filter((r) => bandOf(r) === "pastdue");
  const pastDue = {
    count: pastDueRows.length,
    days: pastDueRows.reduce((a, r) => a + Number(r.days_late || 0), 0),
  };
  /* Resolved here rather than inside the drill's label, so a room name never
     reaches a rendered string without its department already attached (J7). */
  const recordRoomQualified = recordTarget ? qualify(deptOf, recordTarget.room) : null;
  const lateCount = d.compliance.rows.filter((r) => bandOf(r) === "late").length;
  const unmeasuredCount = d.compliance.rows.filter((r) => bandOf(r) === "unmeasured").length;
  const saidUnmeasured = d.adherence.rows.map((r) => r.adherence).filter(Boolean);

  return (
    <DrillRoot label="Schedule adherence">
      <div className="ccpage">
        <DkHead title="Schedule adherence — a pull may be early, never late" viewKey={VIEW_KEY}
          dept={DEPT} role={role} viewAs={viewAs} computed={null} busy={false}>
          <span className="cc-hchip" title="Every figure here is read from a view at the moment the page loads, so there is no snapshot to go stale. What can go stale is the Metrc mirror underneath it, and that age is reported on the Metrc dashboard.">
            source <b>live views, no snapshot</b>
          </span>
          {lateCount > 0 && <DkTag tone="crit">{lateCount} came down late</DkTag>}
          {pastDue.count > 0 && (
            <DkTag tone="crit" title="Scheduled, past its date, and nothing has come down. Lateness here has no end date and grows every night.">
              {pastDue.count} past due and still standing
            </DkTag>
          )}
          {unmeasuredCount > 0 && (
            <DkTag tone="attn" title="Events whose completion is computed rather than observed. They cannot disagree with plan, so no verdict is offered — unmeasured, never compliant.">
              {unmeasuredCount} not measured
            </DkTag>
          )}
        </DkHead>

        <div className="cc-tools">
          <div className="cc-tools-l">
            <button className="cc-btn" type="button" title="Collapse every section — remembered per user on this device"
              onClick={() => store.setAll(WIDGETS.map((w) => w.key), false)}>− collapse all</button>
            <button className="cc-btn" type="button" title="Expand every section"
              onClick={() => store.setAll(WIDGETS.map((w) => w.key), true)}>+ expand all</button>
            <WidgetBarControls layout={layout} />
            {isAdmin && (
              <select className="cc-input cc-viewsel" aria-label="View this platform as another role — presentation preview only"
                value={viewAs ?? ""} onChange={(e) => onViewAs(e.target.value || null)}>
                <option value="">view as…</option>
                {listOf(viewRoles).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
          </div>
          <div className="cc-tools-c">
            <DateRangeSelect label="Dates" from={range.from} to={range.to}
              onFrom={(v) => setRange((p) => ({ ...p, from: v }))}
              onTo={(v) => setRange((p) => ({ ...p, to: v }))} />
          </div>
          <div className="cc-tools-r">
            <button className="cc-btn" type="button" onClick={reload} title="Read every view on this page again">↻ refresh</button>
            <button className="cc-btn" type="button" onClick={() => window.print()}>🖨 print</button>
            <button className="cc-btn" type="button" onClick={() => go("dept_dash_cultivation")}>Cultivation dashboard →</button>
          </div>
        </div>

        {/* THE CAVEAT COMES FIRST, ABOVE THE FIGURES IT QUALIFIES. */}
        <OpenCorrections rows={d.corrections.rows} err={d.corrections.err} />

        <div className="sch-pickrow">
          <span className="sch-picklab">Show</span>
          {PERIODS.map((p) => (
            <button key={p.key} className={`cc-btn ${period === p.key ? "primary" : ""}`} type="button"
              onClick={() => { setPeriod(p.key); setOpenKey(null); }}
              aria-pressed={period === p.key}
              title={`${p.label} — ${periodText(p.key, starts[p.key])}. Resolved from this device's clock, then matched against the periods the database serves.`}>
              {p.label}
            </button>
          ))}
          <span className="sch-picklab">{periodText(period, periodStart)}</span>
        </div>

        {d.periods.err
          ? <DkErr what="The period figures" err={d.periods.err} />
          : (
            <KeyFigures row={periodRow ?? null} periodKey={period} periodStart={periodStart}
              targets={targetByKpi} openKey={openKey} onOpen={setOpenKey} onAssigned={reload}
              pastDue={pastDue} />
          )}
        {d.targets.err && <DkErr what="The owner-set targets" err={d.targets.err} />}
        {d.compliance.err && <DkErr what="The schedule and how it landed" err={d.compliance.err} />}

        {openMeasure && (
          <DkDrill label={`${periodText(period, periodStart)} — the records behind “${openMeasure.label}”`}
            onClose={() => setOpenKey(null)}>
            <div className="sch-said">
              The figure you pressed is computed from exactly these rows, read from
              v_schedule_cost_detail with the same period filter. Nothing is summarised away and
              nothing is capped.
            </div>
            <LatePulls filterCol={period} filterVal={periodStart}
              what={periodText(period, periodStart)} deptOf={deptOf} variance={varianceByKey}
              onRecord={setRecordTarget} />
          </DkDrill>
        )}

        {openKey === "pastdue" && (
          <DkDrill label="Every pull that is past due with nothing harvested" onClose={() => setOpenKey(null)}>
            <div className="sch-said crit">
              These rooms are still standing. Their lateness is measured from today and is not final —
              it grows every night at midnight. None of them appears in any cost figure on this page,
              because the cost views measure a take-down and there is no take-down to measure.
            </div>
            {pastDueRows.length === 0
              ? <DkEmpty why="No pull is past due with nothing harvested."
                  fills="Every scheduled pull whose date has passed has a take-down against it. That is the position we want." />
              : <PullStateTable rows={pastDueRows} deptOf={deptOf} onRecord={setRecordTarget} />}
          </DkDrill>
        )}

        {recordTarget && (
          <DkDrill label={`Record why — ${recordRoomQualified}, planned ${recordTarget.scheduled_date}`}
            onClose={() => setRecordTarget(null)}>
            <VarianceForm target={recordTarget} codes={d.codes.rows} codesErr={d.codes.err}
              deptOf={deptOf} onSaved={reload} onCancel={() => setRecordTarget(null)} />
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            switch (w.key) {
              case "drift": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={<DkTag tone="attn" title="Cumulative drift and scattered misses need different answers from a manager, and a single average looks identical for both.">a shape, never an average</DkTag>}>
                  {d.compliance.err ? <DkErr what="The schedule" err={d.compliance.err} />
                    : <DriftBars rows={d.compliance.rows} deptOf={deptOf} />}
                </Widget>
              );
              case "adherence": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={d.compliance.err ? <DkTag tone="crit">read failed</DkTag> : (
                    <>
                      <DkTag tone="neutral">{d.compliance.rows.length.toLocaleString()} scheduled events</DkTag>
                      {lateCount > 0 && <DkTag tone="crit">{lateCount} late</DkTag>}
                      {pastDue.count > 0 && <DkTag tone="crit">{pastDue.count} past due</DkTag>}
                      {unmeasuredCount > 0 && <DkTag tone="attn">{unmeasuredCount} not measured</DkTag>}
                    </>
                  )}>
                  <AdherenceBand rows={d.compliance.rows} err={d.compliance.err} deptOf={deptOf}
                    said={saidUnmeasured} onRecord={setRecordTarget}
                    openBand={openBand} setOpenBand={setOpenBand} />
                </Widget>
              );
              case "report": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={<DkTag tone="info" title="The same list every cost tile opens, with no period filter on it.">every late pull on the record</DkTag>}>
                  <LatePulls filterCol={null} filterVal={null} what="the whole record"
                    deptOf={deptOf} variance={varianceByKey} onRecord={setRecordTarget} />
                </Widget>
              );
              case "trend": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={<DkTag tone="info" title="A period the database did not serve is never drawn as a zero, and under two real periods nothing is drawn at all.">real periods only</DkTag>}>
                  <div className="sch-pickrow">
                    <span className="sch-picklab">By</span>
                    {PERIODS.map((p) => (
                      <button key={p.key} className={`cc-btn ${trendPeriod === p.key ? "primary" : ""}`} type="button"
                        onClick={() => setTrendPeriod(p.key)} aria-pressed={trendPeriod === p.key}>{p.key}</button>
                    ))}
                    <span className="sch-picklab">Measure</span>
                    {MEASURES.map((m) => (
                      <button key={m.col} className={`cc-btn ${trendMeasure === m.col ? "primary" : ""}`} type="button"
                        onClick={() => setTrendMeasure(m.col)} aria-pressed={trendMeasure === m.col}>{m.label}</button>
                    ))}
                  </div>
                  {trendM && <TrendBars rows={d.periods.rows} periodType={trendPeriod} measure={trendM} err={d.periods.err} />}
                </Widget>
              );
              case "takedowns": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                  chips={d.takedowns.err ? <DkTag tone="crit">read failed</DkTag>
                    : <DkTag tone="neutral">{d.takedowns.rows.length.toLocaleString()} take-downs</DkTag>}>
                  <Takedowns rows={d.takedowns.rows} err={d.takedowns.err} deptOf={deptOf} />
                </Widget>
              );
              case "cycle": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                  chips={<DkTag tone="attn" title="If the plan assumes a cycle the rooms have never achieved, part of what reads as execution lateness is a planning defect — and that changes who is accountable.">plan against reality</DkTag>}>
                  <CycleReality rows={d.turns.rows} err={d.turns.err} planned={d.planned.row}
                    plannedErr={d.planned.err} deptOf={deptOf} />
                </Widget>
              );
              case "disrupt": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                  chips={<DkTag tone="crit" title="This rewrites what every later pull in the room is measured against.">rebaselines the measurement</DkTag>}>
                  <DisruptionForm rooms={flowerRooms} codes={d.codes.rows} codesErr={d.codes.err}
                    deptOf={deptOf} onShifted={reload} />
                </Widget>
              );
              case "revisions": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={d.revisions.err ? <DkTag tone="crit">read failed</DkTag>
                    : <DkTag tone="neutral">{d.revisions.rows.length.toLocaleString()} changes</DkTag>}>
                  <Revisions rows={d.revisions.rows} err={d.revisions.err} deptOf={deptOf}
                    canWrite={role === "owner" || role === "executive" || role === "manager" || isAdmin} />
                </Widget>
              );
              case "corrections": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                  chips={d.corrections.err ? <DkTag tone="crit">read failed</DkTag>
                    : d.corrections.rows.length > 0
                      ? <DkTag tone="crit">{d.corrections.rows.length} open against these views</DkTag>
                      : <DkTag tone="ok">none open</DkTag>}>
                  <OpenCorrections rows={d.corrections.rows} err={d.corrections.err} />
                </Widget>
              );
              case "contract": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                  chips={d.contract.err ? <DkTag tone="crit">read failed</DkTag>
                    : <DkTag tone={d.contract.rows.length ? "neutral" : "attn"}>{d.contract.rows.length} registered</DkTag>}>
                  <DrillContract rows={d.contract.rows} err={d.contract.err} />
                </Widget>
              );
              case "tasks": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={d.tasks.err ? <DkTag tone="crit">read failed</DkTag> : (
                    <>
                      <DkTag tone="neutral">{openTasks.length} open</DkTag>
                      {overdueTasks.length > 0 && <DkTag tone="crit">{overdueTasks.length} overdue</DkTag>}
                    </>
                  )}>
                  {d.tasks.err ? <DkErr what="The task list" err={d.tasks.err} />
                    : <DkTasks tasks={d.tasks.rows} dept={DEPT} go={go} />}
                </Widget>
              );
              case "words": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}>
                  <DkNarrative page={PAGE_KEY} range={range} role={role} session={session} go={go} />
                </Widget>
              );
              case "reports": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}>
                  <DkReports reports={reports} dept={DEPT} go={go} />
                </Widget>
              );
              default: return null;
            }
          })}
        </WidgetBoard>
      </div>
    </DrillRoot>
  );
}
