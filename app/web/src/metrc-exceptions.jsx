/* ═══════════════════════════════════════════════════════════════════════════
   METRC EXCEPTION QUEUES. Ticket C2, 26 August 2026.
   nav_registry view_key `xq_metrc_exceptions`, serving v_xq_summary and the
   four queue views behind it.

   WHY ONE PAGE AND NOT FOUR. All four are the same archetype — page_archetype
   `issue_queue`: "what needs a decision from me, oldest and most costly first;
   age and money visible, a decision action on every row." Sharing that layout
   is the discipline working, not the discipline broken. What is NEVER shared is
   the column set: a harvest residual is not a package tag is not a failed test,
   so each queue below declares its own columns and its own ordering.

   WHERE EVERY NUMBER COMES FROM. Nothing on this page is computed in the
   browser. Each tile is a column of v_xq_summary and each drill is the view
   that tile counts, read through the shared DkRowDrill primitive with the same
   filter. tile_drill_contract re-derives one from the other on every run —
   five contracts, all keyed `xq.*`.

   WHAT IT WILL NOT DO. This platform is a read-only mirror of Metrc and holds
   no write credentials. Nothing here corrects Metrc, adjusts a weight, or
   proposes a moisture band fix. Every row ends in a floor instruction and, for
   the Metrc-side work, the runbook at docs/RUNBOOK_METRC_EXCEPTION_QUEUES.md.

   TARGETS. None of these four tiles carries an owner-set target yet, so none
   can show a red rail. That is stated on the strip rather than papered over
   with an invented number. Targets are owner-set rows on the Goals and Targets
   page.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import {
  grab, listOf, DkTag, DkErr, DkEmpty, DkKpiStrip, DkDrill, DrillRoot, DkHead,
  DkRowDrill, useSectionStore, useWidgetLayout, Widget, WidgetBoard,
  WidgetBarControls, DkReports,
} from "./dashkit.jsx";

const VIEW_KEY = "xq_metrc_exceptions";
const PAGE_KEY = "xq_metrc_exceptions";
const DEPT = "Metrc";

const SOURCE_NOTE = {
  label: "the current Metrc position — no date range, and each queue states the day its own source was captured",
  why: "An exception does not stop being an exception because it is old, so these queues are never filtered to a date "
    + "window. What DOES matter is how fresh the Metrc source behind each one is, and that is printed on every tile and "
    + "on every row as 'Metrc as of'. The package queues read a sync that runs continuously; the harvest queues read a "
    + "sync that last ran on the date shown.",
};

/* The four queues. `key` matches v_xq_summary.ord, `view` is the drill the tile
   counts, and `columns` is this queue's own — never a shared column set. */
const QUEUES = [
  {
    ord: 1,
    key: "moisture",
    title: "Harvest moisture and residual exceptions",
    view: "v_xq_harvest_moisture",
    unit: "harvests",
    order: { col: "severity", asc: true },
    note: "Ranked by consequence, not by size: what is impossible first, then live material still in a room, then the historical record. Owner ruling 26 Aug 2026 — the flag is the owner-set 70-77% band; the measured 5th-95th percentile cut is context only and appears in its own column, deciding nothing.",
    columns: [
      { key: "severity", label: "Severity", bad: (r) => String(r.severity || "").startsWith("1") || String(r.severity || "").startsWith("2") },
      { key: "harvest_name", label: "Harvest" },
      { key: "drying_room", label: "Room", none: "room not recorded" },
      { key: "harvest_state", label: "State in Metrc" },
      { key: "stream", label: "Weight basis" },
      { key: "days_open", label: "Days since cut", kind: "num" },
      { key: "wet_lb", label: "Wet", kind: "lb" },
      { key: "packaged_lb", label: "Packaged", kind: "lb", none: "nothing packaged" },
      { key: "waste_lb", label: "Waste", kind: "lb", none: "none recorded" },
      { key: "metrc_current_weight_lb", label: "Metrc CurrentWeight", kind: "lb" },
      { key: "residual_pct_of_wet", label: "Residual % of wet", kind: "num", none: "no wet weight to divide by" },
      { key: "what_is_wrong", label: "What is wrong", kind: "note" },
      { key: "outlier_context", label: "Against our own harvests (context only)", kind: "note" },
      { key: "second_source_check", label: "Second Metrc source", kind: "note" },
      { key: "what_to_do", label: "What to do", kind: "note" },
      { key: "metrc_as_of", label: "Metrc as of" },
    ],
  },
  {
    ord: 2,
    key: "never_submitted",
    title: "Packages never submitted for testing",
    view: "v_xq_never_submitted",
    unit: "packages",
    order: { col: "severity", asc: true },
    note: "Every row carries Metrc's own proof. If a laboratory result, a manifest line or a certificate exists that contradicts the claim, the proof column says so instead of the page hiding it.",
    columns: [
      { key: "severity", label: "Severity", bad: (r) => String(r.severity || "").startsWith("1") || String(r.severity || "").startsWith("2") },
      { key: "package_tag", label: "Metrc tag" },
      { key: "item", label: "Item" },
      { key: "category", label: "Category", none: "category not served" },
      { key: "metrc_room", label: "Room in Metrc", none: "Metrc holds no room for this tag" },
      { key: "quantity_in_its_own_unit", label: "Quantity", none: "quantity not served" },
      { key: "metrc_lab_state", label: "Metrc lab state" },
      { key: "days_in_facility", label: "Days held", kind: "num" },
      { key: "packaged_on", label: "Packaged on", none: "date not served" },
      { key: "from_harvest", label: "From harvest", none: "no source harvest recorded" },
      { key: "what_is_wrong", label: "What is wrong", kind: "note" },
      { key: "metrc_proof", label: "Metrc's own proof", kind: "note" },
      { key: "what_to_do", label: "What to do", kind: "note" },
      { key: "metrc_as_of", label: "Metrc as of" },
    ],
  },
  {
    ord: 3,
    key: "failed_no_disposition",
    title: "Failed tests with no disposition recorded",
    view: "v_xq_failed_no_disposition",
    unit: "packages",
    order: { col: "severity", asc: true },
    note: "Built from three independent Metrc signals. Where a tag exists only as a Metrc report row, the state, room and quantity columns say why they are empty rather than showing a blank.",
    columns: [
      { key: "severity", label: "Severity", bad: (r) => String(r.severity || "").startsWith("1") || String(r.severity || "").startsWith("2") },
      { key: "package_tag", label: "Metrc tag" },
      { key: "item", label: "Item", none: "item not served" },
      { key: "metrc_lab_state", label: "Metrc lab state", none: "no API package row for this tag" },
      { key: "metrc_list", label: "Metrc list", none: "not returned by the API" },
      { key: "pounds", label: "Weight", kind: "lb", none: "not a weight, or no quantity served" },
      { key: "failed_on", label: "Failed on", none: "no test date in the report" },
      { key: "laboratory", label: "Laboratory", none: "laboratory not served" },
      { key: "disposition", label: "Disposition", none: "NONE RECORDED" },
      { key: "decided_by", label: "Decided by", none: "nobody" },
      { key: "decided_on", label: "Decided on", none: "never" },
      { key: "evidence_sources", label: "Metrc evidence", kind: "note" },
      { key: "what_is_wrong", label: "What is wrong", kind: "note" },
      { key: "what_to_do", label: "What to do", kind: "note" },
      { key: "metrc_as_of", label: "Metrc as of" },
    ],
  },
  {
    ord: 4,
    key: "open_past_limit",
    title: "Harvests open past the 28-day limit",
    view: "v_xq_harvest_open_past_limit",
    unit: "harvests",
    order: { col: "days_over", asc: false },
    note: "The limit is conversion_factors.harvest_open_max_days, taken from the owner's TG 2026 8-Week Harvest Calendar. Change it there and this queue changes with it.",
    columns: [
      { key: "severity", label: "Severity", bad: (r) => String(r.severity || "").startsWith("1") || String(r.severity || "").startsWith("2") },
      { key: "harvest_name", label: "Harvest" },
      { key: "strain", label: "Strain", none: "strain not recorded" },
      { key: "drying_room", label: "Room", none: "room not recorded" },
      { key: "harvest_started", label: "Cut on" },
      { key: "days_open", label: "Days open", kind: "num" },
      { key: "limit_days", label: "Limit", kind: "num" },
      { key: "days_over", label: "Days over", kind: "num" },
      { key: "packaged_lb", label: "Packaged so far", kind: "lb", none: "nothing packaged" },
      { key: "last_package_taken_off", label: "Last package off", none: "nothing has ever come off it" },
      { key: "days_since_last_package", label: "Days since", kind: "num", none: "no package to count from" },
      { key: "what_is_wrong", label: "What is wrong", kind: "note" },
      { key: "what_to_do", label: "What to do", kind: "note" },
      { key: "metrc_as_of", label: "Metrc as of" },
    ],
  },
];

const NUM = (v, dp = 1) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))
  ? null
  : Number(Number(v).toFixed(dp)));

export default function MetrcExceptions({ go, session, role, viewAs, reports }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, PAGE_KEY);
  const WIDGETS = useMemo(() => [
    ...QUEUES.map((q) => ({ key: q.key, title: q.title, span: 2 })),
    { key: "blind", title: "What these queues cannot see", span: 2 },
    { key: "reports", title: "Metrc reports", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);

  const [d, setD] = useState(null);
  const [openKpi, setOpenKpi] = useState(null);
  const [ver, setVer] = useState(0);

  useEffect(() => {
    let live = true;
    supabase.from("v_xq_summary").select("*").order("ord", { ascending: true })
      .then((res) => { if (live) setD({ s: grab(res) }); });
    return () => { live = false; };
  }, [ver]);

  const summary = useMemo(() => listOf(d ? d.s.rows : []), [d]);
  const byOrd = useMemo(() => {
    const m = {};
    for (const r of summary) m[Number(r.ord)] = r;
    return m;
  }, [summary]);

  /* A tile is a column of v_xq_summary. Nothing here recomputes a count from a
     list the browser happens to be holding — the tile and its drill read the
     same two objects the database published, which is why the contract can
     compare them. */
  const tiles = useMemo(() => QUEUES.map((q, i) => {
    const r = byOrd[q.ord];
    const items = r ? Number(r.items) : null;
    const now = r ? Number(r.needs_action_now) : null;
    return {
      ord: i,
      kpi: q.title,
      value: items === null || !Number.isFinite(items) ? 0 : items,
      unit: q.unit,
      tone: now > 0 ? "bad" : items > 0 ? "warn" : "ok",
      context: r
        ? `${now} of ${items} need action now (severity 1 or 2). ${NUM(r.pounds_involved) ?? "No"} lb involved. `
          + `Read from ${r.metrc_source}, Metrc as of ${r.metrc_as_of ?? "a date the source did not carry"}. `
          + `Threshold rules: ${r.rules_used}.`
        : "v_xq_summary served no row for this queue, so the figure cannot be shown. That is a read failure, not a count of zero.",
      drill: null,
    };
  }), [byOrd]);

  const inPlace = useMemo(() => {
    const m = {};
    for (const t of tiles) {
      m[t.kpi] = { open: openKpi === t.kpi, onOpen: () => setOpenKpi((c) => (c === t.kpi ? null : t.kpi)) };
    }
    return m;
  }, [tiles, openKpi]);

  const openQueue = useMemo(() => QUEUES.find((q) => q.title === openKpi) ?? null, [openKpi]);

  const totals = useMemo(() => summary.reduce((a, r) => ({
    items: a.items + (Number(r.items) || 0),
    now: a.now + (Number(r.needs_action_now) || 0),
  }), { items: 0, now: 0 }), [summary]);

  const freshest = useMemo(() => summary.map((r) => r.metrc_as_of).filter(Boolean).sort().at(-1) ?? null, [summary]);
  const stalest = useMemo(() => summary.map((r) => r.metrc_as_of).filter(Boolean).sort()[0] ?? null, [summary]);

  if (d === null) {
    return <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Reading the Metrc exception queues…</div></div>;
  }

  return (
    <DrillRoot label="Metrc exception queues">
      <div className="ccpage">
        <DkHead title="Metrc Exception Queues" viewKey={VIEW_KEY} dept={DEPT} role={role}
          viewAs={viewAs} computed={null} busy={false}>
          <DkTag tone={totals.now ? "crit" : "ok"}>{totals.now.toLocaleString()} need action now</DkTag>
          <DkTag tone="neutral">{totals.items.toLocaleString()} items across four queues</DkTag>
          <DkTag tone="info"
            title="The four queues read different Metrc sources, and those sources are captured on different days. The oldest of them is shown here so nobody reads a stale queue as today's position.">
            Metrc source {stalest === freshest ? `as of ${freshest ?? "a date not served"}`
              : `between ${stalest ?? "a date not served"} and ${freshest ?? "a date not served"}`} ⓘ
          </DkTag>
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
            <button type="button" className="cc-btn" onClick={() => go("v-overdue-harvests")}>Overdue harvests →</button>
            <button type="button" className="cc-btn" onClick={() => go("moisture_loss_register")}>Moisture loss register →</button>
            <button type="button" className="cc-btn" onClick={() => go("never-tested-proof")}>Never tested — proof →</button>
            <button type="button" className="cc-btn" onClick={() => go("failed-material-disposition")}>Failed material disposition →</button>
          </div>
        </div>

        {d.s.err
          ? <DkErr what="The Metrc exception queue summary (v_xq_summary)" err={d.s.err} />
          : (
            <DkKpiStrip dept={DEPT} tiles={tiles} trend={{}} targets={{}} go={go}
              inPlace={inPlace} sourceNote={SOURCE_NOTE} onAssigned={() => setVer((v) => v + 1)}
              emptyNote="v_xq_summary served no rows at all. That is a failed read, not four empty queues — the queues themselves are still there." />
          )}

        <div className="cc-fine">
          This platform is a <b>read-only mirror of Metrc</b> and holds no write credentials. Nothing on this page
          changes Metrc, adjusts a weight, or corrects a lab state. Where a row needs a Metrc-side change, the
          instruction is for a licensed user to make it in Metrc — the click-by-click steps are in{" "}
          <b>docs/RUNBOOK_METRC_EXCEPTION_QUEUES.md</b>.
        </div>
        <div className="cc-fine">
          <b>None of these four tiles carries an owner-set target</b>, so none can turn red on a breach. A target is a
          row a person sets on the Goals and Targets page; this platform never invents one. Until then the colour on a
          tile reflects only whether anything sits at severity 1 or 2.
        </div>

        {openQueue && (
          <DkDrill label={`${openQueue.title} — every record behind the figure`} onClose={() => setOpenKpi(null)}>
            <DkRowDrill view={openQueue.view} order={openQueue.order} columns={openQueue.columns}
              note={openQueue.note} />
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            const q = QUEUES.find((x) => x.key === w.key);
            if (q) {
              const r = byOrd[q.ord];
              return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={q.ord <= 2}
                  chips={<>
                    <DkTag tone="neutral">{r ? Number(r.items).toLocaleString() : "not served"}</DkTag>
                    {r && Number(r.needs_action_now) > 0
                      ? <DkTag tone="crit">{Number(r.needs_action_now).toLocaleString()} need action now</DkTag>
                      : <DkTag tone="ok">nothing at severity 1 or 2</DkTag>}
                    {r && <DkTag tone="info" title={`Read from ${r.metrc_source}.`}>Metrc as of {r.metrc_as_of ?? "a date not served"} ⓘ</DkTag>}
                  </>}>
                  <DkRowDrill view={q.view} order={q.order} columns={q.columns} note={q.note} />
                </Widget>
              );
            }
            if (w.key === "blind") {
              return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                  chips={<DkTag tone="attn">stated, never silent</DkTag>}>
                  {summary.length === 0
                    ? <DkEmpty why="The summary served no rows, so the blind spots cannot be listed either."
                        fills="v_xq_summary carries one row per queue with a plain-English statement of what that queue could not assess. An empty read here means the view itself did not answer." />
                    : <div className="tablewrap">
                        <table>
                          <thead><tr><th>Queue</th><th>What it could not assess, and why</th></tr></thead>
                          <tbody>
                            {summary.map((r) => (
                              <tr key={r.ord}>
                                <td>{r.queue}</td>
                                <td className="note">{r.not_assessed}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>}
                </Widget>
              );
            }
            if (w.key === "reports") {
              return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}>
                  <DkReports reports={reports} dept={DEPT} go={go} />
                </Widget>
              );
            }
            return null;
          })}
        </WidgetBoard>
      </div>
    </DrillRoot>
  );
}
