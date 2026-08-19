/* ═══════════════════════════════════════════════════════════════════════════
   MOISTURE LOSS REGISTER. Agent B, 15 Aug 2026.
   nav_registry view_key `moisture_loss_register`, serving
   v_moisture_loss_register.

   WHAT IT REPLACES. Twenty-two columns of generic grid. The register exists so
   somebody verifies each closed-harvest residual against Metrc and records the
   evidence; a grid asks nobody to do anything.

   HOW IT IS LAID OUT. Action first. Every closed dried harvest whose source
   residual is unavailable is an action card with an estimate and its basis
   evidence. Verified records follow as the dated audit trail.

   WHAT THE ESTIMATE IS. It is wet weight multiplied by the editable company
   residual goal, never direct measured water. Wet-basis fresh frozen is
   excluded, and an unknown basis refuses the estimate.

   THE ROOM. This view serves the drying room with no licence beside it, so the
   department is stated as not recorded rather than guessed.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { AssignTask, DateRangeSelect } from "./App.jsx";
import BusinessRuleEditor from "./business-rule-editor.jsx";
import {
  useDefaultRange, grab, listOf, DkTag, DkErr, DkEmpty, DkKpiStrip, DkDrill, DrillRoot, DkHead, useSectionStore,
  useWidgetLayout, Widget, WidgetBoard, WidgetBarControls, DkReports,
} from "./dashkit.jsx";
import {
  CULT_DEPT, useCultMeasures, cultTargetMap, cultTrendMap, cultLicenceMap, cultRoomLabel,
  cultTile, cultInPlace, CultActivity, cultNum, CULT_ROOM_UNQUALIFIED,
} from "./cult-kit.jsx";

const VIEW_KEY = "moisture_loss_register";
const PAGE_KEY = "cult_moisture";

const SOURCE_NOTE = {
  label: "current open actions plus completed records in the chosen date window",
  why: "Open actions are a current compliance position and never disappear because they are old. "
    + "Completed records follow the chosen date range. Every figure drills to the exact rows it counted.",
};

export default function MoistureRegister({ go, session, role, viewAs, reports }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, PAGE_KEY);
  /* THE SECTIONS ARE ARRANGEABLE AND THE ARRANGEMENT IS THE USER'S OWN. Owner,
     16 Aug 2026: "every single dashboard need to have section as I stated where
     i can drag and put where i want to arreange dash for user preference." This
     mounts the SAME primitive the department dashboards use, saved per user
     through tg_save_dashboard_layout; the page contributes only its own list. */
  const WIDGETS = React.useMemo(() => [
    { key: "rules", title: "Editable moisture and weight-basis rules", span: 2 },
    { key: "needs", title: "Awaiting Metrc residual verification — largest estimate first", span: 2 },
    { key: "trail", title: "Verified residual records — the audit trail", span: 2 },
    { key: "activity", title: "Most recent residual records", span: 1 },
    { key: "reports", title: "Cultivation reports", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const measures = useCultMeasures();
  const [range, setRange] = useState({ from: "", to: "" });
  useDefaultRange(session, VIEW_KEY, setRange);
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

  const allRows = useMemo(
    () => listOf(d ? d.m.rows : []).map((r) => ({ ...r, room_qualified: cultRoomLabel(r.drying_room, r.license, licMap) })),
    [d, licMap],
  );

  const inRange = useMemo(() => allRows.filter((r) => {
    if (!range.from && !range.to) return true;
    const date = String(r.recorded_on || r.harvest_closed || r.harvest_started || "").slice(0, 10);
    if (!date) return false;
    return (!range.from || date >= range.from) && (!range.to || date <= range.to);
  }), [allRows, range.from, range.to]);
  const needs = useMemo(() => allRows.filter((r) => r.needs_recording === true), [allRows]);
  const recorded = useMemo(() => inRange.filter((r) => r.needs_recording !== true), [inRange]);
  const rows = useMemo(() => [...needs, ...recorded], [needs, recorded]);
  const phantom = useMemo(() => needs.reduce((a, r) => a + Number(r.phantom_lb ? r.phantom_lb : 0), 0), [needs]);
  const written = useMemo(() => recorded.reduce((a, r) => a + Number(r.recorded_loss_lb ? r.recorded_loss_lb : 0), 0), [recorded]);
  const inMetrc = useMemo(() => recorded.filter((r) => r.recorded_in_metrc === true), [recorded]);

  const tiles = useMemo(() => {
    let n = 0;
    const t = [
      cultTile(n++, "Harvests needing residual verification", needs.length, "harvests",
        needs.length ? "bad" : "ok",
        "Current closed harvests with no authoritative Metrc residual row. Fresh frozen is excluded and unknown basis is refused."),
      cultTile(n++, "Estimated residual awaiting verification", Number(phantom.toFixed(1)), "lb",
        phantom > 0 ? "bad" : "ok",
        "An estimate from the editable dried-harvest residual goal. It is not measured water and is never calculated for wet or unknown basis."),
      cultTile(n++, "Residual recorded in selected dates", Number(written.toFixed(1)), "lb", "ok",
        "Metrc or locally evidenced mass-balance residuals in the chosen date range. The residual can include evaporation, unrecorded loss, or weighing error."),
      cultTile(n++, "Selected records verified in Metrc", inMetrc.length, "harvests",
        inMetrc.length === recorded.length ? "ok" : "warn",
        "This platform is a read-only mirror. A local record is not a Metrc fact until its source evidence or adjustment reference is present."),
    ];
    return t;
  }, [needs, phantom, written, inMetrc, recorded]);

  const inPlace = useMemo(() => cultInPlace(tiles, openKpi, (k) => setOpenKpi((c) => (c === k ? null : k))), [tiles, openKpi]);
  const drillRows = useMemo(() => {
    if (openKpi === "Harvests needing residual verification") return needs;
    if (openKpi === "Estimated residual awaiting verification") return needs.filter((r) => r.phantom_lb !== null);
    if (openKpi === "Residual recorded in selected dates") return recorded.filter((r) => r.recorded_loss_lb !== null);
    if (openKpi === "Selected records verified in Metrc") return inMetrc;
    return null;
  }, [openKpi, needs, recorded, inMetrc]);

  const activity = useMemo(() => rows
    .filter((r) => r.recorded_on)
    .sort((a, b) => (a.recorded_on < b.recorded_on ? 1 : -1))
    .slice(0, 12)
    .map((r) => ({
      when: r.recorded_on,
      what: `${r.harvest_name} residual recorded by ${r.entered_by ? r.entered_by : "somebody not recorded"}`,
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
      <span className="cult-figure" title="Expected product still left under the owner-set dried-harvest residual goal.">
        {r.really_left_lb === null || r.really_left_lb === undefined
          ? "estimate refused for this basis" : `${cultNum(r.really_left_lb)} lb expected product left`}
      </span>
      <span className="cult-figure" title="Estimated residual still awaiting authoritative source verification. It is not directly measured water.">
        {r.phantom_lb === null || r.phantom_lb === undefined
          ? "residual estimate refused" : `${cultNum(r.phantom_lb)} lb estimated residual`}
      </span>
      <span className="cult-note">{r.weight_basis || "unknown"} basis · {r.classification_basis || "no basis evidence"}</span>
      <span>
        <AssignTask dept={CULT_DEPT} kpi={`Verify the Metrc residual on ${r.harvest_name}`}
          value={r.phantom_lb} unit="lb" drill={VIEW_KEY} onDone={() => setVer((v) => v + 1)} />
      </span>
    </div>
  );

  return (
    <DrillRoot label="Moisture loss register">
      <div className="ccpage">
        <DkHead title="Moisture loss register" viewKey={VIEW_KEY} dept={CULT_DEPT} role={role}
          viewAs={viewAs} computed={null} busy={false}>
          <DkTag tone={needs.length ? "crit" : "ok"}>{needs.length} current actions</DkTag>
          <DkTag tone="neutral">{recorded.length.toLocaleString()} completed records in range</DkTag>
          <DkTag tone="info">Metrc source through {allRows.map((r) => r.source_as_of).filter(Boolean).sort().at(-1) || "date not served"}</DkTag>
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
          <div className="cc-tools-c">
            <DateRangeSelect label="Recorded or closed between" from={range.from} to={range.to}
              onFrom={(v) => setRange((p) => ({ ...p, from: v }))}
              onTo={(v) => setRange((p) => ({ ...p, to: v }))} />
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
          evidence here does not change Metrc. The Metrc report field is a <b>mass-balance residual</b>:
          wet weight minus recorded waste minus packaged weight. It is mostly water for dried flower,
          but can also contain weighing error or unrecorded loss, so the page never diagnoses the cause by itself.
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
                    <thead><tr><th>Harvest</th><th>Basis</th><th>Basis evidence</th><th>Drying room</th><th>Wet</th><th>Packaged</th>
                      <th>Waste</th><th>Shown in Metrc</th><th>Expected product left</th><th>Estimated residual</th>
                      <th>Recorded residual</th><th>By whom</th><th>In Metrc</th></tr></thead>
                    <tbody>
                      {drillRows.map((r) => (
                        <tr key={r.harvest_name}>
                          <td>{r.harvest_name}</td>
                          <td>{r.weight_basis || "unknown"}</td>
                          <td>{r.classification_basis || "not recorded"}</td>
                          <td>{r.room_qualified}</td>
                          <td>{r.wet_lb === null || r.wet_lb === undefined ? "not recorded" : `${cultNum(r.wet_lb)} lb`}</td>
                          <td>{r.packaged_lb === null || r.packaged_lb === undefined ? "nothing packaged" : `${cultNum(r.packaged_lb)} lb`}</td>
                          <td>{r.waste_lb === null || r.waste_lb === undefined ? "not recorded" : `${cultNum(r.waste_lb)} lb`}</td>
                          <td>{r.metrc_shows_remaining_lb === null || r.metrc_shows_remaining_lb === undefined ? "not served" : `${cultNum(r.metrc_shows_remaining_lb)} lb`}</td>
                          <td>{r.really_left_lb === null || r.really_left_lb === undefined ? "refused for this basis" : `${cultNum(r.really_left_lb)} lb`}</td>
                          <td>{r.phantom_lb === null || r.phantom_lb === undefined ? "refused for this basis" : `${cultNum(r.phantom_lb)} lb`}</td>
                          <td>{r.recorded_loss_lb === null || r.recorded_loss_lb === undefined ? "nothing recorded yet" : `${cultNum(r.recorded_loss_lb)} lb`}</td>
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
                        case "rules": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                chips={<><DkTag tone="info">goal {allRows.find((r) => r.residual_goal_pct != null)?.residual_goal_pct ?? "not served"}%</DkTag></>}>
                <BusinessRuleEditor session={session} source="v_moisture_business_rules" compact
                  title="Moisture and weight-basis rules"
                  intro="Owner and executive users can change these here without leaving the register. Every save must return a durable database row and is captured in conversion-factor history."
                  onSaved={() => setVer((v) => v + 1)} />
              </Widget>
              );
                        case "needs": return (
              <Widget key={w.key} w={w} layout={layout} store={store} chips={<><DkTag tone="neutral">{Number(needs.length).toLocaleString()}</DkTag>{needs.length
              ? <DkTag tone="crit">{cultNum(phantom)} lb estimated residual awaiting verification</DkTag>
              : <DkTag tone="ok">nothing waiting</DkTag>}</>}>
            {needs.length === 0
              ? <DkEmpty why="Nothing is waiting for residual verification."
                  fills="Every closed dried harvest the source can judge has authoritative evidence. Fresh frozen is excluded and unknown basis is refused." />
              : <div className="cult-act">{needs.map((r) => <ActionCard key={r.harvest_name} r={r} />)}</div>}
          </Widget>
              );

                        case "trail": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false} chips={<><DkTag tone="neutral">{Number(recorded.length).toLocaleString()}</DkTag></>}>
            {recorded.length === 0
              ? <DkEmpty why="No residual record falls in the chosen dates."
                  fills="Change the date range to read another period. Current unresolved actions remain visible above regardless of age." />
              : <div className="cult-act">
                  {recorded.map((r) => (
                    <div className="cult-actcard ok" key={r.harvest_name}>
                      <span>
                        <b>{r.harvest_name}</b>
                        <span className="cult-hrow-sub">{r.strain ? r.strain : "strain not recorded"} · {r.room_qualified}</span>
                      </span>
                      <span className="cult-figure">
                        {r.recorded_loss_lb === null || r.recorded_loss_lb === undefined
                          ? "no residual recorded" : `${cultNum(r.recorded_loss_lb)} lb residual recorded`}
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
            <CultActivity items={activity} what="the moisture register" none="No residual record carries a date in the selected period." />
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
