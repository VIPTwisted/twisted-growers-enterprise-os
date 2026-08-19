/* ═══════════════════════════════════════════════════════════════════════════
   MOISTURE LOSS REGISTER. Agent B, 15 Aug 2026.
   nav_registry view_key `moisture_loss_register`, serving
   v_moisture_loss_register.

   WHAT IT REPLACES. Twenty-two columns of generic grid. The register exists so
   somebody DOES something — writes the moisture loss off against the harvest —
   and a grid asks nobody to do anything.

   HOW IT IS LAID OUT. TWO BANDS, action first. Every harvest the view says
   still needs a loss recorded is an action card at the top, with the phantom
   pounds beside it and an assignment control on it. Everything already
   recorded sits below, closed by default, as the audit trail. Nothing else in
   Cultivation is laid out as a work list because nothing else in Cultivation
   is one.

   WHAT PHANTOM POUNDS ARE, IN THE VIEW'S OWN TERMS. Metrc still shows weight
   in a room that has actually gone off as water. The view serves the expected
   moisture loss, what is really left, and the difference; this page repeats
   all three and computes none of them.

   THE ROOM. This view serves the drying room with no licence beside it, so the
   department is stated as not recorded rather than guessed.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { AssignTask } from "./App.jsx";
import {
  grab, listOf, DkTag, DkErr, DkEmpty, DkKpiStrip, DkDrill, DrillRoot, DkHead, useSectionStore,
  useWidgetLayout, Widget, WidgetBoard, WidgetBarControls, DkReports,
} from "./dashkit.jsx";
import {
  CULT_DEPT, useCultMeasures, cultTargetMap, cultTrendMap, cultLicenceMap, cultRoomLabel,
  cultTile, cultInPlace, CultActivity, cultNum, CULT_ROOM_UNQUALIFIED,
} from "./cult-kit.jsx";

const VIEW_KEY = "moisture_loss_register";
const PAGE_KEY = "cult_moisture";

const SOURCE_NOTE = {
  label: "counted from the harvests listed below, live",
  why: "Each figure counts or totals the harvest rows this page has read from "
    + "v_moisture_loss_register. Pressing a figure lists those very rows.",
};

export default function MoistureRegister({ go, session, role, viewAs, reports }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, PAGE_KEY);
  /* THE SECTIONS ARE ARRANGEABLE AND THE ARRANGEMENT IS THE USER'S OWN. Owner,
     16 Aug 2026: "every single dashboard need to have section as I stated where
     i can drag and put where i want to arreange dash for user preference." This
     mounts the SAME primitive the department dashboards use, saved per user
     through tg_save_dashboard_layout; the page contributes only its own list. */
  const WIDGETS = React.useMemo(() => [
    { key: "needs", title: "Awaiting a moisture loss record — largest difference first", span: 2 },
    { key: "trail", title: "Already recorded — the audit trail", span: 2 },
    { key: "activity", title: "Most recent write-offs", span: 1 },
    { key: "reports", title: "Cultivation reports", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const measures = useCultMeasures();
  const [d, setD] = useState(null);
  const [openKpi, setOpenKpi] = useState(null);
  const [ver, setVer] = useState(0);

  useEffect(() => {
    let live = true;
    supabase.from("v_moisture_loss_register").select("*")
      .order("phantom_lb", { ascending: false, nullsFirst: false })
      .then((res) => { if (live) setD({ m: grab(res) }); });
    return () => { live = false; };
  }, [ver]);

  const targets = useMemo(() => cultTargetMap(measures), [measures]);
  const trend = useMemo(() => cultTrendMap(measures), [measures]);
  const licMap = useMemo(() => cultLicenceMap(measures), [measures]);

  const rows = useMemo(
    () => listOf(d ? d.m.rows : []).map((r) => ({ ...r, room_qualified: cultRoomLabel(r.drying_room, r.license, licMap) })),
    [d, licMap],
  );

  const needs = useMemo(() => rows.filter((r) => r.needs_recording === true), [rows]);
  const recorded = useMemo(() => rows.filter((r) => r.needs_recording !== true), [rows]);
  const phantom = useMemo(() => needs.reduce((a, r) => a + Number(r.phantom_lb ? r.phantom_lb : 0), 0), [needs]);
  const written = useMemo(() => recorded.reduce((a, r) => a + Number(r.recorded_loss_lb ? r.recorded_loss_lb : 0), 0), [recorded]);
  const inMetrc = useMemo(() => recorded.filter((r) => r.recorded_in_metrc === true), [recorded]);

  const tiles = useMemo(() => {
    let n = 0;
    const t = [
      cultTile(n++, "Harvests needing a moisture loss recorded", needs.length, "harvests",
        needs.length ? "bad" : "ok",
        "The view decides this, not this page. Until a loss is written off, Metrc keeps showing water as though it were saleable weight."),
      cultTile(n++, "Phantom pounds still on the books", Number(phantom.toFixed(1)), "lb",
        phantom > 0 ? "bad" : "ok",
        "Every figure on this page is in pounds, so this total is safe to take. It is the difference the view serves between what Metrc shows and what is really left."),
      cultTile(n++, "Moisture loss already written off", Number(written.toFixed(1)), "lb", "ok",
        "Totalled from the recorded loss column across the harvests in the trail below."),
      cultTile(n++, "Write-offs also recorded in Metrc", inMetrc.length, "harvests",
        inMetrc.length === recorded.length ? "ok" : "warn",
        "This platform is a read-only mirror and has never written to Metrc. A write-off recorded here is a record of intent until somebody records it in Metrc as well; this figure is how many have been."),
    ];
    return t;
  }, [needs, phantom, written, inMetrc, recorded]);

  const inPlace = useMemo(() => cultInPlace(tiles, openKpi, (k) => setOpenKpi((c) => (c === k ? null : k))), [tiles, openKpi]);
  const drillRows = useMemo(() => {
    if (openKpi === "Harvests needing a moisture loss recorded") return needs;
    if (openKpi === "Phantom pounds still on the books") return needs.filter((r) => r.phantom_lb !== null);
    if (openKpi === "Moisture loss already written off") return recorded.filter((r) => r.recorded_loss_lb !== null);
    if (openKpi === "Write-offs also recorded in Metrc") return inMetrc;
    return null;
  }, [openKpi, needs, recorded, inMetrc]);

  const activity = useMemo(() => rows
    .filter((r) => r.recorded_on)
    .sort((a, b) => (a.recorded_on < b.recorded_on ? 1 : -1))
    .slice(0, 12)
    .map((r) => ({
      when: r.recorded_on,
      what: `${r.harvest_name} written off by ${r.entered_by ? r.entered_by : "somebody not recorded"}`,
      detail: r.recorded_loss_lb === null || r.recorded_loss_lb === undefined
        ? "amount not recorded" : `${cultNum(r.recorded_loss_lb)} lb`,
      tone: "ok",
    })), [rows]);

  if (d === null) {
    return <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Reading the moisture loss register…</div></div>;
  }

  const ActionCard = ({ r }) => (
    <div className="cult-actcard crit">
      <span>
        <b>{r.harvest_name}</b>
        <span className="cult-hrow-sub">
          {r.strain ? r.strain : "strain not recorded"} · {r.room_qualified} ·{" "}
          {r.harvest_state ? r.harvest_state : "state not recorded"}
        </span>
      </span>
      <span className="cult-figure" title="What Metrc still shows as remaining in the room.">
        {r.metrc_shows_remaining_lb === null || r.metrc_shows_remaining_lb === undefined
          ? "Metrc remaining not served" : `${cultNum(r.metrc_shows_remaining_lb)} lb shown in Metrc`}
      </span>
      <span className="cult-figure" title="What the view calculates is really left once the water is taken out.">
        {r.really_left_lb === null || r.really_left_lb === undefined
          ? "really left not served" : `${cultNum(r.really_left_lb)} lb really left`}
      </span>
      <span className="cult-figure" title="The difference between the two figures beside this one. It is water, not product.">
        {r.phantom_lb === null || r.phantom_lb === undefined
          ? "difference not served" : `${cultNum(r.phantom_lb)} lb phantom`}
      </span>
      <span>
        <AssignTask dept={CULT_DEPT} kpi={`Record the moisture loss on ${r.harvest_name}`}
          value={r.phantom_lb} unit="lb" drill={VIEW_KEY} onDone={() => setVer((v) => v + 1)} />
      </span>
    </div>
  );

  return (
    <DrillRoot label="Moisture loss register">
      <div className="ccpage">
        <DkHead title="Moisture loss register" viewKey={VIEW_KEY} dept={CULT_DEPT} role={role}
          viewAs={viewAs} computed={null} busy={false}>
          <DkTag tone={needs.length ? "crit" : "ok"}>{needs.length} awaiting a record</DkTag>
          <DkTag tone="neutral">{rows.length.toLocaleString()} harvests on the register</DkTag>
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
          </div>
          <div className="cc-tools-r">
            <button type="button" className="cc-btn" onClick={() => go("harvests")}>Harvest register →</button>
            <button type="button" className="cc-btn" onClick={() => go("grading")}>Weights and grading →</button>
            <button type="button" className="cc-btn" onClick={() => go("dept_dash_cultivation")}>Cultivation dashboard →</button>
          </div>
        </div>

        {d.m.err ? <DkErr what="The moisture loss register" err={d.m.err} /> : (
          <DkKpiStrip dept={CULT_DEPT} tiles={tiles} trend={trend} targets={targets} go={go}
            inPlace={inPlace} sourceNote={SOURCE_NOTE} onAssigned={() => setVer((v) => v + 1)}
            emptyNote="The register holds no harvest, so there is nothing to record against." />
        )}
        {measures && measures.targets.err && <DkErr what="The owner-set targets" err={measures.targets.err} />}
        <div className="cc-fine">{CULT_ROOM_UNQUALIFIED}</div>
        <div className="cc-fine">
          This platform is a <b>read-only mirror of Metrc</b> and holds no write credentials. Recording
          a moisture loss here records the intent and the evidence; the corresponding adjustment in
          Metrc is a separate act by a person, and the register tracks whether it has happened.
        </div>

        {drillRows && (
          <DkDrill label={`${openKpi} — every harvest behind the figure`} onClose={() => setOpenKpi(null)}>
            <div className="cc-fine">
              <b>{drillRows.length.toLocaleString()}</b> harvest{drillRows.length === 1 ? "" : "s"}.
              This is the same array the figure counted.
            </div>
            {drillRows.length === 0
              ? <DkEmpty why="Nothing sits behind this figure right now." fills="The figure counts this same list." />
              : <div className="tablewrap">
                  <table>
                    <thead><tr><th>Harvest</th><th>Drying room</th><th>Wet</th><th>Packaged</th>
                      <th>Waste</th><th>Shown in Metrc</th><th>Really left</th><th>Phantom</th>
                      <th>Recorded</th><th>By whom</th><th>In Metrc</th></tr></thead>
                    <tbody>
                      {drillRows.map((r) => (
                        <tr key={r.harvest_name}>
                          <td>{r.harvest_name}</td>
                          <td>{r.room_qualified}</td>
                          <td>{r.wet_lb === null || r.wet_lb === undefined ? "not recorded" : `${cultNum(r.wet_lb)} lb`}</td>
                          <td>{r.packaged_lb === null || r.packaged_lb === undefined ? "nothing packaged" : `${cultNum(r.packaged_lb)} lb`}</td>
                          <td>{r.waste_lb === null || r.waste_lb === undefined ? "not recorded" : `${cultNum(r.waste_lb)} lb`}</td>
                          <td>{r.metrc_shows_remaining_lb === null || r.metrc_shows_remaining_lb === undefined ? "not served" : `${cultNum(r.metrc_shows_remaining_lb)} lb`}</td>
                          <td>{r.really_left_lb === null || r.really_left_lb === undefined ? "not served" : `${cultNum(r.really_left_lb)} lb`}</td>
                          <td>{r.phantom_lb === null || r.phantom_lb === undefined ? "not served" : `${cultNum(r.phantom_lb)} lb`}</td>
                          <td>{r.recorded_loss_lb === null || r.recorded_loss_lb === undefined ? "nothing written off yet" : `${cultNum(r.recorded_loss_lb)} lb`}</td>
                          <td>{r.entered_by ? r.entered_by : "nobody recorded"}</td>
                          <td>{r.recorded_in_metrc === true ? "Yes" : r.recorded_in_metrc === false ? "Not yet" : "not stated"}</td>
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
                        case "needs": return (
              <Widget key={w.key} w={w} layout={layout} store={store} chips={<><DkTag tone="neutral">{Number(needs.length).toLocaleString()}</DkTag>{needs.length
              ? <DkTag tone="crit">{cultNum(phantom)} lb sitting on the books as water</DkTag>
              : <DkTag tone="ok">nothing waiting</DkTag>}</>}>
            {needs.length === 0
              ? <DkEmpty why="Nothing is waiting for a moisture loss to be recorded."
                  fills="Every harvest the view can judge has either had its loss written off or has none to write off. That is the finished position, not an empty read." />
              : <div className="cult-act">{needs.map((r) => <ActionCard key={r.harvest_name} r={r} />)}</div>}
          </Widget>
              );

                        case "trail": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false} chips={<><DkTag tone="neutral">{Number(recorded.length).toLocaleString()}</DkTag></>}>
            {recorded.length === 0
              ? <DkEmpty why="No moisture loss has been written off yet."
                  fills="A harvest appears here once somebody records the loss against it, with their name, the method and the date." />
              : <div className="cult-act">
                  {recorded.map((r) => (
                    <div className="cult-actcard ok" key={r.harvest_name}>
                      <span>
                        <b>{r.harvest_name}</b>
                        <span className="cult-hrow-sub">{r.strain ? r.strain : "strain not recorded"} · {r.room_qualified}</span>
                      </span>
                      <span className="cult-figure">
                        {r.recorded_loss_lb === null || r.recorded_loss_lb === undefined
                          ? "nothing written off" : `${cultNum(r.recorded_loss_lb)} lb written off`}
                      </span>
                      <span className="cult-note">{r.recorded_method ? r.recorded_method : "method not recorded"}</span>
                      <span className="cult-note">
                        {r.recorded_on ? String(r.recorded_on).slice(0, 10) : "date not recorded"} ·{" "}
                        {r.entered_by ? r.entered_by : "nobody recorded"}
                      </span>
                      <span className="cult-note">
                        {r.recorded_in_metrc === true
                          ? `recorded in Metrc${r.metrc_adjustment_ref ? `, reference ${r.metrc_adjustment_ref}` : ", no reference given"}`
                          : "not yet recorded in Metrc"}
                      </span>
                    </div>
                  ))}
                </div>}
          </Widget>
              );

                        case "activity": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false} chips={<><DkTag tone="neutral">{Number(activity.length).toLocaleString()}</DkTag></>}>
            <CultActivity items={activity} what="the moisture register" none="No moisture loss carries a recorded date yet." />
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
