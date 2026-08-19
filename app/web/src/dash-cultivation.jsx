/* ═══════════════════════════════════════════════════════════════════════════
   CULTIVATION DASHBOARD — Agent B, 12 Aug 2026.

   Owner order: "each and every single dashboard must be built so the manager
   of that department can fully manage and see every single detail, as we are
   doing for command." So this is the Cultivation MANAGER's page: the rooms he
   turns, the harvests he has open, the yield he got against his own strain
   median, whether his dry times sit inside the window, what stock his rooms
   are holding, and what is on his desk to fix.

   IT IS THE CERTIFIED TEMPLATE, NOT A NEW ONE. Same .ccpage token scope, same
   .cc-* classes, same panel/chip/queue/narrative primitives the owner graded
   on the Command Center. What differs is what a cultivator needs on the page —
   a roster is not a ledger is not a punch log, and a grow is not a warehouse.

   EVERY SECTION IS A WIDGET the manager can drag, hide or resize, saved to his
   own account through tg_save_dashboard_layout. The list below IS the page.

   ROOMS COME FROM v_room_board_complete, THROUGH DkRoomBoard — so no
   department is written as a literal anywhere on this page (J7, G2). One
   column of that view is not trusted and the reason is recorded in dashkit
   beside the code that avoids it: is_flower_room is set on four storage rooms
   and attributes plants to them, which would draw four fabricated "past its
   scheduled pull" alarms. The board keys off room_role, the view's own
   classification, which is right. The defect is filed with the database team;
   nothing about it is worked around silently.

   THE WORK QUEUE RESOLVES THROUGH finding_lane_owner. Findings are grouped by
   the lane that raised them, not by department; Cultivation owns Loss and
   yield, Room turnaround and Schedule discipline, which sum to the 52 the
   rollup reports for it. Filtering the cause view on the department name
   returned nothing and contradicted the chip beside it.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import {
  AssignTask, DateRangeSelect, rowsOr, OpenHarvestDetail, RoomDrill, RoomStockDrill,
} from "./App.jsx";
import {
  useDefaultRange, grab, DkTag, DkErr, DkEmpty, DkKpiStrip, DkOrphanTargets, DkWorkQueue, useWorkQueue,
  DkNarrative, DkReports, DkTasks, DkGapCard, DkHead, DkRoomBoard, useWidgetLayout,
  Widget, WidgetBoard, WidgetBarControls, useSectionStore, DkCaret, DkDrill, DrillRoot,
  DkRowDrill,
} from "./dashkit.jsx";

const DEPT = "Cultivation";
const VIEW_KEY = "dept_dash_cultivation";
const PAGE_KEY = "cultivation";

/* ═══════════════════════════════════════════════════════════════════════════
   WHAT EACH KEY FIGURE OPENS — all six, in place, keyed by PUBLISHED LABEL.

   THE DEFECT THIS EXISTS FOR, measured by Agent V on 13 Aug 2026 and recorded
   in tile_drill_contract. This page passed NO in-place handler to DkKpiStrip,
   so every tile fell through to go(r.drill) — a view key with no filter
   channel — and ReportScreen clears every filter on arrival. Five of the six
   figures therefore opened a population that was not their own:

     · the two moisture figures both landed on the whole register,
     · "Harvests open too long" landed on every harvest carrying any issue,
     · "Average dry time" and "Conversion" landed on panels that average over
       ROOMS while the tiles average over HARVESTS — two questions, one label,
     · and "Harvests dried too long" landed on the pull-schedule page, which
       holds schedule EVENTS and not harvests at all, so the figure could not
       be found there under any filter. That is the F1-1,022-plants shape: a
       tile whose drill explains a different kind of thing.

   NO PREDICATE IS INVENTED HERE. Every filter below is lifted from
   mv_department_dashboard_base's own definition of the tile it serves, and
   each one is registered in tile_drill_contract so the database re-derives the
   published figure from these very rows every hour. A filter this file gets
   wrong surfaces as DISAGREE within the hour, not as a quietly wrong list.

   TWO PREDICATES ARE WRITTEN AS THE VIEW'S OWN VOCABULARY RATHER THAN AS
   "IS NOT NULL", because the client's filter channel takes an operator and one
   value and has no three-argument negation. Both were measured equivalent
   before they were used and both are in the contract, so an inequivalence
   becomes a finding rather than a silent difference:
     · "dry time recorded" is served as `dry_days_to_first_package >= 0`. The
       column is a day count that cannot be negative, so this is exactly the
       set the tile averages over; if a negative one ever appears the contract
       breaks and says so.
     · "the harvest is closed" is served as `harvest_state = 'Finished'`, which
       is the view's own state word. Measured against `harvest_closed is not
       null` across every harvest in the view: zero rows differ.

   THE DESCRIPTORS ARE BUILT AT MODULE SCOPE, never inline. An object literal
   rebuilt each render is a new dependency each render, and DkRowDrill would
   re-read the whole population on every keystroke elsewhere on the page.

   THE DRYING ROOM IS SHOWN WITH THE LICENCE THE HARVEST SITS UNDER wherever
   the view serves one. Two of these views serve the room name with neither a
   department nor a licence, and their drills say so in words rather than
   presenting a bare room as if it were qualified — the room register maps two
   of these very names to a different department from the licence the harvests
   sit under, so composing a department here would be inventing one. The
   missing column is filed with the database team.
   ═══════════════════════════════════════════════════════════════════════════ */
const CV_KPI_IN_ROOMS = "In the rooms, dry-equivalent";
const CV_KPI_OPEN_LONG = "Harvests open too long";
const CV_KPI_PHANTOM = "Moisture loss not recorded";
const CV_KPI_AVG_DRY = "Average dry time";
const CV_KPI_DRIED_LONG = "Harvests dried too long";
const CV_KPI_CONVERSION = "Conversion, dried flower only";

/* The two owner-set limits two of these drills need. Read with the page from
   conversion_factors; never written here. Where one is absent its tile keeps
   the published navigation and the page says why, because a guessed limit
   would list the wrong harvests under the right heading. */
const CV_RULE_OPEN_MAX = "harvest_open_max_days";
const CV_RULE_DRY_MAX = "dry_window_max_days";
const CV_RULE_KEYS = [CV_RULE_OPEN_MAX, CV_RULE_DRY_MAX];
function cvRule(rows, key) {
  if (!Array.isArray(rows)) return null;
  const row = rows.find((r) => r.key === key);
  return row && row.value != null ? { value: Number(row.value), setBy: row.set_by } : null;
}

/* ── 1 · In the rooms, dry-equivalent — the whole of v_harvest_still_in_room,
      which IS the tile's population, so no filter is applied and none is
      invented. ─────────────────────────────────────────────────────────── */
const CV_O_IN_ROOMS = { col: "really_left_lb", asc: false };
const CV_C_IN_ROOMS = [
  { key: "harvest_name", label: "Harvest" },
  { key: "drying_room", label: "Drying room", none: "room not recorded" },
  { key: "harvest_started", label: "Cut on", none: "not recorded" },
  { key: "days_open", label: "Days open", kind: "num" },
  { key: "last_package_taken_off", label: "Last package taken off", none: "nothing packaged yet" },
  { key: "days_since_last_package", label: "Days since that package", kind: "num", none: "nothing packaged yet" },
  { key: "wet_lb", label: "Wet weight", kind: "lb" },
  { key: "expected_dry_lb", label: "Expected dry weight", kind: "lb" },
  { key: "packaged_lb", label: "Packaged", kind: "lb" },
  { key: "waste_lb", label: "Waste", kind: "lb" },
  { key: "really_left_lb", label: "Really left, dry-equivalent", kind: "lb" },
  { key: "old_figure_wet_minus_dry", label: "What Metrc still shows, wet", kind: "lb" },
  { key: "what_it_really_means", label: "What it really means", kind: "note", none: "no reading recorded" },
];

/* ── 2 · Harvests open too long — not closed, and open past the owner-set
      limit. The limit arrives with the page and is applied at render. ───── */
const CV_O_OPEN_LONG = { col: "total_days_start_to_now", asc: false };
const CV_C_OPEN_LONG = [
  { key: "harvest_name", label: "Harvest" },
  { key: "drying_room", label: "Drying room", none: "room not recorded" },
  { key: "license", label: "Licence the harvest sits under", none: "not recorded" },
  { key: "strain", label: "Strain", none: "strain not recorded" },
  { key: "harvest_started", label: "Cut on", none: "not recorded" },
  { key: "total_days_start_to_now", label: "Days open", kind: "num" },
  { key: "first_package_taken_off", label: "First package taken off", none: "nothing packaged yet" },
  { key: "plants", label: "Plants", kind: "num" },
  { key: "wet_lb", label: "Wet weight", kind: "lb" },
  { key: "packaged_lb", label: "Packaged", kind: "lb" },
  { key: "still_in_room_lb", label: "Still in the room", kind: "lb" },
  { key: "harvest_state", label: "State", none: "not recorded" },
  { key: "what_is_wrong", label: "What is wrong", kind: "note", none: "nothing flagged against this harvest" },
  { key: "severity", label: "Severity", none: "not graded" },
];

/* ── 3 · Moisture loss not recorded — closed, still showing water in Metrc,
      nothing written off. The three clauses are the tile's own. ─────────── */
const CV_F_PHANTOM = [
  { op: "eq", col: "harvest_state", val: "CLOSED" },
  { op: "is", col: "needs_recording", val: true },
  { op: "gt", col: "phantom_lb", val: 0 },
];
const CV_O_PHANTOM = { col: "phantom_lb", asc: false };
const CV_C_PHANTOM = [
  { key: "harvest_name", label: "Harvest" },
  { key: "strain", label: "Strain", none: "strain not recorded" },
  { key: "drying_room", label: "Drying room", none: "room not recorded" },
  { key: "harvest_started", label: "Cut on", none: "not recorded" },
  { key: "harvest_closed", label: "Closed on", none: "still open" },
  { key: "wet_lb", label: "Wet weight", kind: "lb" },
  { key: "packaged_lb", label: "Packaged", kind: "lb" },
  { key: "waste_lb", label: "Waste", kind: "lb" },
  { key: "metrc_shows_remaining_lb", label: "What Metrc still shows remaining", kind: "lb" },
  { key: "expected_moisture_loss_lb", label: "Expected moisture loss", kind: "lb" },
  { key: "really_left_lb", label: "Really left, dry-equivalent", kind: "lb" },
  { key: "phantom_lb", label: "Water still on the books", kind: "lb" },
  { key: "recorded_loss_lb", label: "Loss already recorded", kind: "lb", none: "none recorded" },
  { key: "recorded_method", label: "How it was recorded", none: "not recorded" },
  { key: "entered_by", label: "Entered by", none: "nobody recorded" },
  { key: "recorded_in_metrc", label: "Recorded in Metrc", kind: "bool", none: "not recorded" },
  { key: "status", label: "Status", none: "not flagged" },
];

/* ── 4 and 5 · Dry time. One column set, two populations: every harvest that
      HAS a recorded dry time (the average), and those past the owner-set
      longest acceptable dry time (the count). ───────────────────────────── */
const CV_F_AVG_DRY = [{ op: "gte", col: "dry_days_to_first_package", val: 0 }];
const CV_O_DRY = { col: "dry_days_to_first_package", asc: false };
const CV_C_DRY = [
  { key: "harvest_name", label: "Harvest" },
  { key: "drying_room", label: "Drying room", none: "room not recorded" },
  { key: "license", label: "Licence the harvest sits under", none: "not recorded" },
  { key: "strain", label: "Strain", none: "strain not recorded" },
  { key: "harvest_started", label: "Cut on", none: "not recorded" },
  { key: "first_package_taken_off", label: "First package taken off", none: "nothing packaged yet" },
  { key: "dry_days_to_first_package", label: "Days drying, cut to first package", kind: "num", none: "never packaged, so no dry time can be scored" },
  { key: "packaging_window_days", label: "Days spent packaging", kind: "num", none: "not scoreable yet" },
  { key: "harvest_state", label: "State", none: "not recorded" },
  { key: "plants", label: "Plants", kind: "num" },
  { key: "wet_lb", label: "Wet weight", kind: "lb" },
  { key: "packaged_lb", label: "Packaged", kind: "lb" },
  { key: "drying_verdict", label: "Drying verdict", kind: "note", none: "no verdict recorded" },
];

/* ── 6 · Conversion, dried flower only — every finished harvest, worst
      conversion first, which is the order a grower reads it in. ─────────── */
const CV_F_CONVERSION = [{ op: "eq", col: "harvest_state", val: "Finished" }];
const CV_O_CONVERSION = { col: "conversion_pct", asc: true };
const CV_C_CONVERSION = [
  { key: "harvest_name", label: "Harvest" },
  { key: "drying_room", label: "Drying room", none: "room not recorded" },
  { key: "license", label: "Licence the harvest sits under", none: "not recorded" },
  { key: "strain", label: "Strain", none: "strain not recorded" },
  { key: "harvest_closed", label: "Closed on", none: "not recorded" },
  { key: "plants", label: "Plants", kind: "num" },
  { key: "wet_lb", label: "Wet weight", kind: "lb" },
  { key: "packaged_lb", label: "Packaged", kind: "lb" },
  { key: "bud_lb", label: "Bud", kind: "lb" },
  { key: "shake_trim_lb", label: "Shake and trim", kind: "lb" },
  { key: "waste_lb", label: "Waste", kind: "lb" },
  { key: "conversion_pct", label: "Conversion, percent of wet weight packaged", kind: "num", none: "no conversion recorded" },
  { key: "wet_to_dry_ratio", label: "Wet to dry ratio", kind: "num", none: "not recorded" },
  { key: "packaged_g_per_plant", label: "Packaged grams per plant", kind: "num", none: "not recorded" },
  { key: "drying_verdict", label: "Drying verdict", kind: "note", none: "no verdict recorded" },
];

/* Whole populations in one read where they fit, with the pager still honest
   about anything beyond it. No sampling and no silent top-N (C1). */
const CV_PAGE = 500;

/* Said once, on the two drills whose view serves a room name with neither a
   department nor a licence beside it. */
const CV_ROOM_UNQUALIFIED =
  "This view serves the drying room name on its own, with no department and no licence beside it, "
  + "so the room here is NOT department-qualified. The room register maps two of these names to a "
  + "different department from the licence these harvests sit under, so this page will not compose a "
  + "department it cannot prove — the missing column is filed with the database team instead.";

/* ---------- rooms holding stock, department-qualified ---------- */
function CvStockRooms({ rows, go }) {
  const [open, setOpen] = useState(null);
  if (!rows.length) {
    return <DkEmpty why={`No room under the ${DEPT} licence is holding stock.`}
      fills="v_stock_by_department lists every room holding tagged material. An empty list here means the cultivation rooms are clear, not that the read failed." />;
  }
  const byRoom = new Map();
  for (const s of rows) {
    const k = s.licence + "|" + s.room;
    const g = byRoom.get(k) ?? {
      licence: s.licence, department: s.department, room: s.room,
      total_lb: 0, ours_lb: 0, third_party_lb: 0, tags: 0, units: 0, failed: 0, no_coa: 0,
    };
    g.total_lb += Number(s.total_lb ?? 0); g.ours_lb += Number(s.ours_lb ?? 0);
    g.third_party_lb += Number(s.third_party_lb ?? 0); g.tags += Number(s.tags ?? 0);
    g.units += Number(s.units ?? 0); g.failed += Number(s.failed ?? 0); g.no_coa += Number(s.no_coa ?? 0);
    byRoom.set(k, g);
  }
  const cards = [...byRoom.values()].sort((a, b) => b.total_lb - a.total_lb);
  return (
    <>
      <div className="cc-stockrooms">
        {cards.map((g) => {
          const k = g.licence + "|" + g.room;
          const roomQualified = g.room + " — " + g.department;
          return (
            <button key={k} className={`cc-stockroom ${open === k ? "on" : ""}`}
              onClick={() => setOpen(open === k ? null : k)}
              aria-expanded={open === k}
              title={roomQualified + (open === k ? ". Click again to close." : ". Click for every package in the room, each with its certificate and its manifest.")}>
              <span className="cc-sr-name"><DkCaret open={open === k} />{roomQualified}</span>
              <span className="cc-sr-big">{g.total_lb > 0
                ? <>{g.total_lb.toLocaleString(undefined, { maximumFractionDigits: 1 })}<em> lb</em></>
                : <>{g.units.toLocaleString()}<em> units</em></>}</span>
              <span className="cc-sr-line">
                {g.tags.toLocaleString()} tags · ours {g.ours_lb.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                {" "}· third party {g.third_party_lb.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
              <span className="cc-sr-chips">
                {g.failed > 0 && <DkTag tone="crit">{g.failed} failed</DkTag>}
                {g.no_coa > 0 && (
                  <DkTag tone="attn" title="Packages with no certificate filed directly against them. The drill states the reason on each row and resolves an inherited certificate where one exists.">
                    {g.no_coa} no direct certificate
                  </DkTag>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {open && (() => {
        const g = byRoom.get(open);
        if (!g) return null;
        const room_qualified = g.room + " — " + g.department;
        const rm = g.room;
        return (
          <DkDrill label={`Every package in ${room_qualified} (licence ${g.licence})`} onClose={() => setOpen(null)}>
            <RoomStockDrill licence={g.licence} room={rm} department={g.department} />
          </DkDrill>
        );
      })()}
    </>
  );
}

/* ---------- yield: tone from the SERVED numeric comparison only ----------
   The drying verdict is prose about water loss and lives in the expanded row,
   labelled as what it is. Colouring a bar by matching words in that prose is
   the defect that painted a +127 g over-median harvest red. */
function CvYield({ rows, go }) {
  const [openRow, setOpenRow] = useState(null);
  if (!rows.length) {
    return <DkEmpty why="No closed harvest has been weighed yet."
      fills="A row appears as soon as a harvest finishes and its dry yield is recorded." />;
  }
  const max = Math.max(...rows.map((r) => Math.max(Number(r.dry_g_per_plant || 0), Number(r.strain_median_dry_g || 0))), 1);
  return (
    <div className="cc-yield">
      {rows.map((r) => {
        const under = r.strain_median_dry_g != null && Number(r.dry_g_per_plant) < Number(r.strain_median_dry_g);
        const tone = r.strain_median_dry_g == null ? "plain" : under ? "crit" : "ok";
        const w = (Number(r.dry_g_per_plant || 0) / max) * 100;
        const tick = r.strain_median_dry_g != null ? (Number(r.strain_median_dry_g) / max) * 100 : null;
        const open = openRow === r.harvest;
        const roomQualified = (r.room ?? "room not recorded") + " — licence " + (r.licence ?? "not recorded");
        return (
          <React.Fragment key={r.harvest}>
            <button className={`cc-yrow ${open ? "on" : ""}`} onClick={() => setOpenRow(open ? null : r.harvest)}
              aria-expanded={open}
              title={`${r.harvest} · ${roomQualified} · finished ${r.finished_on}. ${open ? "Click again to close." : "Click for the full audit line."}`}>
              <span className="cc-yname"><DkCaret open={open} />{r.strain || "strain not recorded"}</span>
              <span className="cc-ytrack">
                <i className={`cc-yfill ${tone}`} style={{ width: `${Math.max(2, w)}%` }} />
                {tick != null && <b className="cc-ytick" style={{ left: `${tick}%` }}
                  title={`Strain median: ${Number(r.strain_median_dry_g).toLocaleString()} g per plant over ${r.strain_harvests} harvests`} />}
              </span>
              <span className="cc-yval">{r.dry_g_per_plant == null ? "not weighed" : `${Number(r.dry_g_per_plant).toLocaleString()} g`}</span>
            </button>
            {open && (
              <div className="cc-yopen">
                <DkDrill label={`${r.harvest} — full audit line`} onClose={() => setOpenRow(null)}>
                <p><b>{r.harvest}</b> · {roomQualified} · finished {r.finished_on} · {Number(r.plants || 0).toLocaleString()} plants
                  · wet {Number(r.wet_in_lb || 0).toLocaleString()} lb · dry {Number(r.dry_yield_lb || 0).toLocaleString()} lb
                  {r.vs_own_strain_g != null && <> · versus own strain median {Number(r.vs_own_strain_g) >= 0 ? "+" : ""}{Number(r.vs_own_strain_g).toLocaleString()} g per plant</>}
                  {r.vs_target_lb != null && <> · versus plan {Number(r.vs_target_lb) >= 0 ? "+" : ""}{Number(r.vs_target_lb).toLocaleString()} lb</>}
                </p>
                {r.audit_verdict && <p className="cc-fine"><b>Drying verdict (about water loss, not the median):</b> {r.audit_verdict}</p>}
                {r.in_plain_english && <p className="cc-fine">{r.in_plain_english}</p>}
                {r.concern && <p className="cc-fine crit">{r.concern}</p>}
                <span className="cc-inst-meta">
                  <AssignTask dept={DEPT} kpi={`Yield audit: ${r.harvest}`}
                    value={r.dry_g_per_plant} unit="g per plant" drill="v-harvest-report" />
                  <button className="cc-btn" onClick={() => go("v-harvest-report")}>Open the harvest report →</button>
                </span>
                </DkDrill>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ---------- dry-time discipline, month by month ---------- */
function CvDryTime({ rows, go }) {
  if (!rows.length) {
    return <DkEmpty why="No month has a scored dry time yet."
      fills="v_dry_time_discipline scores a harvest once it has been packaged; fresh-frozen harvests are excluded by design because they never dried." />;
  }
  const recent = rows.slice(0, 12);
  return (
    <div className="cc-yield">
      {recent.map((m) => {
        const pct = m.pct_inside_window == null ? null : Number(m.pct_inside_window);
        const tone = pct == null ? "plain" : pct >= 90 ? "ok" : pct >= 60 ? "warn" : "crit";
        return (
          <div key={m.month} className="cc-yrow static"
            title={`Window ${m.window_from_days}–${m.window_to_days} days, from conversion_factors. ${m.fresh_frozen_excluded ?? 0} fresh-frozen harvests excluded — they never dried.`}>
            <span className="cc-yname">{m.month_label}</span>
            <span className="cc-ytrack">
              <i className={`cc-yfill ${tone}`} style={{ width: `${Math.max(2, pct ?? 0)}%` }} />
            </span>
            <span className="cc-yval">
              {pct == null ? "not scored" : `${pct}% inside`}
            </span>
            <span className="cc-fine">
              {Number(m.harvests_scored ?? 0).toLocaleString()} scored
              {Number(m.dried_too_long ?? 0) > 0 && <> · <b className="crit">{m.dried_too_long} dried too long</b></>}
              {Number(m.pulled_too_fast ?? 0) > 0 && <> · {m.pulled_too_fast} pulled too fast</>}
              {m.avg_dry_days != null && <> · average {Number(m.avg_dry_days).toLocaleString()} days</>}
              {Number(m.harvests_not_yet_packaged ?? 0) > 0 && (
                <> · <span title="Still drying or not yet packaged, so no dry time can be scored for them yet. Counted, never guessed.">
                  {m.harvests_not_yet_packaged} not yet scoreable</span></>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════ the page ═══════════════════ */
export default function CultivationDashboard({ go, session, reports, role, viewAs, onViewAs, isAdmin, viewRoles }) {
  const store = useSectionStore(session?.user?.id, VIEW_KEY);
  const [range, setRange] = useState({ from: "", to: "" });
  /* Opens on the company default (this month) instead of all history —
     owner ruling 19 Aug 2026. Seeds once, then the user owns the range. */
  useDefaultRange(session, VIEW_KEY, setRange);
  const [busy, setBusy] = useState(false);
  const [ver, setVer] = useState(0);
  const [d, setD] = useState(null);
  /* The three slow views, read in their own wave. `null` means still reading —
     which is a different thing from read-and-empty, and the panels below say
     which of the two they are showing. */
  const [slow, setSlow] = useState(null);
  /* WHICH KEY FIGURE HAS ITS OWN RECORDS OPEN. One at a time, so two evidence
     tables can never stand open under each other's headings. */
  const [openKpi, setOpenKpi] = useState(null);
  const toggleKpi = (k) => setOpenKpi((cur) => (cur === k ? null : k));

  /* THE PAGE IS A DECLARATIVE LIST OF WIDGET KEYS. Adding a section to this
     dashboard is one entry here plus its <Widget> below — that is the whole
     point of the framework. */
  const WIDGETS = React.useMemo(() => [
    { key: "rooms", title: "Flower rooms — the cycle, department-qualified", span: 2 },
    { key: "harvests", title: "Open harvests — every one, with the arithmetic", span: 2 },
    { key: "yield", title: "Yield — grams per plant, tick = own strain median", span: 1 },
    { key: "drytime", title: "Dry-time discipline — month by month against the window", span: 1 },
    { key: "stockrooms", title: "What the cultivation rooms are holding", span: 2 },
    { key: "queue", title: "Work queue — every open finding, grouped by cause", span: 2 },
    { key: "words", title: "In plain words — the period, the platform, and signed notes", span: 2 },
    { key: "targets", title: "Owner-set targets with no published figure", span: 1 },
    { key: "tasks", title: "Tasks raised from this dashboard", span: 1 },
    { key: "reports", title: "Reports — by group", span: 2 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const queue = useWorkQueue(DEPT);

  /* ═══════════════════════════════════════════════════════════════════════
     WHY THIS PAGE READS IN TWO WAVES, AND WHAT IT COST BEFORE.

     Owner report: the Cultivation dashboard takes about thirty-five seconds to
     appear. Measured here on 15 Aug 2026 as a signed-in user, by timing every
     request the page issues:

       v_room_board_complete    8,168 ms
       v_global_management      8,153 ms
       v_stock_by_department    8,153 ms
       mv_department_dashboard    156 ms   <- the key figures
       every other read          under 530 ms

     The eleven reads were one Promise.all and the page rendered NOTHING until
     the last of them settled, so the key figures — which arrive in about a
     sixth of a second — were held behind three slow views for eight seconds
     and, when those views were competing with other traffic, far longer. That
     is a front-end defect: the page chose to wait.

     So the reads are split. WAVE ONE is everything fast, and the page draws as
     soon as it lands: the heading, the action bar, the key figures, the
     targets, the yield panel, the dry-time panel and the task list. WAVE TWO
     is the three slow views, which resolve on their own and fill their own
     panels; until each lands its panel says it is still reading, which is an
     honest state rather than a blank one.

     NOTHING IS DROPPED AND NO READ IS NARROWED. Every column and every row the
     page used before, it still uses. The remaining eight seconds live inside
     those three views and belong to the database team; they are reported, not
     worked around by fetching less than the page needs.
     ═══════════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    let live = true;
    (async () => {
      const [tiles, trend, targets, alertRules, limits, yld, dry, tasks] =
        await Promise.all([
          supabase.rpc("f_department_dashboard", { p_dept: DEPT, p_from: range.from || null, p_to: range.to || null })
          .then((r) => (r.error || !r.data || !r.data.length)
            ? supabase.from("mv_department_dashboard").select("*").eq("department", DEPT).order("ord")
            : r),
          supabase.from("v_dashboard_trend").select("*").eq("department", DEPT),
          supabase.from("kpi_targets").select("*").eq("department", DEPT),
          supabase.from("harvest_alert_rules").select("rule_key, threshold, note, active")
            .in("rule_key", ["weekend_warning_days", "late_tolerance_days"]),
          /* THE TWO OWNER-SET LIMITS TWO OF THE KEY FIGURES ARE DEFINED BY.
             They are rows in conversion_factors, read here so those tiles'
             drills can ask for exactly the harvests the tiles counted. Never
             a literal: today's values are today's values, not the rules. */
          supabase.from("conversion_factors").select("key, value, set_by, what_it_means")
            .in("key", CV_RULE_KEYS),
          supabase.from("v_harvest_yield_audit").select("*").order("finished_on", { ascending: false }).limit(12),
          supabase.from("v_dry_time_discipline").select("*").order("month", { ascending: false }),
          supabase.from("v_dashboard_tasks").select("*"),
        ]);
      if (!live) return;
      setD({
        /* The range these rows were computed for — the shared strip compares it
           to the range now selected and refuses to show a figure under a label
           it does not belong to. Owner, 19 Aug 2026. */
        computedFor: { from: range.from, to: range.to },
        tiles: grab(tiles), trend: grab(trend), targets: grab(targets),
        alertRules: grab(alertRules), limits: grab(limits),
        yld: grab(yld), dry: grab(dry), tasks: grab(tasks),
      });
    })();
    return () => { live = false; };
  /* range.from / range.to: this dashboard never re-fetched on a date change —
     its effect depended on [ver] alone, so the picker moved and nothing behind
     it did. Owner, 19 Aug 2026. */
  }, [ver, range.from, range.to]);

  /* WAVE TWO. Each of these three fills one panel and gates nothing else. The
     ORDER BY on the room board is gone: it sorted an expensive view server-side
     to produce an order the board re-groups anyway, and the rows are sorted
     here instead, at no cost. That is the only change to what is asked for. */
  useEffect(() => {
    let live = true;
    (async () => {
      const [rooms, stockRooms, global] = await Promise.all([
        supabase.from("v_room_board_complete").select("*"),
        supabase.from("v_stock_by_department").select("*").eq("department", DEPT.toUpperCase()),
        supabase.from("v_global_management").select("*").eq("department", DEPT).maybeSingle(),
      ]);
      if (!live) return;
      setSlow({
        rooms: grab(rooms),
        stockRooms: grab(stockRooms),
        global: global.error ? { rows: null, err: global.error.message } : { rows: global.data, err: null },
      });
    })();
    return () => { live = false; };
  }, [ver]);

  /* THE TWO SERVED LIMITS, AND THE FILTER ARRAYS BUILT FROM THEM. Memoised on
     the value so DkRowDrill does not see a new dependency and re-read its whole
     population on every unrelated render. Where a limit could not be read there
     is NO filter and NO in-place drill for that figure: a guessed limit lists
     the wrong harvests under the right heading, which is worse than the
     navigation it would replace. The page says so on screen. */
  const limitRows = d ? d.limits.rows : null;
  const openMax = React.useMemo(() => cvRule(limitRows, CV_RULE_OPEN_MAX), [limitRows]);
  const dryMax = React.useMemo(() => cvRule(limitRows, CV_RULE_DRY_MAX), [limitRows]);
  const cvOpenTooLong = React.useMemo(
    () => (openMax == null ? null : [
      { op: "is", col: "harvest_closed", val: null },
      { op: "gt", col: "total_days_start_to_now", val: openMax.value },
    ]),
    [openMax],
  );
  const cvDriedTooLong = React.useMemo(
    () => (dryMax == null ? null : [{ op: "gt", col: "dry_days_to_first_package", val: dryMax.value }]),
    [dryMax],
  );

  const recompute = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("tg_snapshot_dashboards");
    if (error && d) setD((p) => ({ ...p, tiles: { ...p.tiles, err: `Recompute refused: ${error.message}` } }));
    setVer((v) => v + 1);
    setBusy(false);
  };

  if (d === null) {
    return <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Building the {DEPT} dashboard from the live records…</div></div>;
  }

  const computed = d.tiles.rows?.[0]?.computed_at ?? null;
  const trendByKpi = Object.fromEntries(d.trend.rows.map((r) => [r.kpi, r]));
  const targetByKpi = Object.fromEntries(d.targets.rows.map((r) => [r.kpi, r]));
  const warnRule = d.alertRules.rows.find((x) => x.rule_key === "weekend_warning_days" && x.active);
  /* The room board arrives in the second wave, so until it lands there is no
     room list to count. `null` here means still reading and is rendered as such;
     an empty array would read as "no flower rooms", which is a different claim. */
  const flowerRooms = slow ? slow.rooms.rows.filter((r) => r.room_role === "Flower room") : null;
  const roomsOver = flowerRooms ? flowerRooms.filter((r) => Number(r.days_until) < 0 && Number(r.plants_now) > 0) : null;
  const yieldUnder = d.yld.rows.filter((r) => r.strain_median_dry_g != null && Number(r.dry_g_per_plant) < Number(r.strain_median_dry_g));
  const openTasks = d.tasks.rows.filter((t) => t.department === DEPT);
  const overdueTasks = openTasks.filter((t) => t.position?.startsWith("OVERDUE"));
  const dryLatest = d.dry.rows[0];

  /* EVERY PUBLISHED FIGURE OPENS ITS OWN RECORDS, IN PLACE. The two that are
     defined by an owner-set limit join the map only once that limit has been
     read; without it they keep the published navigation and the page says why
     immediately below the strip. A key here matching no published figure is
     raised by the strip as a critical chip rather than dropped in silence. */
  const kpiInPlace = {};
  for (const k of [CV_KPI_IN_ROOMS, CV_KPI_PHANTOM, CV_KPI_AVG_DRY, CV_KPI_CONVERSION,
                   ...(cvOpenTooLong ? [CV_KPI_OPEN_LONG] : []),
                   ...(cvDriedTooLong ? [CV_KPI_DRIED_LONG] : [])]) {
    kpiInPlace[k] = { open: openKpi === k, onOpen: () => toggleKpi(k) };
  }
  const openTileRow = d.tiles.rows.find((t) => t.kpi === openKpi) ?? null;

  return (
    <DrillRoot label="Cultivation">
    <div className="ccpage">
      <DkHead title={`${DEPT} dashboard`} viewKey={VIEW_KEY} dept={DEPT} role={role}
        viewAs={viewAs} computed={computed} busy={busy} />

      <div className="cc-tools">
        <div className="cc-tools-l">
          <button className="cc-btn" title="Collapse every section — remembered per user on this device"
            onClick={() => store.setAll(WIDGETS.map((w) => w.key), false)}>− collapse all</button>
          <button className="cc-btn" title="Expand every section"
            onClick={() => store.setAll(WIDGETS.map((w) => w.key), true)}>+ expand all</button>
          <WidgetBarControls layout={layout} />
          {isAdmin && (
            <select className="cc-input cc-viewsel" aria-label="View this platform as another role — presentation preview only"
              value={viewAs ?? ""} onChange={(e) => onViewAs(e.target.value || null)}>
              <option value="">view as…</option>
              {rowsOr(viewRoles).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>
        <div className="cc-tools-c">
          <DateRangeSelect label="Dates" from={range.from} to={range.to}
            onFrom={(v) => setRange((p) => ({ ...p, from: v }))}
            onTo={(v) => setRange((p) => ({ ...p, to: v }))} />
        </div>
        <div className="cc-tools-r">
          <button className="cc-btn" onClick={recompute} disabled={busy}
            title="Recompute the dashboard snapshot now — progress shows on the data-age stamp above">↻ recompute</button>
          <button className="cc-btn" onClick={() => window.print()}>🖨 print</button>
          <button className="cc-btn" onClick={() => go("dashboard_tasks")}>☑ tasks</button>
          <button className="cc-btn" onClick={() => go("inventory_alerts")}>⚠ alerts</button>
          <button className="cc-btn" onClick={() => go("dept_dash_command")}>Command Center →</button>
        </div>
      </div>

      {d.tiles.err ? <DkErr what="The key figures" err={d.tiles.err} />
        : d.tiles.rows.length === 0
          ? <DkGapCard row={slow ? slow.global.rows : null} dept={DEPT} go={go} />
          : <DkKpiStrip dept={DEPT} tiles={d.tiles.rows} trend={trendByKpi} targets={targetByKpi}
              range={range} computedFor={d.computedFor}
              go={go} onAssigned={() => setVer((v) => v + 1)} inPlace={kpiInPlace} />}
      {d.targets.err && <DkErr what="The owner-set targets" err={d.targets.err} />}
      {d.trend.err && <DkErr what="The trend snapshots" err={d.trend.err} />}
      {d.limits.err && <DkErr what="The owner-set harvest and drying limits" err={d.limits.err} />}
      {!d.limits.err && openMax == null && (
        <div className="cc-fine">
          No harvest-open limit is set, so <b>{CV_KPI_OPEN_LONG}</b> still opens the whole harvest
          exceptions register rather than the harvests it counted. The limit is the
          conversion_factors row <b>{CV_RULE_OPEN_MAX}</b>, and this page will not guess one to
          narrow a list with — a guessed limit would list the wrong harvests under the right heading.
        </div>
      )}
      {!d.limits.err && dryMax == null && (
        <div className="cc-fine">
          No longest-acceptable dry time is set, so <b>{CV_KPI_DRIED_LONG}</b> still opens the page
          named in its published drill rather than the harvests it counted. The limit is the
          conversion_factors row <b>{CV_RULE_DRY_MAX}</b>, and this page will not guess one.
        </div>
      )}

      {/* ── the records behind whichever key figure is open, in place ────────
          One at a time. Each closes on its own control at the top of the
          drill, on Escape, and on the browser's back button, and the page
          behind it never re-mounts. The general report stays reachable from
          inside the drill, one press further in. ─────────────────────────── */}
      {openTileRow && kpiInPlace[openTileRow.kpi] && (
        <DkDrill label={`${openTileRow.kpi} — every record behind the figure`}
          onClose={() => setOpenKpi(null)}>
          {openTileRow.context && <div className="cc-fine">{openTileRow.context}</div>}

          {openKpi === CV_KPI_IN_ROOMS && (
            <DkRowDrill view="v_harvest_still_in_room" order={CV_O_IN_ROOMS}
              columns={CV_C_IN_ROOMS} pageSize={CV_PAGE}
              note={"Every open harvest with material still in the room — this view IS the figure's whole "
                + "population, so no filter is applied and none is invented. The dry-equivalent is the "
                + "view's own figure; the wet figure beside it is what Metrc still shows, and the "
                + "difference is water. " + CV_ROOM_UNQUALIFIED}
              footer={<button className="cc-btn" onClick={() => go("moisture_loss_register")}>
                Open the full moisture loss register →
              </button>} />
          )}

          {openKpi === CV_KPI_OPEN_LONG && cvOpenTooLong && (
            <DkRowDrill view="v_harvest_forensic" filters={cvOpenTooLong} order={CV_O_OPEN_LONG}
              columns={CV_C_OPEN_LONG} pageSize={CV_PAGE}
              note={`Harvests not yet closed that have been open longer than the owner-set limit of `
                + `${openMax.value} days${openMax.setBy ? `, set by ${openMax.setBy}` : ""}. The limit is `
                + `read from the business rules with the page, never written into it. These are the `
                + `harvests the figure counted, not every harvest carrying an issue.`}
              footer={<button className="cc-btn" onClick={() => go("harvest_issues")}>
                Open the full harvest exceptions register →
              </button>} />
          )}

          {openKpi === CV_KPI_PHANTOM && (
            <DkRowDrill view="v_moisture_loss_register" filters={CV_F_PHANTOM} order={CV_O_PHANTOM}
              columns={CV_C_PHANTOM} pageSize={CV_PAGE}
              note={"Closed harvests that still show water in Metrc with no loss written off against "
                + "them. This is a different population from the open harvests in the room, which is "
                + "why the two moisture figures no longer share one destination. " + CV_ROOM_UNQUALIFIED}
              footer={<button className="cc-btn" onClick={() => go("moisture_loss_register")}>
                Open the full moisture loss register →
              </button>} />
          )}

          {openKpi === CV_KPI_AVG_DRY && (
            <DkRowDrill view="v_harvest_forensic" filters={CV_F_AVG_DRY} order={CV_O_DRY}
              columns={CV_C_DRY} pageSize={CV_PAGE}
              note={"Every harvest with a recorded dry time, cut to first package, longest first. The "
                + "figure above is the average of that one column across exactly these rows and no "
                + "others. A harvest never packaged has no dry time to average, so it is absent here "
                + "rather than counted as nothing. This averages over HARVESTS; the drying-room panel "
                + "averages over ROOMS, which is a different question with the same words."}
              footer={<button className="cc-btn" onClick={() => go("dry_room_performance")}>
                Open drying room performance, which averages by room →
              </button>} />
          )}

          {openKpi === CV_KPI_DRIED_LONG && cvDriedTooLong && (
            <DkRowDrill view="v_harvest_forensic" filters={cvDriedTooLong} order={CV_O_DRY}
              columns={CV_C_DRY} pageSize={CV_PAGE}
              note={`Harvests whose dry time from cut to first package ran past the owner-set longest `
                + `acceptable dry time of ${dryMax.value} days`
                + `${dryMax.setBy ? `, set by ${dryMax.setBy}` : ""}. Each of these is a harvest, listed `
                + `by name — the figure is a count of harvests and this is that list.`}
              footer={<button className="cc-btn" onClick={() => go("harvest_forensic")}>
                Open the full harvest detail register →
              </button>} />
          )}

          {openKpi === CV_KPI_CONVERSION && (
            <DkRowDrill view="v_harvest_forensic" filters={CV_F_CONVERSION} order={CV_O_CONVERSION}
              columns={CV_C_CONVERSION} pageSize={CV_PAGE}
              note={"Every finished harvest, worst conversion first. The figure above is the average of "
                + "the conversion column across exactly these rows. It averages over HARVESTS; the "
                + "yield gap page averages over ROOMS, and the two answers are far enough apart that a "
                + "yield claim must name which one it came from."}
              footer={<button className="cc-btn" onClick={() => go("issue_yield_gap")}>
                Open the yield gap page, which averages by room →
              </button>} />
          )}
        </DkDrill>
      )}

      <WidgetBoard layout={layout}>
        {layout.list.map((w) => {
          switch (w.key) {
            case "rooms": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={!slow ? <DkTag tone="info">still reading the room board</DkTag>
                  : slow.rooms.err ? <DkTag tone="crit">read failed</DkTag> : (
                  <>
                    {roomsOver && roomsOver.length > 0
                      ? <DkTag tone="crit">{roomsOver.length} past the scheduled pull</DkTag>
                      : <DkTag tone="ok">every flower room inside its cycle</DkTag>}
                    <DkTag tone="neutral">{flowerRooms ? flowerRooms.length : 0} flower rooms</DkTag>
                  </>
                )}>
                {!slow ? <div className="cc-fine">Reading the room board. It is the slowest read on this page,
                    so the rest of the dashboard is drawn without waiting for it.</div>
                  : slow.rooms.err ? <DkErr what="The room board" err={slow.rooms.err} />
                  : <DkRoomBoard rooms={slow.rooms.rows} warnDays={warnRule ? Number(warnRule.threshold) : null}
                      renderPlantDrill={(code) => <RoomDrill code={code} />} />}
              </Widget>
            );
            case "harvests": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                chips={<DkTag tone="neutral" title="Every harvest still open, with the wet-to-dry arithmetic shown on the row so no figure has to be taken on trust.">full detail</DkTag>}>
                <OpenHarvestDetail />
              </Widget>
            );
            case "yield": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={d.yld.err ? <DkTag tone="crit">read failed</DkTag> : (
                  <>
                    {yieldUnder.length > 0
                      ? <DkTag tone="crit">{yieldUnder.length} under own strain median</DkTag>
                      : <DkTag tone="ok">every recent harvest at or above its strain median</DkTag>}
                    <DkTag tone="neutral">last {d.yld.rows.length} closed</DkTag>
                  </>
                )}>
                {d.yld.err ? <DkErr what="The yield audit" err={d.yld.err} /> : <CvYield rows={d.yld.rows} go={go} />}
              </Widget>
            );
            case "drytime": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={d.dry.err ? <DkTag tone="crit">read failed</DkTag> : dryLatest ? (
                  <>
                    <DkTag tone={Number(dryLatest.pct_inside_window) >= 90 ? "ok" : Number(dryLatest.pct_inside_window) >= 60 ? "warn" : "crit"}>
                      {dryLatest.month_label}: {dryLatest.pct_inside_window ?? "not scored"}% inside
                    </DkTag>
                    <DkTag tone="neutral" title="The window is read from conversion_factors, never typed here.">
                      window {dryLatest.window_from_days}–{dryLatest.window_to_days} days
                    </DkTag>
                  </>
                ) : null}>
                {d.dry.err ? <DkErr what="Dry-time discipline" err={d.dry.err} /> : <CvDryTime rows={d.dry.rows} go={go} />}
              </Widget>
            );
            case "stockrooms": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={!slow ? <DkTag tone="info">still reading</DkTag>
                  : slow.stockRooms.err ? <DkTag tone="crit">read failed</DkTag> : (
                  <DkTag tone="neutral">
                    {slow.stockRooms.rows.reduce((a, r) => a + Number(r.tags ?? 0), 0).toLocaleString()} tags
                  </DkTag>
                )}>
                {!slow ? <div className="cc-fine">Reading what the cultivation rooms are holding…</div>
                  : slow.stockRooms.err ? <DkErr what="The cultivation rooms" err={slow.stockRooms.err} />
                  : <CvStockRooms rows={slow.stockRooms.rows} go={go} />}
              </Widget>
            );
            case "queue": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={queue.err ? <DkTag tone="crit">read failed</DkTag> : (
                  <>
                    <DkTag tone="neutral">{queue.causes ? queue.causes.length : "…"} causes</DkTag>
                    <DkTag tone={queue.findings ? "crit" : "ok"}>{queue.findings ?? "…"} open findings</DkTag>
                    {slow && slow.global.rows?.critical_findings > 0 && (
                      <DkTag tone="crit">{slow.global.rows.critical_findings} critical</DkTag>
                    )}
                  </>
                )}>
                <DkWorkQueue causes={queue.causes} lanes={queue.lanes} err={queue.err}
                  dept={DEPT} isAdmin={isAdmin} viewKey={VIEW_KEY} go={go} />
              </Widget>
            );
            case "words": return (
              <Widget key={w.key} w={w} layout={layout} store={store}>
                <DkNarrative page={PAGE_KEY} range={range} role={role} session={session} go={go} />
              </Widget>
            );
            case "targets": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                chips={<DkTag tone="neutral">{d.targets.rows.length} targets set</DkTag>}>
                <DkOrphanTargets targets={targetByKpi} tiles={d.tiles.rows} go={go} />
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
