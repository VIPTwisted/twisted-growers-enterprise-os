/* ═══════════════════════════════════════════════════════════════════════════
   CULTIVATION DASHBOARD — Agent B, 12 Aug 2026.

   Owner order: "each and every single dashboard must be built so the manager
   of that department can fully manage and see every single detail, as we are
   doing for command." So this is the Cultivation MANAGER's page: the rooms he
   turns, the harvests he has open, the yield he got against his own strain
   median, whether his dry times sit inside the window, what stock his rooms
   are holding, and what is on his desk to fix.

   IT IS THE CERTIFIED TEMPLATE, NOT A NEW ONE. Same .ccpage token scope, same
   .cc-* classes, same panel/chip/queue/narrative primitives the owner graded
   on the Command Center. What differs is what a cultivator needs on the page —
   a roster is not a ledger is not a punch log, and a grow is not a warehouse.

   EVERY SECTION IS A WIDGET the manager can drag, hide or resize, saved to his
   own account through tg_save_dashboard_layout. The list below IS the page.

   ROOMS COME FROM v_room_board_complete, THROUGH DkRoomBoard — so no
   department is written as a literal anywhere on this page (J7, G2). One
   column of that view is not trusted and the reason is recorded in dashkit
   beside the code that avoids it: is_flower_room is set on four storage rooms
   and attributes plants to them, which would draw four fabricated "past its
   scheduled pull" alarms. The board keys off room_role, the view's own
   classification, which is right. The defect is filed with the database team;
   nothing about it is worked around silently.

   THE WORK QUEUE RESOLVES THROUGH finding_lane_owner. Findings are grouped by
   the lane that raised them, not by department; Cultivation owns Loss and
   yield, Room turnaround and Schedule discipline, which sum to the 52 the
   rollup reports for it. Filtering the cause view on the department name
   returned nothing and contradicted the chip beside it.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import {
  AssignTask, DateRangeSelect, rowsOr, OpenHarvestDetail, RoomDrill, RoomStockDrill,
} from "./App.jsx";
import {
  grab, DkTag, DkErr, DkEmpty, DkKpiStrip, DkOrphanTargets, DkWorkQueue, useWorkQueue,
  DkNarrative, DkReports, DkTasks, DkGapCard, DkHead, DkRoomBoard, useWidgetLayout,
  Widget, WidgetBoard, WidgetBarControls, useSectionStore, DkCaret, DkDrill, DrillRoot,
} from "./dashkit.jsx";

const DEPT = "Cultivation";
const VIEW_KEY = "dept_dash_cultivation";
const PAGE_KEY = "cultivation";

/* ---------- rooms holding stock, department-qualified ---------- */
function CvStockRooms({ rows, go }) {
  const [open, setOpen] = useState(null);
  if (!rows.length) {
    return <DkEmpty why={`No room under the ${DEPT} licence is holding stock.`}
      fills="v_stock_by_department lists every room holding tagged material. An empty list here means the cultivation rooms are clear, not that the read failed." />;
  }
  const byRoom = new Map();
  for (const s of rows) {
    const k = s.licence + "|" + s.room;
    const g = byRoom.get(k) ?? {
      licence: s.licence, department: s.department, room: s.room,
      total_lb: 0, ours_lb: 0, third_party_lb: 0, tags: 0, units: 0, failed: 0, no_coa: 0,
    };
    g.total_lb += Number(s.total_lb ?? 0); g.ours_lb += Number(s.ours_lb ?? 0);
    g.third_party_lb += Number(s.third_party_lb ?? 0); g.tags += Number(s.tags ?? 0);
    g.units += Number(s.units ?? 0); g.failed += Number(s.failed ?? 0); g.no_coa += Number(s.no_coa ?? 0);
    byRoom.set(k, g);
  }
  const cards = [...byRoom.values()].sort((a, b) => b.total_lb - a.total_lb);
  return (
    <>
      <div className="cc-stockrooms">
        {cards.map((g) => {
          const k = g.licence + "|" + g.room;
          const roomQualified = g.room + " — " + g.department;
          return (
            <button key={k} className={`cc-stockroom ${open === k ? "on" : ""}`}
              onClick={() => setOpen(open === k ? null : k)}
              aria-expanded={open === k}
              title={roomQualified + (open === k ? ". Click again to close." : ". Click for every package in the room, each with its certificate and its manifest.")}>
              <span className="cc-sr-name"><DkCaret open={open === k} />{roomQualified}</span>
              <span className="cc-sr-big">{g.total_lb > 0
                ? <>{g.total_lb.toLocaleString(undefined, { maximumFractionDigits: 1 })}<em> lb</em></>
                : <>{g.units.toLocaleString()}<em> units</em></>}</span>
              <span className="cc-sr-line">
                {g.tags.toLocaleString()} tags · ours {g.ours_lb.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                {" "}· third party {g.third_party_lb.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
              <span className="cc-sr-chips">
                {g.failed > 0 && <DkTag tone="crit">{g.failed} failed</DkTag>}
                {g.no_coa > 0 && (
                  <DkTag tone="attn" title="Packages with no certificate filed directly against them. The drill states the reason on each row and resolves an inherited certificate where one exists.">
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

/* ---------- yield: tone from the SERVED numeric comparison only ----------
   The drying verdict is prose about water loss and lives in the expanded row,
   labelled as what it is. Colouring a bar by matching words in that prose is
   the defect that painted a +127 g over-median harvest red. */
function CvYield({ rows, go }) {
  const [openRow, setOpenRow] = useState(null);
  if (!rows.length) {
    return <DkEmpty why="No closed harvest has been weighed yet."
      fills="A row appears as soon as a harvest finishes and its dry yield is recorded." />;
  }
  const max = Math.max(...rows.map((r) => Math.max(Number(r.dry_g_per_plant || 0), Number(r.strain_median_dry_g || 0))), 1);
  return (
    <div className="cc-yield">
      {rows.map((r) => {
        const under = r.strain_median_dry_g != null && Number(r.dry_g_per_plant) < Number(r.strain_median_dry_g);
        const tone = r.strain_median_dry_g == null ? "plain" : under ? "crit" : "ok";
        const w = (Number(r.dry_g_per_plant || 0) / max) * 100;
        const tick = r.strain_median_dry_g != null ? (Number(r.strain_median_dry_g) / max) * 100 : null;
        const open = openRow === r.harvest;
        const roomQualified = (r.room ?? "room not recorded") + " — licence " + (r.licence ?? "not recorded");
        return (
          <React.Fragment key={r.harvest}>
            <button className={`cc-yrow ${open ? "on" : ""}`} onClick={() => setOpenRow(open ? null : r.harvest)}
              aria-expanded={open}
              title={`${r.harvest} · ${roomQualified} · finished ${r.finished_on}. ${open ? "Click again to close." : "Click for the full audit line."}`}>
              <span className="cc-yname"><DkCaret open={open} />{r.strain || "strain not recorded"}</span>
              <span className="cc-ytrack">
                <i className={`cc-yfill ${tone}`} style={{ width: `${Math.max(2, w)}%` }} />
                {tick != null && <b className="cc-ytick" style={{ left: `${tick}%` }}
                  title={`Strain median: ${Number(r.strain_median_dry_g).toLocaleString()} g per plant over ${r.strain_harvests} harvests`} />}
              </span>
              <span className="cc-yval">{r.dry_g_per_plant == null ? "not weighed" : `${Number(r.dry_g_per_plant).toLocaleString()} g`}</span>
            </button>
            {open && (
              <div className="cc-yopen">
                <DkDrill label={`${r.harvest} — full audit line`} onClose={() => setOpenRow(null)}>
                <p><b>{r.harvest}</b> · {roomQualified} · finished {r.finished_on} · {Number(r.plants || 0).toLocaleString()} plants
                  · wet {Number(r.wet_in_lb || 0).toLocaleString()} lb · dry {Number(r.dry_yield_lb || 0).toLocaleString()} lb
                  {r.vs_own_strain_g != null && <> · versus own strain median {Number(r.vs_own_strain_g) >= 0 ? "+" : ""}{Number(r.vs_own_strain_g).toLocaleString()} g per plant</>}
                  {r.vs_target_lb != null && <> · versus plan {Number(r.vs_target_lb) >= 0 ? "+" : ""}{Number(r.vs_target_lb).toLocaleString()} lb</>}
                </p>
                {r.audit_verdict && <p className="cc-fine"><b>Drying verdict (about water loss, not the median):</b> {r.audit_verdict}</p>}
                {r.in_plain_english && <p className="cc-fine">{r.in_plain_english}</p>}
                {r.concern && <p className="cc-fine crit">{r.concern}</p>}
                <span className="cc-inst-meta">
                  <AssignTask dept={DEPT} kpi={`Yield audit: ${r.harvest}`}
                    value={r.dry_g_per_plant} unit="g per plant" drill="v-harvest-report" />
                  <button className="cc-btn" onClick={() => go("v-harvest-report")}>Open the harvest report →</button>
                </span>
                </DkDrill>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ---------- dry-time discipline, month by month ---------- */
function CvDryTime({ rows, go }) {
  if (!rows.length) {
    return <DkEmpty why="No month has a scored dry time yet."
      fills="v_dry_time_discipline scores a harvest once it has been packaged; fresh-frozen harvests are excluded by design because they never dried." />;
  }
  const recent = rows.slice(0, 12);
  return (
    <div className="cc-yield">
      {recent.map((m) => {
        const pct = m.pct_inside_window == null ? null : Number(m.pct_inside_window);
        const tone = pct == null ? "plain" : pct >= 90 ? "ok" : pct >= 60 ? "warn" : "crit";
        return (
          <div key={m.month} className="cc-yrow static"
            title={`Window ${m.window_from_days}–${m.window_to_days} days, from conversion_factors. ${m.fresh_frozen_excluded ?? 0} fresh-frozen harvests excluded — they never dried.`}>
            <span className="cc-yname">{m.month_label}</span>
            <span className="cc-ytrack">
              <i className={`cc-yfill ${tone}`} style={{ width: `${Math.max(2, pct ?? 0)}%` }} />
            </span>
            <span className="cc-yval">
              {pct == null ? "not scored" : `${pct}% inside`}
            </span>
            <span className="cc-fine">
              {Number(m.harvests_scored ?? 0).toLocaleString()} scored
              {Number(m.dried_too_long ?? 0) > 0 && <> · <b className="crit">{m.dried_too_long} dried too long</b></>}
              {Number(m.pulled_too_fast ?? 0) > 0 && <> · {m.pulled_too_fast} pulled too fast</>}
              {m.avg_dry_days != null && <> · average {Number(m.avg_dry_days).toLocaleString()} days</>}
              {Number(m.harvests_not_yet_packaged ?? 0) > 0 && (
                <> · <span title="Still drying or not yet packaged, so no dry time can be scored for them yet. Counted, never guessed.">
                  {m.harvests_not_yet_packaged} not yet scoreable</span></>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════ the page ═══════════════════ */
export default function CultivationDashboard({ go, session, reports, role, viewAs, onViewAs, isAdmin, viewRoles }) {
  const store = useSectionStore(session?.user?.id, VIEW_KEY);
  const [range, setRange] = useState({ from: "", to: "" });
  const [busy, setBusy] = useState(false);
  const [ver, setVer] = useState(0);
  const [d, setD] = useState(null);

  /* THE PAGE IS A DECLARATIVE LIST OF WIDGET KEYS. Adding a section to this
     dashboard is one entry here plus its <Widget> below — that is the whole
     point of the framework. */
  const WIDGETS = React.useMemo(() => [
    { key: "rooms", title: "Flower rooms — the cycle, department-qualified", span: 2 },
    { key: "harvests", title: "Open harvests — every one, with the arithmetic", span: 2 },
    { key: "yield", title: "Yield — grams per plant, tick = own strain median", span: 1 },
    { key: "drytime", title: "Dry-time discipline — month by month against the window", span: 1 },
    { key: "stockrooms", title: "What the cultivation rooms are holding", span: 2 },
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
      const [tiles, trend, targets, rooms, alertRules, stockRooms, yld, dry, tasks, global] =
        await Promise.all([
          supabase.from("mv_department_dashboard").select("*").eq("department", DEPT).order("ord"),
          supabase.from("v_dashboard_trend").select("*").eq("department", DEPT),
          supabase.from("kpi_targets").select("*").eq("department", DEPT),
          supabase.from("v_room_board_complete").select("*").order("room"),
          supabase.from("harvest_alert_rules").select("rule_key, threshold, note, active")
            .in("rule_key", ["weekend_warning_days", "late_tolerance_days"]),
          supabase.from("v_stock_by_department").select("*").eq("department", DEPT.toUpperCase()),
          supabase.from("v_harvest_yield_audit").select("*").order("finished_on", { ascending: false }).limit(12),
          supabase.from("v_dry_time_discipline").select("*").order("month", { ascending: false }),
          supabase.from("v_dashboard_tasks").select("*"),
          supabase.from("v_global_management").select("*").eq("department", DEPT).maybeSingle(),
        ]);
      if (!live) return;
      setD({
        tiles: grab(tiles), trend: grab(trend), targets: grab(targets), rooms: grab(rooms),
        alertRules: grab(alertRules), stockRooms: grab(stockRooms), yld: grab(yld), dry: grab(dry),
        tasks: grab(tasks),
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
  const warnRule = d.alertRules.rows.find((x) => x.rule_key === "weekend_warning_days" && x.active);
  const flowerRooms = d.rooms.rows.filter((r) => r.room_role === "Flower room");
  const roomsOver = flowerRooms.filter((r) => Number(r.days_until) < 0 && Number(r.plants_now) > 0);
  const yieldUnder = d.yld.rows.filter((r) => r.strain_median_dry_g != null && Number(r.dry_g_per_plant) < Number(r.strain_median_dry_g));
  const openTasks = d.tasks.rows.filter((t) => t.department === DEPT);
  const overdueTasks = openTasks.filter((t) => t.position?.startsWith("OVERDUE"));
  const dryLatest = d.dry.rows[0];

  return (
    <DrillRoot label="Cultivation">
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
            case "rooms": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={d.rooms.err ? <DkTag tone="crit">read failed</DkTag> : (
                  <>
                    {roomsOver.length > 0
                      ? <DkTag tone="crit">{roomsOver.length} past the scheduled pull</DkTag>
                      : <DkTag tone="ok">every flower room inside its cycle</DkTag>}
                    <DkTag tone="neutral">{flowerRooms.length} flower rooms</DkTag>
                  </>
                )}>
                {d.rooms.err ? <DkErr what="The room board" err={d.rooms.err} />
                  : <DkRoomBoard rooms={d.rooms.rows} warnDays={warnRule ? Number(warnRule.threshold) : null}
                      renderPlantDrill={(code) => <RoomDrill code={code} />} />}
              </Widget>
            );
            case "harvests": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                chips={<DkTag tone="neutral" title="Every harvest still open, with the wet-to-dry arithmetic shown on the row so no figure has to be taken on trust.">full detail</DkTag>}>
                <OpenHarvestDetail />
              </Widget>
            );
            case "yield": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={d.yld.err ? <DkTag tone="crit">read failed</DkTag> : (
                  <>
                    {yieldUnder.length > 0
                      ? <DkTag tone="crit">{yieldUnder.length} under own strain median</DkTag>
                      : <DkTag tone="ok">every recent harvest at or above its strain median</DkTag>}
                    <DkTag tone="neutral">last {d.yld.rows.length} closed</DkTag>
                  </>
                )}>
                {d.yld.err ? <DkErr what="The yield audit" err={d.yld.err} /> : <CvYield rows={d.yld.rows} go={go} />}
              </Widget>
            );
            case "drytime": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={d.dry.err ? <DkTag tone="crit">read failed</DkTag> : dryLatest ? (
                  <>
                    <DkTag tone={Number(dryLatest.pct_inside_window) >= 90 ? "ok" : Number(dryLatest.pct_inside_window) >= 60 ? "warn" : "crit"}>
                      {dryLatest.month_label}: {dryLatest.pct_inside_window ?? "not scored"}% inside
                    </DkTag>
                    <DkTag tone="neutral" title="The window is read from conversion_factors, never typed here.">
                      window {dryLatest.window_from_days}–{dryLatest.window_to_days} days
                    </DkTag>
                  </>
                ) : null}>
                {d.dry.err ? <DkErr what="Dry-time discipline" err={d.dry.err} /> : <CvDryTime rows={d.dry.rows} go={go} />}
              </Widget>
            );
            case "stockrooms": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={d.stockRooms.err ? <DkTag tone="crit">read failed</DkTag> : (
                  <DkTag tone="neutral">
                    {d.stockRooms.rows.reduce((a, r) => a + Number(r.tags ?? 0), 0).toLocaleString()} tags
                  </DkTag>
                )}>
                {d.stockRooms.err ? <DkErr what="The cultivation rooms" err={d.stockRooms.err} />
                  : <CvStockRooms rows={d.stockRooms.rows} go={go} />}
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
