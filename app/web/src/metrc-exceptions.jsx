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

/* THE PERIOD BUS, AND WHY THIS PAGE DECLARES INSTEAD OF SUBSCRIBING.
   docs/TODO_EVERY_PAGE.md: every page either uses the active frame, OR declares
   as-of / undated / snapshot with a VISIBLE CHIP. These four are queues of open
   work. An exception does not stop being an exception because it is old, and a
   date range over them would answer "no results" for the honest reason that the
   defect is from July — the exact failure the rule exists to stop. So this page
   takes the second road, and says so on its face rather than in a comment. */
const AS_OF_CHIP = {
  label: "as-of now · snapshot, not on the date bus",
  why: "This page deliberately does NOT take the active date frame. Every row here is open work, and open work does not "
    + "age out of a queue — filtering it to a period would hide a live exception because it started last month. The "
    + "freshness that DOES matter is the Metrc sync behind each queue, and that is on every tile and every row as "
    + "'Metrc as of'. Declared under the period-bus rule: a page is either on the frame or says plainly that it is not.",
};

/* Which column carries the thing a person actually types. Search runs against
   the SERVER, one ilike per queue, so it reaches every row in every queue and
   not just the ones a widget happens to have loaded. */
const SEARCH_COLUMNS = {
  moisture: ["harvest_name", "strain", "drying_room"],
  never_submitted: ["package_tag", "item", "metrc_room", "from_harvest"],
  failed_no_disposition: ["package_tag", "item", "metrc_room", "failing_tests"],
  open_past_limit: ["harvest_name", "strain", "drying_room"],
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
  const [q, setQ] = useState("");
  const [hits, setHits] = useState(null);
  /* null = not asked yet, true = may read, false = REFUSED. Not a boolean with a
     false default: "we have not asked" and "you may not read this" are different
     answers and the page must not print the second while it means the first. */
  const [mayRead, setMayRead] = useState(null);
  const [gateErr, setGateErr] = useState(null);

  useEffect(() => {
    let live = true;
    supabase.from("v_xq_summary").select("*").order("ord", { ascending: true })
      .then((res) => { if (live) setD({ s: grab(res) }); });
    return () => { live = false; };
  }, [ver]);

  /* REFUSE, DO NOT ZERO.
     These five views are SECURITY DEFINER and carry f_xq_reader(). A role the
     gate declines gets zero rows and NO error — which renders as four tiles
     reading 0, i.e. "there are no exceptions", which is a lie. It is the exact
     shape docs/TODO_EVERY_PAGE.md forbids: "Fake zeros from RLS". So the page
     asks the gate directly and, when refused, says so instead of counting. */
  useEffect(() => {
    let live = true;
    supabase.rpc("f_xq_reader").then(({ data, error }) => {
      if (!live) return;
      if (error) { setGateErr(error.message); setMayRead(null); return; }
      setGateErr(null);
      setMayRead(data === true);
    });
    return () => { live = false; };
  }, [ver]);

  /* SEARCH REACHES EVERY QUEUE AND EVERY PERIOD.
     One ilike per searchable column per queue, run at the server, so a tag is
     found whether or not its queue's section is open and whatever its age. The
     page carries no date range to set aside — it is a declared snapshot — so
     what has to be said instead is that all four queues were searched, which the
     result line does. */
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setHits(null); return undefined; }
    let live = true;
    const like = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    Promise.all(QUEUES.map((qq) =>
      supabase.from(qq.view).select("*")
        .or(SEARCH_COLUMNS[qq.key].map((c) => `${c}.ilike.${like}`).join(","))
        .limit(200)
        .then((res) => ({ queue: qq, ...grab(res) }))))
      .then((all) => { if (live) setHits(all); });
    return () => { live = false; };
  }, [q]);

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
          <DkTag tone="attn" title={AS_OF_CHIP.why}>{AS_OF_CHIP.label} ⓘ</DkTag>
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
          <div className="cc-tools-c">
            <label htmlFor="xq-q">Find a tag, harvest, strain or room</label>
            <input id="xq-q" className="cc-input" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="1A40A030000E5B2000000009 or TG Spec Ops"
              title="Searches all four queues at the server, every row and every age. Three characters to start." />
            {q.trim().length > 0 && (
              <button type="button" className="cc-btn" onClick={() => setQ("")}
                title="Clear the search and go back to the queues.">clear</button>
            )}
          </div>
          <div className="cc-tools-r">
            <button type="button" className="cc-btn" onClick={() => go("v-overdue-harvests")}>Overdue harvests →</button>
            <button type="button" className="cc-btn" onClick={() => go("moisture_loss_register")}>Moisture loss register →</button>
            <button type="button" className="cc-btn" onClick={() => go("never-tested-proof")}>Never tested — proof →</button>
            <button type="button" className="cc-btn" onClick={() => go("failed-material-disposition")}>Failed material disposition →</button>
          </div>
        </div>

        {gateErr && <DkErr what="The check for whether your role may read these queues (f_xq_reader)" err={gateErr} />}

        {mayRead === false ? (
          <DkEmpty
            why={`Your role may not read the Metrc exception queues, so this page is showing you nothing rather than four zeroes.`}
            fills={"The four queue views are SECURITY DEFINER and gated by f_xq_reader(), whose allow-list is "
              + "nav_role_visibility for xq_metrc_exceptions — the same list that decides who sees this page on the menu. "
              + "A role outside it reads zero rows and gets NO error, which would render as 'no exceptions' and would be "
              + "false: there may be hundreds. An owner or executive can grant the role on the menu-visibility page, and "
              + "the data opens in the same statement. Nothing here is broken and nothing is being computed in the browser."} />
        ) : d.s.err
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

        {hits && (
          <DkDrill label={`Search — “${q.trim()}” across all four queues`} onClose={() => setQ("")}>
            <div className="cc-fine">
              All four queues were searched at the server, every row and every age — this page carries no date range to
              set aside, because it is a declared snapshot. A tag that is in a queue is found here whether or not that
              queue&rsquo;s section is open below.
            </div>
            {hits.some((h) => h.err) && hits.filter((h) => h.err).map((h) => (
              <DkErr key={h.queue.key} what={`The search of ${h.queue.title} (${h.queue.view})`} err={h.err} />
            ))}
            {hits.every((h) => !h.err && listOf(h.rows).length === 0) ? (
              <DkEmpty
                why={`Nothing in any of the four queues matches “${q.trim()}”.`}
                fills={"All four were searched in full, not just the section that is open and not just recent rows. "
                  + "A tag that is absent here is a tag that is not currently an exception — it may still exist in Metrc "
                  + "and be perfectly healthy."} />
            ) : hits.filter((h) => !h.err && listOf(h.rows).length > 0).map((h) => (
              <div key={h.queue.key}>
                <div className="cc-fine">
                  <b>{h.queue.title}</b> — {listOf(h.rows).length.toLocaleString()} match
                  {listOf(h.rows).length === 1 ? "" : "es"}
                  {listOf(h.rows).length === 200 ? " (showing the first 200)" : ""}
                </div>
                <div className="tablewrap">
                  <table>
                    <thead><tr>{h.queue.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                    <tbody>
                      {listOf(h.rows).map((r, i) => (
                        <tr key={`${r.package_tag ?? r.harvest_name ?? "row"}|${i}`}>
                          {h.queue.columns.map((c) => {
                            const v = r[c.key];
                            const blank = v === null || v === undefined || v === "";
                            return (
                              <td key={c.key} className={c.kind === "note" ? "note" : undefined}>
                                {blank ? (c.none ?? "not recorded")
                                  : c.kind === "lb" ? `${NUM(v) ?? v} lb`
                                  : String(v)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </DkDrill>
        )}

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
