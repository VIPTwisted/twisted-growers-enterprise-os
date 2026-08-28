/* ═══════════════════════════════════════════════════════════════════════════
   ROOM TURN AUDIT — pass or fail on the cycle. Agent B, 15 Aug 2026.
   nav_registry view_key `room_turn_audit`, serving v_room_turn_audit.

   WHAT IT REPLACES. An eleven-column generic grid sorted by nothing in
   particular, in which the room — the single thing this audit is about — was
   just another column.

   HOW IT IS LAID OUT. ONE COLUMN PER ROOM, side by side, each column running
   down that room's own sequence of turns. A room's discipline is a property of
   the room over time, and reading it as a flat list mixed four rooms together
   so no pattern in any one of them was visible. No other Cultivation page is
   laid out this way because no other page asks about one room over time.

   THE PASS AND THE REQUIRED DAYS ARE BOTH THE VIEW'S. required_days and
   verdict are served per row and repeated unchanged. This page holds no cycle
   length of its own: the eight-week cycle is a business rule and a front end
   that carried its own copy would disagree with it the day it changed.

   WHAT IT CANNOT TELL YOU. v_room_turn_audit serves the room name with no
   licence, so the department cannot be resolved and is not guessed.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { DateRangeSelect } from "./App.jsx";
import {
  useDefaultRange, DkRangeSearch, rangeSearch,
  grab, listOf, DkTag, DkErr, DkEmpty, DkKpiStrip, DkDrill, DrillRoot, DkHead, useSectionStore,
  useWidgetLayout, Widget, WidgetBoard, WidgetBarControls, DkReports,
} from "./dashkit.jsx";
import {
  CULT_DEPT, useCultMeasures, cultTargetMap, cultTrendMap, cultLicenceMap, cultRoomLabel,
  cultTile, cultInPlace, CultActivity, cultNum, CULT_ROOM_UNQUALIFIED,
} from "./cult-kit.jsx";

const VIEW_KEY = "room_turn_audit";
const PAGE_KEY = "cult_room_turn";
const PASS = "PASS";
const FAIL = "FAIL";

const SOURCE_NOTE = {
  label: "counted from the turns listed below, live",
  why: "Each figure counts the turn rows this page has read from v_room_turn_audit, and pressing "
    + "it lists those very rows. The verdict on each row is the view&#39;s, not this page&#39;s.",
};

const turnTone = (v) => {
  const s = String(v ? v : "").toUpperCase();
  if (s.includes(FAIL)) return "fail";
  if (s.includes(PASS)) return "pass";
  return "none";
};

export default function RoomTurnAudit({ go, session, role, viewAs, reports }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, PAGE_KEY);
  /* THE SECTIONS ARE ARRANGEABLE AND THE ARRANGEMENT IS THE USER'S OWN. Owner,
     16 Aug 2026: "every single dashboard need to have section as I stated where
     i can drag and put where i want to arreange dash for user preference." This
     mounts the SAME primitive the department dashboards use, saved per user
     through tg_save_dashboard_layout; the page contributes only its own list. */
  const WIDGETS = React.useMemo(() => [
    { key: "cols", title: "Every room, its own turns down its own column", span: 2 },
    { key: "activity", title: "Most recent turns", span: 1 },
    { key: "reports", title: "Cultivation reports", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const measures = useCultMeasures();
  const [d, setD] = useState(null);
  const [openKpi, setOpenKpi] = useState(null);
  const [ver, setVer] = useState(0);
  /* ON THE BUS. The range is resolved by useDefaultRange over f_date_presets —
     the one catalog. Nothing about a preset or a week-start is defined here. */
  const [range, setRange] = useState({ from: "", to: "" });
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    supabase.from("v_room_turn_audit").select("*")
      .order("harvest_started", { ascending: false, nullsFirst: false })
      .then((res) => { if (live) setD({ t: grab(res) }); });
    return () => { live = false; };
  }, [ver]);

  const targets = useMemo(() => cultTargetMap(measures), [measures]);
  const trend = useMemo(() => cultTrendMap(measures), [measures]);
  const licMap = useMemo(() => cultLicenceMap(measures), [measures]);

  /* Qualified once, at read time. This view carries no licence, so the label
     states that the department is not on the record rather than inventing one,
     and the bare name is never rendered anywhere below. */
  const allRows = useMemo(
    () => listOf(d ? d.t.rows : []).map((r) => ({ ...r, room_qualified: cultRoomLabel(r.room, r.license, licMap) })),
    [d, licMap],
  );
  /* Range and search decided by the shared primitive, so this page cannot drift
     from the others. A turn with no start date is kept, not dropped. */
  const rs = useMemo(() => rangeSearch(allRows, {
    from: range.from, to: range.to, dateField: "harvest_started", q,
    fields: ["room_qualified", "verdict"],
  }), [allRows, range.from, range.to, q]);
  const rows = rs.rows;

  const failed = useMemo(() => rows.filter((r) => turnTone(r.verdict) === "fail"), [rows]);
  const passed = useMemo(() => rows.filter((r) => turnTone(r.verdict) === "pass"), [rows]);
  const unjudged = useMemo(() => rows.filter((r) => turnTone(r.verdict) === "none"), [rows]);
  const measured = useMemo(() => rows.filter((r) => r.room_turn_days !== null && r.room_turn_days !== undefined), [rows]);
  const slowest = useMemo(() => {
    let best = null;
    for (const r of measured) if (best === null || Number(r.room_turn_days) > Number(best.room_turn_days)) best = r;
    return best;
  }, [measured]);

  const tiles = useMemo(() => {
    let n = 0;
    const t = [
      cultTile(n++, "Turns that failed the cycle", failed.length, "turns", failed.length ? "bad" : "ok",
        "The verdict served on the row. A room that turns late holds up the next cycle, and the room is the constraint."),
      cultTile(n++, "Turns that passed", passed.length, "turns", "ok",
        "Turned inside the days the view requires for that room."),
    ];
    if (unjudged.length) {
      t.push(cultTile(n++, "Turns the view could not judge", unjudged.length, "turns", "warn",
        "No pass or fail was served for these, usually because there is no previous take-down to measure the gap from. They are shown rather than dropped."));
    }
    if (slowest) {
      t.push(cultTile(n++, "Slowest turn on record", Number(slowest.room_turn_days), "days", "warn",
        "The largest gap between one take-down and the next in the same room, taken from the rows below."));
    }
    return t;
  }, [failed, passed, unjudged, slowest]);

  const inPlace = useMemo(() => cultInPlace(tiles, openKpi, (k) => setOpenKpi((c) => (c === k ? null : k))), [tiles, openKpi]);
  const drillRows = useMemo(() => {
    if (openKpi === "Turns that failed the cycle") return failed;
    if (openKpi === "Turns that passed") return passed;
    if (openKpi === "Turns the view could not judge") return unjudged;
    if (openKpi === "Slowest turn on record") return measured;
    return null;
  }, [openKpi, failed, passed, unjudged, measured]);

  /* One column per room, each running down that room's own sequence. */
  const columns = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const k = r.room_qualified;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [rows]);

  const activity = useMemo(() => rows.filter((r) => r.harvest_started).slice(0, 12).map((r) => ({
    when: r.harvest_started,
    what: `${r.room_qualified} turned on ${r.cultivars ? r.cultivars : "cultivars not recorded"}`,
    detail: r.room_turn_days === null || r.room_turn_days === undefined
      ? "turn length not measured"
      : `${cultNum(r.room_turn_days, 0)} days`,
    tone: turnTone(r.verdict) === "fail" ? "crit" : "ok",
  })), [rows]);

  if (d === null) {
    return <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Auditing every room turn…</div></div>;
  }

  const Turn = ({ r }) => (
    <div className={`cult-turn ${turnTone(r.verdict)}`}>
      <span className="cult-figure">{r.harvest_started ? String(r.harvest_started).slice(0, 10) : "no date"}</span>
      <span>
        {r.cultivars ? r.cultivars : "cultivars not recorded"}
        <span className="cult-hrow-sub">
          {r.plants === null || r.plants === undefined ? "plants not recorded" : `${cultNum(r.plants, 0)} plants`}
          {r.wet_lb === null || r.wet_lb === undefined ? "" : `, ${cultNum(r.wet_lb)} lb wet`}
        </span>
      </span>
      <span className="cult-figure" title={r.verdict ? r.verdict : "no verdict served with this turn"}>
        {r.room_turn_days === null || r.room_turn_days === undefined
          ? "not measured"
          : `${cultNum(r.room_turn_days, 0)} of ${r.required_days === null || r.required_days === undefined ? "an unstated" : cultNum(r.required_days, 0)} days`}
      </span>
    </div>
  );

  return (
    <DrillRoot label="Room turn audit">
      <div className="ccpage">
        <DkHead title="Room turn audit" viewKey={VIEW_KEY} dept={CULT_DEPT} role={role} viewAs={viewAs}
          computed={null} busy={false}>
          <DkTag tone="neutral">{rows.length.toLocaleString()} turns</DkTag>
          <DkTag tone={failed.length ? "crit" : "ok"}>{failed.length} failed</DkTag>
        </DkHead>

        <div className="cc-tools">
          <div className="cc-tools-l">
            <button type="button" className="cc-btn" onClick={() => setVer((v) => v + 1)}>↻ read again</button>
            <button type="button" className="cc-btn" onClick={() => window.print()}>🖨 print</button>
            <button type="button" className="cc-btn" title="Collapse every section — remembered on your own account"
              onClick={() => store.setAll(WIDGETS.map((x) => x.key), false)}>− collapse all</button>
            <button type="button" className="cc-btn" title="Expand every section"
              onClick={() => store.setAll(WIDGETS.map((x) => x.key), true)}>+ expand all</button>
            <WidgetBarControls layout={layout} />
            <DateRangeSelect label="Turn started" from={range.from} to={range.to}
              onFrom={(v) => setRange((prev) => ({ ...prev, from: v }))}
              onTo={(v) => setRange((prev) => ({ ...prev, to: v }))}
              presetKey={dateDefault.presetKey} session={session} viewKey={VIEW_KEY} allowSave />
          </div>
          <div className="cc-tools-r">
            <button type="button" className="cc-btn" onClick={() => go("harvest_lifecycle")}>Harvest lifecycle →</button>
            <button type="button" className="cc-btn" onClick={() => go("grow_rooms")}>Grow rooms →</button>
            <button type="button" className="cc-btn" onClick={() => go("dept_dash_cultivation")}>Cultivation dashboard →</button>
          </div>
        </div>

                <DkRangeSearch id="rta-q" label="Search room or verdict"
          q={q} onQ={setQ} result={rs} noun="turns" rangeLabel="this range"
          source="v_room_turn_audit" err={d.t.err} />

        {d.t.err ? <DkErr what="The room turn audit" err={d.t.err} /> : (
          <DkKpiStrip dept={CULT_DEPT} tiles={tiles} trend={trend} targets={targets} go={go}
            inPlace={inPlace} sourceNote={SOURCE_NOTE} onAssigned={() => setVer((v) => v + 1)}
            emptyNote="The view serves no room turn, so there is nothing to audit." />
        )}
        {measures && measures.targets.err && <DkErr what="The owner-set targets" err={measures.targets.err} />}
        <div className="cc-fine">{CULT_ROOM_UNQUALIFIED}</div>

        {drillRows && (
          <DkDrill label={`${openKpi} — every turn behind the figure`} onClose={() => setOpenKpi(null)}>
            <div className="cc-fine">
              <b>{drillRows.length.toLocaleString()}</b> turn{drillRows.length === 1 ? "" : "s"}, listed
              individually with the room each belongs to. This is the same array the figure counted.
            </div>
            {drillRows.length === 0
              ? <DkEmpty why="Nothing sits behind this figure right now." fills="The figure counts this same list." />
              : <div className="tablewrap">
                  <table>
                    <thead><tr><th>Room</th><th>Take-down</th><th>Cultivars</th><th>Plants</th>
                      <th>Wet weight</th><th>Turn</th><th>Required</th><th>Verdict</th></tr></thead>
                    <tbody>
                      {drillRows.map((r, i) => (
                        <tr key={`${r.room_qualified}|${r.harvest_started}|${i}`}>
                          <td>{r.room_qualified}</td>
                          <td>{r.harvest_started ? String(r.harvest_started).slice(0, 10) : "not recorded"}</td>
                          <td>{r.cultivars ? r.cultivars : "not recorded"}</td>
                          <td>{r.plants === null || r.plants === undefined ? "not recorded" : cultNum(r.plants, 0)}</td>
                          <td>{r.wet_lb === null || r.wet_lb === undefined ? "not recorded" : `${cultNum(r.wet_lb)} lb`}</td>
                          <td>{r.room_turn_days === null || r.room_turn_days === undefined ? "not measured" : `${cultNum(r.room_turn_days, 0)} days`}</td>
                          <td>{r.required_days === null || r.required_days === undefined ? "not stated" : `${cultNum(r.required_days, 0)} days`}</td>
                          <td>{r.verdict ? r.verdict : "none served"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            switch (w.key) {
                        case "cols": return (
              <Widget key={w.key} w={w} layout={layout} store={store} chips={<><DkTag tone="neutral">{Number(columns.length).toLocaleString()}</DkTag>{<DkTag tone="info">pass and fail exactly as the view serves them</DkTag>}</>}>
            {columns.length === 0
              ? <DkEmpty why="The view serves no room turn."
                  fills="A turn appears here once two consecutive take-downs exist in the same room for the gap between them to be measured." />
              : <div className="cult-rooms">
                  {columns.map(([roomName, list]) => {
                    const bad = list.filter((r) => turnTone(r.verdict) === "fail").length;
                    return (
                      <div className="cult-roomcol" key={roomName}>
                        <div className="cult-roomhead">
                          <div className="cult-roomname">{roomName}</div>
                          <div className="cult-note">
                            {list.length} turn{list.length === 1 ? "" : "s"} ·{" "}
                            {bad ? `${bad} failed` : "none failed"} ·{" "}
                            {list[0] && list[0].plant_capacity
                              ? `${cultNum(list[0].plant_capacity, 0)} plant capacity`
                              : "plant capacity not recorded"}
                          </div>
                        </div>
                        <div className="cult-turns">
                          {list.map((r, i) => <Turn key={`${r.harvest_started}|${i}`} r={r} />)}
                        </div>
                      </div>
                    );
                  })}
                </div>}
          </Widget>
              );

                        case "activity": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false} chips={<><DkTag tone="neutral">{Number(activity.length).toLocaleString()}</DkTag></>}>
            <CultActivity items={activity} what="the room turn audit" none="No turn carries a take-down date." />
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
