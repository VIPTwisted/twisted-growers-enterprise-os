/* ═══════════════════════════════════════════════════════════════════════════
   THE PLANT CENSUS AND THE METRC MIRROR — Agent B, 15 Aug 2026.

   WHY THIS PAGE EXISTS. On 14-15 Aug 2026 the plant record was reconciled
   against Metrc's own two paths and the result is now solid: 4,413 standing
   plants, every row carrying which of Metrc's doors it came through, and a
   per-room balance against Metrc's own point-in-time report showing no gap in
   any of the four flower rooms. Measured before this file was written, none of
   that reached a screen: `v_plant_census` and `v_plant_mirror_balance` were
   named by no component in app/web/src. A reconciliation nobody can look at is
   a reconciliation that has to be done again next time somebody asks.

   ── THIS FILE COMPUTES NO BUSINESS FIGURE ──────────────────────────────────
   Every count on this page is produced BY THE DATABASE. The tiles do not read
   rows and length them: each one issues a `count: exact, head: true` request
   carrying the same filter its drill carries, so the number on the tile and
   the list underneath it are the same question asked once each. Reads:

     v_plant_census          one row per standing plant, with its provenance
     v_plant_mirror_balance  our mirror against Metrc's own report, per room
     v_room_board_complete   the department that qualifies every room name
     v_dashboard_trend       the daily series, where one is genuinely kept
     kpi_targets             the owner-set target the rails are driven from
     v_dashboard_tasks       work raised from these tiles
     correction_proposal     corrections OPEN against the views above

   ── THE TWO DOORS, WHICH ARE NOT THE SAME DOOR ─────────────────────────────
   v_plant_census's own comment is the specification and it is worth restating,
   because a reader who does not know this will misread every figure here:
   Metrc offers the plant record through an API and through a dated
   point-in-time report, and THEY DO NOT AGREE BY CONSTRUCTION. The API cannot
   see Flower Room #2 at all — 1,050 tags that appear in no API response in any
   state across every window from May 2024 to Aug 2026, with nine consecutive
   runs returning zero while reporting success. The report can see them. So
   `source` is carried on every row and is never collapsed: "both" is a plant
   two independent paths agree on, and "metrc report only" is the expected
   state for a room the API is blind to, not a defect in this platform.

   The report is DATED. `report_age_days` is on every row and is stated beside
   every figure drawn from it, because a nine-day-old report and a live mirror
   disagreeing by a few plants is movement, not a discrepancy.

   ── THE DISAGREEMENT THIS PAGE REFUSES TO HIDE ─────────────────────────────
   v_dashboard_trend keeps a daily series called "Plants growing now" and its
   latest point does not equal the census. Both numbers are shown, side by
   side, named, with the observation that they are differently derived — and
   NEITHER is drawn as a trend line on a census tile. Averaging them, picking
   one, or quietly drawing the series under the other number would each turn a
   finding into a decoration. Disagreement is the finding.

   ── NO FABRICATED HISTORY ──────────────────────────────────────────────────
   No daily snapshot is kept of the census itself. So the tiles say that, in
   those words, and no line is drawn. A sparkline invented from one reading is
   a picture of a straight line and it is a lie about what is known.

   ── A ROOM IS NEVER SHOWN WITHOUT ITS DEPARTMENT ───────────────────────────
   Eleven room names exist in both Cultivation and Manufacturing. Every room
   name on this page goes through dkRoomQualified against v_room_board_complete
   before it is rendered — including inside drill headings, which is where a
   bare name usually survives review.

   ── SHARE PRIMITIVES, NEVER LAYOUTS ────────────────────────────────────────
   The chips, panels, drill, tables, buttons and empty states are dashkit's,
   used here. The KEY-FIGURE STRIP is this page's own, for the same reason
   dash-schedule.jsx keeps its own: DkKpiStrip states on its face that its
   figures come from mv_department_dashboard and cover "all data, all time",
   and both claims would be false here. A shared primitive that asserts
   something untrue about a page's data is worse than a second layout.

   A census is not a schedule and is not a ledger. It counts what is standing
   and proves where each count came from; that is its own shape.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { AssignTask } from "./App.jsx";
import {
  grab, listOf, DkTag, DkErr, DkEmpty, DkDrill, DrillRoot, DkCaret, DkHead,
  dkRoomQualified, useWidgetLayout, Widget, WidgetBoard, WidgetBarControls,
  useSectionStore, DkNarrative, DkTasks, DkReports, DkRowDrill,
} from "./dashkit.jsx";
import "./dash-plants.css";

const DEPT = "Cultivation";
const VIEW_KEY = "plant_census";
const PAGE_KEY = "plant_census";
const CENSUS = "v_plant_census";
/* Every object on this page descends from the plant record, so an open
   correction naming a plant object is a correction against these figures. */
const CORRECTION_TARGET = "%plant%";
/* The trend series that counts plants by a different derivation. Named as a
   constant because the page's job is to REPORT the disagreement, not to
   resolve it, and a reader should be able to find the exact series. */
const RIVAL_TREND_KPI = "Plants growing now";

/* ═══════════════════════════════════════════════════════════════════════════
   THE MEASURES. One entry per figure this page knows how to count.

   `filters` is the single definition of each population: the tile counts with
   it and the drill lists with it, from the same view, so the two cannot drift.
   That is the whole of the tile-drill contract, held structurally rather than
   by two call sites remembering to agree.

   `targetKpi` names the row in kpi_targets a tile reports against. Where no
   such row exists the tile says "no target set" and offers no judgement of its
   own — this platform never invents a threshold.
   ═══════════════════════════════════════════════════════════════════════════ */
const MEASURES = [
  {
    col: "standing", label: "Standing plants", unit: "plants", filters: [],
    what: "Every plant Metrc holds as standing right now, through either of its two paths. This is the census: it counts plants, never plant batches, and a plant appears exactly once however many doors report it.",
  },
  {
    col: "both", label: "Confirmed by both of Metrc's paths", unit: "plants",
    filters: [{ op: "eq", col: "source", val: "both" }],
    what: "Plants the live API mirror and Metrc's own dated report BOTH show standing. Two independent records of the same fact — the strongest evidence this platform can offer that a plant exists.",
  },
  {
    col: "report_only", label: "Seen only in Metrc's dated report", unit: "plants",
    filters: [{ op: "eq", col: "source", val: "metrc report only" }],
    what: "Plants the point-in-time report shows and the API has never returned. For Flower Room #2 this is the EXPECTED state and not a fault: the API is blind to that room. Read the report age before treating any of these as a question.",
  },
  {
    col: "api_only", label: "Seen only in the live API mirror", unit: "plants",
    filters: [{ op: "eq", col: "source", val: "metrc api only" }],
    what: "Plants the API shows that Metrc's dated report does not. This is the expected state for anything that moved AFTER the report was taken, so the report's age is the first thing to check, not the plant.",
  },
  {
    col: "room_dispute", label: "Plants whose room the two paths dispute", unit: "plants",
    filters: [{ op: "not.is", col: "room_disagreement", val: null }],
    what: "Both of Metrc's paths agree the plant is standing and disagree about WHICH ROOM it is standing in. Each row carries the database's own sentence describing the disagreement; nothing here picks a winner.",
  },
];

/* Which room a census row belongs to, qualified by department before it ever
   reaches a rendered string. `dkRoomQualified` already words an unknown
   department honestly, so an unmapped room degrades to a stated absence rather
   than to a bare name that could mean either building. */
function qualify(deptOf, room) {
  return dkRoomQualified({ room, department: deptOf.get(room) ?? null });
}

const NUM = (v) => (v === null || v === undefined ? null : Number(v).toLocaleString());

/* A served error, turned into something a person can act on, WITHOUT ever
   inventing what went wrong. An error object with a blank message is itself a
   fact worth stating: it means the failure arrived with no explanation
   attached, and "the database refused the count and gave no reason" is the
   honest sentence for it. A blank string here would be read as "no error" by
   every branch downstream, which is how a refused read becomes a spinner that
   never stops. */
function errText(error) {
  const parts = [error.message, error.details, error.hint]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  if (parts.length) return `${parts.join(" — ")}${error.code ? ` (${error.code})` : ""}`;
  return error.code
    ? `The database refused this count and returned no message, only the code ${error.code}.`
    : "The database refused this count and returned no message with it.";
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE KEY FIGURES — rule 10, clause by clause.

   Large number · unit · plain-language label · the owner-set target where one
   exists and an honest "no target set" where none does · the exact records on
   one press · assign to a named person capturing the value as it stood · and,
   where no daily history is kept, THE WORDS FOR THAT rather than a line drawn
   from a single reading.
   ═══════════════════════════════════════════════════════════════════════════ */
function KeyFigures({ counts, targets, openKey, onOpen, onAssigned }) {
  const noTarget = MEASURES.filter((m) => !m.targetKpi || !targets[m.targetKpi]).length;
  return (
    <div className="cc-kpiwrap">
      <div className="cc-striphead">
        <span className="cc-striplabel">Key figures — the standing plant record</span>
        <DkTag tone="neutral">{MEASURES.length} figures</DkTag>
        <DkTag tone="info"
          title="Each figure is an exact count issued to the database with the same filter its drill carries, at the moment this page asked. No row is counted in the browser and no figure is cached.">
          counted by the database, not by this page ⓘ
        </DkTag>
        {noTarget > 0 && (
          <DkTag tone="attn"
            title="A figure with no owner-set target cannot show a red rail, because there is nothing to breach. Targets are rows in kpi_targets set by a person; this platform never invents one. Set them on the Goals and Targets page.">
            {noTarget} with no owner-set target ⓘ
          </DkTag>
        )}
      </div>
      <div className="cc-kpi-strip">
        {MEASURES.map((m) => {
          const c = counts[m.col];
          const tg = m.targetKpi ? targets[m.targetKpi] : null;
          const failed = c && c.err;
          const value = c && !c.err ? c.n : null;
          const offTarget = value != null && tg && tg.target != null &&
            (tg.direction === "at_most" ? Number(value) > Number(tg.target) : Number(value) < Number(tg.target));
          const open = openKey === m.col;
          return (
            <div key={m.col} className={`cc-kpi ${open ? "on" : ""}`}>
              <button className="cc-kpi-open" type="button" aria-expanded={open}
                onClick={() => onOpen(open ? null : m.col)}
                title={`${m.what} ${open ? "Press again to close; the records are listed below the strip." : "Press for the exact records behind this figure, in place, below the strip."}`}>
                <span className="cc-kpi-lbl">{m.label}</span>
                <span className="cc-kpi-line">
                  {failed ? (
                    <b className="cc-kpi-val crit">could not be counted</b>
                  ) : value === null ? (
                    <b className="cc-kpi-val plain">counting…</b>
                  ) : (
                    <>
                      <b className={`cc-kpi-val ${offTarget ? "crit" : "plain"}`}>{NUM(value)}</b>
                      <em className="cc-kpi-unit">{m.unit}</em>
                    </>
                  )}
                  <em className="cc-kpi-nohist"
                    title="A trend line is drawn only from real repeated snapshots of the same figure. Nothing snapshots the plant census daily, so there is no history to draw and none is invented here. The one daily plant series the platform does keep is derived differently and disagrees; it is reported in its own section below rather than drawn on this tile.">
                    no daily history is kept for this figure
                  </em>
                </span>
                {tg && tg.target != null ? (
                  <span className={`cc-kpi-target ${offTarget ? "crit" : ""}`}
                    title={`This tile reports against the owner-set target named “${tg.kpi}” in kpi_targets. Set by ${tg.set_by ?? "a person, not recorded"}.`}>
                    target {tg.direction === "at_most" ? "no more than" : "at least"} {Number(tg.target).toLocaleString()}
                    {value === null ? " — nothing to compare yet" : offTarget ? " — BREACHED" : " — within"}
                    {" "}· measured against “{tg.kpi}”
                  </span>
                ) : (
                  <span className="cc-kpi-target none"
                    title="Nobody has set a target for this figure, so there is no rail to breach and this page offers no judgement of its own. Set one on the Goals and Targets page.">
                    no target set
                  </span>
                )}
                <span className="cc-kpi-ctx">{failed ? c.err : m.what}</span>
                <span className="cc-kpi-pair-go">
                  {open ? "Close — the records are below" : "Open the exact records →"}
                </span>
              </button>
              {/* Assign from the tile, using the certified affordance rather than a
                  second one: same class, same position, same behaviour as every
                  other tile on the platform. The value travels with it exactly as
                  it stood when the button was pressed. */}
              <span className="cc-kpi-assign">
                <AssignTask dept={DEPT} kpi={m.label} value={value} unit={m.unit}
                  drill={VIEW_KEY} onDone={onAssigned} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE MIRROR, ROOM BY ROOM.

   One card per room, rendered AS SERVED. The verdict word and the staleness
   sentence are the database's, not this page's: a component that decides for
   itself what counts as balanced is a second definition of balance, and the
   next person to change the rule changes it in one place and not the other.
   ═══════════════════════════════════════════════════════════════════════════ */
function MirrorBoard({ rows, err, deptOf, openRoom, onOpenRoom }) {
  if (err) return <DkErr what="The mirror against Metrc's own report" err={err} />;
  if (!rows.length) {
    return <DkEmpty why="No room is on the mirror board."
      fills="v_plant_mirror_balance carries a row per room that appears in BOTH our mirror and Metrc's point-in-time report. With no report loaded there is nothing to balance against, and this page will not present our own count as though something had confirmed it." />;
  }
  const worst = rows.reduce((a, r) => Math.max(a, Math.abs(Number(r.gap || 0))), 0);
  return (
    <>
      <div className="cc-fine">
        Each room is our mirror set against Metrc&rsquo;s own point-in-time report for the same
        room. <b>The report is a dated export</b>, so its age is on every card: a small gap
        against a nine-day-old report can simply be movement since, and each row carries the
        database&rsquo;s own sentence saying so. {worst === 0
          ? <>Every room currently reads <b>no gap at all</b>, which is the strongest state this
            comparison has.</>
          : <>The largest gap in any room is <b>{NUM(worst)}</b> plants.</>}
      </div>
      <div className="pc-rooms">
        {rows.map((r) => {
          const gap = Number(r.gap || 0);
          const tone = gap === 0 ? "ok" : Math.abs(gap) > 50 ? "crit" : "warn";
          const qualified = qualify(deptOf, r.room);
          const open = openRoom === r.room;
          return (
            <div key={r.room} className={`pc-room ${tone} ${open ? "on" : ""}`}>
              <button className="pc-room-open" type="button" aria-expanded={open}
                onClick={() => onOpenRoom(open ? null : r.room)}
                title={`Open every plant standing in ${qualified}, one row each, with the Metrc path that reports it.`}>
                {/* Never the bare room name: eleven names exist in two departments
                    and two of them are real rooms in two different buildings. */}
                <span className="pc-room-name">{qualified}</span>
                <span className="pc-room-nums">
                  <span><b>{NUM(r.metrc_report_plants)}</b><em>Metrc&rsquo;s report</em></span>
                  <span><b>{NUM(r.our_mirror_plants)}</b><em>our mirror</em></span>
                  <span className={`pc-gap ${tone}`}><b>{gap > 0 ? `+${NUM(gap)}` : NUM(gap)}</b><em>gap</em></span>
                </span>
                <span className={`cc-tag ${tone === "ok" ? "ok" : tone === "crit" ? "crit" : "attn"}`}>{r.verdict}</span>
                {/* The database's own words about how far the report can be trusted.
                    Wrapped, never clipped — it is a full sentence and it carries the
                    only caveat that makes the number above it readable. */}
                <span className="pc-room-note">{r.staleness_note}</span>
                <span className="pc-room-when">
                  Report taken {r.report_as_of ? new Date(r.report_as_of).toLocaleDateString() : "on a date not served"}
                  {r.report_age_days != null ? ` · ${r.report_age_days} days ago` : ""}
                  {r.last_synced ? ` · our side last synced ${new Date(r.last_synced).toLocaleString()}` : " · our side carries no sync timestamp"}
                </span>
                <span className="cc-kpi-pair-go">{open ? "Close this room" : "Open every plant in this room →"}</span>
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* The rooms the census counts that the mirror does not cover. Stated rather
   than left to be noticed: a balance board showing four rooms beside a census
   counting five reads as complete, and it is not. */
function CoverageGap({ censusRooms, mirrorRooms, deptOf, counts }) {
  const uncovered = censusRooms.filter((r) => !mirrorRooms.includes(r));
  if (!censusRooms.length) {
    return <DkEmpty why="No room could be listed from the census."
      fills="The room list is read from v_plant_census itself. With no standing plant there is no room to cover." />;
  }
  if (!uncovered.length) {
    return <DkEmpty why="Every room holding a standing plant is covered by the mirror board above."
      fills="Nothing in the census sits outside the comparison against Metrc's own report." />;
  }
  return (
    <>
      <div className="cc-fine">
        <b>{uncovered.length} {uncovered.length === 1 ? "room holds" : "rooms hold"} standing plants that the
        mirror board above does not cover.</b> Those plants are in the census and therefore in
        every count on this page, but nothing has compared them against Metrc&rsquo;s own report,
        so they carry one record rather than two. That is a weaker position than the rooms
        above, and it is not visible from the mirror board on its own.
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Room</th><th>Standing plants</th><th>What is missing</th></tr></thead>
          <tbody>
            {uncovered.map((room) => (
              <tr key={room}>
                <td>{qualify(deptOf, room)}</td>
                <td>{counts[room] != null ? NUM(counts[room]) : "not counted"}</td>
                <td className="note">
                  This room appears in our plant mirror and in no row of
                  v_plant_mirror_balance, so Metrc&rsquo;s point-in-time report has not been
                  loaded for it. The count is ours alone and nothing has confirmed it.
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE OTHER PLANT COUNT.

   The platform keeps a daily series that also claims to count plants and it
   does not agree with the census. Both are shown with their derivations named.
   Nothing here reconciles them: this page cannot know which is right, and a
   page that picks one silently is how a wrong number becomes the house figure.
   ═══════════════════════════════════════════════════════════════════════════ */
function RivalCount({ trend, err, censusTotal }) {
  if (err) return <DkErr what="The daily plant series" err={err} />;
  if (!trend) {
    return <DkEmpty why={`No daily series called “${RIVAL_TREND_KPI}” is held.`}
      fills="Nothing else in the platform is counting plants on a schedule, so the census on this page is the only standing-plant figure there is and there is nothing to disagree with it." />;
  }
  const latest = trend.latest == null ? null : Number(trend.latest);
  const points = Number(trend.points || 0);
  const agrees = latest != null && censusTotal != null && latest === censusTotal;
  return (
    <div className={`pc-rival ${agrees ? "ok" : "warn"}`}>
      <div className="pc-rival-pair">
        <span><b>{censusTotal == null ? "not counted" : NUM(censusTotal)}</b><em>this page — v_plant_census, counted just now</em></span>
        <span><b>{latest == null ? "no value served" : NUM(latest)}</b><em>“{RIVAL_TREND_KPI}” — v_dashboard_trend, latest point</em></span>
      </div>
      {agrees ? (
        <div className="cc-fine">
          The two agree. They are still two derivations of one fact, so this section stays on
          the page: the day they diverge, that is worth seeing rather than discovering later.
        </div>
      ) : (
        <div className="cc-fine">
          <b>These two figures do not agree, and this page does not resolve them.</b> They are
          derived differently — the census counts one row per standing plant across both of
          Metrc&rsquo;s paths, and the daily series is built by the dashboard trend job from its
          own definition. Nothing on this page averages them, picks one, or draws the series
          under the census figure. Which is right is a question for the data layer; the
          disagreement is recorded here so that it is asked.
        </div>
      )}
      <div className="cc-fine">
        The series holds <b>{points === 1 ? "a single reading" : `${NUM(points)} readings`}</b>
        {points < 2
          ? " — too few to draw a direction from, so no line is drawn. One point is not a trend."
          : `, the earliest ${trend.days && trend.days.length ? new Date(trend.days[0]).toLocaleDateString() : "on a date not served"}.`}
        {trend.previous != null && <> Its previous point was <b>{NUM(trend.previous)}</b>.</>}
      </div>
    </div>
  );
}

/* Corrections OPEN against the plant views, in the register's own words.
   Nothing about any specific defect is written into this file: a warning typed
   into a component goes stale, and a stale warning on a corrected figure is
   its own defect. */
function OpenCorrections({ rows, err }) {
  if (err) return <DkErr what="The correction register" err={err} />;
  if (!rows.length) {
    return <DkEmpty why="No correction is open against the plant record."
      fills="correction_proposal carries a row while a figure on a plant view is disputed and not yet fixed. Nothing is disputed right now." />;
  }
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th>Object</th><th>Raised</th><th>By</th><th>What is wrong</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id ?? `${r.target_object}|${r.raised_at}`}>
              <td>{r.target_object ?? "not recorded"}</td>
              <td>{r.raised_at ? new Date(r.raised_at).toLocaleDateString() : "not recorded"}</td>
              <td>{r.raised_by ?? "not recorded"}</td>
              <td className="note">{r.problem ?? r.rationale ?? r.note ?? "The register carries no description for this correction."}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* The columns every plant drill shows. One definition, used by the tile drills
   and by the room drills, so a plant reads the same whichever way it is
   reached. `provenance_note` is the database's sentence about which of Metrc's
   doors reported this plant and is rendered as served. */
const PLANT_COLUMNS = [
  { key: "tag", label: "Plant tag" },
  { key: "room", label: "Room (as Metrc records it)" },
  { key: "phase", label: "Growth phase" },
  { key: "strain", label: "Strain" },
  { key: "source", label: "Which of Metrc's paths reports it" },
  { key: "provenance_note", label: "What that means", kind: "note" },
  { key: "room_disagreement", label: "Room disagreement", kind: "note", none: "None — both paths name the same room" },
  { key: "api_synced_at", label: "Our mirror last synced", none: "Never synced through the API" },
  { key: "report_as_of", label: "Report taken", none: "Not in any loaded report" },
];

export default function PlantCensusDashboard({ go, session, reports, role, viewAs, onViewAs, isAdmin, viewRoles }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, VIEW_KEY);
  const layoutDefs = useMemo(() => [
    { key: "mirror", title: "Our mirror against Metrc's own report, room by room", span: 2 },
    { key: "coverage", title: "Rooms the mirror does not cover", span: 1 },
    { key: "rival", title: "The other plant count, and whether it agrees", span: 1 },
    { key: "everyplant", title: "Every standing plant, one row each", span: 2 },
    { key: "corrections", title: "Corrections open against the plant record", span: 2 },
    { key: "tasks", title: "Work raised from these figures", span: 1 },
    { key: "words", title: "In plain words", span: 1 },
    { key: "reports", title: "Reports — by group", span: 2 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, layoutDefs);

  const [counts, setCounts] = useState({});
  const [openKey, setOpenKey] = useState(null);
  const [openRoom, setOpenRoom] = useState(null);
  const [ver, setVer] = useState(0);
  const [d, setD] = useState(null);

  /* THE PERIOD BUS: THIS PAGE DECLARES, IT DOES NOT SUBSCRIBE — AND THAT IS
     MEASURED, NOT PREFERRED.
     docs/TODO_EVERY_PAGE.md gives two roads: use the active frame, or declare
     as-of / snapshot with a visible chip. A census is the second by nature — it
     answers "what is standing right now" — and v_plant_census proves it: its
     columns are tag, room, phase, strain, source, in_api_mirror, in_metrc_report,
     api_synced_at, report_as_of, report_age_days, provenance_note,
     room_disagreement. There is NO activity date on a plant row. The only dates
     are provenance: when the mirror synced, and what day the Metrc report was
     as of.

     So a frame could only be applied to api_synced_at, which would drop every
     plant whose row happened to sync before the 1st — a fake zero of exactly the
     kind the rule forbids. Declaring is the only truthful road, so the chip below
     says so on the page rather than the page quietly ignoring a range it appears
     to offer.

     FLAGGED, NOT FIXED HERE: nav_registry for view_key 'plant_census' carries
     default_range = 'this_month_td' and range_kind = 'activity'. On the evidence
     above that row is wrong — this is a snapshot, as dept_dash_inventory is
     already correctly marked. Correcting it is a data change to the nav registry
     and is not being made from a front-end branch. */
  const AS_OF_CHIP = {
    label: "as-of now · snapshot, not on the date bus",
    why: "A plant census counts what is standing at this moment, so it is declared as-of rather than taking the active "
      + "date frame. This is not a page that forgot the bus: v_plant_census carries no activity date on a plant at all — "
      + "its only dates are provenance (when the mirror synced, what day the Metrc report was as of). Filtering a census "
      + "to a period could only drop plants by when their row synced, which would be a false zero. The freshness that "
      + "does matter is the sync age, and that is on the page already.",
  };

  /* SEARCH REACHES EVERY PLANT, WHATEVER ITS AGE OR ROOM.
     Server-side ilike over the census, so a tag is found whether or not its room
     card is open. There is no date range on this page to set aside — it is a
     declared snapshot — so the result line says what WAS searched instead. */
  const [q, setQ] = useState("");
  const [hits, setHits] = useState(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setHits(null); return undefined; }
    let live = true;
    const like = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    supabase.from(CENSUS)
      .select("tag,room,phase,strain,source,in_api_mirror,in_metrc_report,report_age_days,provenance_note,room_disagreement")
      .or(["tag", "strain", "room", "phase"].map((c) => `${c}.ilike.${like}`).join(","))
      .limit(200)
      .then((res) => { if (live) setHits(grab(res)); });
    return () => { live = false; };
  }, [q]);
  const reload = useCallback(() => setVer((v) => v + 1), []);

  /* THE TILES. One exact count per measure, issued to the database with the
     measure's own filter. The error is bound on every one: a refused count that
     fell back to zero would read as "no plants in this state", which is a
     different fact and the more comforting one — the exact shape this platform
     keeps being bitten by.

     WHY `limit(0)` AND NOT `head: true`. The obvious way to ask for a count
     without moving rows is a HEAD request, and it was written that way first.
     A HEAD RESPONSE HAS NO BODY, so when the database refuses the read there is
     nothing for PostgREST to put its message in: supabase-js resolves with an
     error object whose `message` is the EMPTY STRING. Every branch that tests
     the message then reads as "no error", and five tiles sat on "counting…"
     for ever — a refused read presented as a slow one, on a page whose whole
     subject is proving where a number came from. Caught in a render probe
     against an unauthenticated browser before this page was ever mounted.

     `limit(0)` moves no rows either, still returns the exact count in the
     Content-Range header, and on refusal returns a JSON body carrying
     "permission denied for view v_plant_census" and its SQLSTATE. The cost is
     nothing and the failure becomes legible. */
  useEffect(() => {
    let live = true;
    for (const m of MEASURES) {
      let q = supabase.from(CENSUS).select("tag", { count: "exact" }).limit(0);
      for (const f of listOf(m.filters)) {
        if (f.op === "not.is") q = q.not(f.col, "is", f.val);
        else q = q[f.op](f.col, f.val);
      }
      q.then(({ count, error }) => {
        if (!live) return;
        setCounts((c) => ({ ...c, [m.col]: error ? { n: null, err: errText(error) } : { n: count, err: null } }));
      }, (thrown) => {
        /* A rejected promise — a dropped connection, a blocked request — is
           still a failed count and must not leave the tile counting for ever.
           Never `.catch(() => {})`: the reason reaches the screen. */
        if (!live) return;
        setCounts((c) => ({ ...c, [m.col]: { n: null, err: String((thrown && thrown.message) || thrown) } }));
      });
    }
    return () => { live = false; };
  }, [ver]);

  useEffect(() => {
    let live = true;
    (async () => {
      const [mirror, rooms, targets, trend, tasks, corrections, censusRooms] = await Promise.all([
        supabase.from("v_plant_mirror_balance").select("*").order("room"),
        supabase.from("v_room_board_complete").select("room, department, licence, is_flower_room"),
        supabase.from("kpi_targets").select("*").eq("department", DEPT),
        supabase.from("v_dashboard_trend").select("*").eq("department", DEPT).eq("kpi", RIVAL_TREND_KPI).limit(1),
        supabase.from("v_dashboard_tasks").select("*"),
        supabase.from("correction_proposal").select("*").ilike("target_object", CORRECTION_TARGET).is("applied_at", null).order("raised_at", { ascending: false }),
        /* Which rooms hold standing plants, read from the census itself so the
           coverage check cannot be answered by a stale room register. Only the
           room column travels. */
        supabase.from(CENSUS).select("room"),
      ]);
      if (!live) return;
      setD({
        mirror: grab(mirror), rooms: grab(rooms), targets: grab(targets),
        trend: grab(trend), tasks: grab(tasks), corrections: grab(corrections),
        censusRooms: grab(censusRooms),
      });
    })();
    return () => { live = false; };
  }, [ver]);

  if (d === null) {
    return (
      <div className="ccpage">
        <div className="cc-fine" style={{ padding: 16 }}>
          Counting every standing plant and balancing each room against Metrc&rsquo;s own report&hellip;
        </div>
      </div>
    );
  }

  const deptOf = new Map(d.rooms.rows.map((r) => [r.room, r.department]));
  const targetByKpi = Object.fromEntries(d.targets.rows.map((r) => [r.kpi, r]));
  const openMeasure = MEASURES.find((m) => m.col === openKey) ?? null;
  const mirrorRooms = d.mirror.rows.map((r) => r.room);
  /* Per-room totals from the census rows already in hand. This is a tally of
     rows the database served, not a business figure derived here: the same
     rows, grouped, so the coverage table can state how many plants sit outside
     the comparison instead of naming a room and leaving the size unsaid. */
  const roomTally = {};
  for (const r of d.censusRooms.rows) roomTally[r.room] = (roomTally[r.room] || 0) + 1;
  const censusRoomNames = Object.keys(roomTally).sort();
  const censusTotal = counts.standing && !counts.standing.err ? counts.standing.n : null;
  const openTasks = d.tasks.rows.filter((t) => t.department === DEPT);
  const overdueTasks = openTasks.filter((t) => t.position && t.position.startsWith("OVERDUE"));
  const failedCounts = MEASURES.filter((m) => counts[m.col] && counts[m.col].err).length;
  const disputed = counts.room_dispute && !counts.room_dispute.err ? counts.room_dispute.n : null;
  const reportAge = d.mirror.rows.length ? d.mirror.rows[0].report_age_days : null;

  return (
    <DrillRoot label="Plant census">
      <div className="ccpage">
        <DkHead title="Plant census — every standing plant, and who says so" viewKey={VIEW_KEY}
          dept={DEPT} role={role} viewAs={viewAs} computed={null} busy={false}>
          <span className="cc-hchip"
            title="Every figure here is counted from a live view at the moment the page loads, so there is no snapshot to go stale. What CAN go stale is Metrc's point-in-time report underneath the mirror board, and that age is stated on every room card.">
            source <b>live views, no snapshot</b>
          </span>
          <DkTag tone="attn" title={AS_OF_CHIP.why}>{AS_OF_CHIP.label} ⓘ</DkTag>
          {censusTotal != null && <DkTag tone="neutral">{NUM(censusTotal)} standing</DkTag>}
          {reportAge != null && (
            <DkTag tone={reportAge > 14 ? "attn" : "info"}
              title="How old Metrc's point-in-time report is. Everything the report side of the mirror board asserts was true on that date and not necessarily since.">
              Metrc&rsquo;s report is {reportAge} days old
            </DkTag>
          )}
          {disputed != null && disputed > 0 && (
            <DkTag tone="crit" title="Both of Metrc's paths agree these plants are standing and disagree about which room they are standing in.">
              {NUM(disputed)} with a disputed room
            </DkTag>
          )}
          {failedCounts > 0 && (
            <DkTag tone="crit" title="A count was refused by the database. The tile says so on its face rather than showing a zero — a refused count and an empty population are opposite facts.">
              {failedCounts} figure{failedCounts === 1 ? "" : "s"} could not be counted
            </DkTag>
          )}
        </DkHead>

        <div className="cc-tools">
          <div className="cc-tools-l">
            <button className="cc-btn" type="button"
              title="Collapse every section — remembered per user on this device"
              onClick={() => store.setAll(layoutDefs.map((w) => w.key), false)}>− collapse all</button>
            <button className="cc-btn" type="button" title="Expand every section"
              onClick={() => store.setAll(layoutDefs.map((w) => w.key), true)}>+ expand all</button>
            <WidgetBarControls layout={layout} />
          </div>
          <div className="cc-tools-c">
            <label htmlFor="plants-q">Find a plant tag, strain, room or phase</label>
            <input id="plants-q" className="cc-input" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="1A40A020… or Blue Dream"
              title="Searches every plant in the census at the server, whichever room it is in and whether or not its card is open. Plant tags begin 1A40A020 — packages begin 1A40A030 and live on the Inventory dashboard." />
            {q.trim().length > 0 && (
              <button type="button" className="cc-btn" onClick={() => setQ("")}
                title="Clear the search and return to the census.">clear</button>
            )}
          </div>
          <div className="cc-tools-r">
            <button className="cc-btn" type="button"
              title="Re-count every figure and re-read every room against Metrc's report."
              onClick={reload}>recount</button>
            <button className="cc-btn" type="button"
              title="Open the Cultivation dashboard, where the harvest side of the plant record lives."
              onClick={() => go && go("dept_dash_cultivation")}>Cultivation dashboard →</button>
          </div>
        </div>

        {hits && (
          <DkDrill label={`Search — “${q.trim()}” across every plant in the census`} onClose={() => setQ("")}>
            {hits.err ? <DkErr what={`The plant search (${CENSUS})`} err={hits.err} />
              : listOf(hits.rows).length === 0 ? (
                <DkEmpty
                  why={`No plant in the census matches “${q.trim()}”.`}
                  fills={"Every room and every phase was searched at the server, not just the cards that happen to be open, "
                    + "and the census carries no date range that could have hidden a row. A tag that is absent here is not "
                    + "standing — it may still exist in Metrc as harvested or destroyed."} />
              ) : (
                <>
                  <div className="cc-fine">
                    <b>{listOf(hits.rows).length.toLocaleString()}</b> plant
                    {listOf(hits.rows).length === 1 ? "" : "s"} found
                    {listOf(hits.rows).length === 200 ? " — showing the first 200" : ""}. The whole census was searched;
                    this page carries no date range to have narrowed it.
                  </div>
                  <div className="tablewrap">
                    <table>
                      <thead><tr><th>Tag</th><th>Room</th><th>Phase</th><th>Strain</th><th>Source</th>
                        <th>In API mirror</th><th>In Metrc report</th><th>Report age</th><th>Provenance</th><th>Room disagreement</th></tr></thead>
                      <tbody>
                        {listOf(hits.rows).map((r, i) => (
                          <tr key={`${r.tag ?? "row"}|${i}`}>
                            <td>{r.tag ?? "no tag"}</td>
                            <td>{r.room ?? "room not recorded"}</td>
                            <td>{r.phase ?? "phase not recorded"}</td>
                            <td>{r.strain ?? "strain not recorded"}</td>
                            <td>{r.source ?? "source not recorded"}</td>
                            <td>{r.in_api_mirror === true ? "Yes" : r.in_api_mirror === false ? "No" : "not stated"}</td>
                            <td>{r.in_metrc_report === true ? "Yes" : r.in_metrc_report === false ? "No" : "not stated"}</td>
                            <td>{r.report_age_days === null || r.report_age_days === undefined ? "no report row" : `${r.report_age_days} days`}</td>
                            <td className="note">{r.provenance_note ?? "not stated"}</td>
                            <td className="note">{r.room_disagreement ?? "none"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
          </DkDrill>
        )}

        <KeyFigures counts={counts} targets={targetByKpi} openKey={openKey}
          onOpen={setOpenKey} onAssigned={reload} />

        {openMeasure && (
          <DkDrill label={`${openMeasure.label} — every plant behind the figure`} onClose={() => setOpenKey(null)}>
            <DkRowDrill view={CENSUS} filters={openMeasure.filters}
              order={{ col: "room", asc: true }} columns={PLANT_COLUMNS}
              note={`This list carries the identical filter the tile counted with, against ${CENSUS}. A plant tag is its identity; the strain and the room are attributes Metrc records against it.`} />
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            switch (w.key) {
              case "mirror": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={d.mirror.err ? <DkTag tone="crit">read failed</DkTag> : (
                    <>
                      <DkTag tone="neutral">{d.mirror.rows.length} rooms compared</DkTag>
                      {d.mirror.rows.every((r) => Number(r.gap || 0) === 0) && d.mirror.rows.length > 0 && (
                        <DkTag tone="ok">no gap in any room</DkTag>
                      )}
                    </>
                  )}>
                  <MirrorBoard rows={d.mirror.rows} err={d.mirror.err} deptOf={deptOf}
                    openRoom={openRoom} onOpenRoom={setOpenRoom} />
                  {openRoom && (
                    <DkDrill label={`Every plant standing in ${qualify(deptOf, openRoom)}`}
                      onClose={() => setOpenRoom(null)}>
                      <DkRowDrill view={CENSUS} filters={[{ op: "eq", col: "room", val: openRoom }]}
                        order={{ col: "tag", asc: true }} columns={PLANT_COLUMNS}
                        note="Our mirror's own rows for this room. The card above compares this population against Metrc's dated report; this is our side of that comparison, plant by plant." />
                    </DkDrill>
                  )}
                </Widget>
              );
              case "coverage": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={<DkTag tone={censusRoomNames.filter((r) => !mirrorRooms.includes(r)).length ? "attn" : "ok"}>
                    {censusRoomNames.filter((r) => !mirrorRooms.includes(r)).length} uncovered
                  </DkTag>}>
                  {d.censusRooms.err
                    ? <DkErr what="The rooms holding standing plants" err={d.censusRooms.err} />
                    : <CoverageGap censusRooms={censusRoomNames} mirrorRooms={mirrorRooms}
                        deptOf={deptOf} counts={roomTally} />}
                </Widget>
              );
              case "rival": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={<DkTag tone="info">two derivations</DkTag>}>
                  <RivalCount trend={d.trend.rows[0] ?? null} err={d.trend.err} censusTotal={censusTotal} />
                </Widget>
              );
              case "everyplant": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                  chips={censusTotal != null ? <DkTag tone="neutral">{NUM(censusTotal)} rows</DkTag> : null}>
                  <DkRowDrill view={CENSUS} filters={[]} order={{ col: "room", asc: true }}
                    columns={PLANT_COLUMNS}
                    note="The whole census, unfiltered, paged. Nothing is grouped away and nothing is summarised: every standing plant Metrc holds appears here as its own row." />
                </Widget>
              );
              case "corrections": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                  chips={d.corrections.err ? <DkTag tone="crit">read failed</DkTag>
                    : <DkTag tone={d.corrections.rows.length ? "crit" : "ok"}>{d.corrections.rows.length} open</DkTag>}>
                  <OpenCorrections rows={d.corrections.rows} err={d.corrections.err} />
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
                  <DkNarrative page={PAGE_KEY} range={{ from: "", to: "" }} role={role}
                    session={session} go={go} />
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
