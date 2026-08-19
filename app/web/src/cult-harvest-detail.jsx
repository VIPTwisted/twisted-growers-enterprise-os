/* ═══════════════════════════════════════════════════════════════════════════
   HARVEST DETAIL BY CULTIVAR — the planned pull, cultivar by cultivar.
   Agent B, 15 Aug 2026.
   nav_registry view_key `harvest_detail`, serving `harvest_pull_details`.

   WHAT THIS TABLE ACTUALLY IS, WHICH THE GRID HID. It is the PLAN, not the
   record: the 2026 eight-week calendar exploded to one row per cultivar per
   pull, carrying projected weights, the fresh-frozen split, and the two-day
   take-down and replant shift. Rendered as a thirty-five column grid it read
   like history, and a projection read as history is the most expensive kind of
   mistake this platform can make. Every projected figure on this page is
   labelled projected, on the row, every time.

   HOW IT IS LAID OUT. ONE CARD PER PULL — the unit of work a grower actually
   schedules — with its cultivars nested inside it and its two-day shift plan
   underneath. Not a grid, not a severity band, not a ledger.

   WHAT IT DOES NOT CLAIM. This table names the flower room by its short code
   and carries no licence, so the department is stated as not recorded rather
   than guessed. It also holds no actual weights at all: the actual is in the
   harvest register, one press away, and the two are never mixed on one line.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import {
  grab, listOf, DkTag, DkErr, DkEmpty, DkKpiStrip, DkDrill, DrillRoot, DkHead, useSectionStore,
  useWidgetLayout, Widget, WidgetBoard, WidgetBarControls, DkReports,
} from "./dashkit.jsx";
import {
  CULT_DEPT, useCultMeasures, cultTargetMap, cultTrendMap, cultLicenceMap, cultRoomLabel,
  cultTile, cultInPlace, CultActivity, cultNum, CULT_ROOM_UNQUALIFIED,
} from "./cult-kit.jsx";

const VIEW_KEY = "harvest_detail";
const PAGE_KEY = "cult_harvest_detail";

const SOURCE_NOTE = {
  label: "counted from the planned pulls below — every weight is a projection",
  why: "Each figure counts or totals rows of harvest_pull_details, which is the 2026 calendar "
    + "exploded per cultivar. Nothing on this page is an actual weight; the actuals are in the "
    + "harvest register and the two are never added together.",
};

export default function HarvestDetail({ go, session, role, viewAs, reports }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, PAGE_KEY);
  /* THE SECTIONS ARE ARRANGEABLE AND THE ARRANGEMENT IS THE USER'S OWN. Owner,
     16 Aug 2026: "every single dashboard need to have section as I stated where
     i can drag and put where i want to arreange dash for user preference." This
     mounts the SAME primitive the department dashboards use, saved per user
     through tg_save_dashboard_layout; the page contributes only its own list. */
  const WIDGETS = React.useMemo(() => [
    { key: "pulls", title: "Every planned pull, its cultivars and its two-day plan", span: 2 },
    { key: "activity", title: "Next planned lines, soonest first", span: 1 },
    { key: "reports", title: "Cultivation reports", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const measures = useCultMeasures();
  const [d, setD] = useState(null);
  const [openKpi, setOpenKpi] = useState(null);
  const [ver, setVer] = useState(0);
  const [roomPick, setRoomPick] = useState("");

  useEffect(() => {
    let live = true;
    supabase.from("harvest_pull_details").select("*")
      .order("harvest_date", { ascending: true, nullsFirst: false })
      .then((res) => { if (live) setD({ p: grab(res) }); });
    return () => { live = false; };
  }, [ver]);

  const targets = useMemo(() => cultTargetMap(measures), [measures]);
  const trend = useMemo(() => cultTrendMap(measures), [measures]);
  const licMap = useMemo(() => cultLicenceMap(measures), [measures]);

  /* Qualified once. harvest_pull_details carries no licence column, so the
     label states the department is not on the record. */
  const rows = useMemo(
    () => listOf(d ? d.p.rows : []).map((r) => ({ ...r, room_qualified: cultRoomLabel(r.flower_room, r.license, licMap) })),
    [d, licMap],
  );
  const roomNames = useMemo(() => [...new Set(listOf(rows).map((r) => r.room_qualified))].sort(), [rows]);
  const shown = useMemo(() => listOf(rows).filter((r) => !roomPick || r.room_qualified === roomPick), [rows, roomPick]);

  const pulls = useMemo(() => {
    const m = new Map();
    for (const r of shown) {
      const k = `${r.pull_no}|${r.harvest_date ? String(r.harvest_date).slice(0, 10) : "no date"}|${r.room_qualified}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()];
  }, [shown]);

  const plannedPlants = useMemo(() => shown.reduce((a, r) => a + Number(r.plants ? r.plants : 0), 0), [shown]);
  const projFlower = useMemo(() => shown.reduce((a, r) => a + Number(r.flower_after_ff_lbs ? r.flower_after_ff_lbs : 0), 0), [shown]);
  const projFreeze = useMemo(() => shown.reduce((a, r) => a + Number(r.ff_weight_dry_lbs ? r.ff_weight_dry_lbs : 0), 0), [shown]);
  const cultivarCount = useMemo(() => new Set(shown.map((r) => r.cultivar).filter(Boolean)).size, [shown]);
  const fridays = useMemo(() => shown.filter((r) => String(r.friday_flag ? r.friday_flag : "").toLowerCase() === "yes"), [shown]);

  const tiles = useMemo(() => {
    let n = 0;
    return [
      cultTile(n++, "Pulls in the plan", pulls.length, "pulls", "plain",
        "One pull is one room coming down on one date. The cultivars inside it are the rows of this table."),
      cultTile(n++, "Cultivar lines planned", shown.length, "lines", "plain",
        "One line per cultivar per pull, which is what this table holds a row for."),
      cultTile(n++, "Distinct cultivars in the plan", cultivarCount, "cultivars", "plain",
        "Counted by the cultivar name on the planning rows. These are planning names and are not joined to the Metrc strain list on a name."),
      cultTile(n++, "Plants planned across these pulls", plannedPlants, "plants", "plain",
        "Totalled from the planned plant count on each line."),
      cultTile(n++, "Projected dried flower after the fresh frozen split", Number(projFlower.toFixed(1)), "lb", "plain",
        "A PROJECTION from the calendar, never an actual. It is the flower expected to remain once the fresh frozen portion is taken out."),
      cultTile(n++, "Projected fresh frozen, dry-equivalent", Number(projFreeze.toFixed(1)), "lb", "plain",
        "Also a projection, and already expressed dry-equivalent by the plan, which is why it may be shown beside the flower figure."),
      cultTile(n++, "Pulls the plan puts on a Friday", fridays.length, "lines", fridays.length ? "warn" : "ok",
        "The plan flags these itself. A Friday take-down runs the replant into the weekend, which is why the calendar marks it."),
    ];
  }, [pulls, shown, cultivarCount, plannedPlants, projFlower, projFreeze, fridays]);

  const inPlace = useMemo(() => cultInPlace(tiles, openKpi, (k) => setOpenKpi((c) => (c === k ? null : k))), [tiles, openKpi]);
  const drillRows = useMemo(() => {
    if (openKpi === "Pulls the plan puts on a Friday") return fridays;
    if (openKpi === null) return null;
    return shown;
  }, [openKpi, shown, fridays]);

  const activity = useMemo(() => [...shown]
    .filter((r) => r.harvest_date)
    .sort((a, b) => (a.harvest_date < b.harvest_date ? -1 : 1))
    .slice(0, 12)
    .map((r) => ({
      when: r.harvest_date,
      what: `Pull ${r.pull_no} — ${r.cultivar ? r.cultivar : "cultivar not recorded"} in ${r.room_qualified}`,
      detail: r.plants === null || r.plants === undefined ? "plants not planned" : `${cultNum(r.plants, 0)} plants planned`,
      tone: "ok",
    })), [shown]);

  if (d === null) {
    return <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Reading the planned pulls, cultivar by cultivar…</div></div>;
  }

  return (
    <DrillRoot label="Harvest detail">
      <div className="ccpage">
        <DkHead title="Harvest detail by cultivar — the plan" viewKey={VIEW_KEY} dept={CULT_DEPT}
          role={role} viewAs={viewAs} computed={null} busy={false}>
          <DkTag tone="attn" title={SOURCE_NOTE.why}>every weight on this page is a projection</DkTag>
          <DkTag tone="neutral">{shown.length.toLocaleString()} of {rows.length.toLocaleString()} lines</DkTag>
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
            <label className="cc-fine" htmlFor="hd-room">Flower room</label>
            <select id="hd-room" className="cc-input" value={roomPick} onChange={(e) => setRoomPick(e.target.value)}
              title="Narrow the plan to one room. Every figure above recounts for the narrowed set.">
              <option value="">Every room</option>
              {roomNames.map((rn) => <option key={rn} value={rn}>{rn}</option>)}
            </select>
          </div>
          <div className="cc-tools-r">
            <button type="button" className="cc-btn" onClick={() => go("harvests")}
              title="What actually came down, against what this page planned">Actual harvests →</button>
            <button type="button" className="cc-btn" onClick={() => go("harvest_pulls")}>Harvest calendar →</button>
            <button type="button" className="cc-btn" onClick={() => go("dept_dash_cultivation")}>Cultivation dashboard →</button>
          </div>
        </div>

        {d.p.err ? <DkErr what="The planned pulls" err={d.p.err} /> : (
          <DkKpiStrip dept={CULT_DEPT} tiles={tiles} trend={trend} targets={targets} go={go}
            inPlace={inPlace} sourceNote={SOURCE_NOTE} onAssigned={() => setVer((v) => v + 1)}
            emptyNote="The calendar holds no planned pull for this selection." />
        )}
        {measures && measures.targets.err && <DkErr what="The owner-set targets" err={measures.targets.err} />}
        <div className="cc-fine">{CULT_ROOM_UNQUALIFIED}</div>

        {drillRows && (
          <DkDrill label={`${openKpi} — every planned line behind the figure`} onClose={() => setOpenKpi(null)}>
            <div className="cc-fine">
              <b>{drillRows.length.toLocaleString()}</b> planned line{drillRows.length === 1 ? "" : "s"}. Every
              weight below is a projection from the calendar and none of them is an actual.
            </div>
            {drillRows.length === 0
              ? <DkEmpty why="Nothing sits behind this figure right now." fills="The figure counts this same list." />
              : <div className="tablewrap">
                  <table>
                    <thead><tr><th>Pull</th><th>Planned date</th><th>Flower room</th><th>Cultivar</th>
                      <th>Plants planned</th><th>Projected harvest weight</th><th>Projected fresh frozen</th>
                      <th>Projected flower after the split</th><th>Dry window</th></tr></thead>
                    <tbody>
                      {drillRows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.pull_no}</td>
                          <td>{r.harvest_date ? String(r.harvest_date).slice(0, 10) : "not planned"}</td>
                          <td>{r.room_qualified}</td>
                          <td>{r.cultivar ? r.cultivar : "not recorded"}</td>
                          <td>{r.plants === null || r.plants === undefined ? "not planned" : cultNum(r.plants, 0)}</td>
                          <td>{r.proj_harvest_weight_lbs === null || r.proj_harvest_weight_lbs === undefined
                            ? "not projected" : `${cultNum(r.proj_harvest_weight_lbs)} lb projected`}</td>
                          <td>{r.ff_weight_dry_lbs === null || r.ff_weight_dry_lbs === undefined
                            ? "not projected" : `${cultNum(r.ff_weight_dry_lbs)} lb projected`}</td>
                          <td>{r.flower_after_ff_lbs === null || r.flower_after_ff_lbs === undefined
                            ? "not projected" : `${cultNum(r.flower_after_ff_lbs)} lb projected`}</td>
                          <td>{r.dry_window ? r.dry_window : "not stated"}</td>
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
                        case "pulls": return (
              <Widget key={w.key} w={w} layout={layout} store={store} chips={<><DkTag tone="neutral">{Number(pulls.length).toLocaleString()}</DkTag>{<DkTag tone="attn">projections, not actuals</DkTag>}</>}>
            {pulls.length === 0
              ? <DkEmpty why="The calendar holds no planned pull for this selection."
                  fills="Choose every room above to see the whole plan."
                  action={<button type="button" className="cc-btn" onClick={() => setRoomPick("")}>Show every room</button>} />
              : <div className="cult-pulls">
                  {pulls.map(([key, list]) => {
                    const head = list[0];
                    return (
                      <div className="cult-pull" key={key}>
                        <div className="cult-pullhead">
                          <span className="cult-pullno">Pull {head.pull_no}</span>
                          <span>
                            {head.harvest_date ? String(head.harvest_date).slice(0, 10) : "date not planned"}
                            {head.day_of_week ? `, ${head.day_of_week}` : ""}
                          </span>
                          <span>{head.room_qualified}</span>
                          <DkTag tone="neutral">{list.length} cultivar{list.length === 1 ? "" : "s"}</DkTag>
                          {String(head.friday_flag ? head.friday_flag : "").toLowerCase() === "yes"
                            && <DkTag tone="warn">the plan flags this as a Friday pull</DkTag>}
                          <span className="cult-note">
                            {head.room_cycle_no ? `room cycle ${head.room_cycle_no}` : "room cycle not recorded"} ·{" "}
                            {head.dry_window ? `dry window ${head.dry_window}` : "dry window not stated"}
                          </span>
                        </div>
                        <div className="cult-cvs">
                          {list.map((r) => (
                            <div className="cult-cv" key={r.id}>
                              <span>{r.cultivar ? r.cultivar : "cultivar not recorded"}</span>
                              <span className="cult-figure">
                                {r.plants === null || r.plants === undefined ? "plants not planned" : `${cultNum(r.plants, 0)} plants planned`}
                              </span>
                              <span className="cult-figure">
                                {r.proj_harvest_weight_lbs === null || r.proj_harvest_weight_lbs === undefined
                                  ? "weight not projected" : `${cultNum(r.proj_harvest_weight_lbs)} lb projected`}
                              </span>
                              <span className="cult-figure">
                                {r.flower_after_ff_lbs === null || r.flower_after_ff_lbs === undefined
                                  ? "flower not projected" : `${cultNum(r.flower_after_ff_lbs)} lb flower projected`}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="cult-shifts">
                          <div>
                            <div className="cult-cardname">Day one — take-down</div>
                            <p className="cult-note">
                              {head.day1_harvest_shift ? head.day1_harvest_shift : "shift not planned"}
                              {head.day1_start && head.day1_end ? `, ${head.day1_start} to ${head.day1_end}` : ""}
                            </p>
                          </div>
                          <div>
                            <div className="cult-cardname">Day two — replant</div>
                            <p className="cult-note">
                              {head.day2_replant_date ? String(head.day2_replant_date).slice(0, 10) : "replant date not planned"} ·{" "}
                              {head.day2_shift ? head.day2_shift : "shift not planned"}
                              {head.day2_start && head.day2_end ? `, ${head.day2_start} to ${head.day2_end}` : ""}
                            </p>
                          </div>
                          {head.two_day_plan_notes && (
                            <p className="cult-note" style={{ gridColumn: "1 / -1" }}>{head.two_day_plan_notes}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>}
          </Widget>
              );

                        case "activity": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false} chips={<><DkTag tone="neutral">{Number(activity.length).toLocaleString()}</DkTag></>}>
            <CultActivity items={activity} what="the pull plan" none="No planned line carries a date." />
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
