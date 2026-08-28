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
import { fetchDepartmentDashboard } from "./lib/dashboard-range.js";
import {
  DateRangeSelect, rowsOr, StockByStreamCards, StockProofTable, RoomStockDrill, InTransitDrill,
} from "./App.jsx";
import {
  useDefaultRange, grab, DkTag, DkErr, DkEmpty, DkKpiStrip, DkOrphanTargets, DkWorkQueue, useWorkQueue,
  DkNarrative, DkReports, DkTasks, DkGapCard, DkHead, DkStreamDrill, useWidgetLayout,
  Widget, WidgetBoard, WidgetBarControls, useSectionStore, DkCaret, DkDrill, DrillRoot,
} from "./dashkit.jsx";
/* THE ARRANGEABLE SECTION, mounted not copied. Owner, 15 Aug 2026: "every single
   dashboard need to have section as I stated where i can drag and put where i want
   to arreange dash for user preference." One implementation of drag, resize and
   persistence serves every dashboard; this page contributes a page key and a
   starting set of panels and nothing else. */
import { ArrangeableSection } from "./wcanvas.jsx";

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
  /* Opens on the company default (this month) instead of all history —
     owner ruling 19 Aug 2026. Seeds once, then the user owns the range. */
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [busy, setBusy] = useState(false);
  const [ver, setVer] = useState(0);
  const [d, setD] = useState(null);
  /* The frozen cards own this state exactly as they do on the Command Center;
     what is new is that something now RENDERS from it. */
  const [openTile, setOpenTile] = useState(null);

  /* SEARCH, AND WHAT IT DOES TO THE DATE RANGE.
     docs/TODO_EVERY_PAGE.md: "Typing search sets the date range aside and says
     so on the page. No page answers 'no results' only because this-month is
     selected." This dashboard opens on this_month_td, so without a search a tag
     packaged in May is not on screen — and the honest fix is not to widen the
     default, it is to make the search ignore the range entirely and print that
     it has. The query runs at the SERVER against v_stock_packages with no date
     predicate at all, so it reaches every tag of every age. */
  const [q, setQ] = useState("");
  const [hits, setHits] = useState(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setHits(null); return undefined; }
    let live = true;
    const like = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    supabase.from("v_stock_packages")
      .select("package_tag,item_name,strain,stream,license,location,quantity,uom,pounds,packaged_on,source_harvest")
      .or(["package_tag", "item_name", "strain", "source_harvest", "location"].map((c) => `${c}.ilike.${like}`).join(","))
      .limit(200)
      .then((res) => { if (live) setHits(grab(res)); });
    return () => { live = false; };
  }, [q]);

  const WIDGETS = React.useMemo(() => [
    { key: "streams", title: "Stock by stream", span: 2 },
    { key: "rooms", title: "Where it is — every room holding stock, department-qualified", span: 2 },
    { key: "transit", title: "On a truck right now — ours until the destination accepts", span: 2 },
    { key: "queue", title: "Work queue — every open finding, grouped by cause", span: 2 },
    { key: "words", title: "In plain words — the period, the platform, and signed notes", span: 2 },
    { key: "targets", title: "Owner-set targets with no published figure", span: 1 },
    { key: "tasks", title: "Tasks raised from this dashboard", span: 1 },
    { key: "reports", title: "Reports — by group", span: 2 },
    /* APPENDED, deliberately. useWidgetLayout keeps a saved position for every key
       a user has already arranged and appends only the keys they have never seen,
       so adding this moves nothing on anybody's existing board. */
    { key: "arrange", title: "Arrange your own — drag, resize, and it stays where you put it", span: 2 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const queue = useWorkQueue(DEPT);

  useEffect(() => {
    if (!dateDefault.ready) return undefined;
    let live = true;
    (async () => {
      const [tiles, trend, targets, stock, stockRooms, tasks, global] = await Promise.all([
        fetchDepartmentDashboard(supabase, {
          department: DEPT, from: range.from, to: range.to,
        }),
        supabase.from("v_dashboard_trend").select("*").eq("department", DEPT),
        supabase.from("kpi_targets").select("*").eq("department", DEPT),
        supabase.from("v_stock_summary").select("*"),
        supabase.from("v_stock_by_department").select("*"),
        supabase.from("v_dashboard_tasks").select("*"),
        supabase.from("v_global_management").select("*").eq("department", DEPT).maybeSingle(),
      ]);
      if (!live) return;
      setD({
        /* The range these rows were computed for — the shared strip compares it
           to the range now selected and refuses to show a figure under a label
           it does not belong to. Owner, 19 Aug 2026. */
        computedFor: { from: range.from, to: range.to },
        tiles: grab(tiles), trend: grab(trend), targets: grab(targets), stock: grab(stock),
        stockRooms: grab(stockRooms), tasks: grab(tasks),
        global: global.error ? { rows: null, err: global.error.message } : { rows: global.data, err: null },
      });
    })();
    return () => { live = false; };
  /* range.from / range.to: this dashboard never re-fetched on a date change —
     its effect depended on [ver] alone, so the picker moved and nothing behind
     it did. Owner, 19 Aug 2026. */
  }, [ver, range.from, range.to, dateDefault.ready]);

  const recompute = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("tg_snapshot_dashboards");
    if (error && d) setD((p) => ({ ...p, tiles: { ...p.tiles, err: `Recompute refused: ${error.message}` } }));
    setVer((v) => v + 1);
    setBusy(false);
  };

  if (dateDefault.error) {
    return <div className="ccpage"><DkErr what="The governed date range" err={dateDefault.error} /></div>;
  }
  if (!dateDefault.ready || d === null) {
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
            onTo={(v) => setRange((p) => ({ ...p, to: v }))}
            presetKey={dateDefault.presetKey} session={session} viewKey={VIEW_KEY} allowSave />
          <label htmlFor="inv-q">Find a tag, item, strain, harvest or room</label>
          <input id="inv-q" className="cc-input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="1A40A030… or Blue Dream"
            title="Searches every package of every age at the server. The date range above is set aside while you search. Package tags begin 1A40A030 — plant tags begin 1A40A020 and live on the Plant Census." />
          {q.trim().length > 0 && (
            <button type="button" className="cc-btn" onClick={() => setQ("")}
              title="Clear the search and return to the selected date range.">clear</button>
          )}
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

      {hits && (
        <DkDrill label={`Search — “${q.trim()}” across every package, every period`} onClose={() => setQ("")}>
          <div className="cc-fine">
            <DkTag tone="attn"
              title="A search asks about a specific package, so the date range is set aside for it entirely — the query carries no date predicate at all. Clear the search to return to the range.">
              date range set aside while searching — every period is being searched ⓘ
            </DkTag>
          </div>
          {hits.err ? <DkErr what={`The package search (v_stock_packages)`} err={hits.err} />
            : rowsOr(hits.rows).length === 0 ? (
              <DkEmpty
                why={`No package anywhere matches “${q.trim()}”.`}
                fills={"Every package of every age was searched, not just the ones in the selected date range, so this is "
                  + "the real answer rather than an artefact of the period. A tag that is absent here is not held on this "
                  + "licence — it may still exist in Metrc as finished or transferred."} />
            ) : (
              <>
                <div className="cc-fine">
                  <b>{rowsOr(hits.rows).length.toLocaleString()}</b> package
                  {rowsOr(hits.rows).length === 1 ? "" : "s"} found
                  {rowsOr(hits.rows).length === 200 ? " — showing the first 200" : ""}, ignoring the date range.
                </div>
                <div className="tablewrap">
                  <table>
                    <thead><tr><th>Tag</th><th>Item</th><th>Strain</th><th>Stream</th><th>Room</th>
                      <th>Quantity</th><th>Pounds</th><th>Packaged</th><th>From harvest</th><th>Licence</th></tr></thead>
                    <tbody>
                      {rowsOr(hits.rows).map((r, i) => (
                        <tr key={`${r.package_tag ?? "row"}|${i}`}>
                          <td>{r.package_tag ?? "no tag"}</td>
                          <td>{r.item_name ?? "item not recorded"}</td>
                          <td>{r.strain ?? "strain not recorded"}</td>
                          <td>{r.stream ?? "stream not recorded"}</td>
                          <td>{r.location ?? "Metrc holds no room for this tag"}</td>
                          <td>{r.quantity === null || r.quantity === undefined ? "not recorded" : `${r.quantity} ${r.uom ?? ""}`.trim()}</td>
                          <td>{r.pounds === null || r.pounds === undefined ? "not a weight" : `${r.pounds} lb`}</td>
                          <td>{r.packaged_on ?? "date not served"}</td>
                          <td>{r.source_harvest ?? "no source harvest recorded"}</td>
                          <td>{r.license ?? "not recorded"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
        </DkDrill>
      )}

      {d.tiles.err ? <DkErr what="The key figures" err={d.tiles.err} />
        : d.tiles.rows.length === 0
          ? <DkGapCard row={d.global.rows} dept={DEPT} go={go} />
          : <DkKpiStrip dept={DEPT} tiles={d.tiles.rows} trend={trendByKpi} targets={targetByKpi}
              range={range} computedFor={d.computedFor}
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
            /* THE SAME COMPONENT My Dashboard runs, pinned to this page's own key.
               Its panels are moved with the mouse or the arrow keys and saved to
               dashboard_layout the moment the drag ends; every user arranges their
               own and nobody else's view moves. */
            case "arrange": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                chips={<DkTag tone="info">yours only · saved on drop</DkTag>}>
                {/* WHICH PANELS IT OPENS WITH IS A DATABASE ANSWER, not a list frozen
                    here: every enabled widget_catalog row whose category is this
                    department. §7 — a hardcoded list means a new widget needs a
                    deploy, so it never gets one. Registering a widget against
                    Inventory is now the whole of putting it on this section. */}
                <ArrangeableSection page={VIEW_KEY} startsWith={DEPT} go={go} />
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
