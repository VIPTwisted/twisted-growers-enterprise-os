/* ═══════════════════════════════════════════════════════════════════════════
   HARVEST LIFECYCLE AND DEADLINES. Agent B, 15 Aug 2026.
   nav_registry view_key `harvest_lifecycle`, serving v_harvest_lifecycle.

   WHAT IT REPLACES. Registered, enabled, and rendering through the generic data
   browser: twenty-nine columns of grid in which a blown dry deadline looked
   exactly like a completed one.

   HOW IT IS LAID OUT. This page answers "where is each harvest against its
   clock", so every harvest is a CARD WITH A STAGE TRACK — planned pull, taken
   down, dry target, dry deadline, packaged — and each step says whether it is
   done, due, or blown. It is deliberately not the severity bands of the
   Harvests register: that page asks what is wrong, this one asks how late.

   THE DEADLINE IS THE VIEW'S. dry_target_date, dry_deadline_date and
   drying_status are served, and this page repeats them. It computes no
   deadline and applies no tolerance of its own — the owner's rule is that
   early is fine and late never is, and a front end that softened a deadline
   would be quietly overruling him.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { DateRangeSelect } from "./App.jsx";
import {
  grab, listOf, DkTag, DkErr, DkEmpty, DkKpiStrip, DkDrill, DrillRoot, DkHead, useSectionStore,
  useWidgetLayout, Widget, WidgetBoard, WidgetBarControls, DkReports,
} from "./dashkit.jsx";
import {
  CULT_DEPT, useCultMeasures, cultTargetMap, cultTrendMap, cultLicenceMap,
  cultRoomLabel, cultTile, cultInPlace, CultActivity, cultNum,
} from "./cult-kit.jsx";

const VIEW_KEY = "harvest_lifecycle";
const PAGE_KEY = "cult_lifecycle";
const BLOWN = "DRY DEADLINE BLOWN";
const NO_PLAN = "No matching plan";

const SOURCE_NOTE = {
  label: "counted from the harvests listed below, live",
  why: "Each figure counts the harvest rows this page has read from v_harvest_lifecycle, and "
    + "pressing it lists those very rows. No snapshot sits between the figure and the list.",
};

const step = (label, value, state) => ({ label, value, state });

/* One harvest as a clock. The five steps are the view's own dates; the state of
   each is decided only by which of those dates the view served and by the
   status it served with them. */
function LcCard({ r, licMap }) {
  const blown = String(r.drying_status ? r.drying_status : "").startsWith(BLOWN);
  const tone = r.verdict === "BLOCKING THE ROOM" ? "crit" : r.verdict === "EXCESS WASTE" ? "warn" : "";
  const steps = [
    step("Planned pull", r.planned_date ? String(r.planned_date).slice(0, 10) : "no plan matched this take-down",
      r.planned_date ? "done" : ""),
    step("Taken down", r.takedown_actual ? String(r.takedown_actual).slice(0, 10) : "not recorded",
      r.takedown_actual ? "done" : ""),
    step("Dry target", r.dry_target_date ? String(r.dry_target_date).slice(0, 10) : "no target served", "now"),
    step("Dry deadline", r.dry_deadline_date ? String(r.dry_deadline_date).slice(0, 10) : "no deadline served",
      blown ? "late" : "done"),
    step("Packaged", r.packages_made && Number(r.packages_made) > 0
      ? `${cultNum(r.packages_made, 0)} packages, ${cultNum(r.packaged_lbs)} lb`
      : "nothing packaged yet", Number(r.packages_made) > 0 ? "done" : ""),
  ];
  return (
    <div className={`cult-lifecard ${tone}`}>
      <div className="cult-lifehead">
        <span className="cult-lifename">{r.harvest}</span>
        <span className="cult-note">
          {r.strain ? r.strain : "strain not recorded"} · {cultRoomLabel(r.room, r.license, licMap)}
        </span>
        <DkTag tone={r.verdict === "BLOCKING THE ROOM" ? "crit" : r.verdict === "EXCESS WASTE" ? "warn" : "ok"}>
          {r.verdict ? r.verdict : "no verdict served"}
        </DkTag>
      </div>
      <div className="cult-track">
        {steps.map((s) => (
          <div key={s.label} className={`cult-step ${s.state}`}>
            <b>{s.label}</b>{s.value}
          </div>
        ))}
      </div>
      <div className="cult-note" style={{ marginTop: 8 }}>
        {r.drying_status ? r.drying_status : "no drying status served"} ·{" "}
        {r.takedown_status ? r.takedown_status : "no take-down status served"} ·{" "}
        weights {r.weights_status ? r.weights_status : "not stated"} ·{" "}
        {r.waste_pct === null || r.waste_pct === undefined
          ? "waste share not worked out"
          : `${cultNum(r.waste_pct)} per cent of the wet weight was waste`} ·{" "}
        {r.days_since_takedown === null || r.days_since_takedown === undefined
          ? "days since take-down not worked out"
          : `${cultNum(r.days_since_takedown, 0)} days since take-down`}
      </div>
    </div>
  );
}

export default function HarvestLifecycle({ go, session, role, viewAs, reports }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, PAGE_KEY);
  /* THE SECTIONS ARE ARRANGEABLE AND THE ARRANGEMENT IS THE USER'S OWN. Owner,
     16 Aug 2026: "every single dashboard need to have section as I stated where
     i can drag and put where i want to arreange dash for user preference." This
     mounts the SAME primitive the department dashboards use, saved per user
     through tg_save_dashboard_layout; the page contributes only its own list. */
  const WIDGETS = React.useMemo(() => [
    { key: "clocks", title: "Every harvest against its clock, blocking first", span: 2 },
    { key: "activity", title: "Most recent take-downs in these records", span: 1 },
    { key: "reports", title: "Cultivation reports", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const measures = useCultMeasures();
  const [range, setRange] = useState({ from: "", to: "" });
  const [d, setD] = useState(null);
  const [openKpi, setOpenKpi] = useState(null);
  const [ver, setVer] = useState(0);

  useEffect(() => {
    let live = true;
    supabase.from("v_harvest_lifecycle").select("*")
      .order("takedown_actual", { ascending: false, nullsFirst: false })
      .then((res) => { if (live) setD({ h: grab(res) }); });
    return () => { live = false; };
  }, [ver]);

  const targets = useMemo(() => cultTargetMap(measures), [measures]);
  const trend = useMemo(() => cultTrendMap(measures), [measures]);
  const licMap = useMemo(() => cultLicenceMap(measures), [measures]);
  const rows = useMemo(() => (d ? d.h.rows : []), [d]);

  const inRange = useMemo(() => listOf(rows).filter((r) => {
    if (!range.from && !range.to) return true;
    const d0 = r.takedown_actual ? String(r.takedown_actual).slice(0, 10) : null;
    if (!d0) return false;
    if (range.from && d0 < range.from) return false;
    if (range.to && d0 > range.to) return false;
    return true;
  }), [rows, range]);

  const blocking = useMemo(() => inRange.filter((r) => r.verdict === "BLOCKING THE ROOM"), [inRange]);
  const excess = useMemo(() => inRange.filter((r) => r.verdict === "EXCESS WASTE"), [inRange]);
  const blown = useMemo(() => inRange.filter((r) => String(r.drying_status ? r.drying_status : "").startsWith(BLOWN)), [inRange]);
  const unplanned = useMemo(() => inRange.filter((r) => r.takedown_status === NO_PLAN), [inRange]);
  const complete = useMemo(() => inRange.filter((r) => r.verdict === "Complete"), [inRange]);

  const tiles = useMemo(() => {
    let n = 0;
    return [
      cultTile(n++, "Harvests blocking a room", blocking.length, "harvests", blocking.length ? "bad" : "ok",
        "The view's own verdict. A harvest that has not been packaged out is still occupying the room it dried in, and the room is the constraint."),
      cultTile(n++, "Dry deadline blown", blown.length, "harvests", blown.length ? "bad" : "ok",
        "The drying status served with the row says the deadline has passed. Early is acceptable and late is not — that asymmetry is the owner's rule and this page does not soften it."),
      cultTile(n++, "Harvests carrying excess waste", excess.length, "harvests", excess.length ? "warn" : "ok",
        "The verdict served with the row. Where the waste is worth investigating by room and strain, the loss analysis page ranks it."),
      cultTile(n++, "Take-downs with no matching plan", unplanned.length, "harvests", unplanned.length ? "warn" : "ok",
        "Metrc records the take-down and the 2026 calendar holds no pull it can be matched to, so plan-against-actual cannot be judged for these."),
      cultTile(n++, "Harvests complete", complete.length, "harvests", "ok",
        "Taken down, dried, packaged and carrying no open verdict."),
    ];
  }, [blocking, blown, excess, unplanned, complete]);

  const inPlace = useMemo(() => cultInPlace(tiles, openKpi, (k) => setOpenKpi((c) => (c === k ? null : k))), [tiles, openKpi]);
  const drillRows = useMemo(() => {
    if (openKpi === "Harvests blocking a room") return blocking;
    if (openKpi === "Dry deadline blown") return blown;
    if (openKpi === "Harvests carrying excess waste") return excess;
    if (openKpi === "Take-downs with no matching plan") return unplanned;
    if (openKpi === "Harvests complete") return complete;
    return null;
  }, [openKpi, blocking, blown, excess, unplanned, complete]);

  const openFirst = useMemo(() => [...inRange].sort((a, b) => {
    const rank = (r) => (r.verdict === "BLOCKING THE ROOM" ? 0 : r.verdict === "EXCESS WASTE" ? 1 : 2);
    return rank(a) - rank(b);
  }), [inRange]);

  const activity = useMemo(() => inRange.filter((r) => r.takedown_actual).slice(0, 12).map((r) => ({
    when: r.takedown_actual,
    what: `${r.harvest} taken down in ${cultRoomLabel(r.room, r.license, licMap)}`,
    detail: r.drying_status,
    tone: r.verdict === "BLOCKING THE ROOM" ? "crit" : r.verdict === "EXCESS WASTE" ? "warn" : "ok",
  })), [inRange, licMap]);

  if (d === null) {
    return <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Reading every harvest against its clock…</div></div>;
  }

  return (
    <DrillRoot label="Harvest lifecycle">
      <div className="ccpage">
        <DkHead title="Harvest lifecycle and deadlines" viewKey={VIEW_KEY} dept={CULT_DEPT}
          role={role} viewAs={viewAs} computed={null} busy={false}>
          <DkTag tone="neutral">{inRange.length.toLocaleString()} of {rows.length.toLocaleString()} in range</DkTag>
        </DkHead>

        <div className="cc-tools">
          <div className="cc-tools-l">
            <button type="button" className="cc-btn" onClick={() => setVer((v) => v + 1)}
              title="Read every harvest again from the live records">↻ read again</button>
            <button type="button" className="cc-btn" onClick={() => window.print()}>🖨 print</button>
            <button type="button" className="cc-btn" title="Collapse every section — remembered on your own account"
              onClick={() => store.setAll(WIDGETS.map((x) => x.key), false)}>− collapse all</button>
            <button type="button" className="cc-btn" title="Expand every section"
              onClick={() => store.setAll(WIDGETS.map((x) => x.key), true)}>+ expand all</button>
            <WidgetBarControls layout={layout} />
          </div>
          <div className="cc-tools-c">
            <DateRangeSelect label="Taken down between" from={range.from} to={range.to}
              onFrom={(v) => setRange((p) => ({ ...p, from: v }))}
              onTo={(v) => setRange((p) => ({ ...p, to: v }))} />
          </div>
          <div className="cc-tools-r">
            <button type="button" className="cc-btn" onClick={() => go("harvests")}
              title="The same harvests read by severity rather than by deadline">Harvest register →</button>
            <button type="button" className="cc-btn" onClick={() => go("room_turn_audit")}>Room turn audit →</button>
            <button type="button" className="cc-btn" onClick={() => go("dept_dash_cultivation")}>Cultivation dashboard →</button>
          </div>
        </div>

        {d.h.err ? <DkErr what="The harvest lifecycle" err={d.h.err} /> : (
          <DkKpiStrip dept={CULT_DEPT} tiles={tiles} trend={trend} targets={targets} go={go}
            inPlace={inPlace} sourceNote={SOURCE_NOTE} onAssigned={() => setVer((v) => v + 1)}
            emptyNote="No harvest was taken down in the chosen date range, so there is nothing to count." />
        )}
        {measures && measures.targets.err && <DkErr what="The owner-set targets" err={measures.targets.err} />}

        {drillRows && (
          <DkDrill label={`${openKpi} — every harvest behind the figure`} onClose={() => setOpenKpi(null)}>
            <div className="cc-fine">
              <b>{drillRows.length.toLocaleString()}</b> harvest{drillRows.length === 1 ? "" : "s"}, each
              shown against its own clock. This is the same array the figure counted.
            </div>
            {drillRows.length === 0
              ? <DkEmpty why="Nothing sits behind this figure right now." fills="The figure counts this same list." />
              : <div className="cult-life">{drillRows.map((r) => <LcCard key={r.harvest} r={r} licMap={licMap} />)}</div>}
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            switch (w.key) {
                        case "clocks": return (
              <Widget key={w.key} w={w} layout={layout} store={store} chips={<><DkTag tone="neutral">{Number(openFirst.length).toLocaleString()}</DkTag>{<DkTag tone="info">dates and statuses exactly as the view serves them</DkTag>}</>}>
            {openFirst.length === 0
              ? <DkEmpty why="No harvest was taken down in the chosen date range."
                  fills="Widen the range above to see the whole lifecycle."
                  action={<button type="button" className="cc-btn" onClick={() => setRange({ from: "", to: "" })}>Show all dates</button>} />
              : <div className="cult-life">{openFirst.map((r) => <LcCard key={r.harvest} r={r} licMap={licMap} />)}</div>}
          </Widget>
              );

                        case "activity": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false} chips={<><DkTag tone="neutral">{Number(activity.length).toLocaleString()}</DkTag></>}>
            <CultActivity items={activity} what="the lifecycle register"
              none="No harvest in the chosen range carries a take-down date." />
          </Widget>
              );
                      case "reports": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}>
                <DkReports reports={reports} dept={CULT_DEPT} go={go} />
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
