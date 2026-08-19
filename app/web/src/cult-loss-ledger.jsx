/* ═══════════════════════════════════════════════════════════════════════════
   LOSS AND DESTRUCTION LEDGER. Agent B, 15 Aug 2026.
   nav_registry view_key `loss_ledger`, serving v_loss_ledger.

   WHAT IT REPLACES. A nine-column generic grid. A ledger read as a grid loses
   the one thing a ledger is for: what happened, in order, on which day.

   HOW IT IS LAID OUT. A DATE SPINE. Every loss is filed under the day it
   occurred, newest day first, and the day carries its own totals. That is what
   an auditor asks this page and it is not a question any other Cultivation
   page asks.

   THE UNIT RULE, WHICH IS THE WHOLE DIFFICULTY WITH THIS VIEW. v_loss_ledger
   records amounts in more than one unit of measure — the same column holds
   grams and pounds. Adding them would produce a number that is wrong by three
   orders of magnitude and looks perfectly reasonable, which is the exact shape
   of the defect that once published tens of thousands of units as nothing. So
   NOTHING ON THIS PAGE IS EVER TOTALLED ACROSS UNITS. Every total, on the
   strip and on every day of the spine, is per unit and says which unit it is.
   There is deliberately no grand total, and the page says why.

   THE ROOM CARRIES ITS DEPARTMENT. This view serves the licence beside the
   room, so the department is resolved from company_licenses.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { dateUpperExclusive } from "./lib/date-range-core.js";
import { DateRangeSelect } from "./App.jsx";
import {
  useDefaultRange, grab, listOf, DkTag, DkErr, DkEmpty, DkKpiStrip, DkDrill, DrillRoot, DkHead, useSectionStore,
  useWidgetLayout, Widget, WidgetBoard, WidgetBarControls, DkReports,
} from "./dashkit.jsx";
import {
  CULT_DEPT, useCultMeasures, cultTargetMap, cultTrendMap, cultLicenceMap,
  cultRoomLabel, cultTile, cultInPlace, CultActivity, cultNum, cultQty,
} from "./cult-kit.jsx";

const VIEW_KEY = "loss_ledger";
const PAGE_KEY = "cult_loss_ledger";

const SOURCE_NOTE = {
  label: "counted from the ledger entries below, live, never added across units",
  why: "Every figure counts or totals the ledger rows this page has read from v_loss_ledger. "
    + "A total is only ever taken within one unit of measure; two units are never added, and "
    + "there is no grand total because a grand total across units would be meaningless.",
};

/* Totals per unit, never across them. Returns [[uom, amount, records], …]. */
function byUnit(rows) {
  const m = new Map();
  for (const r of listOf(rows)) {
    const u = r.uom ? String(r.uom) : "unit of measure not recorded";
    const cur = m.get(u) ? m.get(u) : { amount: 0, n: 0 };
    cur.amount += Number(r.amount ? r.amount : 0);
    cur.n += 1;
    m.set(u, cur);
  }
  return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
}

export default function LossLedger({ go, session, role, viewAs, reports }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, PAGE_KEY);
  /* THE SECTIONS ARE ARRANGEABLE AND THE ARRANGEMENT IS THE USER'S OWN. Owner,
     16 Aug 2026: "every single dashboard need to have section as I stated where
     i can drag and put where i want to arreange dash for user preference." This
     mounts the SAME primitive the department dashboards use, saved per user
     through tg_save_dashboard_layout; the page contributes only its own list. */
  const WIDGETS = React.useMemo(() => [
    { key: "spine", title: "Every loss, filed under the day it happened", span: 2 },
    { key: "activity", title: "Most recent entries", span: 1 },
    { key: "reports", title: "Cultivation reports", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const measures = useCultMeasures();
  const [range, setRange] = useState({ from: "", to: "" });
  /* Opens on the company default (this month) rather than all history —
     owner charter, 19 Aug 2026: no page may show all history by default. */
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [kind, setKind] = useState("");
  const [d, setD] = useState(null);
  const [openKpi, setOpenKpi] = useState(null);
  const [ver, setVer] = useState(0);

  useEffect(() => {
    if (!dateDefault.ready) return undefined;
    let live = true;
    let query = supabase.from("v_loss_ledger").select("*");
    if (range.from) query = query.gte("occurred_on", range.from);
    if (range.to) query = query.lt("occurred_on", dateUpperExclusive(range.to));
    query.order("occurred_on", { ascending: false, nullsFirst: false })
      .then((res) => { if (live) setD({ l: grab(res) }); });
    return () => { live = false; };
  }, [ver, range.from, range.to, dateDefault.ready]);

  const targets = useMemo(() => cultTargetMap(measures), [measures]);
  const trend = useMemo(() => cultTrendMap(measures), [measures]);
  const licMap = useMemo(() => cultLicenceMap(measures), [measures]);
  const rows = useMemo(() => (d ? d.l.rows : []), [d]);

  const kinds = useMemo(() => [...new Set(listOf(rows).map((r) => r.loss_type).filter(Boolean))].sort(), [rows]);

  const inRange = useMemo(() => listOf(rows).filter((r) => {
    if (kind && r.loss_type !== kind) return false;
    if (!range.from && !range.to) return true;
    const d0 = r.occurred_on ? String(r.occurred_on).slice(0, 10) : null;
    if (!d0) return false;
    if (range.from && d0 < range.from) return false;
    if (range.to && d0 > range.to) return false;
    return true;
  }), [rows, range, kind]);

  const units = useMemo(() => byUnit(inRange), [inRange]);

  const tiles = useMemo(() => {
    let n = 0;
    const t = [cultTile(n++, "Loss records", inRange.length, "records", inRange.length ? "warn" : "ok",
      "Every destruction and every write-off the ledger holds in the chosen range.")];
    for (const [u, v] of units) {
      t.push(cultTile(n++, `Recorded loss in ${u}`, Number(v.amount.toFixed(2)), u, "bad",
        `Totalled only within this unit of measure, across ${v.n.toLocaleString()} records. It is never added to a total in any other unit.`));
    }
    for (const k of kinds) {
      const list = inRange.filter((r) => r.loss_type === k);
      if (list.length) {
        t.push(cultTile(n++, `${k} records`, list.length, "records", "warn",
          "A count of records, which is safe to compare across units. The weight behind them is totalled per unit above."));
      }
    }
    return t;
  }, [inRange, units, kinds]);

  const inPlace = useMemo(() => cultInPlace(tiles, openKpi, (k) => setOpenKpi((c) => (c === k ? null : k))), [tiles, openKpi]);

  const drillRows = useMemo(() => {
    if (!openKpi) return null;
    if (openKpi === "Loss records") return inRange;
    const unitHit = units.find(([u]) => openKpi === `Recorded loss in ${u}`);
    if (unitHit) return inRange.filter((r) => (r.uom ? String(r.uom) : "unit of measure not recorded") === unitHit[0]);
    const kindHit = kinds.find((k) => openKpi === `${k} records`);
    if (kindHit) return inRange.filter((r) => r.loss_type === kindHit);
    return null;
  }, [openKpi, inRange, units, kinds]);

  /* The spine: one entry per day, newest first, each day carrying its own
     per-unit totals. */
  const days = useMemo(() => {
    const m = new Map();
    for (const r of inRange) {
      const k = r.occurred_on ? String(r.occurred_on).slice(0, 10) : "date not recorded";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  }, [inRange]);

  const activity = useMemo(() => inRange.slice(0, 12).map((r) => ({
    when: r.occurred_on,
    what: `${r.loss_type ? r.loss_type : "loss"} against ${r.record ? r.record : "an unnamed record"} in ${cultRoomLabel(r.room, r.license, licMap)}`,
    detail: cultQty(r.amount, r.uom),
    tone: "crit",
  })), [inRange, licMap]);

  if (dateDefault.error) {
    return <div className="ccpage"><DkErr what="The governed date range" err={dateDefault.error} /></div>;
  }
  if (!dateDefault.ready || d === null) {
    return <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Reading the loss and destruction ledger…</div></div>;
  }

  const LossRow = ({ r }) => (
    <div className="cult-lossrow crit">
      <span>{r.record ? r.record : "record not named"}</span>
      <span className="cult-figure">{cultQty(r.amount, r.uom)}</span>
      <span>{cultRoomLabel(r.room, r.license, licMap)}</span>
      <span className="cult-note">
        {r.loss_type ? r.loss_type : "type not recorded"}
        {r.reason_code ? ` · ${r.reason_code}` : " · no reason code recorded"}
        {r.detail ? ` · ${r.detail}` : ""}
      </span>
    </div>
  );

  return (
    <DrillRoot label="Loss ledger">
      <div className="ccpage">
        <DkHead title="Loss and destruction ledger" viewKey={VIEW_KEY} dept={CULT_DEPT}
          role={role} viewAs={viewAs} computed={null} busy={false}>
          <DkTag tone="neutral">{inRange.length.toLocaleString()} of {rows.length.toLocaleString()} entries</DkTag>
          <DkTag tone="attn" title={SOURCE_NOTE.why}>{units.length} units of measure, never added together</DkTag>
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
            <label className="cc-fine" htmlFor="loss-kind">Kind of loss</label>
            <select id="loss-kind" className="cc-input" value={kind} onChange={(e) => setKind(e.target.value)}
              title="Narrow the ledger to one kind of loss. Every figure above recounts for the narrowed set.">
              <option value="">Every kind</option>
              {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="cc-tools-c">
            <DateRangeSelect label="Occurred between" from={range.from} to={range.to}
              onFrom={(v) => setRange((p) => ({ ...p, from: v }))}
              onTo={(v) => setRange((p) => ({ ...p, to: v }))}
              presetKey={dateDefault.presetKey} session={session} viewKey={VIEW_KEY} allowSave />
          </div>
          <div className="cc-tools-r">
            <button type="button" className="cc-btn" onClick={() => go("loss_analysis")}
              title="The same losses ranked by room and strain, with the verdict the view serves">Loss analysis →</button>
            <button type="button" className="cc-btn" onClick={() => go("dept_dash_cultivation")}>Cultivation dashboard →</button>
          </div>
        </div>

        {d.l.err ? <DkErr what="The loss ledger" err={d.l.err} /> : (
          <DkKpiStrip dept={CULT_DEPT} tiles={tiles} trend={trend} targets={targets} go={go}
            inPlace={inPlace} sourceNote={SOURCE_NOTE} onAssigned={() => setVer((v) => v + 1)}
            emptyNote="No loss is recorded in the chosen range, which is the real position rather than a failed read." />
        )}
        {measures && measures.targets.err && <DkErr what="The owner-set targets" err={measures.targets.err} />}

        <div className="cc-fine">
          There is <b>no grand total on this page and there will not be one</b>. The ledger records
          amounts in more than one unit of measure, and a figure that added grams to pounds would be
          wrong by a factor of hundreds while looking entirely plausible. Each unit is totalled on
          its own tile above.
        </div>

        {drillRows && (
          <DkDrill label={`${openKpi} — every ledger entry behind the figure`} onClose={() => setOpenKpi(null)}>
            <div className="cc-fine">
              <b>{drillRows.length.toLocaleString()}</b> entr{drillRows.length === 1 ? "y" : "ies"}, listed
              individually. This is the same array the figure counted.
            </div>
            {drillRows.length === 0
              ? <DkEmpty why="Nothing sits behind this figure right now." fills="The figure counts this same list." />
              : <div className="cult-dayitems">{drillRows.map((r, i) => <LossRow key={`${r.record}|${r.occurred_on}|${i}`} r={r} />)}</div>}
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            switch (w.key) {
                        case "spine": return (
              <Widget key={w.key} w={w} layout={layout} store={store} chips={<><DkTag tone="neutral">{Number(inRange.length).toLocaleString()}</DkTag>{<DkTag tone="info">newest day first</DkTag>}</>}>
            {days.length === 0
              ? <DkEmpty why="No loss is recorded in the chosen range."
                  fills="That is the real position for this range — nothing was destroyed and nothing was written off."
                  action={<button type="button" className="cc-btn" onClick={() => { setRange({ from: "", to: "" }); setKind(""); }}>Show every entry</button>} />
              : <div className="cult-spine">
                  {days.map(([day, list]) => (
                    <div className="cult-day" key={day}>
                      <div className="cult-daymark">
                        {day}
                        <div className="cult-note">{list.length} entr{list.length === 1 ? "y" : "ies"}</div>
                        {byUnit(list).map(([u, v]) => (
                          <div className="cult-note" key={u}>{cultNum(v.amount, 2)} {u}</div>
                        ))}
                      </div>
                      <div className="cult-dayitems">
                        {list.map((r, i) => <LossRow key={`${r.record}|${i}`} r={r} />)}
                      </div>
                    </div>
                  ))}
                </div>}
          </Widget>
              );

                        case "activity": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false} chips={<><DkTag tone="neutral">{Number(activity.length).toLocaleString()}</DkTag></>}>
            <CultActivity items={activity} what="the loss ledger" none="No dated loss entry in the chosen range." />
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
