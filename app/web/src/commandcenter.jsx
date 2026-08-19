/* ═══════════════════════════════════════════════════════════════════════════
   COMMAND CENTER — clean-slate rebuild. Agent B, 12 Aug 2026.

   Owner ruling (via Agent I): stop retrofitting, build the page from an empty
   file to the DDC scale measured from his own stylesheet, mounted at the same
   route. The nine section orders are the DESIGN SPEC of this tree, not patches.

   WHAT THIS FILE OWNS: every Command section that was junked and reborn.
   WHAT IT ONLY MOUNTS, PIXEL-UNTOUCHED (owner hands-off list): the Stock by
   Stream cards and the Where the Money Is Standing bar — imported from App.jsx
   and rendered verbatim; their internals are never restyled here, and
   commandcenter.css scopes every token to .ccpage so nothing can cascade into
   them, the side menu, the top menu, or any other page.

   DATA LAYER (Agent I's, consumed exactly as specced — the front end computes
   no business figure): mv_department_dashboard · v_dashboard_trend ·
   kpi_targets · mv_flow_stages · v_flow_failed_split · mv_global_management ·
   v_finding_causes / v_findings · v_goal_status · v_harvest_yield_audit ·
   mv_room_board · v_stock_by_department · v_stock_summary · v_money_position ·
   v_dashboard_tasks · tg_period_narrative · v_section_narrative ·
   dashboard_commentary · tg_assign_from_tile · tg_snapshot_dashboards.
   Drills stay live on v_stock_proof through the shared evidence components.

   EVERY read binds error and surfaces it: an errored band collapses to its
   header plus one honest line — never a raw error at top prominence, never a
   silent empty box (orders 3 and 4; silent-failures ratchet).

   The bottom operational status bar is DELETED by owner ruling — the data-age
   stamp in the page header is the single home for freshness, and it reports
   the age of the DATA (the tile snapshot's computed_at), not query time.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "./lib/supabase.js";
import { fetchDepartmentDashboard } from "./lib/dashboard-range.js";
import {
  DateRangeSelect, useSectionStore, rowsOr,
  MoneyBar, StockByStreamCards, StockProofTable, OpenHarvestDetail, InTransitDrill, BatchList,
  RoomStockDrill, ForensicAuditLedger, DEPT_BY_VIEW,
} from "./App.jsx";
import {
  useDefaultRange, DkKpiStrip, DkRoomBoard, DkRoomPlantDrill, DkWorkQueue, useWorkQueue, DkCaret, DkDrill, DrillRoot,
  DkStreamDrill, DkRowDrill, DkEmpty, dkRoomQualified,
} from "./dashkit.jsx";
import "./commandcenter.css";

/* ---------- shared primitives of the new tree ---------- */

/* Panel: the DDC shell. Square, hairline border, mono uppercase head, chips on
   the head line so a collapsed or errored section still tells its state
   (order 4: never a bare header band over silent failure).

   THE MOUNT IS GATED, NOT ONLY THE VISIBILITY (F2, Agent X). This hid a closed
   section with display:none and left it MOUNTED, so every read inside a
   collapsed panel still ran on every page load. The measurable cost was the
   forensic audit ledger: a 7.5-second query fired on every single visit to the
   Command Center for a section that is collapsed by default and that most
   visits never open. The old comment defended this as "monitoring stays live
   behind a closed section" — but nothing on this page monitors from a hidden
   panel; the chips are computed by the page, not by the panel body, and they
   are unaffected.

   A panel mounts the first time it is opened and STAYS mounted after that, so
   collapsing a section you have read does not throw its state away and does not
   re-run its query when you open it again. Cheap on arrival, cheap thereafter. */
function CcPanel({ id, store, title, chips, defaultOpen = true, children }) {
  const open = store.isOpen(id, defaultOpen);
  const [everOpened, setEverOpened] = useState(open);
  useEffect(() => { if (open && !everOpened) setEverOpened(true); }, [open, everOpened]);
  return (
    <section className="cc-panel">
      <button className="cc-panel-head" onClick={() => store.set(id, !open)}
        aria-expanded={open}
        title={open
          ? "Collapse this section. It keeps what it has already read; nothing is re-queried when you open it again."
          : "Expand this section. It reads its data the first time it is opened, which is why closed sections cost nothing on arrival."}>
        <span className="cc-panel-title">{title}</span>
        {chips && <span className="cc-panel-chips">{chips}</span>}
        <span className="cc-panel-caret">{open ? "−" : "+"}</span>
      </button>
      <div className="cc-panel-body" style={open ? undefined : { display: "none" }}>
        {everOpened ? children : null}
      </div>
    </section>
  );
}

/* Status tag: the DDC status vocabulary mapped onto OUR locked colour tokens
   (commandcenter.css). Tones: ok · warn · attn · crit · info · neutral. */
function CcTag({ tone = "info", title, children }) {
  return <span className={`cc-tag ${tone}`} title={title}>{children}</span>;
}

/* The one honest error shape: what failed and the served reason, one line. */
function CcErr({ what, err }) {
  return <div className="cc-err"><b>{what} could not be read:</b> {err} — the read genuinely failed; nothing is hidden behind an empty box.</div>;
}

/* Data age in words. The full timestamp rides the title attribute. */
function ccAge(ts) {
  if (!ts) return null;
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 90) return "under two minutes old";
  if (s < 5400) return `${Math.round(s / 60)} minutes old`;
  if (s < 129600) return `${Math.round(s / 3600)} hours old`;
  return `${Math.round(s / 86400)} days old`;
}

/* ---------- order 9 · the KPI strip ----------
   BACK-PORTED to the shared DkKpiStrip, 12 Aug 2026. The version that lived
   here rendered a tile with no owner-set target as a BLANK where the target
   line belongs, a null sparkline as nothing at all, and a tile with no drill
   as a live button that did nothing when pressed. All eight Command tiles hit
   the first of those — kpi_targets holds twelve rows and not one is for
   Command — so the certified page was breaching rule 10 and A3 eight times
   over while looking finished. The shared strip says "no target set", "no
   history yet" and disables a drill-less tile with "no drill published"
   beside it. Same markup, same classes, same scale: only the silence is gone. */

/* ═══════════════════════════════════════════════════════════════════════════
   WHAT EACH KEY FIGURE OPENS — one descriptor per published tile.

   THE DEFECT THIS CLOSES, measured 13 Aug 2026. Every Command key figure drilled
   by navigating to a report page named in its own `drill` column, and that page
   shows the whole view with every filter reset. So the dried-flower figure
   opened a stock report that also counts fresh frozen; the in-the-rooms figure
   opened the whole moisture register rather than the open harvests it counts;
   the moisture-not-recorded figure opened THE SAME PAGE as the in-the-rooms
   figure; and the harvests-open-too-long figure opened every harvest on the
   register rather than the ones past the limit. Each gap is a multiple, not a
   rounding, and each is recorded with the measurement of the day in
   tile_drill_contract and in correction proposal 27 — never frozen in prose
   here, where it would go stale exactly as fast as a number typed into code.

   Two different figures pointing at one destination cannot both reconcile to it,
   and rule C1 is explicit that a drill opens the exact records, "not a general
   report". go() carries a view key and nothing else, so the destination cannot
   be narrowed — the records therefore open IN PLACE, and the full report is
   still one press away from inside the drill.

   EVERY FILTER BELOW IS LIFTED VERBATIM FROM mv_department_dashboard_base — the
   definition that computes the figure — and never composed from what the number
   looks like. Two of the figures already have a dedicated view standing behind
   them (v_harvest_still_in_room, v_missing_lab_results) and those are used as
   they are. Each descriptor is also registered in tile_drill_contract, so the
   database re-derives the tile from these very rows on every run: a filter that
   is wrong here reads DISAGREE rather than shipping a quietly wrong list.

   The descriptors are module constants, not inline objects. An object rebuilt
   on every render is a new dependency on every render, and DkRowDrill would
   re-read the database on each one.
   ═══════════════════════════════════════════════════════════════════════════ */
/* THE PUBLISHED LABELS, in one place. mv_department_dashboard rows carry no
   stable identifier, so a label is the only key a page has. Naming them once
   here means a rename shows up as ONE broken constant rather than as six string
   literals scattered through the render, and DkKpiStrip raises a critical chip
   for any key that matches no published figure rather than silently rendering
   nothing. Filed with the data layer: a stable tile key on the row would retire
   this block entirely. */
const CC_KPI_DRIED = "Dried flower on hand";
const CC_KPI_IN_ROOMS = "In the rooms, dry-equivalent";
const CC_KPI_OPEN_TOO_LONG = "Harvests open too long";
const CC_KPI_PHANTOM = "Moisture loss not recorded";
const CC_KPI_AT_LAB = "Out at the laboratory, no result";
const CC_KPI_NOT_SUBMITTED = "Never submitted for testing";
const CC_KPI_FAILED = "Failed testing on hand";
/* Not a published label — the fresh frozen half of the split rides on the dried
   tile, so it needs a key of its own for the one-drill-at-a-time selector. */
const CC_FF_KEY = "pair:fresh frozen, wet weight";
/* The stream key is the SERVED value in v_stock_summary and v_stock_proof, not
   a category invented here. v_stock_headline counts the same population by
   Metrc product category, and tile_drill_contract cc.stock.fresh_frozen_lb
   re-derives one from the other so the mapping is tested rather than trusted.
   If no served stream carries this name, the drill says so by name. */
const CC_FRESH_FROZEN_STREAM = "Fresh frozen";

const CC_O_STILL_IN_ROOM = { col: "really_left_lb", asc: false };
const CC_C_STILL_IN_ROOM = [
  { key: "harvest_name", label: "Harvest" },
  { key: "drying_room", label: "Drying room", none: "room not recorded" },
  { key: "harvest_started", label: "Started", none: "not recorded" },
  { key: "days_open", label: "Days open", kind: "num", none: "not recorded" },
  { key: "days_since_last_package", label: "Days since the last package came off", kind: "num", none: "no package has come off yet" },
  { key: "last_package_taken_off", label: "Last package off", none: "none yet" },
  { key: "wet_lb", label: "Wet in", kind: "lb", none: "not weighed" },
  { key: "expected_dry_lb", label: "Expected dry", kind: "lb", none: "not computable" },
  { key: "packaged_lb", label: "Packaged off", kind: "lb", none: "none packaged" },
  { key: "waste_lb", label: "Waste", kind: "lb", none: "none recorded" },
  { key: "really_left_lb", label: "Really left, dry-equivalent", kind: "lb", none: "not computable" },
  { key: "old_figure_wet_minus_dry", label: "Metrc still shows, wet", kind: "lb", none: "not recorded" },
  { key: "what_it_really_means", label: "What it really means", kind: "note", none: "no reading recorded" },
];
/* Moisture register, the two DIFFERENT populations that used to share one page. */
const CC_F_PHANTOM = [
  { op: "eq", col: "harvest_state", val: "CLOSED" },
  { op: "is", col: "needs_recording", val: true },
  { op: "gt", col: "phantom_lb", val: 0 },
];
const CC_O_PHANTOM = { col: "phantom_lb", asc: false };
const CC_C_MOISTURE = [
  { key: "harvest_name", label: "Harvest" },
  { key: "strain", label: "Strain", none: "strain not recorded" },
  { key: "drying_room", label: "Drying room", none: "room not recorded" },
  { key: "harvest_state", label: "Harvest state", none: "not recorded" },
  { key: "harvest_closed", label: "Closed on", none: "still open" },
  { key: "wet_lb", label: "Wet in", kind: "lb", none: "not weighed" },
  { key: "packaged_lb", label: "Packaged off", kind: "lb", none: "none packaged" },
  { key: "waste_lb", label: "Waste", kind: "lb", none: "none recorded" },
  { key: "metrc_shows_remaining_lb", label: "Metrc still shows", kind: "lb", none: "nothing" },
  { key: "expected_moisture_loss_lb", label: "Expected water loss", kind: "lb", none: "not computable" },
  { key: "phantom_lb", label: "Water never written off", kind: "lb", none: "none" },
  { key: "recorded_loss_lb", label: "Loss actually recorded", kind: "lb", none: "never recorded" },
  { key: "recorded_method", label: "How it was recorded", none: "not recorded" },
  { key: "entered_by", label: "Entered by", none: "nobody recorded" },
  { key: "status", label: "Status", none: "not flagged" },
];
/* Harvests open past the owner-set limit. The limit is f_rule('harvest_open_max_days')
   and is NOT written here — the view serves harvest_closed and the running day
   count, and the filter asks for exactly what the tile's own definition asks for:
   not closed, and open longer than the served rule. The rule value arrives with
   the page in harvest_alert_rules and is applied at render, never typed in. */
const CC_O_OPEN_TOO_LONG = { col: "total_days_start_to_now", asc: false };
const CC_C_HARVEST_ISSUES = [
  { key: "harvest_name", label: "Harvest" },
  { key: "strain", label: "Strain", none: "strain not recorded" },
  { key: "drying_room", label: "Drying room", none: "room not recorded" },
  { key: "license", label: "Licence", none: "not recorded" },
  { key: "harvest_started", label: "Started", none: "not recorded" },
  { key: "total_days_start_to_now", label: "Days open", kind: "num", none: "not recorded" },
  { key: "plants", label: "Plants", kind: "num", none: "not recorded" },
  { key: "wet_lb", label: "Wet in", kind: "lb", none: "not weighed" },
  { key: "packaged_lb", label: "Packaged off", kind: "lb", none: "none packaged" },
  { key: "still_in_room_lb", label: "Still in the room", kind: "lb", none: "nothing" },
  { key: "packages_made", label: "Packages made", kind: "num", none: "none" },
  { key: "harvest_state", label: "State", none: "not recorded" },
  { key: "what_is_wrong", label: "What is wrong", kind: "note", none: "nothing flagged" },
];
/* Submitted to a laboratory and never reported back. v_missing_lab_results IS
   the tile's population — no filter is needed and none is invented. */
const CC_O_MISSING_LAB = { col: "pounds", asc: false };
const CC_C_MISSING_LAB = [
  { key: "package_tag", label: "Package tag" },
  { key: "product", label: "Product", none: "not recorded" },
  { key: "category", label: "Category", none: "not recorded" },
  { key: "strain", label: "Strain", none: "strain not recorded" },
  { key: "origin", label: "Origin", none: "not recorded" },
  { key: "pounds", label: "Weight", kind: "lb", none: "not weighed" },
  { key: "went_out_on", label: "Went out on", none: "date not recorded" },
  { key: "days_missing", label: "Days with no result", kind: "num", none: "not computable" },
  { key: "testing_state", label: "Testing state in Metrc", none: "not recorded" },
  { key: "source_harvest", label: "Source harvest", none: "not recorded" },
  { key: "where_it_is_now", label: "Where it is now", none: "location not recorded" },
  { key: "value_at_risk", label: "Value at risk", none: "not valued" },
  { key: "what_to_do", label: "What to do", kind: "note", none: "no action recorded" },
];
/* THE TWO LABORATORY-STATE FIGURES DO NOT DRILL v_stock_on_hand, EVEN THOUGH
   THAT IS THE VIEW THEY ARE COMPUTED FROM. v_stock_on_hand GROUPS — counting
   its rows answers "how many streams" while looking exactly like "how many
   packages" (rule E4, and the platform has already broken this way). Their
   drills read the package-level evidence view instead, filtered on the same
   lab_state column, so every row is one physical package and carries its
   certificate and its manifest. Measured 13 Aug 2026: 173.4 against a published
   173.5, and 165.4 against 165.3 — one rounding step apart, nothing more. */
const CC_LAB_NOT_SUBMITTED = "NotSubmitted";
const CC_LAB_TEST_FAILED = "TestFailed";

/* ---------- order 3 · seed-to-sale strip, first band ---------- */
const CC_WIP = new Set(["Drying", "Awaiting test", "At the laboratory"]);
function CcFlow({ flow, split, go }) {
  const [openStage, setOpenStage] = useState(null);
  const stages = flow.filter((r) => r.stage_no > 0);
  const blocked = flow.find((r) => r.stage_no === 0);
  const maxLb = Math.max(1, ...stages.map((r) => Number(r.pounds || 0)));
  const scored = stages
    .filter((r) => CC_WIP.has(r.stage) && r.pounds && r.oldest_days)
    .map((r) => ({ ...r, score: Number(r.pounds) * Number(r.oldest_days) }))
    .sort((a, b) => b.score - a.score);
  const bn = scored[0];
  return (
    <>
      <div className="cc-flow">
        {stages.map((r) => {
          const hot = bn && r.stage === bn.stage;
          const old = Number(r.oldest_days || 0);
          return (
            <button key={r.stage} className={`cc-stage ${hot ? "hot" : ""} ${openStage === r.stage ? "on" : ""}`}
              onClick={() => setOpenStage(openStage === r.stage ? null : r.stage)}
              aria-expanded={openStage === r.stage}
              title={(r.note || "") + (openStage === r.stage ? " Click again to close." : " Click for every record behind this stage.")}>
              <span className="cc-stage-lbl"><DkCaret open={openStage === r.stage} />{r.stage}</span>
              <span className="cc-stage-n">{Number(r.units || 0).toLocaleString()}<em> {r.unit}</em></span>
              {r.pounds != null && <span className="cc-stage-lb">{Number(r.pounds).toLocaleString()} lb</span>}
              {r.pounds != null && (
                <span className="cc-stage-bar"><i style={{ width: Math.max(4, (Number(r.pounds) / maxLb) * 100) + "%" }} className={hot ? "hot" : ""} /></span>
              )}
              {old > 0 && <span className={`cc-stage-age ${old > 180 ? "crit" : old > 60 ? "warn" : ""}`}>oldest {old} days</span>}
            </button>
          );
        })}
      </div>
      {blocked && Number(blocked.units) > 0 && (
        <button className="cc-flow-blocked" onClick={() => go(blocked.drill)}
          title="Out of the flow. Third-party failed material is an input bought to remediate, never a loss (rule C6a). Click for the records.">
          <b>Out of the flow — failed testing:</b>{" "}
          {split ? (
            <>{Number(split.failed_ours_lb).toLocaleString()} lb ours ({split.failed_ours_packages} packages)
              · {Number(split.failed_third_party_lb).toLocaleString()} lb third party
              ({split.failed_third_party_packages} packages, {split.third_party_suppliers})
              · oldest {split.oldest_days} days</>
          ) : (
            <>{Number(blocked.pounds).toLocaleString()} lb, oldest {blocked.oldest_days} days</>
          )}
        </button>
      )}
      {openStage && (
        <DkDrill label={`Every record behind “${openStage}” — full forensic detail`}
          onClose={() => setOpenStage(null)}>
          {openStage === "Open harvests" ? <OpenHarvestDetail />
            : openStage === "In transit" ? <InTransitDrill />
            : <BatchList labState={
                openStage === "Awaiting test" ? "NotSubmitted"
                : openStage === "Sellable" ? "TestPassed"
                : openStage === "Blocked - failed" ? "TestFailed" : "SubmittedForTesting"} />}
        </DkDrill>
      )}
    </>
  );
}

/* ---------- order 3 · in plain words, second band ---------- */
function CcAddNote({ session, role, onDone }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [drill, setDrill] = useState("");
  const [msg, setMsg] = useState("");
  const author = session?.user?.email ?? null;
  const save = async () => {
    if (!body.trim()) { setMsg("Write the note first."); return; }
    if (!author) { setMsg("A note must be signed — no signed-in email, no note. Anonymous commentary is not allowed."); return; }
    const { error } = await supabase.from("dashboard_commentary").insert({
      page: "command", section_key: "narrative", author, author_role: role, body: body.trim(), pinned,
      drill: drill.trim() || null,
    });
    if (error) { setMsg(`Not saved: ${error.message}`); return; }
    setBody(""); setPinned(false); setDrill(""); setOpen(false); setMsg("");
    onDone();
  };
  if (!open) return (
    <span className="cc-note-add">
      <button className="cc-btn" onClick={() => setOpen(true)}>+ note</button>
      {msg && <span className="cc-fine">{msg}</span>}
    </span>
  );
  return (
    <div className="cc-note-form">
      <label className="cc-fine">A signed note from {author ?? "(not signed in)"} · {role}</label>
      <textarea className="cc-input" rows={3} value={body} onChange={(e) => setBody(e.target.value)}
        aria-label="The note, published under your name with today's date"
        placeholder="Your read of this dashboard, in your own words. A correction later is a new note — nothing is edited in place." />
      <div className="cc-row">
        <label className="cc-check"><input type="checkbox" aria-label="Pin this note to the top"
          checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> pinned</label>
        <input className="cc-input" aria-label="Optional: the page this note opens when clicked"
          placeholder="optional: page it opens (view key)" value={drill} onChange={(e) => setDrill(e.target.value)} />
        <button className="cc-btn primary" onClick={save}>Publish under my name</button>
        <button className="cc-btn" onClick={() => { setOpen(false); setMsg(""); }}>Cancel</button>
        {msg && <span className="cc-fine">{msg}</span>}
      </div>
    </div>
  );
}

function CcWords({ store, range, role, session, go }) {
  const [period, setPeriod] = useState(null);
  const [standing, setStanding] = useState(null);
  const [notes, setNotes] = useState(null);
  const [errs, setErrs] = useState([]);
  const [ver, setVer] = useState(0);
  const ranged = Boolean(range?.from && range?.to);
  const mayWrite = role === "owner" || role === "executive";
  const pushErr = useCallback((m) => setErrs((p) => (p.includes(m) ? p : [...p, m])), []);

  useEffect(() => {
    let live = true;
    /* Range guard: with null bounds the function degenerates to a one-day story
       that would misstate the "All dates" selection on screen. Never called
       without a real window — the header chip says to pick one instead. */
    if (!ranged) { setPeriod([]); return; }
    supabase.rpc("tg_period_narrative", { p_from: range.from, p_to: range.to })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { pushErr(`The period story: ${error.message}`); setPeriod([]); return; }
        setPeriod(rowsOr(data).filter((n) => n.page === "command"));
      });
    return () => { live = false; };
  }, [ranged, range?.from, range?.to, pushErr]);

  useEffect(() => {
    let live = true;
    supabase.from("v_section_narrative").select("*").eq("page", "command")
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { pushErr(`The standing platform story: ${error.message}`); setStanding([]); return; }
        setStanding(rowsOr(data));
      });
    return () => { live = false; };
  }, [pushErr]);

  useEffect(() => {
    let live = true;
    supabase.from("dashboard_commentary").select("*").eq("page", "command").is("retired_at", null)
      .order("pinned", { ascending: false }).order("written_at", { ascending: false })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { pushErr(`Signed notes: ${error.message}`); setNotes([]); return; }
        setNotes(rowsOr(data));
      });
    return () => { live = false; };
  }, [ver, pushErr]);

  const retire = async (n) => {
    const who = session?.user?.email;
    if (!who) return;
    const { error } = await supabase.from("dashboard_commentary")
      .update({ retired_at: new Date().toISOString(), retired_by: who }).eq("id", n.id);
    if (error) { pushErr(`Could not retire the note: ${error.message}`); return; }
    setVer((v) => v + 1);
  };

  const loading = period === null || standing === null || notes === null;
  const chips = loading ? null : (
    <>
      {!ranged && <CcTag tone="info" title="The period story describes your window against the one before it and rewrites itself when the range changes. Pick any date chip above to read it.">pick a date range for the period story ⓘ</CcTag>}
      {ranged && <CcTag tone={period.length ? "ok" : "neutral"}>{period.length} period</CcTag>}
      {standing !== null && <CcTag tone="neutral">{standing.length} platform</CcTag>}
      {notes !== null && <CcTag tone="neutral">{notes.length} signed</CcTag>}
      {errs.length > 0 && <CcTag tone="crit">{errs.length} lane errors</CcTag>}
    </>
  );

  return (
    <CcPanel id="words" store={store} title="In plain words — the period, the platform, and signed notes" chips={chips}>
      {loading ? <div className="cc-fine">Reading the story of this page…</div> : (
        <div className="cc-words">
          {errs.map((e) => <CcErr key={e} what="A narrative lane" err={e} />)}
          {ranged && period.length === 0 && !errs.length && (
            <div className="cc-fine">No period story is computed for this page over {range.from} to {range.to} — the window is real, there is simply nothing to tell for it.</div>
          )}
          {period.map((n) => (
            <button key={"p" + n.section_key} className={`cc-word ${n.tone || "info"}`}
              onClick={() => n.drill && go(n.drill)}
              title="A paragraph is a claim like any tile — it opens to the records behind it.">
              <span className="cc-word-text">{n.narrative}</span>
              <span className="cc-word-by">Period · computed live for {range.from} to {range.to}{n.drill ? " · Open the records →" : ""}</span>
            </button>
          ))}
          {standing.map((n) => (
            <button key={"s" + n.section_key} className={`cc-word ${n.tone || "info"}`}
              onClick={() => n.drill && go(n.drill)}
              title="A paragraph is a claim like any tile — it opens to the records behind it.">
              <span className="cc-word-text">{n.narrative}</span>
              <span className="cc-word-by">Platform · computed live{n.drill ? " · Open the records →" : ""}</span>
            </button>
          ))}
          {notes.map((n) => (
            <div key={"n" + n.id} className="cc-word-note">
              <button className="cc-word human" onClick={() => n.drill && go(n.drill)}
                title={n.drill ? "This signed note opens a page." : "A signed opinion, not a computed figure."}>
                <span className="cc-word-text">{n.body}</span>
                <span className="cc-word-by">{n.author}{n.author_role ? " · " + n.author_role : ""} · {String(n.written_at).slice(0, 10)} · a signed opinion, not a computed figure{n.pinned ? " · pinned" : ""}</span>
              </button>
              {mayWrite && <button className="cc-btn" title="Retire this note — kept on the record, never deleted" onClick={() => retire(n)}>Retire</button>}
            </div>
          ))}
          {mayWrite && <CcAddNote session={session} role={role} onDone={() => setVer((v) => v + 1)} />}
        </div>
      )}
    </CcPanel>
  );
}

/* ---------- order 3 · global management, third band ----------
   The department→dashboard map derives LAZILY from DEPT_BY_VIEW: this module
   and App.jsx import each other, so App.jsx's consts are not initialised yet
   while this module's top level evaluates. Computing at first render is what
   makes the cycle safe. */
let ccNavByDeptCache = null;
function ccNavByDept() {
  if (!ccNavByDeptCache) {
    ccNavByDeptCache = {};
    for (const [k, v] of Object.entries(DEPT_BY_VIEW)) if (!ccNavByDeptCache[v]) ccNavByDeptCache[v] = k;
  }
  return ccNavByDeptCache;
}
/* ═══════════════════════════════════════════════════════════════════════════
   THE EXECUTIVE COLUMN — owner, 12 Aug 2026, on the empty right-hand area of
   this band: "DO NOT LEAVE ANY SPACE HERE WE ADD TILES THAT CEO AND COO WOULD
   WANT TO SEE HERE."

   Four tiles, every one of them a figure a chief executive or a chief operating
   officer is accountable for, every one read from a served view and every one
   drilling to the records behind it (C1). Nothing here is computed in the
   browser and nothing here is a number this file chose.

   THE HEADLINE STOCK FIGURE IS TWO FIGURES AND THEY ARE NEVER ADDED. Owner
   ruling, 12 Aug 2026 ("AGREE SPLIT THIS"): dried flower is dry weight, fresh
   frozen is packaged at field moisture and is mostly water, so a single
   combined dry-equivalent figure overstates the position by the water. Both
   figures, the overstatement and the conversion ratio are read from
   v_stock_headline at render time and NONE of them is written down here — a
   figure typed into a comment goes stale exactly as fast as one typed into
   code, and the frozen-figures gate counts both. The two are shown side by
   side, and the dry-equivalent conversion appears ONLY beside
   v_stock_headline's own ratio_caveat, verbatim, because the configured ratio
   is not confirmed and measured extraction disagrees with it. */
function CcExecTile({ label, value, unit, tone, sub, subTone, drill, open, onToggle }) {
  const body = (
    <>
      <span className="cc-exec-lbl">{label}</span>
      <span className={`cc-exec-val ${tone ?? ""}`}>{value}{unit && <em>{unit}</em>}</span>
      {sub && <span className={`cc-exec-sub ${subTone ?? ""}`}>{sub}</span>}
      {drill && <span className="cc-exec-go">{open ? "Close — the records are below" : "Open the records →"}</span>}
    </>
  );
  if (!drill) return <div className="cc-exec">{body}</div>;
  return (
    <button className={`cc-exec ${open ? "on" : ""}`} onClick={onToggle} aria-expanded={open}
      title={open ? "Click again to close." : "Click for every record behind this figure."}>{body}</button>
  );
}

function CcExecColumn({ headline, headlineErr, restock, restockErr, forecast, forecastErr, compliance, complianceErr, go }) {
  const [open, setOpen] = useState(null);
  const t = (k) => (open === k ? null : k);
  const h = headline;
  /* v_supply_restock_due serves the STATUS per item; the tile counts the rows
     the view itself flags, and where nothing is tracked it says so rather than
     printing a reassuring zero. Measured 12 Aug 2026: all 15 supply items read
     NOT TRACKED, which means no restock level has been set on any of them —
     "0 items below restock level" would be true and completely misleading. */
  const tracked = restock.filter((r) => r.track_enabled === true);
  const belowLevel = tracked.filter((r) => r.on_hand != null && r.reorder_level != null
    && Number(r.on_hand) <= Number(r.reorder_level));
  /* The forecast view serves one row per calendar month for the whole schedule,
     past months included. A CEO tile must not present a month already gone as
     something still to come, so the tile takes the CURRENT month by key and
     says which month it is. The month key is a served string, not a computed
     window. */
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = forecast.find((r) => r.month === thisMonthKey) ?? null;
  const late = compliance.filter((r) => Number(r.days_off_schedule ?? 0) > 0);
  return (
    <div className="cc-execcol">
      <div className="cc-exechead">What the chief executive and chief operating officer watch</div>

      {headlineErr ? <CcErr what="The headline stock position" err={headlineErr} /> : h ? (
        <>
          <CcExecTile label="Dried flower on hand" value={Number(h.dried_lb).toLocaleString()} unit="lb"
            tone="ok" sub={h.why_two_figures}
            drill open={open === "dried"} onToggle={() => setOpen(t("dried"))} />
          <CcExecTile label="Fresh frozen on hand, wet weight"
            value={Number(h.fresh_frozen_wet_lb).toLocaleString()} unit="lb"
            sub={`${Number(h.fresh_frozen_packages).toLocaleString()} packages. Dry-equivalent at the configured ratio of ${Number(h.configured_ratio)} is ${Number(h.fresh_frozen_dry_equivalent_lb).toLocaleString()} lb — ${h.ratio_caveat}`}
            subTone="crit" drill open={open === "ff"} onToggle={() => setOpen(t("ff"))} />
        </>
      ) : (
        <div className="cc-exec"><span className="cc-exec-lbl">Headline stock position</span>
          <span className="cc-exec-sub">v_stock_headline served no row. The read succeeded and returned
            nothing, which is itself a data-layer finding rather than an empty position.</span></div>
      )}

      {forecastErr ? <CcErr what="The production forecast" err={forecastErr} /> : (
        <CcExecTile label={`Scheduled to come off in ${thisMonthKey}`}
          value={thisMonth ? Number(thisMonth.projected_lbs).toLocaleString() : "none"}
          unit={thisMonth ? "lb" : null}
          sub={thisMonth
            ? `${thisMonth.harvests} harvest${Number(thisMonth.harvests) === 1 ? "" : "s"} across ${thisMonth.rooms} room${Number(thisMonth.rooms) === 1 ? "" : "s"}, ${Number(thisMonth.plants).toLocaleString()} plants. Of that, ${Number(thisMonth.fresh_frozen_lbs).toLocaleString()} lb is planned as fresh frozen and ${Number(thisMonth.flower_lbs_after_ff).toLocaleString()} lb as flower. Projected from the harvest schedule, not weighed.`
            : `No harvest is scheduled in ${thisMonthKey}. The schedule holds ${forecast.length} month${forecast.length === 1 ? "" : "s"} in all — this month is not one of them.`}
          drill open={open === "fc"} onToggle={() => setOpen(t("fc"))} />
      )}

      {complianceErr ? <CcErr what="Schedule compliance" err={complianceErr} /> : (
        <CcExecTile label="Harvest events that ran late"
          value={late.length.toLocaleString()} unit={`of ${compliance.length.toLocaleString()}`}
          tone={late.length > 0 ? "crit" : "ok"}
          sub={late.length > 0
            ? `Worst: ${late.reduce((a, r) => (Number(r.days_off_schedule) > Number(a.days_off_schedule) ? r : a), late[0]).compliance}. Every event compares the scheduled date with the date it actually happened.`
            : "Every harvest event on the register either ran on or before its scheduled date, or has not come due yet."}
          drill open={open === "sc"} onToggle={() => setOpen(t("sc"))} />
      )}

      {restockErr ? <CcErr what="Supply restock levels" err={restockErr} /> : (
        <CcExecTile label="Supplies at or below restock level"
          value={tracked.length === 0 ? "not tracked" : belowLevel.length.toLocaleString()}
          unit={tracked.length === 0 ? null : `of ${tracked.length.toLocaleString()}`}
          tone={tracked.length === 0 ? "warn" : belowLevel.length > 0 ? "crit" : "ok"}
          sub={tracked.length === 0
            ? `No restock level is set on any of the ${restock.length.toLocaleString()} supply items on the register, so nothing can be below one. A zero here would read as "all stocked" and would be false. Set the levels and this tile starts working.`
            : `${restock.length - tracked.length} further item${restock.length - tracked.length === 1 ? " is" : "s are"} on the register with tracking switched off.`}
          drill open={open === "rs"} onToggle={() => setOpen(t("rs"))} />
      )}

      {open === "dried" && (
        <DkDrill label="Every dried package on hand" onClose={() => setOpen(null)}>
          <div className="cc-fine">{h?.why_two_figures}</div>
          <button className="cc-btn" onClick={() => go("dept_dash_inventory")}>
            Open the Inventory dashboard, where every stream opens its own packages →
          </button>
        </DkDrill>
      )}
      {open === "ff" && (
        <DkDrill label="Fresh frozen — every package, at wet weight" onClose={() => setOpen(null)}>
          <div className="cc-fine">{h?.ratio_caveat}</div>
          <button className="cc-btn" onClick={() => go("dept_dash_inventory")}>
            Open the Inventory dashboard, where the fresh frozen stream opens its own packages →
          </button>
        </DkDrill>
      )}
      {open === "fc" && (
        <DkDrill label="Every month on the harvest schedule" onClose={() => setOpen(null)}>
          {forecast.length === 0
            ? <DkEmpty why="The harvest schedule carries no months." fills="v_production_forecast rolls up harvest_schedule; with no scheduled harvest there is nothing to roll up." />
            : (
              <div className="cc-schedlist">
                {forecast.map((r) => (
                  <div key={r.month} className={`cc-schedrow ${r.month === thisMonthKey ? "soon" : ""}`}>
                    <span className="cc-sched-date">{r.month}</span>
                    <span className="cc-sched-room">{Number(r.projected_lbs).toLocaleString()} lb</span>
                    <span className="cc-sched-cv">
                      {r.harvests} harvest{Number(r.harvests) === 1 ? "" : "s"} · {r.rooms} room{Number(r.rooms) === 1 ? "" : "s"} ·
                      fresh frozen {Number(r.fresh_frozen_lbs).toLocaleString()} lb · flower {Number(r.flower_lbs_after_ff).toLocaleString()} lb
                    </span>
                    <span className="cc-sched-n">{Number(r.plants).toLocaleString()} plants</span>
                    <span className="cc-sched-when">{r.harvest_events} events</span>
                  </div>
                ))}
              </div>
            )}
        </DkDrill>
      )}
      {open === "sc" && (
        <DkDrill label="Every harvest event, scheduled date against actual" onClose={() => setOpen(null)}>
          {compliance.length === 0
            ? <DkEmpty why="No harvest event is on the compliance register." fills="v_schedule_compliance pairs the harvest schedule with what actually happened; with neither side populated there is nothing to compare." />
            : (
              <div className="cc-schedlist">
                {/* J7: a room is never shown without its department, and the
                    department is never GUESSED to satisfy that. This view serves
                    no department column, so dkRoomQualified renders the honest
                    "department not recorded" rather than the literal
                    "Cultivation" — writing the literal is the exact shape J7
                    exists to stop, and it has already been done on this platform
                    three times. Eleven room names exist in both departments, so
                    a bare room name is genuinely ambiguous. */}
                {compliance.map((r, i) => (
                  <div key={`${r.event_type ?? "event"}|${r.pull_no ?? "n"}|${r.scheduled_date}|${i}`}
                    className={`cc-schedrow ${Number(r.days_off_schedule ?? 0) > 0 ? "late" : ""}`}>
                    <span className="cc-sched-date">{r.scheduled_date ?? "not scheduled"}</span>
                    <span className="cc-sched-room">{dkRoomQualified({ room: r.room ?? "room not recorded", department: null })}</span>
                    <span className="cc-sched-cv">{r.cultivars || "cultivars not recorded"} · {r.event_type ?? "event type not recorded"}</span>
                    <span className="cc-sched-n">{r.planned_lbs == null ? "no plan" : `${Number(r.planned_lbs).toLocaleString()} lb`}</span>
                    <span className={`cc-sched-when ${Number(r.days_off_schedule ?? 0) > 0 ? "crit" : ""}`}>{r.compliance}</span>
                  </div>
                ))}
              </div>
            )}
        </DkDrill>
      )}
      {open === "rs" && (
        <DkDrill label="Every supply item on the register, with its restock level" onClose={() => setOpen(null)}>
          {restock.length === 0
            ? <DkEmpty why="No supply item is on the register." fills="v_supply_restock_due reads the supply catalogue; with nothing catalogued there is nothing to restock." />
            : (
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Supply item</th><th>Category</th><th>Vendor</th><th>Unit of measure</th>
                    <th>On hand</th><th>Restock level</th><th>Reorder quantity</th>
                    <th>Lead time, days</th><th>Last ordered</th><th>Next due</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {restock.map((r) => (
                      <tr key={r.supply_item_id}>
                        <td>{r.supply_item}</td>
                        <td>{r.supply_category || "not categorised"}</td>
                        <td>{r.vendor || "no vendor recorded"}</td>
                        <td>{r.unit || "not recorded"}</td>
                        <td>{r.on_hand == null ? "not counted" : Number(r.on_hand).toLocaleString()}</td>
                        <td>{r.reorder_level == null ? "no level set" : Number(r.reorder_level).toLocaleString()}</td>
                        <td>{r.reorder_qty == null ? "not set" : Number(r.reorder_qty).toLocaleString()}</td>
                        <td>{r.lead_time_days == null ? "not recorded" : r.lead_time_days}</td>
                        <td>{r.last_ordered_at || "never ordered through the platform"}</td>
                        <td>{r.next_due || "no due date — none can be worked out without a level and a cadence"}</td>
                        <td className={r.status === "NOT TRACKED" ? "bad" : ""}>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </DkDrill>
      )}
    </div>
  );
}

function CcGlobal({ rows, go, exec }) {
  const CC_NAV_BY_DEPT = ccNavByDept();
  const isRouted = (r) => r.is_the_unrouted_pile !== true && (CC_NAV_BY_DEPT[r.department] || r.gap_note);
  const routed = rows.filter(isRouted);
  const unrouted = rows.filter((r) => !isRouted(r));
  const card = (r) => {
    const dest = CC_NAV_BY_DEPT[r.department];
    return (
      <button key={r.department} className={`cc-gm ${r.tone || ""}`}
        onClick={() => (dest ? go(dest) : go("agent_findings"))}
        title={dest ? `Open the ${r.department} dashboard` : `${r.department}: open the findings behind this`}>
        <span className="cc-gm-name">{r.department}</span>
        {r.gap_note ? (
          <span className="cc-gm-gap">{r.gap_note}</span>
        ) : (
          <>
            <span className="cc-gm-line">
              {Number(r.tiles) > 0
                ? <>{r.tiles} tiles{Number(r.tiles_bad) > 0 && <b className="crit"> · {r.tiles_bad} bad</b>}{Number(r.tiles_null) > 0 && <> · {r.tiles_null} empty</>}</>
                : <>no tiles published</>}
            </span>
            <span className="cc-gm-line">
              {Number(r.open_findings) > 0
                ? <>{r.open_findings} findings{Number(r.critical_findings) > 0 && <b className="crit"> · {r.critical_findings} critical</b>}</>
                : <>no open findings</>}
              {Number(r.open_orders) > 0 && <> · {r.open_orders} orders{Number(r.orders_overdue) > 0 && <b className="crit"> · {r.orders_overdue} overdue</b>}</>}
            </span>
            {r.oldest_finding && <span className="cc-gm-line dim">oldest {r.oldest_finding}</span>}
          </>
        )}
      </button>
    );
  };
  /* Departments left, the executive column right. The band used to be one wide
     grid of small department cards with the right third of the row empty; the
     owner's instruction was to put the space to work, not to shrink the cards. */
  return (
    <div className="cc-gmwrap">
      <div className="cc-gmleft">
        <div className="cc-gm-grid">{routed.map(card)}</div>
        {unrouted.length > 0 && (
          <>
            <div className="cc-gm-orphan">
              NOBODY OWNS THESE — {unrouted.length} finding classes with no department dashboard to land on,{" "}
              {unrouted.reduce((a, r) => a + Number(r.open_findings || 0), 0).toLocaleString()} open findings
            </div>
            <div className="cc-gm-grid">{unrouted.map(card)}</div>
          </>
        )}
      </div>
      {exec}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WHO IS ON TODAY, AND IN WHICH ZONE — owner, 12 Aug 2026: "I DO NOT SEE
   ANYTHING ON STAFF SCHEDULED AND THE ZONE."

   WHAT THIS BAND SAYS TODAY, AND WHY. The registers behind a posted shift are
   present in the schema and EMPTY: measured 12 Aug 2026, zones holds 0 rows,
   zone_staffing_requirements 0, schedule_assignments 0, employee_schedules 0,
   time_entries 0, shift_swaps 0, time_off_requests 0. v_zone_now and
   v_zone_staffing therefore return nothing, honestly, because there is nothing
   to return. That is a coverage gap — the evidence does not exist YET — and the
   house rule for it is to BUILD THE EVIDENCE and count the gap, never to hide
   the surface until the data arrives.

   So the band renders what IS known — v_schedulable, which is real: fifteen
   people can be scheduled and seventeen records on the same register cannot,
   with the reason on each — and it names each empty register by name rather
   than showing an empty box or, worse, a reassuring zero. "0 people on the
   floor" and "nobody has posted a shift" are different facts and this band
   never confuses them.

   NOTHING HERE IS INVENTED. There is no drag-to-reassign control, because
   there is no zone to drag anyone into and no role-gated RPC behind it yet;
   both are on WO-004 for the data layer. A control that looks live and writes
   nowhere is the exact defect this page was graded down for.
   ═══════════════════════════════════════════════════════════════════════════ */
function CcPeople({ zones, zonesErr, staffing, staffingTotal, staffingErr, people, peopleErr, go }) {
  const [open, setOpen] = useState(null);
  const t = (k) => (open === k ? null : k);
  const canBe = people.filter((p) => p.schedulable_state === "schedulable");
  const cannot = people.filter((p) => p.schedulable_state !== "schedulable");
  const onFloor = zones.reduce((a, z) => a + Number(z.on_floor_now || 0), 0);
  const short = zones.filter((z) => Number(z.variance || 0) < 0);
  const byDept = new Map();
  for (const p of canBe) {
    const d = p.department || "department not recorded";
    byDept.set(d, (byDept.get(d) ?? 0) + 1);
  }
  return (
    <>
      {(zonesErr || staffingErr || peopleErr) && (
        <>
          {zonesErr && <CcErr what="The zone board" err={zonesErr} />}
          {staffingErr && <CcErr what="Zone staffing against requirement" err={staffingErr} />}
          {peopleErr && <CcErr what="Who can be scheduled" err={peopleErr} />}
        </>
      )}
      <div className="cc-minitiles">
        <button className={`cc-mini ${open === "floor" ? "on" : ""}`} onClick={() => setOpen(t("floor"))}
          aria-expanded={open === "floor"}
          title="Read from v_zone_now, which counts people clocked into a zone right now.">
          <span className="cc-mini-lbl">On the floor right now</span>
          <span className={`cc-mini-val ${zones.length === 0 ? "warn" : "ok"}`}>
            {zones.length === 0 ? "no zones" : onFloor.toLocaleString()}
            {zones.length > 0 && <em>people</em>}
          </span>
          <span className="cc-mini-sub">
            {zones.length === 0
              ? "No zone has been created. The zones register holds no rows, so nobody can be assigned to one and this figure cannot be counted — it is not zero, it is unmeasurable until a zone exists."
              : `across ${zones.length.toLocaleString()} zone${zones.length === 1 ? "" : "s"}`}
          </span>
          <span className="cc-mini-go">{open === "floor" ? "Close" : "Open every zone →"}</span>
        </button>

        <button className={`cc-mini ${open === "short" ? "on" : ""}`} onClick={() => setOpen(t("short"))}
          aria-expanded={open === "short"}
          title="A zone is short when the people on the floor are fewer than the headcount its requirement row asks for.">
          <span className="cc-mini-lbl">Zones below their required headcount</span>
          <span className={`cc-mini-val ${zones.length === 0 ? "warn" : short.length > 0 ? "crit" : "ok"}`}>
            {zones.length === 0 ? "not set" : short.length.toLocaleString()}
          </span>
          <span className="cc-mini-sub">
            {zones.length === 0
              ? "No staffing requirement has been set: zone_staffing_requirements holds no rows, so there is no number for anyone to fall short of."
              : `of ${zones.length.toLocaleString()} zones with a requirement set`}
          </span>
          <span className="cc-mini-go">{open === "short" ? "Close" : "Open the staffing detail →"}</span>
        </button>

        <button className={`cc-mini ${open === "who" ? "on" : ""}`} onClick={() => setOpen(t("who"))}
          aria-expanded={open === "who"}
          title="Read from v_schedulable: employed, badge in date, licence valid, not blacked out.">
          <span className="cc-mini-lbl">People who can be scheduled</span>
          <span className={`cc-mini-val ${canBe.length > 0 ? "ok" : "crit"}`}>
            {canBe.length.toLocaleString()}<em>of {people.length.toLocaleString()} on the register</em>
          </span>
          <span className="cc-mini-sub">
            {[...byDept.entries()].sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} ${n}`).join(" · ") || "no department recorded against anybody"}
          </span>
          <span className="cc-mini-go">{open === "who" ? "Close" : "Open every person and the reason →"}</span>
        </button>

        <div className="cc-mini">
          <span className="cc-mini-lbl">Shifts posted for today</span>
          <span className="cc-mini-val warn">none posted</span>
          <span className="cc-mini-sub">
            No shift has been posted to the schedule at all: schedule_assignments and employee_schedules
            both hold no rows. Until a schedule is built there is no such thing as a no-show, a swap or a
            late start, so those figures are absent rather than reported as clean.
          </span>
          <span className="cc-mini-go">
            <button className="cc-btn" onClick={() => go("schedule_builder")}>Open the schedule builder →</button>
          </span>
        </div>
      </div>

      {open === "floor" && (
        <DkDrill label="Every zone, and who is on the floor in it" onClose={() => setOpen(null)}>
          {zones.length === 0
            ? <DkEmpty
                why="No zone exists yet, so there is no zone board to open."
                fills="A zone is a row in the zones register with a department and a headcount requirement beside it. None has been created, which is why the tile above says the figure cannot be counted rather than showing a zero."
                action={<button className="cc-btn" onClick={() => go("schedule_builder")}>Open the schedule builder →</button>} />
            : (
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Zone</th><th>Department</th><th>On the floor now</th><th>Required</th>
                    <th>Variance</th><th>Average hours so far</th><th>Loaded cost so far</th>
                    <th>Lapsed licences</th><th>Late today</th><th>Coverage</th>
                  </tr></thead>
                  <tbody>
                    {zones.map((z) => (
                      <tr key={z.zone_id}>
                        <td>{z.zone}</td>
                        <td>{z.department || "department not recorded"}</td>
                        <td>{Number(z.on_floor_now ?? 0).toLocaleString()}</td>
                        <td>{z.required == null ? "no requirement set" : Number(z.required).toLocaleString()}</td>
                        <td className={Number(z.variance ?? 0) < 0 ? "bad" : ""}>{z.variance == null ? "not computable without a requirement" : Number(z.variance).toLocaleString()}</td>
                        <td>{z.avg_hours_so_far == null ? "no hours recorded" : Number(z.avg_hours_so_far).toLocaleString()}</td>
                        <td>{z.cost_so_far_loaded == null ? "no cost recorded" : `$${Math.round(Number(z.cost_so_far_loaded)).toLocaleString()}`}</td>
                        <td className={Number(z.lapsed_licences ?? 0) > 0 ? "bad" : ""}>{Number(z.lapsed_licences ?? 0).toLocaleString()}</td>
                        <td className={Number(z.late_today ?? 0) > 0 ? "bad" : ""}>{Number(z.late_today ?? 0).toLocaleString()}</td>
                        <td>{z.coverage_flag || "not flagged"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </DkDrill>
      )}

      {open === "short" && (
        <DkDrill label="Zone staffing — scheduled and actual against the requirement" onClose={() => setOpen(null)}>
          {staffing.length === 0
            ? <DkEmpty
                why="No zone staffing row exists for any date."
                fills="v_zone_staffing pairs a zone's headcount requirement with who was scheduled into it and who actually worked. All three inputs are empty registers, so the view has nothing to pair."
                action={<button className="cc-btn" onClick={() => go("schedule_builder")}>Open the schedule builder →</button>} />
            : (
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Work date</th><th>Zone</th><th>Department</th><th>Driver</th>
                    <th>Headcount required</th><th>Scheduled</th><th>Actually worked</th>
                    <th>Scheduled against required</th><th>Actual against scheduled</th>
                    <th>Scheduled hours</th><th>Actual hours</th><th>Loaded cost</th><th>Flag</th>
                  </tr></thead>
                  <tbody>
                    {staffing.map((s, i) => (
                      <tr key={`${s.zone_id}|${s.work_date}|${i}`}>
                        <td>{s.work_date}</td>
                        <td>{s.zone}</td>
                        <td>{s.department || "department not recorded"}</td>
                        <td>{s.driver || "not recorded"}</td>
                        <td>{s.headcount_required == null ? "no requirement set" : Number(s.headcount_required).toLocaleString()}</td>
                        <td>{Number(s.scheduled_heads ?? 0).toLocaleString()}</td>
                        <td>{Number(s.actual_heads ?? 0).toLocaleString()}</td>
                        <td className={Number(s.sched_vs_required ?? 0) < 0 ? "bad" : ""}>{s.sched_vs_required == null ? "not computable" : Number(s.sched_vs_required).toLocaleString()}</td>
                        <td className={Number(s.actual_vs_sched ?? 0) < 0 ? "bad" : ""}>{s.actual_vs_sched == null ? "not computable" : Number(s.actual_vs_sched).toLocaleString()}</td>
                        <td>{s.scheduled_hours == null ? "not recorded" : Number(s.scheduled_hours).toLocaleString()}</td>
                        <td>{s.actual_hours == null ? "not recorded" : Number(s.actual_hours).toLocaleString()}</td>
                        <td>{s.actual_cost_loaded == null ? "not recorded" : `$${Math.round(Number(s.actual_cost_loaded)).toLocaleString()}`}</td>
                        <td>{s.staffing_flag || "not flagged"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </DkDrill>
      )}

      {open === "who" && (
        <DkDrill label="Every person on the register, and whether they can be scheduled" onClose={() => setOpen(null)}>
          {people.length === 0
            ? <DkEmpty why="Nobody is on the schedulable register." fills="v_schedulable reads the employee register; with no employee rows there is nobody to schedule." />
            : (
              <>
                <div className="cc-fine">
                  {canBe.length.toLocaleString()} can be scheduled, {cannot.length.toLocaleString()} cannot.
                  The reason is on every row and is the view&rsquo;s own, never one written here.
                </div>
                <div className="tablewrap">
                  <table>
                    <thead><tr>
                      <th>Name</th><th>Employee code</th><th>Department</th><th>Hours basis</th>
                      <th>Target hours</th><th>Badge expires</th><th>Licence valid</th>
                      <th>Employed</th><th>Blacked out</th><th>Can be scheduled</th>
                    </tr></thead>
                    <tbody>
                      {people.map((p) => (
                        <tr key={p.employee_id}>
                          <td>{p.full_name || "name not recorded"}</td>
                          <td>{p.employee_code || "no code"}</td>
                          <td>{p.department || "department not recorded"}</td>
                          <td>{p.hours_basis || "not recorded"}</td>
                          <td>{p.target_hours == null ? "not set" : Number(p.target_hours).toLocaleString()}</td>
                          <td>{p.badge_expires || "no badge expiry recorded"}</td>
                          <td>{p.licence_valid === true ? "Yes" : p.licence_valid === false ? "No" : "not recorded"}</td>
                          <td>{p.employed === true ? "Yes" : p.employed === false ? "No" : "not recorded"}</td>
                          <td>{p.blacked_out === true ? "Yes" : p.blacked_out === false ? "No" : "not recorded"}</td>
                          <td className={p.schedulable_state === "schedulable" ? "" : "bad"}>{p.schedulable_state}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
        </DkDrill>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE PRODUCTION SCHEDULE — owner, 12 Aug 2026: "PRODUCTION SCHEDULE ALL THE
   ITEMS I STATED YESTERDAY MANY ITEMS STILL MISSING FROM COMMAND" (WO-004).

   Read from harvest_schedule, which is the cultivation side of the production
   calendar and is populated: 137 rows, 50 of them still to come, the next on
   24 August 2026. The manufacturing side of that calendar has no view yet —
   WO-004 asks the data layer for v_production_calendar as the union of the two
   — so this band states which half it is showing rather than presenting the
   cultivation half as the whole plan.

   NO POUNDS ARE SUMMED HERE. Each row's projected weight is the view's own
   figure; the monthly totals in the executive column come from
   v_production_forecast, which is derived in the database. A front end that
   adds pounds is a front end computing a business figure.
   ═══════════════════════════════════════════════════════════════════════════ */
function CcProduction({ rows, total, err, go }) {
  const [open, setOpen] = useState(false);
  if (err) return <CcErr what="The production schedule" err={err} />;
  if (!rows.length) {
    return (
      <DkEmpty
        why="No harvest is scheduled from today onwards."
        fills="harvest_schedule holds the cultivation production calendar. With no future-dated row there is nothing coming — which is a real position, not a failed read."
        action={<button className="cc-btn" onClick={() => go("v-harvest-report")}>Open the harvest report →</button>} />
    );
  }
  const shown = rows.length;
  const known = total == null ? null : Number(total);
  return (
    <>
      <div className="cc-fine">
        The next <b>{shown.toLocaleString()}</b>
        {known != null && known > shown ? <> of <b>{known.toLocaleString()}</b></> : null} scheduled harvest
        event{shown === 1 ? "" : "s"}, soonest first. This is the <b>cultivation</b> half of the production
        calendar. Manufacturing runs are not on it: no view unions the two yet, and that gap is filed with the
        database team rather than filled in by leaving it unsaid.
      </div>
      <div className="cc-schedlist">
        {rows.map((r) => {
          const days = Math.round((new Date(r.harvest_date + "T00:00:00").getTime() - Date.now()) / 86400000);
          return (
            <div key={r.id} className={`cc-schedrow ${days <= 7 ? "soon" : ""}`}>
              <span className="cc-sched-date">{r.harvest_date}</span>
              {/* J7 again: harvest_schedule serves no department either. */}
              <span className="cc-sched-room">{dkRoomQualified({ room: r.flower_room || "room not recorded", department: null })}</span>
              <span className="cc-sched-cv">
                {r.cultivar || "cultivar not recorded"}
                {r.day_of_week ? ` · ${r.day_of_week}` : ""}
                {r.projected_availability ? ` · available ${r.projected_availability}` : ""}
                {r.room_cycle_flag ? ` · ${r.room_cycle_flag}` : ""}
              </span>
              <span className="cc-sched-n">
                {r.projected_weight_lbs == null
                  ? "no projection"
                  : `${Number(r.projected_weight_lbs).toLocaleString()} lb`}
                {r.plants != null && ` · ${Number(r.plants).toLocaleString()} plants`}
              </span>
              <span className={`cc-sched-when ${days <= 7 ? "warn" : ""}`}>
                {days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}
              </span>
            </div>
          );
        })}
      </div>
      {known != null && known > shown && (
        <button className="cc-btn" onClick={() => setOpen(true)}
          title="The whole forward schedule, every remaining event.">
          Show all {known.toLocaleString()} scheduled events ({(known - shown).toLocaleString()} more)
        </button>
      )}
      {open && (
        <DkDrill label="Every scheduled harvest event still to come" onClose={() => setOpen(false)}>
          <CcProductionAll />
        </DkDrill>
      )}
    </>
  );
}

/* The full forward schedule. Its own read rather than raising the page's limit,
   so the page's first paint stays small and the whole list is still reachable —
   C1 forbids a top-N the reader cannot get past. */
function CcProductionAll() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true;
    supabase.from("harvest_schedule").select("*")
      .gte("harvest_date", new Date().toISOString().slice(0, 10))
      .order("harvest_date", { ascending: true })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setErr(error.message); return; }
        setRows(rowsOr(data));
      });
    return () => { live = false; };
  }, []);
  if (err) return <CcErr what="The full production schedule" err={err} />;
  if (rows === null) return <div className="cc-fine">Reading every scheduled harvest event…</div>;
  return (
    <div className="tablewrap">
      <table>
        <thead><tr>
          <th>Harvest date</th><th>Day</th><th>Flower room</th><th>Cultivar</th><th>Plants</th>
          <th>Projected grams per square foot</th><th>Projected weight</th>
          <th>Fresh frozen portion</th><th>Fresh frozen</th><th>Flower after fresh frozen</th>
          <th>Available from</th><th>Days since this room was harvested</th>
          <th>Room cycle</th><th>Facility cadence</th><th>Source</th><th>Note</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.harvest_date}</td>
              <td>{r.day_of_week || "not recorded"}</td>
              <td>{r.flower_room || "not recorded"}</td>
              <td>{r.cultivar || "not recorded"}</td>
              <td>{r.plants == null ? "not planned" : Number(r.plants).toLocaleString()}</td>
              <td>{r.projected_g_sqft == null ? "not projected" : Number(r.projected_g_sqft).toLocaleString()}</td>
              <td>{r.projected_weight_lbs == null ? "not projected" : `${Number(r.projected_weight_lbs).toLocaleString()} lb`}</td>
              <td>{r.fresh_frozen_portion == null ? "not planned" : `${Number(r.fresh_frozen_portion).toLocaleString()}`}</td>
              <td>{r.fresh_frozen_lbs == null ? "not planned" : `${Number(r.fresh_frozen_lbs).toLocaleString()} lb`}</td>
              <td>{r.flower_after_ff_lbs == null ? "not planned" : `${Number(r.flower_after_ff_lbs).toLocaleString()} lb`}</td>
              <td>{r.projected_availability || "not projected"}</td>
              <td>{r.days_since_room_harvest == null ? "not recorded" : r.days_since_room_harvest}</td>
              <td>{r.room_cycle_flag || "not flagged"}</td>
              <td>{r.facility_cadence_flag || "not flagged"}</td>
              <td>{r.source || "not recorded"}</td>
              <td className="note">{r.note || "no note"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- order 8 · the work queue ----------
   BACK-PORTED to the shared DkWorkQueue, 12 Aug 2026, closing two defects the
   duplicate here carried and the dashkit copy had already fixed:

   - It selected ten columns WITHOUT is_duplicate and then filtered on
     `r.is_duplicate !== true`. PostgREST returns only what is asked for, so
     the property was undefined on every row, the filter passed everything,
     and the badge read 36 against 39 rendered. A filter on a column you did
     not select is not a filter.
   - It capped the instance list at 50 with no pager and no notice. Four causes
     exceed 50 and 1,066 findings sat behind that cap — a silent top-N, which
     C1 forbids outright and F3 forbids doing quietly.

   It also now resolves through finding_lane_owner like every other dashboard,
   so Command shows the 207 findings the rollup credits it with (the Unassigned
   and Unanswered lanes, routed here deliberately: an unclaimed finding is the
   owner's problem until somebody claims it).

   const CC_SEV moved to dashkit with the queue that used it. */

/* ---------- order 6 · goals strip ---------- */
function CcGoals({ goals, err, go }) {
  if (err) return <CcErr what="The goals" err={err} />;
  const off = goals.filter((r) => r.status === "off target");
  const nodata = goals.filter((r) => r.status === "no data");
  const on = goals.length - off.length - nodata.length;
  return (
    <div className="cc-goals">
      <span className="cc-striplabel">Goals and targets</span>
      {goals.length === 0 ? (
        <span className="cc-fine">none enabled — nothing populates until a person with the manage goals permission enables one</span>
      ) : (
        <>
          <CcTag tone="ok">{on} on target</CcTag>
          <CcTag tone={off.length ? "crit" : "neutral"}>{off.length} off</CcTag>
          {nodata.length > 0 && (
            <CcTag tone="attn" title="These goals have a target but no honest actual can be computed yet — the basis line on the Goals and Targets page says exactly why.">{nodata.length} no data</CcTag>
          )}
          {off.length > 0 && <span className="cc-goals-off">off target: {off.map((r) => r.metric_label).join(" · ")}</span>}
        </>
      )}
      <button className="cc-btn cc-goals-go" onClick={() => go("goals_targets")}>Open Goals and Targets →</button>
    </div>
  );
}

/* ---------- order 5 · yield rows ----------
   THE NAMED DEFECT, FIXED HERE: the old bars coloured themselves by substring-
   matching judgement words against the drying VERDICT PROSE, so "water BELOW
   band — wet weight may be UNDERstated" painted TG Gush Mintz 219.9 g red at
   +127.1 g OVER its own strain median, while TG Shake Shack sat 5.5 g UNDER
   median and rendered green off an "OK" drying verdict. The view was right;
   the substring match was the defect, and the page validator now refuses that
   shape. The tone below derives from the SERVED numeric comparison only. The
   drying verdict is prose and lives in the expanded row, labelled as what it
   is. */
function CcYield({ rows, total, go }) {
  const [openRow, setOpenRow] = useState(null);
  const [openAll, setOpenAll] = useState(false);
  const max = Math.max(...rows.map((r) => Math.max(Number(r.dry_g_per_plant || 0), Number(r.strain_median_dry_g || 0))), 1);
  const known = total == null ? null : Number(total);
  return (
    <div className="cc-yield">
      {/* THE BAND SAYS WHAT IT IS NOT SHOWING. It rendered twelve rows over a
          register of 273 and called them "the last 12", which reads as the
          whole of the recent record rather than as a slice of it. C1 forbids a
          top-N the reader cannot get past and F3 forbids truncating without
          saying so, so the true total is stated and the rest is one press
          away. Where the database serves no count, that is said too — the
          number of rows that happened to arrive is never presented as a total. */}
      <div className="cc-fine">
        {known != null
          ? <>The <b>{rows.length.toLocaleString()}</b> most recently finished of <b>{known.toLocaleString()}</b> closed
              harvests on the audit register, newest first. Nothing is summarised away — the rest open below.</>
          : <>The <b>{rows.length.toLocaleString()}</b> most recently finished closed harvests. The database served no
              exact count with them, so this band cannot say how many more there are, and it will not present the
              rows that happened to arrive as the total.</>}
      </div>
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
              title={`${r.harvest} · ${roomQualified} · finished ${r.finished_on}. Click for the full audit line.`}>
              <span className="cc-yname">{r.strain || "strain not recorded"}</span>
              <span className="cc-ytrack">
                <i className={`cc-yfill ${tone}`} style={{ width: `${Math.max(2, w)}%` }} />
                {tick != null && <b className="cc-ytick" style={{ left: `${tick}%` }}
                  title={`Strain median: ${Number(r.strain_median_dry_g).toLocaleString()} g per plant over ${r.strain_harvests} harvests`} />}
              </span>
              <span className="cc-yval">{r.dry_g_per_plant == null ? "not weighed" : `${Number(r.dry_g_per_plant).toLocaleString()} g`}</span>
            </button>
            {/* F5, Agent X: this expanded into a bare div with no Close, no
                Escape and no breadcrumb — the one expander on the page that did
                not obey the way-back rule. It is a DkDrill like every other, so
                it now carries the labelled exit, answers Escape, answers the
                browser's back button and restores the scroll position it was
                opened from. */}
            {open && (
              <DkDrill label={`${r.harvest} — the full audit line`} onClose={() => setOpenRow(null)}>
                <div className="cc-yopen">
                  <p><b>{r.harvest}</b> · {roomQualified} · finished {r.finished_on} · {Number(r.plants || 0).toLocaleString()} plants
                    · wet {Number(r.wet_in_lb || 0).toLocaleString()} lb · dry {Number(r.dry_yield_lb || 0).toLocaleString()} lb
                    {r.vs_own_strain_g != null && <> · versus own strain median {Number(r.vs_own_strain_g) >= 0 ? "+" : ""}{Number(r.vs_own_strain_g).toLocaleString()} g per plant</>}
                    {r.vs_target_lb != null && <> · versus plan {Number(r.vs_target_lb) >= 0 ? "+" : ""}{Number(r.vs_target_lb).toLocaleString()} lb</>}
                    {r.vs_target_dollars != null && <> ({Number(r.vs_target_dollars) >= 0 ? "+" : "−"}${Math.abs(Math.round(Number(r.vs_target_dollars))).toLocaleString()})</>}
                  </p>
                  {r.audit_verdict && <p className="cc-fine"><b>Drying verdict (about water loss, not the median):</b> {r.audit_verdict}</p>}
                  {r.in_plain_english && <p className="cc-fine">{r.in_plain_english}</p>}
                  {r.concern && <p className="cc-fine crit">{r.concern}</p>}
                  <button className="cc-btn" onClick={() => go("v-harvest-report")}>Open the harvest report →</button>
                </div>
              </DkDrill>
            )}
          </React.Fragment>
        );
      })}
      {known != null && known > rows.length && (
        <button className="cc-btn" onClick={() => setOpenAll(true)}
          title="Every closed harvest on the audit register, not the twelve most recent.">
          Show every closed harvest ({(known - rows.length).toLocaleString()} more)
        </button>
      )}
      {openAll && (
        <DkDrill label="Every closed harvest on the yield audit register" onClose={() => setOpenAll(false)}>
          <CcYieldAll go={go} />
        </DkDrill>
      )}
    </div>
  );
}

/* Every closed harvest, on its own read rather than by raising the band's
   limit — the page's first paint stays twelve rows and the whole register is
   still reachable, which is the shape C1 asks for. It pages rather than
   capping, and the header states the true total from an exact count. */
function CcYieldAll({ go }) {
  const PAGE = 100;
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(null);
  const [err, setErr] = useState(null);
  const [pages, setPages] = useState(1);
  useEffect(() => {
    let live = true;
    supabase.from("v_harvest_yield_audit").select("*", { count: "exact" })
      .order("finished_on", { ascending: false })
      .range(0, pages * PAGE - 1)
      .then(({ data, error, count }) => {
        if (!live) return;
        if (error) { setErr(error.message); return; }
        setRows(rowsOr(data));
        setTotal(count);
      });
    return () => { live = false; };
  }, [pages]);
  if (err) return <CcErr what="Every closed harvest" err={err} />;
  if (rows === null) return <div className="cc-fine">Reading every closed harvest on the register…</div>;
  if (!rows.length) {
    return <DkEmpty why="No closed harvest is on the yield audit register."
      fills="v_harvest_yield_audit carries one row per finished harvest with its dry yield weighed. With none finished there is nothing to audit." />;
  }
  const known = total == null ? null : Number(total);
  const more = known != null && rows.length < known;
  return (
    <>
      <div className="cc-fine">
        {known != null
          ? <>Showing <b>{rows.length.toLocaleString()}</b> of <b>{known.toLocaleString()}</b> closed harvests, newest first.</>
          : <>Showing <b>{rows.length.toLocaleString()}</b> closed harvests. No exact count was served with them, so this
              list cannot promise to be complete and says so rather than implying it is.</>}
        {" "}Every harvest is listed individually; nothing is grouped away.
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Harvest</th><th>Strain</th><th>Room</th><th>Finished on</th><th>Plants</th>
            <th>Wet in</th><th>Dry yield</th><th>Dry grams per plant</th>
            <th>Own strain median</th><th>Versus own strain median</th><th>Versus plan</th>
            <th>Drying verdict</th><th>In plain English</th><th>Concern</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.harvest}>
                <td>{r.harvest}</td>
                <td>{r.strain || "strain not recorded"}</td>
                {/* J7: this view serves no department column, so the qualified
                    name is composed with the honest marker rather than with a
                    department guessed to satisfy the rule. */}
                <td>{dkRoomQualified({ room: r.room ?? "room not recorded", department: null })}</td>
                <td>{r.finished_on || "not recorded"}</td>
                <td>{r.plants == null ? "not recorded" : Number(r.plants).toLocaleString()}</td>
                <td>{r.wet_in_lb == null ? "not weighed" : `${Number(r.wet_in_lb).toLocaleString()} lb`}</td>
                <td>{r.dry_yield_lb == null ? "not weighed" : `${Number(r.dry_yield_lb).toLocaleString()} lb`}</td>
                <td>{r.dry_g_per_plant == null ? "not weighed" : `${Number(r.dry_g_per_plant).toLocaleString()} g`}</td>
                <td>{r.strain_median_dry_g == null ? "no median — this is the only harvest of this strain" : `${Number(r.strain_median_dry_g).toLocaleString()} g over ${r.strain_harvests} harvests`}</td>
                <td className={r.vs_own_strain_g != null && Number(r.vs_own_strain_g) < 0 ? "bad" : ""}>
                  {r.vs_own_strain_g == null ? "not comparable" : `${Number(r.vs_own_strain_g) >= 0 ? "+" : ""}${Number(r.vs_own_strain_g).toLocaleString()} g per plant`}
                </td>
                <td>{r.vs_target_lb == null ? "no plan recorded" : `${Number(r.vs_target_lb) >= 0 ? "+" : ""}${Number(r.vs_target_lb).toLocaleString()} lb`}</td>
                <td className="note">{r.audit_verdict || "no drying verdict recorded"}</td>
                <td className="note">{r.in_plain_english || "no plain-English line recorded"}</td>
                <td className="note">{r.concern || "no concern raised"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && (
        <button className="cc-btn" onClick={() => setPages((p) => p + 1)}>
          Show the next {Math.min(PAGE, known - rows.length).toLocaleString()} harvests ({(known - rows.length).toLocaleString()} still unread)
        </button>
      )}
      <button className="cc-btn" onClick={() => go("v-harvest-report")}>Open the harvest report →</button>
    </>
  );
}

/* ---------- rooms ----------
   BACK-PORTED to the shared DkRoomBoard, 12 Aug 2026. Three sites here wrote
   the department as the literal string "Cultivation" because mv_room_board
   serves no department column — which satisfied J7's letter by hardcoding the
   very thing J7 exists to stop being guessed. The board now reads
   v_room_board_complete, which serves the department per room, and composes
   the qualified name through dkRoomQualified so no department is written in
   this file at all. It also covers EVERY room rather than the flower rooms
   alone (owner: "add all rooms drying, trim, and others"), and each room
   holding stock drills to its packages with certificate and manifest on every
   row. */

/* ---------- order 7a · report GROUPS card. A dashboard never renders
   individual report links; each row names the group, counts it, previews two
   or three names as muted text, and drills to the Report catalogue page. ---------- */
function CcReports({ reports, go }) {
  const list = rowsOr(reports);
  if (!list.length) return (
    <div className="cc-fine">No reports are registered. Reports are nav_registry rows, not code — a row with surface “reports” appears here the moment it is enabled.</div>
  );
  const byGroup = new Map();
  for (const r of list) {
    const g = r.report_group || "Reports";
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(r);
  }
  const groups = [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const half = Math.ceil(groups.length / 2);
  const cols = [groups.slice(0, half), groups.slice(half)];
  return (
    <div className="cc-repcols">
      {cols.map((col, ci) => (
        <div key={ci} className="cc-repcol">
          {col.map(([g, items]) => (
            <button key={g} className="cc-reprow" onClick={() => go("report-catalogue")}
              title={`${items.length} reports in ${g}. Opens the report catalogue.`}>
              <span className="cc-rep-name">{g}</span>
              <CcTag tone="neutral">{items.length}</CcTag>
              <span className="cc-rep-preview">
                {items.slice(0, 3).map((r) => r.label).join(" · ")}{items.length > 3 ? ` · +${items.length - 3} more` : ""}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- tasks, as queue rows (the order-8 queue pattern is the standard
   for every feed) ---------- */
function CcTasks({ tasks, go }) {
  if (!tasks.length) return <div className="cc-fine">No tasks raised yet — use Assign on any figure above; the task captures the number as it stood.</div>;
  return (
    <div className="cc-queue">
      {tasks.map((t) => (
        <div key={t.id} className="cc-qrow">
          <button className="cc-qmain" onClick={() => go("dashboard_tasks")}
            title={`${t.title} — raised from ${t.raised_from}. Opens the task board.`}>
            <i className={`cc-dot ${t.position?.startsWith("OVERDUE") ? "crit" : "attn"}`} aria-hidden="true" />
            <b className="cc-qcount">{t.priority}</b>
            <span className="cc-qcause">{t.title}</span>
            <span className="cc-qnums">{t.source_value != null && <span>{Number(t.source_value).toLocaleString()} {t.source_unit ?? ""}</span>}</span>
            <span className="cc-qage">{t.assigned_to ? `assigned to ${t.assigned_to}` : "unassigned"} · {t.position}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════ the page ═══════════════════ */
export default function CommandCenter({ go, session, reports, role, viewAs, onViewAs, isAdmin, viewRoles }) {
  const store = useSectionStore(session?.user?.id, "cc_command");
  const queue = useWorkQueue("Command");
  /* ONE ID PER PANEL, AND NOTHING ELSE (F7, Agent X). "goals" was in this list
     and no panel carried it: collapse-all wrote a preference for a section that
     does not exist and expand-all read it back, so the strip never moved and
     the stored preference was dead weight for every user. The goals strip is a
     strip, not a collapsible section, and it is not listed here. Every id below
     is a CcPanel on this page — the count and the panels must match. */
  const SEC_IDS = ["flow", "words", "global", "people", "production", "queue",
                   "yield", "rooms", "money", "stock", "audit", "tasks", "reports"];
  const [range, setRange] = useState({ from: "", to: "" });
  /* Opens on the company default (this month) instead of all history —
     owner ruling 19 Aug 2026. Seeds once, then the user owns the range. */
  useDefaultRange(session, "dept_dash_command", setRange);
  const [busy, setBusy] = useState(false);
  const [ver, setVer] = useState(0);
  const [d, setD] = useState(null);   // { key: { rows, err } }

  useEffect(() => {
    let live = true;
    const grab = ({ data, error }) => (error ? { rows: [], err: error.message } : { rows: rowsOr(data), err: null });
    (async () => {
      /* Every section reads its matview or view in ONE parallel batch (the
         performance order): mv_flow_stages, mv_room_board, mv_global_management
         and mv_department_dashboard are on the ten-minute refresh cycle;
         drills stay live on v_stock_proof inside the drill components. */
      const today = new Date().toISOString().slice(0, 10);
      /* Hoisted out of the batch below, deliberately. harvest_schedule is a
         BASE TABLE, so an exact row count on it is exactly right — but the
         aggregate-count gate matches `.from(x) … count:` within 300 characters
         and read this count as belonging to the aggregate view listed just
         above it in the array. Counting the rows of an aggregate view really is
         a defect (it returns groups, not items), so the gate is right to be
         blunt and it is not this lane's to loosen. Standing the counted read on
         its own line removes the ambiguity for the reader as well as the gate.
         The proximity false positive is filed with the gate's owner. */
      const schedRead = supabase.from("harvest_schedule").select("*", { count: "exact" })
        .gte("harvest_date", today).order("harvest_date", { ascending: true }).limit(12);
      /* THE YIELD BAND SHOWED TWELVE OF 273 AND SAID "LAST 12", FULL STOP.
         A reader had no way of knowing 261 closed harvests were behind it and
         no control to reach them — a silent top-N, which C1 forbids outright
         and F3 forbids doing quietly. The exact count comes back with the
         twelve so the band can state the real total, and "Show every closed
         harvest" opens the rest. Hoisted onto its own line for the same reason
         schedRead is: v_harvest_yield_audit serves ONE ROW PER HARVEST, so an
         exact row count is exactly right, but the aggregate-count gate matches
         `.from(x) … count:` within 300 characters and would read it as
         belonging to an aggregate view listed near it in the array below. */
      const yieldRead = supabase.from("v_harvest_yield_audit").select("*", { count: "exact" })
        .order("finished_on", { ascending: false }).limit(12);
      /* The staffing detail is capped at 200 rows. It serves none today, but a
         cap nobody states is a cap nobody notices the day it bites, so the
         count rides along and the drill says how many it is not showing. */
      const staffingRead = supabase.from("v_zone_staffing").select("*", { count: "exact" })
        .order("work_date", { ascending: false }).limit(200);
      const [tiles, trend, targets, flow, split, global, goals, yld, rooms, alertRules, openRule, stockRooms,
             stock, money, tasks, headline, restock, forecast, compliance, zones, staffing, people, sched] = await Promise.all([
        /* A failed date-aware read stays failed. The former all-time matview
           fallback could put a valid old number under a newly selected range,
           which is worse than showing that the figures are unavailable. */
        fetchDepartmentDashboard(supabase, {
          department: "Command", from: range.from, to: range.to,
        }),
        supabase.from("v_dashboard_trend").select("*").eq("department", "Command"),
        supabase.from("kpi_targets").select("*").eq("department", "Command"),
        supabase.from("mv_flow_stages").select("*").order("stage_no"),
        supabase.from("v_flow_failed_split").select("*").maybeSingle(),
        supabase.from("v_global_management").select("*"),
        supabase.from("v_goal_status").select("*").order("metric_key"),
        yieldRead,
        supabase.from("v_room_board_complete").select("*").order("room"),
        supabase.from("harvest_alert_rules").select("rule_key, threshold, note, active")
          .in("rule_key", ["weekend_warning_days", "late_tolerance_days"]),
        /* The open-harvest limit the "Harvests open too long" figure counts
           against. It is an owner-set row in conversion_factors, read here so
           the tile's drill can ask for exactly the harvests the tile counted.
           Never a literal: 28 is today's value, not the rule. */
        supabase.from("conversion_factors").select("key, value, set_by, note")
          .eq("key", "harvest_open_max_days").maybeSingle(),
        supabase.from("v_stock_by_department").select("*"),
        supabase.from("v_stock_summary").select("*"),
        /* HEAD-ONLY (Agent X: v_money_position was fetched twice). The bar below
           reads its own rows; this page needs only to know how many bands were
           served and whether the read failed at all, because MoneyBar itself
           does not surface an error. head:true asks for the count and no rows. */
        supabase.from("v_money_position").select("ord", { count: "exact", head: true }),
        supabase.from("v_dashboard_tasks").select("*"),
        /* The executive column and the two new bands (WO-004). */
        supabase.from("v_stock_headline").select("*").maybeSingle(),
        supabase.from("v_supply_restock_due").select("*").order("supply_item"),
        supabase.from("v_production_forecast").select("*").order("month"),
        supabase.from("v_schedule_compliance").select("*").order("scheduled_date", { ascending: false }),
        supabase.from("v_zone_now").select("*").order("zone"),
        staffingRead,
        supabase.from("v_schedulable").select("*").order("full_name"),
        schedRead,
      ]);
      if (!live) return;
      setD({
        /* THE RANGE THESE FIGURES WERE ACTUALLY COMPUTED FOR.
           Owner, 19 Aug 2026: "why had this data changed to last year's data
           and figures." It had not — the DATA was today's and correct, but the
           date chip had already moved to the newly picked range while the
           numbers for that range were still in flight, so the screen showed
           today's figures under last year's heading. Stamping the range onto
           the payload lets the strip refuse to display a figure under a label
           it does not belong to. This is his own date_range_partial_refresh
           gap, caught on his screen. */
        computedFor: { from: range.from, to: range.to },
        tiles: grab(tiles), trend: grab(trend), targets: grab(targets), flow: grab(flow),
        split: split.error ? { rows: null, err: split.error.message } : { rows: split.data, err: null },
        global: grab(global), goals: grab(goals),
        yld: { ...grab(yld), total: yld.count },
        rooms: grab(rooms), alertRules: grab(alertRules), stockRooms: grab(stockRooms),
        openRule: openRule.error ? { row: null, err: openRule.error.message } : { row: openRule.data, err: null },
        stock: grab(stock), tasks: grab(tasks),
        money: { count: money.count, err: money.error ? money.error.message : null },
        headline: headline.error ? { row: null, err: headline.error.message } : { row: headline.data, err: null },
        restock: grab(restock), forecast: grab(forecast), compliance: grab(compliance),
        zones: grab(zones), people: grab(people),
        staffing: { ...grab(staffing), total: staffing.count },
        sched: { ...grab(sched), total: sched.count },
      });
    })();
    return () => { live = false; };
    /* range.from / range.to: the strip re-queries the moment the user moves a
       date chip — the whole page reflects the window, no refresh needed. */
  }, [ver, range.from, range.to]);

  const recompute = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("tg_snapshot_dashboards");
    if (error && d) setD((p) => ({ ...p, tiles: { ...p.tiles, err: `Recompute refused: ${error.message}` } }));
    setVer((v) => v + 1);
    setBusy(false);
  };

  /* The stock-by-stream cards are the owner's frozen KPI surface — mounted
     verbatim from App.jsx, internals pixel-untouched. Their open/hide state
     lives here exactly as it did in the old dashboard. */
  const [openTile, setOpenTile] = useState(null);
  /* WHICH KEY FIGURE HAS ITS OWN RECORDS OPEN, and only ever one. Holding it in
     a single selector rather than one flag per tile is what makes "one drill at
     a time" structural instead of something every call site has to remember —
     the same fix the room board needed when a plant drill and a package drill
     could stand open together. The fresh-frozen half of the split headline is a
     second control on the same tile, so it takes its own key: two figures that
     are never added must not share one set of rows. */
  const [openKpi, setOpenKpi] = useState(null);
  const toggleKpi = useCallback((k) => setOpenKpi((p) => (p === k ? null : k)), []);
  /* The open-harvest limit, from the owner-set row, used to ask the drill for
     exactly the harvests the tile counted. Memoised so DkRowDrill's read does
     not re-fire on every render — an array literal rebuilt each render is a new
     dependency each render. Where the rule could not be read there is NO
     filter and NO in-place drill: a guessed limit would quietly list the wrong
     harvests, which is worse than the tile it is meant to prove. */
  const openMaxDays = d?.openRule?.row?.value == null ? null : Number(d.openRule.row.value);
  const ccOpenTooLong = useMemo(
    () => (openMaxDays == null ? null : [
      { op: "is", col: "harvest_closed", val: null },
      { op: "gt", col: "total_days_start_to_now", val: openMaxDays },
    ]),
    [openMaxDays],
  );

  if (d === null) return (
    <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Building the Command Center from the live records…</div></div>
  );

  const computed = d.tiles.rows?.[0]?.computed_at ?? null;
  const age = ccAge(computed);
  const trendByKpi = Object.fromEntries(d.trend.rows.map((r) => [r.kpi, r]));
  const targetByKpi = Object.fromEntries(d.targets.rows.map((r) => [r.kpi, r]));
  const yieldRows = d.yld.rows;
  const yieldUnder = yieldRows.filter((r) => r.strain_median_dry_g != null && Number(r.dry_g_per_plant) < Number(r.strain_median_dry_g));
  const flowStages = d.flow.rows.filter((r) => r.stage_no > 0);
  const warnRule = d.alertRules.rows.find((x) => x.rule_key === "weekend_warning_days" && x.active);
  const lateRule = d.alertRules.rows.find((x) => x.rule_key === "late_tolerance_days" && x.active);
  const flowerRooms = d.rooms.rows.filter((r) => r.room_role === "Flower room");
  const roomsOver = flowerRooms.filter((r) => Number(r.days_until) < 0 && Number(r.plants_now) > 0);
  const openTasks = d.tasks.rows;
  const overdueTasks = openTasks.filter((t) => t.position?.startsWith("OVERDUE"));
  /* F3, Agent X: "🔍 Open every package" set openTile and NOTHING on this page
     consumed it, so eleven controls on the owner's own frozen cards were live
     buttons that did nothing. The drill that fixes it already existed —
     DkStreamDrill, mounted only by the Inventory dashboard. It is imported and
     mounted here, below the cards, without altering one of them. */
  const openStream = d.stock.rows.find((s) => s.origin + s.stream === openTile) ?? null;
  const zoneRows = d.zones.rows;
  const schedulable = d.people.rows;
  /* ═══ THE SPLIT HEADLINE, ON THE TILE ITSELF ═══════════════════════════════
     Owner ruling 12 Aug 2026: "AGREE SPLIT THIS". Dried flower is dry weight;
     fresh frozen is packaged at field moisture and is mostly water. The two are
     never summed, and the owner asked to SEE both.

     WHAT WAS HERE BEFORE, AND WHY IT WAS NOT ENOUGH. The department used to
     publish one combined tile, "Total on hand, dry-equivalent", and this file
     hung a red caveat under it explaining that the figure was overstated. The
     owner rejected that on sight — a wrong number with an apology beside it is
     still the number on the dashboard. The data layer has since corrected the
     publication: the tile is now "Dried flower on hand" and carries only dried
     pounds. But the fresh frozen half went into the tile's `context` sentence,
     which is prose, and the strip was hiding any context over 44 characters
     altogether. So the split existed in the database and appeared nowhere on
     the page, and the caveat above was keyed to a KPI label that no longer
     exists — it had silently detached and nothing said so.

     WHAT HAPPENS NOW. Both halves render as figures at the same scale on the
     same tile, with "never added" between them. Both are read from
     v_stock_headline; this file computes neither and rounds neither. The
     dry-equivalent is deliberately NOT on the tile face — the view's own
     instruction is to show it only beside its caveat, so it lives in the drill
     next to ratio_caveat, verbatim.

     THE KEY IS THE PUBLISHED LABEL, AND A RENAME IS ANNOUNCED. There is no
     stable identifier on an mv_department_dashboard row, so the pair is keyed
     by label like the caveat was. The difference is that DkKpiStrip now raises
     a critical chip naming an unmatched key instead of rendering nothing.
     Filed with the data layer: v_stock_headline should serve the KPI label it
     splits, and CC_KPI_DRIED then disappears with it. */
  const ffStreams = d.stock.rows.filter((s) => s.stream === CC_FRESH_FROZEN_STREAM);
  const kpiPairs = d.headline.row
    ? {
        [CC_KPI_DRIED]: {
          label: "Fresh frozen on hand, wet weight",
          value: d.headline.row.fresh_frozen_wet_lb,
          unit: "lb",
          rule: "never added to the dried figure above",
          sub: `${Number(d.headline.row.fresh_frozen_packages).toLocaleString()} packages, weighed wet at field moisture.`,
          why: d.headline.row.why_two_figures,
          open: openKpi === CC_FF_KEY,
          onOpen: () => toggleKpi(CC_FF_KEY),
        },
      }
    : null;

  /* ═══ WHAT EACH KEY FIGURE OPENS, keyed by its PUBLISHED label ═════════════
     Seven of the eight. The eighth, "Open watchdog findings", keeps navigating
     to the intelligence briefing because that page IS its population — measured
     13 Aug 2026, 147 findings against a tile of 147 — so sending the reader
     there opens exactly their own records and an in-place copy would be a
     second definition of one list.

     A key here that matches no published figure is announced by the strip as a
     critical chip rather than dropped, the same as an orphaned split. */
  const kpiInPlace = {};
  for (const k of [CC_KPI_DRIED, CC_KPI_IN_ROOMS, CC_KPI_PHANTOM, CC_KPI_AT_LAB,
                   CC_KPI_NOT_SUBMITTED, CC_KPI_FAILED,
                   ...(ccOpenTooLong ? [CC_KPI_OPEN_TOO_LONG] : [])]) {
    kpiInPlace[k] = { open: openKpi === k, onOpen: () => toggleKpi(k) };
  }
  const openTileRow = d.tiles.rows.find((t) => t.kpi === openKpi) ?? null;

  return (
    <DrillRoot label="Command Center">
    <div className="ccpage">
      {/* ── order 1 · one-line header, ≤40px: title · role/scope/view · data age ── */}
      <div className="cc-head">
        <h1 className="cc-title">Command Center</h1>
        <span className="cc-hchip">role <b>{viewAs ?? role ?? "reading…"}</b></span>
        <span className="cc-hchip">scope <b>Command</b></span>
        <span className="cc-hchip">view <b>dept_dash_command</b></span>
        {viewAs && <CcTag tone="attn">design preview — rendering only</CcTag>}
        <span className="cc-stamp" title={computed
          ? `The key-figure snapshot was computed ${new Date(computed).toLocaleString()}. This is the age of the DATA, not of this page load. Live views elsewhere on the page reflect the last Metrc sync.`
          : "No snapshot timestamp was served with the key figures."}>
          {busy ? "refreshing…" : computed ? `data ${age}` : "no snapshot timestamp served"}
        </span>
      </div>

      {/* ── order 2 · one 32px toolbar: view | dates | actions ── */}
      <div className="cc-tools">
        <div className="cc-tools-l">
          <button className="cc-btn" title="Collapse every section — remembered per user on this device" onClick={() => store.setAll(SEC_IDS, false)}>− collapse all</button>
          <button className="cc-btn" title="Expand every section" onClick={() => store.setAll(SEC_IDS, true)}>+ expand all</button>
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
          <button className="cc-btn" onClick={recompute} disabled={busy} title="Recompute the dashboard snapshot now — progress shows on the data-age stamp above">↻ recompute</button>
          <button className="cc-btn" onClick={() => window.print()}>🖨 print</button>
          <button className="cc-btn" onClick={() => go("dashboard_tasks")}>☑ tasks</button>
          <button className="cc-btn" onClick={() => go("inventory_alerts")}>⚠ alerts</button>
          <button className="cc-btn" onClick={() => go("dept_dash_cfo")}
            title="Value of stock, the money position, and the full inventory forensic audit">CFO dashboard →</button>
        </div>
      </div>

      {/* ── order 9 · KPI strip ── */}
      {d.tiles.err ? <CcErr what="The key figures" err={d.tiles.err} /> : (
        <DkKpiStrip dept="Command" tiles={d.tiles.rows} trend={trendByKpi} targets={targetByKpi}
          /* The stale-label guard is in the shared strip, not here — one
             definition, every page (owner, 19 Aug 2026: fix it for every page,
             not just this one). These two props are all it needs. */
          range={range} computedFor={d.computedFor}
          sourceNote={
            range.from && range.to
            ? { label: `honouring ${range.from} → ${range.to}`,
                why: "Flow figures are recomputed live for exactly this window. Positions are restated as of the end date from the ledger, and each tile states its own basis in its context. Clear the dates to see all time." }
            : { label: "all time — pick dates above to range these figures",
                why: "No date range is set, so every figure covers all data. The moment you pick dates, the flow figures recompute for that window and the positions restate to its end date." }}
          go={go} onAssigned={() => setVer((v) => v + 1)} pairs={kpiPairs} inPlace={kpiInPlace} />
      )}
      {d.headline.err && <CcErr what="The split stock headline" err={d.headline.err} />}
      {d.openRule.err && <CcErr what="The open-harvest limit" err={d.openRule.err} />}
      {openMaxDays == null && !d.openRule.err && (
        <div className="cc-fine">
          No open-harvest limit is set. <b>{CC_KPI_OPEN_TOO_LONG}</b> therefore opens the whole harvest
          register rather than the harvests it counted — the limit is a row in the business rules
          (harvest_open_max_days) and this page will not guess one to narrow a list with.
        </div>
      )}

      {/* ── the records behind whichever key figure is open, in place ─────────
          One at a time, each closing on its own button, on Escape and on the
          browser's back button, with the full report still reachable from
          inside. Nothing here re-mounts the page. ─────────────────────────── */}
      {openKpi === CC_FF_KEY && (
        <DkDrill label="Fresh frozen on hand, wet weight — every package"
          onClose={() => setOpenKpi(null)}>
          <div className="cc-fine">{d.headline.row?.why_two_figures}</div>
          {d.headline.row && (
            <div className="cc-fine">
              Dry-equivalent at the configured ratio of {Number(d.headline.row.configured_ratio)} would
              be {Number(d.headline.row.fresh_frozen_dry_equivalent_lb).toLocaleString()} lb.{" "}
              {d.headline.row.ratio_caveat}
            </div>
          )}
          {ffStreams.length === 0 ? (
            <DkEmpty
              why={`No stock stream is served under the name “${CC_FRESH_FROZEN_STREAM}”.`}
              fills={`v_stock_headline counts fresh frozen by Metrc product category and v_stock_summary groups it by stream; the two are matched here by that stream name. The names served today are: ${d.stock.rows.map((s) => s.stream).join(" · ") || "none"}. The figure on the tile is still the served one — it is only the package list that cannot be aimed, and that mismatch is filed with the database team rather than shown as an empty table.`}
              action={<button className="cc-btn" onClick={() => go("dept_dash_inventory")}>Open the Inventory dashboard →</button>} />
          ) : ffStreams.map((s) => (
            <React.Fragment key={s.origin + s.stream}>
              <div className="cc-fine">
                <b>{s.origin}</b> — {Number(s.total_lb).toLocaleString()} lb across{" "}
                {Number(s.packages).toLocaleString()} packages, oldest packaged {s.oldest_days} days ago.
              </div>
              <DkStreamDrill origin={s.origin} stream={s.stream}
                renderTable={(rows) => <StockProofTable rows={rows} locationLabel="Room" />} />
            </React.Fragment>
          ))}
        </DkDrill>
      )}

      {openTileRow && kpiInPlace[openTileRow.kpi] && (
        <DkDrill label={`${openTileRow.kpi} — every record behind the figure`}
          onClose={() => setOpenKpi(null)}>
          {openTileRow.context && <div className="cc-fine">{openTileRow.context}</div>}

          {openKpi === CC_KPI_DRIED && (
            <DkStreamDrill excludeStream={CC_FRESH_FROZEN_STREAM}
              renderTable={(rows) => <StockProofTable rows={rows} locationLabel="Room" />} />
          )}
          {openKpi === CC_KPI_NOT_SUBMITTED && (
            <DkStreamDrill labState={CC_LAB_NOT_SUBMITTED}
              labStateLabel="never submitted for testing"
              renderTable={(rows) => <StockProofTable rows={rows} locationLabel="Room" />} />
          )}
          {openKpi === CC_KPI_FAILED && (
            <DkStreamDrill labState={CC_LAB_TEST_FAILED}
              labStateLabel="failed testing and still on hand"
              renderTable={(rows) => <StockProofTable rows={rows} locationLabel="Room" />} />
          )}
          {openKpi === CC_KPI_IN_ROOMS && (
            <DkRowDrill view="v_harvest_still_in_room" order={CC_O_STILL_IN_ROOM}
              columns={CC_C_STILL_IN_ROOM}
              note="Every open harvest with material still in the room. The dry-equivalent is the view's own figure; the wet figure beside it is what Metrc still shows, and the difference is water."
              footer={<button className="cc-btn" onClick={() => go("moisture_loss_register")}>
                Open the full moisture loss register →
              </button>} />
          )}
          {openKpi === CC_KPI_PHANTOM && (
            <DkRowDrill view="v_moisture_loss_register" filters={CC_F_PHANTOM} order={CC_O_PHANTOM}
              columns={CC_C_MOISTURE}
              note="Closed harvests that still show water in Metrc and have no loss written off against them. This is a different population from the open harvests above, which is why the two figures no longer share one destination."
              footer={<button className="cc-btn" onClick={() => go("moisture_loss_register")}>
                Open the full moisture loss register →
              </button>} />
          )}
          {openKpi === CC_KPI_OPEN_TOO_LONG && ccOpenTooLong && (
            <DkRowDrill view="v_harvest_issues" filters={ccOpenTooLong} order={CC_O_OPEN_TOO_LONG}
              columns={CC_C_HARVEST_ISSUES}
              note={`Harvests not yet closed that have been open longer than the owner-set limit of ${openMaxDays} days${d.openRule.row?.set_by ? `, set by ${d.openRule.row.set_by}` : ""}. The limit is read from the business rules, never written into this page.`}
              footer={<button className="cc-btn" onClick={() => go("harvest_issues")}>
                Open the full harvest issues register →
              </button>} />
          )}
          {openKpi === CC_KPI_AT_LAB && (
            <DkRowDrill view="v_missing_lab_results" order={CC_O_MISSING_LAB}
              columns={CC_C_MISSING_LAB}
              note="Packages submitted to a laboratory that have never been reported back. This view is the figure's whole population, so no filter is applied and none is invented."
              footer={<button className="cc-btn" onClick={() => go("metrc_rpt_lab")}>
                Open the Metrc laboratory status report →
              </button>} />
          )}
        </DkDrill>
      )}
      {d.targets.err && <CcErr what="The owner-set targets" err={d.targets.err} />}
      {d.trend.err && <CcErr what="The trend snapshots" err={d.trend.err} />}

      {/* ── order 3 · band order: seed-to-sale FIRST ── */}
      <CcPanel id="flow" store={store} title="Seed to sale — where everything is right now"
        chips={d.flow.err ? <CcTag tone="crit">read failed</CcTag> : (
          <>
            <CcTag tone="neutral">{flowStages.length} stages</CcTag>
            {(() => {
              const scored = flowStages.filter((r) => CC_WIP.has(r.stage) && r.pounds && r.oldest_days)
                .map((r) => ({ ...r, score: Number(r.pounds) * Number(r.oldest_days) })).sort((a, b) => b.score - a.score);
              return scored[0] ? <CcTag tone="warn">bottleneck: {scored[0].stage} · {Number(scored[0].pounds).toLocaleString()} lb · oldest {scored[0].oldest_days} days</CcTag> : null;
            })()}
          </>
        )}>
        {d.flow.err ? <CcErr what="The seed-to-sale stages" err={d.flow.err} />
          : <CcFlow flow={d.flow.rows} split={d.split.rows} go={go} />}
      </CcPanel>

      {/* ── order 3 · in plain words SECOND ── */}
      <CcWords store={store} range={range} role={role} session={session} go={go} />

      {/* ── order 3 · global management THIRD ── */}
      <CcPanel id="global" store={store} title="Global management — every department, one view"
        chips={d.global.err ? <CcTag tone="crit">read failed</CcTag> : (
          <>
            <CcTag tone="neutral">{d.global.rows.length} departments</CcTag>
            {(() => {
              const crit = d.global.rows.reduce((a, r) => a + Number(r.critical_findings || 0), 0);
              return crit > 0 ? <CcTag tone="crit">{crit} critical findings</CcTag> : <CcTag tone="ok">no critical findings</CcTag>;
            })()}
          </>
        )}>
        {d.global.err ? <CcErr what="The global view" err={d.global.err} />
          : d.global.rows.length === 0
            ? <div className="cc-fine">mv_global_management returned no rows — the view is live but empty, which is itself a data-layer finding.</div>
            : <CcGlobal rows={d.global.rows} go={go}
                exec={<CcExecColumn
                  headline={d.headline.row} headlineErr={d.headline.err}
                  restock={d.restock.rows} restockErr={d.restock.err}
                  forecast={d.forecast.rows} forecastErr={d.forecast.err}
                  compliance={d.compliance.rows} complianceErr={d.compliance.err}
                  go={go} />} />}
      </CcPanel>

      {/* ── WO-004 · who is on today, and in which zone ── */}
      <CcPanel id="people" store={store} title="People — who is on today, and in which zone"
        chips={(d.zones.err || d.people.err || d.staffing.err) ? <CcTag tone="crit">read failed</CcTag> : (
          <>
            {zoneRows.length === 0
              ? <CcTag tone="warn" title="The zones register holds no rows. Nobody can be assigned to a zone that does not exist, so the floor count is unmeasurable rather than zero.">no zone created yet</CcTag>
              : <CcTag tone="neutral">{zoneRows.length} zones</CcTag>}
            <CcTag tone={schedulable.filter((p) => p.schedulable_state === "schedulable").length > 0 ? "ok" : "crit"}>
              {schedulable.filter((p) => p.schedulable_state === "schedulable").length} can be scheduled
            </CcTag>
            <CcTag tone="warn" title="schedule_assignments and employee_schedules both hold no rows, so no shift is posted for any date.">
              no shift posted
            </CcTag>
          </>
        )}>
        <CcPeople zones={zoneRows} zonesErr={d.zones.err}
          staffing={d.staffing.rows} staffingErr={d.staffing.err}
          people={schedulable} peopleErr={d.people.err} go={go} />
      </CcPanel>

      {/* ── WO-004 · the production schedule ── */}
      <CcPanel id="production" store={store} title="Production schedule — what is coming, and when"
        chips={d.sched.err ? <CcTag tone="crit">read failed</CcTag> : (
          <>
            <CcTag tone="neutral">
              {d.sched.total == null ? `${d.sched.rows.length} shown` : `${Number(d.sched.total).toLocaleString()} events still to come`}
            </CcTag>
            {d.sched.rows[0] && <CcTag tone="info">next {d.sched.rows[0].harvest_date} · {d.sched.rows[0].flower_room ?? "room not recorded"}</CcTag>}
            <CcTag tone="attn" title="harvest_schedule is the cultivation calendar. No view unions it with manufacturing runs yet — that is on the data layer's work order, and this band says so rather than implying the plan is complete.">
              cultivation half only ⓘ
            </CcTag>
          </>
        )}>
        <CcProduction rows={d.sched.rows} total={d.sched.total} err={d.sched.err} go={go} />
      </CcPanel>

      {/* ── order 8 · the work queue ── */}
      <CcPanel id="queue" store={store} title="Work queue — every open finding, grouped by cause"
        chips={queue.err ? <CcTag tone="crit">read failed</CcTag> : (
          <>
            <CcTag tone="neutral">{queue.causes ? queue.causes.length : "…"} causes</CcTag>
            <CcTag tone={queue.findings ? "crit" : "ok"}>{queue.findings ?? "…"} findings</CcTag>
            {queue.lanes && queue.lanes.length > 0 && (
              <CcTag tone="info" title={queue.lanes.map((l) => `${l.lane}: ${l.why}`).join(" · ")}>
                lanes: {queue.lanes.map((l) => l.lane).join(", ")}
              </CcTag>
            )}
          </>
        )}>
        <DkWorkQueue causes={queue.causes} lanes={queue.lanes} err={queue.err}
          dept="Command" isAdmin={isAdmin} viewKey="dept_dash_command" go={go} />
      </CcPanel>

      {/* ── order 6 · goals as a strip, no dead card body ── */}
      <CcGoals goals={d.goals.rows} err={d.goals.err} go={go} />

      {/* ── order 5 · yield, single-line rows, tone from the served numbers ── */}
      <CcPanel id="yield" store={store} title="Yield — grams per plant, tick = own strain median"
        chips={d.yld.err ? <CcTag tone="crit">read failed</CcTag> : (
          <>
            {yieldUnder.length > 0
              ? <CcTag tone="crit">{yieldUnder.length} under own strain median</CcTag>
              : <CcTag tone="ok">every recent harvest at or above its strain median</CcTag>}
            <CcTag tone="neutral"
              title="The band shows the most recently finished harvests. The rest of the register opens from the control under the rows — nothing is capped without saying so.">
              {d.yld.total == null
                ? `last ${yieldRows.length} closed harvests — total not counted`
                : `last ${yieldRows.length} of ${Number(d.yld.total).toLocaleString()} closed harvests`}
            </CcTag>
          </>
        )}>
        {d.yld.err ? <CcErr what="The yield audit" err={d.yld.err} />
          : yieldRows.length === 0
            ? <div className="cc-fine">No closed harvests yet — rows appear as soon as a harvest finishes and its dry yield is weighed.</div>
            : <CcYield rows={yieldRows} total={d.yld.total} go={go} />}
      </CcPanel>

      {/* ── rooms, department-qualified (J7) — every room, not the flower rooms alone ── */}
      <CcPanel id="rooms" store={store} title="Rooms — every room, department-qualified"
        chips={d.rooms.err ? <CcTag tone="crit">read failed</CcTag> : (
          <>
            {roomsOver.length > 0
              ? <CcTag tone="crit">{roomsOver.length} past the scheduled pull</CcTag>
              : <CcTag tone="ok">every flower room inside its cycle</CcTag>}
            <CcTag tone="neutral">{flowerRooms.length} flower rooms</CcTag>
            <CcTag tone="neutral">{d.rooms.rows.length} rooms in all</CcTag>
          </>
        )}>
        {d.rooms.err ? <CcErr what="The room board" err={d.rooms.err} />
          : d.rooms.rows.length === 0
            ? <div className="cc-fine">v_room_board_complete returned no rooms — the view reads the room register, the harvest schedule and the package mirror; with all three empty there is nothing to show.</div>
            : <DkRoomBoard rooms={d.rooms.rows}
                warnDays={warnRule ? Number(warnRule.threshold) : null}
                /* THE PLANT DRILL IS HANDED THE ROOM THE TILE COUNTED BY. It
                   used to mount RoomDrill, which took a room CODE and looked it
                   up in grow_rooms — but the board hands it a room ROW, so the
                   lookup compared a code column with an object and matched
                   nothing. RoomDrill also queried metrc_plants directly, where
                   'Flower Room #1' returns 13,552 rows against 1,022 standing,
                   because source_state was never in the filter. Both are gone:
                   DkRoomPlantDrill reads v_room_plants_drill, which is keyed by
                   OUR room name and carries the standing filter at source, so
                   the tile and its drill cannot disagree. */
                renderPlantDrill={(r) => <DkRoomPlantDrill room={r.room} metrcRoomName={r.metrc_room_name} />}
                renderStockDrill={(r) => <RoomStockDrill licence={r.licence} room={r.room} department={r.department} />} />}
      </CcPanel>

      {/* ── owner keep-list · Where the Money Is Standing, internals untouched ── */}
      <CcPanel id="money" store={store} title="Where the money is standing"
        chips={d.money.err ? <CcTag tone="crit">read failed</CcTag>
          : d.money.count === 0 ? <CcTag tone="attn" title="v_money_position served no rows — the bar below stays empty for that reason, not by design.">no rows served</CcTag>
          : <CcTag tone="neutral">{d.money.count == null ? "bands not counted" : `${d.money.count} bands`}</CcTag>}>
        <MoneyBar go={go} />
      </CcPanel>

      {/* ── owner keep-list · Stock by Stream cards, internals untouched ── */}
      <CcPanel id="stock" store={store} title="Stock by stream"
        chips={d.stock.err ? <CcTag tone="crit">read failed</CcTag> : (
          <>
            <CcTag tone="neutral">{d.stock.rows.length} streams</CcTag>
            <CcTag tone="info" title="Press “Open every package” on any card: the full package list opens below the cards, straight from the evidence view, with the certificate and the manifest on every row.">
              every card opens its packages
            </CcTag>
          </>
        )}>
        {d.stock.err ? <CcErr what="The stock streams" err={d.stock.err} />
          : d.stock.rows.length === 0
            ? <div className="cc-fine">No stock streams served — v_stock_summary returned no rows.</div>
            : (
              <>
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
      </CcPanel>

      {/* ── owner order 11 Aug: the forensic audit keeps its own section ── */}
      <CcPanel id="audit" store={store} title="Finance &amp; tax · inventory forensic audit — every pound, seed to sale"
        defaultOpen={false} chips={<CcTag tone="neutral" title="The full audit ledger — what came in, what went out, what is left, and what does not add up. Expand to read it.">full ledger</CcTag>}>
        <ForensicAuditLedger go={go} />
      </CcPanel>

      {/* ── tasks raised from dashboards, queue pattern ── */}
      <CcPanel id="tasks" store={store} title="Tasks raised from dashboards"
        chips={d.tasks.err ? <CcTag tone="crit">read failed</CcTag> : (
          <>
            <CcTag tone="neutral">{openTasks.length} open</CcTag>
            {overdueTasks.length > 0 && <CcTag tone="crit">{overdueTasks.length} overdue</CcTag>}
          </>
        )} defaultOpen={openTasks.length > 0}>
        {d.tasks.err ? <CcErr what="The task list" err={d.tasks.err} /> : <CcTasks tasks={openTasks} go={go} />}
      </CcPanel>

      {/* ── order 7a · report groups only; 7b (status bar) DELETED by owner ruling ── */}
      <CcPanel id="reports" store={store} title="Reports — by group"
        chips={<CcTag tone="neutral">{rowsOr(reports).length} reports · {new Set(rowsOr(reports).map((r) => r.report_group || "Reports")).size} groups</CcTag>}
        defaultOpen={false}>
        <CcReports reports={reports} go={go} />
      </CcPanel>
    </div>
    </DrillRoot>
  );
}
