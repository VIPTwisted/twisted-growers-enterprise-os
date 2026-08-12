/* ═══════════════════════════════════════════════════════════════════════════
   INVENTORY DASHBOARD — Agent B, 12 Aug 2026.

   The Inventory MANAGER's page: what is on hand and what of it can actually be
   sold, what is stuck untested, what was bought in, what is ageing, what is on
   a truck, which rooms are holding it, and every package behind every one of
   those numbers with its certificate and its manifest on the row.

   THE OWNER'S RULING ON STOCK BY STREAM IS IMPLEMENTED HERE, 12 Aug 2026:
   "this section is no longer dynamic! make this section dynamic, fully drills
   down, every item on drill down drills down forensically with files
   attached." The CARDS ARE HIS FINALISED REFERENCE ANATOMY and are mounted
   from App.jsx pixel-untouched — not restyled, not re-laid-out, not one label
   reworded. What was broken is that "Open every package" set a state that
   nothing rendered. It now opens the full package list beneath the cards, from
   v_stock_proof, each row resolving its documents from mv_tag_evidence.

   Same certified template as the Command Center: same .ccpage scope, same
   .cc-* classes, same primitives. A warehouse is not a grow — this page counts
   and traces where Cultivation measures and turns.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import {
  DateRangeSelect, rowsOr, StockByStreamCards, StockProofTable, RoomStockDrill, InTransitDrill,
} from "./App.jsx";
import {
  grab, DkTag, DkErr, DkEmpty, DkKpiStrip, DkOrphanTargets, DkWorkQueue, useWorkQueue,
  DkNarrative, DkReports, DkTasks, DkGapCard, DkHead, DkStreamDrill, useWidgetLayout,
  Widget, WidgetBoard, WidgetBarControls, useSectionStore, DkCaret, DkDrill, DrillRoot,
} from "./dashkit.jsx";

const DEPT = "Inventory";
const VIEW_KEY = "dept_dash_inventory";
const PAGE_KEY = "inventory";

/* ---------- rooms holding stock, every department, J7-qualified ---------- */
function InvRooms({ rows }) {
  const [open, setOpen] = useState(null);
  if (!rows.length) {
    return <DkEmpty why="No room is holding tagged stock."
      fills="v_stock_by_department lists every room holding material under either licence. An empty list is a real position, not a failed read." />;
  }
  const byRoom = new Map();
  for (const s of rows) {
    const k = s.licence + "|" + s.room;
    const g = byRoom.get(k) ?? {
      licence: s.licence, department: s.department, room: s.room, room_role: s.room_role,
      total_lb: 0, ours_lb: 0, third_party_lb: 0, tags: 0, units: 0, failed: 0, no_coa: 0,
    };
    g.total_lb += Number(s.total_lb ?? 0); g.ours_lb += Number(s.ours_lb ?? 0);
    g.third_party_lb += Number(s.third_party_lb ?? 0); g.tags += Number(s.tags ?? 0);
    g.units += Number(s.units ?? 0); g.failed += Number(s.failed ?? 0); g.no_coa += Number(s.no_coa ?? 0);
    byRoom.set(k, g);
  }
  const cards = [...byRoom.values()].sort((a, b) => b.total_lb - a.total_lb);
  const shared = new Map();
  for (const g of cards) shared.set(g.room, (shared.get(g.room) ?? 0) + 1);
  return (
    <>
      <div className="cc-substriphead">
        <span className="cc-striplabel">Rooms holding stock</span>
        <DkTag tone="neutral">{cards.length} rooms</DkTag>
        <DkTag tone="attn"
          title="Eleven room names exist in BOTH buildings — Finish Vault, Cure Vault, Pre-Trim Storage and the rest — and a bare room name shows the wrong room roughly two thirds of the time. Room identity is licence plus name, so every card below names its department (rule J7).">
          room identity is licence + name ⓘ
        </DkTag>
      </div>
      <div className="cc-stockrooms">
        {cards.map((g) => {
          const k = g.licence + "|" + g.room;
          const roomQualified = g.room + " — " + g.department;
          return (
            <button key={k} className={`cc-stockroom ${open === k ? "on" : ""}`}
              onClick={() => setOpen(open === k ? null : k)}
              aria-expanded={open === k}
              title={`${roomQualified}${g.room_role ? " · " + g.room_role : ""}${shared.get(g.room) > 1 ? " · this room NAME exists in both departments; this card is the one under licence " + g.licence : ""}. ${open === k ? "Click again to close." : "Click for every package in it."}`}>
              <span className="cc-sr-name"><DkCaret open={open === k} />{roomQualified}</span>
              <span className="cc-sr-big">{g.total_lb > 0
                ? <>{g.total_lb.toLocaleString(undefined, { maximumFractionDigits: 1 })}<em> lb</em></>
                : <>{g.units.toLocaleString()}<em> units</em></>}</span>
              <span className="cc-sr-line">
                {g.tags.toLocaleString()} tags · ours {g.ours_lb.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                {" "}· third party {g.third_party_lb.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
              <span className="cc-sr-chips">
                {g.room_role && <DkTag tone="info">{g.room_role}</DkTag>}
                {g.failed > 0 && <DkTag tone="crit">{g.failed} failed</DkTag>}
                {g.no_coa > 0 && (
                  <DkTag tone="attn" title="Packages with no certificate filed directly against them. The drill resolves an inherited certificate where one exists and states the reason where there is none.">
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

/* ═══════════════════ the page ═══════════════════ */
export default function InventoryDashboard({ go, session, reports, role, viewAs, onViewAs, isAdmin, viewRoles }) {
  const store = useSectionStore(session?.user?.id, VIEW_KEY);
  const [range, setRange] = useState({ from: "", to: "" });
  const [busy, setBusy] = useState(false);
  const [ver, setVer] = useState(0);
  const [d, setD] = useState(null);
  /* The frozen cards own this state exactly as they do on the Command Center;
     what is new is that something now RENDERS from it. */
  const [openTile, setOpenTile] = useState(null);

  const WIDGETS = React.useMemo(() => [
    { key: "streams", title: "Stock by stream", span: 2 },
    { key: "rooms", title: "Where it is — every room holding stock, department-qualified", span: 2 },
    { key: "transit", title: "On a truck right now — ours until the destination accepts", span: 2 },
    { key: "queue", title: "Work queue — every open finding, grouped by cause", span: 2 },
    { key: "words", title: "In plain words — the period, the platform, and signed notes", span: 2 },
    { key: "targets", title: "Owner-set targets with no published figure", span: 1 },
    { key: "tasks", title: "Tasks raised from this dashboard", span: 1 },
    { key: "reports", title: "Reports — by group", span: 2 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const queue = useWorkQueue(DEPT);

  useEffect(() => {
    let live = true;
    (async () => {
      const [tiles, trend, targets, stock, stockRooms, tasks, global] = await Promise.all([
        supabase.from("mv_department_dashboard").select("*").eq("department", DEPT).order("ord"),
        supabase.from("v_dashboard_trend").select("*").eq("department", DEPT),
        supabase.from("kpi_targets").select("*").eq("department", DEPT),
        supabase.from("v_stock_summary").select("*"),
        supabase.from("v_stock_by_department").select("*"),
        supabase.from("v_dashboard_tasks").select("*"),
        supabase.from("v_global_management").select("*").eq("department", DEPT).maybeSingle(),
      ]);
      if (!live) return;
      setD({
        tiles: grab(tiles), trend: grab(trend), targets: grab(targets), stock: grab(stock),
        stockRooms: grab(stockRooms), tasks: grab(tasks),
        global: global.error ? { rows: null, err: global.error.message } : { rows: global.data, err: null },
      });
    })();
    return () => { live = false; };
  }, [ver]);

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
  const openTasks = d.tasks.rows.filter((t) => t.department === DEPT);
  const overdueTasks = openTasks.filter((t) => t.position?.startsWith("OVERDUE"));
  /* The open card, resolved back to its origin and stream so the drill knows
     which population to read. The key the frozen cards emit is origin+stream
     concatenated, so it is matched rather than parsed. */
  const openStream = d.stock.rows.find((s) => s.origin + s.stream === openTile) ?? null;

  return (
    <DrillRoot label="Inventory">
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
          ? <DkGapCard row={d.global.rows} dept={DEPT} go={go} />
          : <DkKpiStrip dept={DEPT} tiles={d.tiles.rows} trend={trendByKpi} targets={targetByKpi}
              go={go} onAssigned={() => setVer((v) => v + 1)} />}
      {d.targets.err && <DkErr what="The owner-set targets" err={d.targets.err} />}
      {d.trend.err && <DkErr what="The trend snapshots" err={d.trend.err} />}

      <WidgetBoard layout={layout}>
        {layout.list.map((w) => {
          switch (w.key) {
            case "streams": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={d.stock.err ? <DkTag tone="crit">read failed</DkTag> : (
                  <>
                    <DkTag tone="neutral">{d.stock.rows.length} streams</DkTag>
                    <DkTag tone="info" title="Press “Open every package” on any card: the full package list opens below it, straight from the evidence view, with the certificate and the manifest on every row.">
                      every card opens its packages
                    </DkTag>
                  </>
                )}>
                {d.stock.err ? <DkErr what="The stock streams" err={d.stock.err} />
                  : d.stock.rows.length === 0
                    ? <DkEmpty why="No stock stream is on hand."
                        fills="v_stock_summary returned no rows — that is a real position, not a failed read." />
                    : (
                      <>
                        {/* The owner's frozen card anatomy, mounted verbatim. */}
                        <StockByStreamCards stock={d.stock.rows} openTile={openTile} setOpenTile={setOpenTile} />
                        {openStream && (
                          <DkDrill label={`Every package in ${openStream.stream} — ${openStream.origin}`}
                            onClose={() => setOpenTile(null)}>
                            <DkStreamDrill origin={openStream.origin} stream={openStream.stream}
                              renderTable={(rows) => <StockProofTable rows={rows} locationLabel="Room" />} />
                          </DkDrill>
                        )}
                      </>
                    )}
              </Widget>
            );
            case "rooms": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={d.stockRooms.err ? <DkTag tone="crit">read failed</DkTag> : (
                  <DkTag tone="neutral">
                    {d.stockRooms.rows.reduce((a, r) => a + Number(r.tags ?? 0), 0).toLocaleString()} tags held
                  </DkTag>
                )}>
                {d.stockRooms.err ? <DkErr what="The rooms holding stock" err={d.stockRooms.err} />
                  : <InvRooms rows={d.stockRooms.rows} />}
              </Widget>
            );
            case "transit": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                chips={<DkTag tone="info" title="Owner ruling: material on an active transfer is OURS until the destination accepts it, so it is stock and it is counted here.">ours until accepted</DkTag>}>
                <InTransitDrill />
              </Widget>
            );
            case "queue": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={queue.err ? <DkTag tone="crit">read failed</DkTag> : (
                  <>
                    <DkTag tone="neutral">{queue.causes ? queue.causes.length : "…"} causes</DkTag>
                    <DkTag tone={queue.findings ? "crit" : "ok"}>{queue.findings ?? "…"} open findings</DkTag>
                    {d.global.rows?.critical_findings > 0 && (
                      <DkTag tone="crit">{d.global.rows.critical_findings} critical</DkTag>
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
