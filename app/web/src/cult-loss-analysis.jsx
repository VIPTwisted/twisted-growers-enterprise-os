/* ═══════════════════════════════════════════════════════════════════════════
   LOSS ANALYSIS — the why. Agent B, 15 Aug 2026.
   nav_registry view_key `loss_analysis`, serving v_loss_analysis.

   WHAT IT REPLACES. A fifteen-column generic grid in which the worst room in
   the building sorted alphabetically next to the best one.

   HOW IT IS LAID OUT. A RANKING, worst first, one line per room, strain and
   month, with the waste share drawn against the company average the view
   itself serves. The ledger page files the same losses by date; this page
   files them by blame. Neither is a substitute for the other and neither
   shares the other's shape.

   THE VERDICT IS THE VIEW'S. loss_verdict is served and repeated unchanged.
   This page applies no band of its own — deciding here what counts as SEVERE
   would put a second, invisible threshold on the platform.

   WHAT THIS PAGE CANNOT TELL YOU, AND SAYS SO. v_loss_analysis serves the room
   name with no licence beside it, so the department cannot be resolved on
   these rows and is not guessed. Adding the licence to the view is on the list
   for the database team.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import {
  grab, listOf, DkTag, DkErr, DkEmpty, DkKpiStrip, DkDrill, DrillRoot, DkHead, useSectionStore,
  useWidgetLayout, Widget, WidgetBoard, WidgetBarControls, DkReports,
} from "./dashkit.jsx";
import {
  CULT_DEPT, useCultMeasures, cultTargetMap, cultTrendMap, cultLicenceMap, cultRoomLabel,
  cultTile, cultInPlace, CultActivity, CultShare, cultNum, CULT_ROOM_UNQUALIFIED,
} from "./cult-kit.jsx";

const VIEW_KEY = "loss_analysis";
const PAGE_KEY = "cult_loss_analysis";
const V_SEVERE = "SEVERE";
const V_HIGH = "HIGH";
const V_ELEVATED = "ELEVATED";

const SOURCE_NOTE = {
  label: "counted from the lines ranked below, live",
  why: "Each figure counts the room, strain and month lines this page has read from "
    + "v_loss_analysis. Pressing a figure lists those very lines.",
};

const verdictTone = (v) => {
  const s = String(v ? v : "");
  if (s.startsWith(V_SEVERE)) return "crit";
  if (s.startsWith(V_HIGH)) return "warn";
  if (s.startsWith(V_ELEVATED)) return "attn";
  return "ok";
};

export default function LossAnalysis({ go, session, role, viewAs, reports }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, PAGE_KEY);
  /* THE SECTIONS ARE ARRANGEABLE AND THE ARRANGEMENT IS THE USER'S OWN. Owner,
     16 Aug 2026: "every single dashboard need to have section as I stated where
     i can drag and put where i want to arreange dash for user preference." This
     mounts the SAME primitive the department dashboards use, saved per user
     through tg_save_dashboard_layout; the page contributes only its own list. */
  const WIDGETS = React.useMemo(() => [
    { key: "worst", title: "The worst line on record for this selection", span: 2 },
    { key: "rank", title: "Every room, strain and month, worst loss first", span: 2 },
    { key: "activity", title: "Most recent harvest on each of these lines", span: 1 },
    { key: "reports", title: "Cultivation reports", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const measures = useCultMeasures();
  const [d, setD] = useState(null);
  const [openKpi, setOpenKpi] = useState(null);
  const [ver, setVer] = useState(0);
  const [room, setRoom] = useState("");

  useEffect(() => {
    let live = true;
    supabase.from("v_loss_analysis").select("*")
      .order("waste_pct", { ascending: false, nullsFirst: false })
      .then((res) => { if (live) setD({ a: grab(res) }); });
    return () => { live = false; };
  }, [ver]);

  const targets = useMemo(() => cultTargetMap(measures), [measures]);
  const trend = useMemo(() => cultTrendMap(measures), [measures]);
  const licMap = useMemo(() => cultLicenceMap(measures), [measures]);
  /* EVERY ROW IS QUALIFIED ONCE, HERE, AND THE BARE NAME IS NEVER RENDERED AGAIN.
     This view serves no licence, so cultRoomLabel returns the name together with
     the statement that the department is not on the record — which is the honest
     label, not a decoration. Doing it once at read time also means no later line
     on this page can accidentally print a room name on its own. */
  const rows = useMemo(
    () => listOf(d ? d.a.rows : []).map((r) => ({ ...r, room_qualified: cultRoomLabel(r.room, r.license, licMap) })),
    [d, licMap],
  );
  const roomNames = useMemo(
    () => [...new Set(listOf(rows).map((r) => r.room_qualified))].sort(),
    [rows],
  );
  const shown = useMemo(() => listOf(rows).filter((r) => !room || r.room_qualified === room), [rows, room]);

  const severe = useMemo(() => shown.filter((r) => String(r.loss_verdict ? r.loss_verdict : "").startsWith(V_SEVERE)), [shown]);
  const high = useMemo(() => shown.filter((r) => String(r.loss_verdict ? r.loss_verdict : "").startsWith(V_HIGH)), [shown]);
  const elevated = useMemo(() => shown.filter((r) => String(r.loss_verdict ? r.loss_verdict : "").startsWith(V_ELEVATED)), [shown]);
  const wasteLbs = useMemo(() => shown.reduce((a, r) => a + Number(r.waste_lbs ? r.waste_lbs : 0), 0), [shown]);
  const worst = shown.length ? shown[0] : null;

  const tiles = useMemo(() => {
    let n = 0;
    return [
      cultTile(n++, "Lines the view calls severe", severe.length, "lines", severe.length ? "bad" : "ok",
        "The verdict is the one the view serves, repeated unchanged. Each line is one room, one strain, one month."),
      cultTile(n++, "Lines above the acceptable band", high.length, "lines", high.length ? "bad" : "ok",
        "The band is set in the view, not on this page."),
      cultTile(n++, "Lines to watch", elevated.length, "lines", elevated.length ? "warn" : "ok",
        "Elevated against the company average the view serves with each line."),
      cultTile(n++, "Waste recorded on these lines", Number(wasteLbs.toFixed(1)), "lb", wasteLbs > 0 ? "warn" : "ok",
        "Totalled only across lines that carry a pound figure. Every line here is in pounds, so this total is safe to take; the loss ledger, which mixes units, deliberately has no grand total."),
    ];
  }, [severe, high, elevated, wasteLbs]);

  const inPlace = useMemo(() => cultInPlace(tiles, openKpi, (k) => setOpenKpi((c) => (c === k ? null : k))), [tiles, openKpi]);
  const drillRows = useMemo(() => {
    if (openKpi === "Lines the view calls severe") return severe;
    if (openKpi === "Lines above the acceptable band") return high;
    if (openKpi === "Lines to watch") return elevated;
    if (openKpi === "Waste recorded on these lines") return shown.filter((r) => r.waste_lbs !== null);
    return null;
  }, [openKpi, severe, high, elevated, shown]);

  const activity = useMemo(() => [...shown]
    .filter((r) => r.last_harvest)
    .sort((a, b) => (a.last_harvest < b.last_harvest ? 1 : -1))
    .slice(0, 12)
    .map((r) => ({
      when: r.last_harvest,
      what: `${r.strain ? r.strain : "strain not recorded"} last harvested in ${r.room_qualified}`,
      detail: `${cultNum(r.waste_pct)} per cent waste`,
      tone: verdictTone(r.loss_verdict),
    })), [shown]);

  if (d === null) {
    return <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Ranking every room, strain and month by loss…</div></div>;
  }

  const RankRow = ({ r, i }) => (
    <div className="cult-rankrow">
      <span className="cult-rankno">{i + 1}</span>
      <span>
        {r.room_qualified}
        <span className="cult-hrow-sub">{r.strain ? r.strain : "strain not recorded"} · {r.month ? r.month : "month not recorded"}</span>
      </span>
      <span>
        <CultShare pct={r.waste_pct} tone={verdictTone(r.loss_verdict)}
          title={`${cultNum(r.waste_pct)} per cent of the wet weight was waste on this line.`} />
        <span className="cult-note"> {cultNum(r.waste_pct)} per cent waste</span>
      </span>
      <span><DkTag tone={verdictTone(r.loss_verdict)}>{r.loss_verdict ? r.loss_verdict : "no verdict served"}</DkTag></span>
      <span className="cult-figure">
        {r.waste_lbs === null || r.waste_lbs === undefined ? "waste not recorded" : `${cultNum(r.waste_lbs)} lb waste`}
      </span>
      <span className="cult-note">
        {r.harvests ? `${cultNum(r.harvests, 0)} harvests` : "harvest count not recorded"} ·{" "}
        {r.plants ? `${cultNum(r.plants, 0)} plants` : "plant count not recorded"} ·{" "}
        {r.waste_pct_vs_company_average === null || r.waste_pct_vs_company_average === undefined
          ? "no comparison against the company average served"
          : `${cultNum(r.waste_pct_vs_company_average)} points above the company average`}
      </span>
    </div>
  );

  return (
    <DrillRoot label="Loss analysis">
      <div className="ccpage">
        <DkHead title="Loss analysis — where it is going and why" viewKey={VIEW_KEY} dept={CULT_DEPT}
          role={role} viewAs={viewAs} computed={null} busy={false}>
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
            <label className="cc-fine" htmlFor="la-room">Room</label>
            <select id="la-room" className="cc-input" value={room} onChange={(e) => setRoom(e.target.value)}
              title="Narrow the ranking to one room. Every figure above recounts for the narrowed set.">
              <option value="">Every room</option>
              {roomNames.map((rn) => <option key={rn} value={rn}>{rn}</option>)}
            </select>
          </div>
          <div className="cc-tools-r">
            <button type="button" className="cc-btn" onClick={() => go("loss_ledger")}
              title="The same losses filed by the day they happened">Loss ledger →</button>
            <button type="button" className="cc-btn" onClick={() => go("dept_dash_cultivation")}>Cultivation dashboard →</button>
          </div>
        </div>

        {d.a.err ? <DkErr what="The loss analysis" err={d.a.err} /> : (
          <DkKpiStrip dept={CULT_DEPT} tiles={tiles} trend={trend} targets={targets} go={go}
            inPlace={inPlace} sourceNote={SOURCE_NOTE} onAssigned={() => setVer((v) => v + 1)}
            emptyNote="The view serves no loss line for this selection." />
        )}
        {measures && measures.targets.err && <DkErr what="The owner-set targets" err={measures.targets.err} />}
        <div className="cc-fine">{CULT_ROOM_UNQUALIFIED}</div>

        {drillRows && (
          <DkDrill label={`${openKpi} — every line behind the figure`} onClose={() => setOpenKpi(null)}>
            <div className="cc-fine">
              <b>{drillRows.length.toLocaleString()}</b> line{drillRows.length === 1 ? "" : "s"}, worst
              first. This is the same array the figure counted.
            </div>
            {drillRows.length === 0
              ? <DkEmpty why="Nothing sits behind this figure right now." fills="The figure counts this same list." />
              : <div className="cult-rank">{drillRows.map((r, i) => <RankRow key={`${r.room_qualified}|${r.strain}|${r.month}`} r={r} i={i} />)}</div>}
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            switch (w.key) {
              /* The worst line is a section like any other, so it can be dragged
                 or hidden — but it renders an honest empty state rather than
                 vanishing when there is no line to be worst. */
              case "worst": return (
              <Widget key={w.key} w={w} layout={layout} store={store}>
              {!worst ? <DkEmpty why="There is no line to call the worst one."
                fills="A line appears here as soon as the view serves one for this selection." /> : (<>
              <div className="cult-splitcard">
                <span className="cult-splitlbl">Worst waste share</span>
                <span className="cult-splitbig">{cultNum(worst.waste_pct)} per cent</span>
                <span className="cult-splitlbl">
                  {worst.strain ? worst.strain : "strain not recorded"} in{" "}
                  {worst.room_qualified}, {worst.month ? worst.month : "month not recorded"}
                </span>
                <p className="cult-note">{worst.loss_verdict ? worst.loss_verdict : "no verdict served with this line"}</p>
              </div></>)}
              </Widget>
              );

                        case "rank": return (
              <Widget key={w.key} w={w} layout={layout} store={store} chips={<><DkTag tone="neutral">{Number(shown.length).toLocaleString()}</DkTag>{<DkTag tone="info">the view&rsquo;s own verdict, unchanged</DkTag>}</>}>
            {shown.length === 0
              ? <DkEmpty why="The view serves no loss line for this selection."
                  fills="Choose every room above to see the whole ranking."
                  action={<button type="button" className="cc-btn" onClick={() => setRoom("")}>Show every room</button>} />
              : <div className="cult-rank">{shown.map((r, i) => <RankRow key={`${r.room_qualified}|${r.strain}|${r.month}`} r={r} i={i} />)}</div>}
          </Widget>
              );

                        case "activity": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false} chips={<><DkTag tone="neutral">{Number(activity.length).toLocaleString()}</DkTag></>}>
            <CultActivity items={activity} what="the loss analysis" none="No line carries a last-harvest date." />
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
