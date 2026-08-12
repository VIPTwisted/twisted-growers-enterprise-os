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
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "./lib/supabase.js";
import {
  AssignTask, DateRangeSelect, useSectionStore, movementVerdict, rowsOr,
  MoneyBar, StockByStreamCards, OpenHarvestDetail, InTransitDrill, BatchList,
  RoomDrill, RoomStockDrill, ForensicAuditLedger, DEPT_BY_VIEW,
} from "./App.jsx";
import "./commandcenter.css";

/* ---------- shared primitives of the new tree ---------- */

/* Panel: the DDC shell. Square, hairline border, mono uppercase head, chips on
   the head line so a collapsed or errored section still tells its state
   (order 4: never a bare header band over silent failure). Collapse hides, it
   does not unmount — monitoring stays live behind a closed section. */
function CcPanel({ id, store, title, chips, defaultOpen = true, children }) {
  const open = store.isOpen(id, defaultOpen);
  return (
    <section className="cc-panel">
      <button className="cc-panel-head" onClick={() => store.set(id, !open)}
        aria-expanded={open} title={open ? "Collapse this section" : "Expand this section"}>
        <span className="cc-panel-title">{title}</span>
        {chips && <span className="cc-panel-chips">{chips}</span>}
        <span className="cc-panel-caret">{open ? "−" : "+"}</span>
      </button>
      <div className="cc-panel-body" style={open ? undefined : { display: "none" }}>{children}</div>
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

const fmtVal = (v, u) => {
  const n = Number(v ?? 0);
  if (u === "$") return "$" + Math.round(n).toLocaleString();
  if (u === "%") return n.toLocaleString() + "%";
  return n.toLocaleString();
};

/* 40×10 sparkline, drawn ONLY from served daily snapshots. With fewer than two
   points nothing renders — no placeholder ghost (order 9; rule 10 honesty). */
function CcSpark({ series, direction }) {
  if (!series || series.length < 2) return null;
  const n = series.map(Number);
  const min = Math.min(...n), max = Math.max(...n), rng = max - min || 1;
  const W = 40, H = 10;
  const pts = n.map((v, i) => [(i / (n.length - 1)) * W, H - 1.5 - ((v - min) / rng) * (H - 3)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const rising = n[n.length - 1] === n[0] ? null : n[n.length - 1] > n[0];
  const cls = movementVerdict(rising, direction);
  return (
    <svg className={`cc-spark ${cls}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <path d={d} className="cc-spark-line" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="1.5" className="cc-spark-dot" />
    </svg>
  );
}

/* ---------- order 9 · the KPI strip ---------- */
function CcKpiStrip({ tiles, trend, targets, go, onAssigned }) {
  return (
    <div className="cc-kpiwrap">
      <div className="cc-striphead">
        <span className="cc-striplabel">Key figures</span>
        <CcTag tone="neutral">{tiles.length} figures</CcTag>
        {/* The range caveat renders ONCE for the whole strip, never per tile
            (order 9). The full explanation rides the tooltip (rule A3). */}
        <CcTag tone="info"
          title="These figures are read from mv_department_dashboard, one pre-computed row per figure with no date on it, refreshed on the ten-minute cycle. They cover all data, all time, whatever range is picked above. The fix belongs in the view: it must carry the date its own facts hold.">
          all data, all time — does not honour the date range ⓘ
        </CcTag>
      </div>
      <div className="cc-kpi-strip">
        {tiles.map((r) => {
          const tg = targets[r.kpi];
          const tr = trend[r.kpi];
          const offTarget = tg && tg.target != null &&
            (tg.direction === "at_most" ? Number(r.value) > Number(tg.target) : Number(r.value) < Number(tg.target));
          const valTone = offTarget ? "crit" : r.tone === "bad" ? "crit" : r.tone === "warn" ? "warn" : r.tone === "good" ? "ok" : "plain";
          let delta = null;
          if (tr && tr.latest != null && tr.previous != null) {
            const d = Number(tr.latest) - Number(tr.previous);
            delta = { cls: movementVerdict(d === 0 ? null : d > 0, tg?.direction),
              txt: d === 0 ? "no change since yesterday" : `${d > 0 ? "+" : ""}${d.toLocaleString()} since yesterday` };
          }
          const shortCtx = r.context && r.context.length <= 44 ? r.context : null;
          return (
            <div key={r.kpi + r.ord} className="cc-kpi">
              <button className="cc-kpi-open" onClick={() => r.drill && go(r.drill)}
                title={(r.context ? r.context + " — " : "") + "Open the records behind this figure."}>
                <span className="cc-kpi-lbl">{r.kpi}</span>
                <span className="cc-kpi-line">
                  <b className={`cc-kpi-val ${valTone}`}>{fmtVal(r.value, r.unit)}</b>
                  {r.unit && r.unit !== "$" && r.unit !== "%" && <em className="cc-kpi-unit">{r.unit}</em>}
                  <CcSpark series={tr?.series} direction={tg?.direction} />
                  {delta && <span className={`cc-kpi-delta ${delta.cls}`}>{delta.txt}</span>}
                </span>
                {tg && tg.target != null && (
                  <span className={`cc-kpi-target ${offTarget ? "crit" : ""}`}>
                    target {tg.direction === "at_most" ? "no more than" : "at least"} {Number(tg.target).toLocaleString()}
                    {offTarget ? " — OVER" : " — within"}
                  </span>
                )}
                {shortCtx && <span className="cc-kpi-ctx">{shortCtx}</span>}
              </button>
              <span className="cc-kpi-assign">
                <AssignTask dept="Command" kpi={r.kpi} value={r.value} unit={r.unit} drill={r.drill} onDone={onAssigned} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
              title={(r.note || "") + " Click for every record behind this stage."}>
              <span className="cc-stage-lbl">{r.stage}</span>
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
        <div className="cc-drill">
          <div className="cc-drill-head">Every record behind “{openStage}” — full forensic detail</div>
          {openStage === "Open harvests" ? <OpenHarvestDetail />
            : openStage === "In transit" ? <InTransitDrill />
            : <BatchList labState={
                openStage === "Awaiting test" ? "NotSubmitted"
                : openStage === "Sellable" ? "TestPassed"
                : openStage === "Blocked - failed" ? "TestFailed" : "SubmittedForTesting"} />}
        </div>
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
function CcGlobal({ rows, go }) {
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
  return (
    <>
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
    </>
  );
}

/* ---------- order 8 · the work queue ---------- */
const CC_SEV = { critical: "crit", elevated: "warn", watch: "attn", info: "info" };
function CcAssignCause({ row, isAdmin, viewKey }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState(null);
  const [who, setWho] = useState("");
  const [due, setDue] = useState("");
  const [pri, setPri] = useState("normal");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!open || people) return;
    supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name")
      .then(({ data, error }) => setPeople(error ? [] : rowsOr(data)));
  }, [open, people]);
  const save = async () => {
    if (!who) { setMsg("Assignment needs a named person — pick one."); return; }
    const { data, error } = await supabase.rpc("tg_assign_from_tile", {
      p_title: `Work the cause: ${row.pattern_key} — ${row.findings_that_clear_if_fixed} findings clear if fixed`,
      p_assignee_employee_id: who, p_due_on: due || null, p_priority: pri,
      p_source_view: viewKey, p_source_kpi: row.pattern_key,
      p_source_value: row.findings_that_clear_if_fixed, p_source_unit: "findings",
      p_department: row.department, p_description: `${row.example_finding ?? ""}${row.what_to_do ? " — " + row.what_to_do : ""}`,
      p_snapshot: row,
    });
    if (error) { setMsg(`Refused: ${error.message}`); return; }
    const order = data?.[0]?.order_no;
    setMsg(order ? `Assigned — order ${order}.` : "Assigned.");
    setTimeout(() => { setOpen(false); setMsg(""); }, 1400);
  };
  if (!isAdmin) {
    /* Fails closed, with the reason on the control itself. */
    return <span className="cc-fine" title="tg_assign_from_tile is administrator-gated and fails closed. Ask an owner, executive or administrator to assign this cause.">assign: administrators only</span>;
  }
  if (!open) return <button className="cc-btn" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>Assign</button>;
  return (
    <span className="cc-assign">
      <select className="cc-input" aria-label="Assign this cause to a named person" value={who} onChange={(e) => setWho(e.target.value)}>
        <option value="">Named person…</option>
        {rowsOr(people).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
      <input className="cc-input" type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} />
      <select className="cc-input" aria-label="Priority" value={pri} onChange={(e) => setPri(e.target.value)}>
        <option value="low">Low</option><option value="normal">Normal</option>
        <option value="high">High</option><option value="urgent">Urgent</option>
      </select>
      <button className="cc-btn primary" onClick={save}>Assign it</button>
      <button className="cc-btn" onClick={() => { setOpen(false); setMsg(""); }}>Cancel</button>
      {msg && <span className="cc-fine">{msg}</span>}
    </span>
  );
}

function CcQueueInstances({ row, go }) {
  const [inst, setInst] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true;
    supabase.from("v_findings").select("severity, what, where_it_is, why_it_matters, what_to_do, the_arithmetic, pounds, dollars, first_raised, drill")
      .eq("pattern_key", row.pattern_key).eq("source", row.source)
      .is("resolved_at", null)
      .order("severity_rank", { ascending: false }).order("first_raised", { ascending: true })
      .limit(50)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setErr(error.message); return; }
        setInst(rowsOr(data).filter((r) => r.is_duplicate !== true));
      });
    return () => { live = false; };
  }, [row.pattern_key, row.source]);
  if (err) return <CcErr what="The findings behind this cause" err={err} />;
  if (inst === null) return <div className="cc-fine">Reading every finding behind this cause…</div>;
  if (!inst.length) return <div className="cc-fine">No open findings behind this cause right now — it may have cleared since the queue was computed.</div>;
  return (
    <div className="cc-inst-list">
      {inst.map((f, i) => (
        <div key={i} className={`cc-inst ${CC_SEV[f.severity] ?? "info"}`}>
          <div className="cc-inst-what">{f.what}</div>
          {f.where_it_is && <div className="cc-inst-line"><b>Where:</b> {f.where_it_is}</div>}
          {f.why_it_matters && <div className="cc-inst-line"><b>Why it matters:</b> {f.why_it_matters}</div>}
          {f.what_to_do && <div className="cc-inst-line"><b>What to do:</b> {f.what_to_do}</div>}
          {f.the_arithmetic && <div className="cc-inst-line dim">{f.the_arithmetic}</div>}
          <div className="cc-inst-meta">
            {f.pounds != null && <span>{Number(f.pounds).toLocaleString()} lb</span>}
            {f.dollars != null && <span title="untrusted — dedupe check disagreeing">${Math.round(Number(f.dollars)).toLocaleString()}</span>}
            {f.first_raised && <span>raised {String(f.first_raised).slice(0, 10)}</span>}
            {f.drill && <button className="cc-btn" onClick={() => go(f.drill)}>Open the records →</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CcQueue({ causes, isAdmin, go }) {
  const [openRow, setOpenRow] = useState(null);
  /* Paged like every honest feed on the platform (the in-transit drill set the
     pattern): the first page renders, the header chips carry the TRUE totals,
     and one press shows the rest. Nothing is summarised away — every cause is
     one press from the screen. */
  const PAGE = 15;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? causes : causes.slice(0, PAGE);
  return (
    <div className="cc-queue">
      {visible.map((r) => {
        const key = r.source + "|" + r.pattern_key;
        const open = openRow === key;
        const cause = r.pattern_key.includes(":") ? r.pattern_key.slice(r.pattern_key.indexOf(":") + 1) : r.pattern_key;
        return (
          <React.Fragment key={key}>
            <div className={`cc-qrow ${open ? "on" : ""}`}>
              <button className="cc-qmain" onClick={() => setOpenRow(open ? null : key)}
                title={`${r.example_finding ?? cause}${r.what_to_do ? " — " + r.what_to_do : ""} — click to open every finding behind this cause, in place.`}>
                <i className={`cc-dot ${CC_SEV[r.worst_severity] ?? "info"}`} aria-hidden="true" />
                <b className="cc-qcount">{r.findings_that_clear_if_fixed}</b>
                <span className="cc-qcause">{cause}</span>
                <span className="cc-qnums">
                  {r.pounds_untrusted != null && <span>{Number(r.pounds_untrusted).toLocaleString()} lb</span>}
                  {r.dollars_untrusted != null && (
                    <span title="untrusted — dedupe check disagreeing">${Math.round(Number(r.dollars_untrusted)).toLocaleString()} ⓘ</span>
                  )}
                </span>
                <span className="cc-qage">{r.days_open != null ? `${r.days_open} days` : "age not served"}</span>
              </button>
              <CcAssignCause row={r} isAdmin={isAdmin} viewKey="dept_dash_command" />
            </div>
            {open && <div className="cc-qopen"><CcQueueInstances row={r} go={go} /></div>}
          </React.Fragment>
        );
      })}
      {causes.length > PAGE && (
        <button className="cc-btn cc-qmore" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show the worst 15 causes only" : `Show all ${causes.length} causes (${causes.length - PAGE} more)`}
        </button>
      )}
    </div>
  );
}

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
function CcYield({ rows, go }) {
  const [openRow, setOpenRow] = useState(null);
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
              title={`${r.harvest} · ${roomQualified} · finished ${r.finished_on}. Click for the full audit line.`}>
              <span className="cc-yname">{r.strain || "strain not recorded"}</span>
              <span className="cc-ytrack">
                <i className={`cc-yfill ${tone}`} style={{ width: `${Math.max(2, w)}%` }} />
                {tick != null && <b className="cc-ytick" style={{ left: `${tick}%` }}
                  title={`Strain median: ${Number(r.strain_median_dry_g).toLocaleString()} g per plant over ${r.strain_harvests} harvests`} />}
              </span>
              <span className="cc-yval">{r.dry_g_per_plant == null ? "not weighed" : `${Number(r.dry_g_per_plant).toLocaleString()} g`}</span>
            </button>
            {open && (
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
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ---------- rooms ---------- */
function CcRooms({ rooms, stockRooms, stockErr, warnDays, lateNote, go }) {
  const [openRoom, setOpenRoom] = useState(null);
  const [openStock, setOpenStock] = useState(null);
  const flower = rooms.filter((r) => r.room_type === "Flower room");
  const over = flower.filter((r) => Number(r.days_until) < 0 && Number(r.plants_now) > 0);
  const stateOf = (r) => {
    if (Number(r.plants_now) === 0) return { tag: "turning", tone: "info" };
    if (Number(r.days_until) < 0) return { tag: "over", tone: "crit" };
    if (warnDays != null && Number(r.days_until) <= warnDays) return { tag: "approaching", tone: "warn" };
    return { tag: "on plan", tone: "ok" };
  };
  const byRoom = new Map();
  for (const s of stockRooms) {
    const k = s.licence + "|" + s.room;
    const g = byRoom.get(k) ?? { licence: s.licence, department: s.department, room: s.room,
      total_lb: 0, ours_lb: 0, third_party_lb: 0, tags: 0, units: 0, failed: 0, no_coa: 0 };
    g.total_lb += Number(s.total_lb ?? 0); g.ours_lb += Number(s.ours_lb ?? 0);
    g.third_party_lb += Number(s.third_party_lb ?? 0); g.tags += Number(s.tags ?? 0);
    g.units += Number(s.units ?? 0); g.failed += Number(s.failed ?? 0); g.no_coa += Number(s.no_coa ?? 0);
    byRoom.set(k, g);
  }
  const stockCards = [...byRoom.values()].sort((a, b) => b.total_lb - a.total_lb);
  return (
    <>
      {over.map((r) => {
        /* J7: a room never renders without its department. mv_room_board covers
           the flower rooms, which are Cultivation; the served-department column
           for post-harvest rooms is the requirement already filed with Agent I. */
        const roomQualified = r.room + " — Cultivation";
        return (
          <div key={"bn" + r.room} className="cc-breach">
            <b>{roomQualified} is {Math.abs(Number(r.days_until))} day{Math.abs(Number(r.days_until)) === 1 ? "" : "s"} past its scheduled pull{r.cycle_days ? ` on a ${r.cycle_days}-day cycle` : ""}.</b>
            {lateNote && <em>{lateNote}</em>}
            <span className="cc-breach-acts">
              <button className="cc-btn" onClick={() => setOpenRoom(openRoom === r.room ? null : r.room)}>Open {roomQualified}</button>
              <AssignTask dept="Command" kpi={roomQualified + ", days past scheduled pull"}
                value={Math.abs(Number(r.days_until))} unit="days" drill="room_board" />
            </span>
          </div>
        );
      })}
      <div className="cc-ringrow">
        {flower.map((r) => {
          const st = stateOf(r);
          const empty = Number(r.plants_now) === 0;
          const roomQualified = r.room + " — Cultivation";
          const frac = !empty && r.cycle_days
            ? Math.min(1, Math.max(0, (Number(r.cycle_days) - Number(r.days_until)) / Number(r.cycle_days)))
            : 0;
          const C = 2 * Math.PI * 18;
          return (
            <button key={r.room} className={`cc-ringcard ${openRoom === r.room ? "on" : ""}`}
              onClick={() => setOpenRoom(openRoom === r.room ? null : r.room)}
              title={roomQualified + (r.strains_now ? " · " + r.strains_now : "") + ". Click for every plant in the room."}>
              <svg className="cc-ring" viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
                <circle cx="22" cy="22" r="18" className="cc-ring-track" />
                {!empty && (
                  <circle cx="22" cy="22" r="18" className={`cc-ring-fill ${st.tone}`}
                    strokeDasharray={`${(frac * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 22 22)" />
                )}
                <text x="22" y="26" textAnchor="middle" className="cc-ring-num">{empty ? "—" : Math.abs(Number(r.days_until))}</text>
              </svg>
              <span className="cc-ring-name">{roomQualified}</span>
              <span className="cc-ring-meta">{empty
                ? (r.next_event_detail ? `next: ${r.next_event_detail}` : "empty — turning")
                : `${Number(r.plants_now).toLocaleString()} plants · ${Number(r.days_until) < 0 ? "OVER" : "days left"}`}</span>
              <CcTag tone={st.tone}>{st.tag}</CcTag>
            </button>
          );
        })}
      </div>
      {openRoom && (
        <div className="cc-drill">
          <div className="cc-drill-head">Every plant standing in {openRoom} — Cultivation</div>
          <RoomDrill code={openRoom} />
        </div>
      )}
      {stockErr && <CcErr what="The stock rooms" err={stockErr} />}
      {stockCards.length > 0 && (
        <>
          <div className="cc-substriphead">
            <span className="cc-striplabel">Rooms holding stock</span>
            <CcTag tone="neutral">{stockCards.length} rooms</CcTag>
            <CcTag tone="attn" title="Dry-deadline and cycle tracking covers flower rooms only for now: the harvest schedule view does not yet carry the department for post-harvest rooms, and eleven room names exist in both buildings. The requirement is with the database team.">deadline tracking: flower rooms only ⓘ</CcTag>
          </div>
          <div className="cc-stockrooms">
            {stockCards.map((g) => {
              const k = g.licence + "|" + g.room;
              const qualified = g.room + " — " + g.department;
              return (
                <button key={k} className={`cc-stockroom ${openStock === k ? "on" : ""}`}
                  onClick={() => setOpenStock(openStock === k ? null : k)}
                  title={qualified + ". Click for every package in the room."}>
                  <span className="cc-sr-name">{qualified}</span>
                  <span className="cc-sr-big">{g.total_lb > 0
                    ? <>{g.total_lb.toLocaleString(undefined, { maximumFractionDigits: 1 })}<em> lb</em></>
                    : <>{g.units.toLocaleString()}<em> units</em></>}</span>
                  <span className="cc-sr-line">{g.tags.toLocaleString()} tags · ours {g.ours_lb.toLocaleString(undefined, { maximumFractionDigits: 1 })} · third party {g.third_party_lb.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                  <span className="cc-sr-chips">
                    {g.failed > 0 && <CcTag tone="crit">{g.failed} failed</CcTag>}
                    {g.no_coa > 0 && <CcTag tone="attn" title="Packages with no certificate of analysis on file — the reason per package is on its row in the drill.">{g.no_coa} no certificate</CcTag>}
                  </span>
                </button>
              );
            })}
          </div>
          {openStock && (() => {
            const g = byRoom.get(openStock);
            if (!g) return null;
            /* J7: the qualified name is composed ONCE and rendered whole — no
               bare room accessor reaches a render. The filter value is aliased
               for the same reason: room identity is licence + name. */
            const room_qualified = g.room + " — " + g.department;
            const rm = g.room;
            return (
              <div className="cc-drill">
                <div className="cc-drill-head">Every package in {room_qualified} (licence {g.licence})</div>
                <RoomStockDrill licence={g.licence} room={rm} department={g.department} />
              </div>
            );
          })()}
        </>
      )}
    </>
  );
}

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
  const SEC_IDS = ["flow", "words", "global", "queue", "goals", "yield", "rooms", "money", "stock", "audit", "tasks", "reports"];
  const [range, setRange] = useState({ from: "", to: "" });
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
      const [tiles, trend, targets, flow, split, global, causes, goals, yld, rooms, alertRules, stockRooms, stock, money, tasks] = await Promise.all([
        supabase.from("mv_department_dashboard").select("*").eq("department", "Command").order("ord"),
        supabase.from("v_dashboard_trend").select("*").eq("department", "Command"),
        supabase.from("kpi_targets").select("*").eq("department", "Command"),
        supabase.from("mv_flow_stages").select("*").order("stage_no"),
        supabase.from("v_flow_failed_split").select("*").maybeSingle(),
        supabase.from("mv_global_management").select("*"),
        supabase.from("v_finding_causes").select("*")
          .order("worst_severity_rank", { ascending: false })
          .order("findings_that_clear_if_fixed", { ascending: false }),
        supabase.from("v_goal_status").select("*").order("metric_key"),
        supabase.from("v_harvest_yield_audit").select("*").order("finished_on", { ascending: false }).limit(12),
        supabase.from("mv_room_board").select("*").order("room"),
        supabase.from("harvest_alert_rules").select("rule_key, threshold, note, active")
          .in("rule_key", ["weekend_warning_days", "late_tolerance_days"]),
        supabase.from("v_stock_by_department").select("*"),
        supabase.from("v_stock_summary").select("*"),
        supabase.from("v_money_position").select("ord").limit(200),
        supabase.from("v_dashboard_tasks").select("*"),
      ]);
      if (!live) return;
      setD({
        tiles: grab(tiles), trend: grab(trend), targets: grab(targets), flow: grab(flow),
        split: split.error ? { rows: null, err: split.error.message } : { rows: split.data, err: null },
        global: grab(global), causes: grab(causes), goals: grab(goals), yld: grab(yld),
        rooms: grab(rooms), alertRules: grab(alertRules), stockRooms: grab(stockRooms),
        stock: grab(stock), money: grab(money), tasks: grab(tasks),
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

  /* The stock-by-stream cards are the owner's frozen KPI surface — mounted
     verbatim from App.jsx, internals pixel-untouched. Their open/hide state
     lives here exactly as it did in the old dashboard. */
  const [openTile, setOpenTile] = useState(null);

  if (d === null) return (
    <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Building the Command Center from the live records…</div></div>
  );

  const computed = d.tiles.rows?.[0]?.computed_at ?? null;
  const age = ccAge(computed);
  const trendByKpi = Object.fromEntries(d.trend.rows.map((r) => [r.kpi, r]));
  const targetByKpi = Object.fromEntries(d.targets.rows.map((r) => [r.kpi, r]));
  const causes = d.causes.rows;
  const worstCause = causes[0];
  const yieldRows = d.yld.rows;
  const yieldUnder = yieldRows.filter((r) => r.strain_median_dry_g != null && Number(r.dry_g_per_plant) < Number(r.strain_median_dry_g));
  const flowStages = d.flow.rows.filter((r) => r.stage_no > 0);
  const warnRule = d.alertRules.rows.find((x) => x.rule_key === "weekend_warning_days" && x.active);
  const lateRule = d.alertRules.rows.find((x) => x.rule_key === "late_tolerance_days" && x.active);
  const flowerRooms = d.rooms.rows.filter((r) => r.room_type === "Flower room");
  const roomsOver = flowerRooms.filter((r) => Number(r.days_until) < 0 && Number(r.plants_now) > 0);
  const openTasks = d.tasks.rows;
  const overdueTasks = openTasks.filter((t) => t.position?.startsWith("OVERDUE"));

  return (
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
        <CcKpiStrip tiles={d.tiles.rows} trend={trendByKpi} targets={targetByKpi} go={go} onAssigned={() => setVer((v) => v + 1)} />
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
            : <CcGlobal rows={d.global.rows} go={go} />}
      </CcPanel>

      {/* ── order 8 · the work queue ── */}
      <CcPanel id="queue" store={store} title="Work queue — every open finding, grouped by cause"
        chips={d.causes.err ? <CcTag tone="crit">read failed</CcTag> : (
          <>
            <CcTag tone="neutral">{causes.length} causes</CcTag>
            <CcTag tone="neutral">{causes.reduce((a, r) => a + Number(r.findings_that_clear_if_fixed || 0), 0)} findings</CcTag>
            {worstCause && <CcTag tone={CC_SEV[worstCause.worst_severity] ?? "info"}>worst: {worstCause.worst_severity}</CcTag>}
          </>
        )}>
        {d.causes.err ? <CcErr what="The work queue" err={d.causes.err} />
          : causes.length === 0
            ? <div className="cc-fine">Nothing open. The watchdog sweeps twice a day and clears findings itself when the problem is gone.</div>
            : <CcQueue causes={causes} isAdmin={isAdmin} go={go} />}
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
            <CcTag tone="neutral">last {yieldRows.length} closed harvests</CcTag>
          </>
        )}>
        {d.yld.err ? <CcErr what="The yield audit" err={d.yld.err} />
          : yieldRows.length === 0
            ? <div className="cc-fine">No closed harvests yet — rows appear as soon as a harvest finishes and its dry yield is weighed.</div>
            : <CcYield rows={yieldRows} go={go} />}
      </CcPanel>

      {/* ── rooms, department-qualified (J7) ── */}
      <CcPanel id="rooms" store={store} title="Rooms — every room, department-qualified"
        chips={d.rooms.err ? <CcTag tone="crit">read failed</CcTag> : (
          <>
            {roomsOver.length > 0 && <CcTag tone="crit">{roomsOver.length} over</CcTag>}
            {roomsOver.length === 0 && <CcTag tone="ok">every room inside its cycle</CcTag>}
            <CcTag tone="neutral">{flowerRooms.length} flower rooms</CcTag>
          </>
        )}>
        {d.rooms.err ? <CcErr what="The room board" err={d.rooms.err} />
          : flowerRooms.length === 0
            ? <div className="cc-fine">No flower rooms in mv_room_board — the board reads the grow-room register and the harvest schedule; if both are empty nothing can be shown.</div>
            : <CcRooms rooms={d.rooms.rows} stockRooms={d.stockRooms.rows} stockErr={d.stockRooms.err}
                warnDays={warnRule ? Number(warnRule.threshold) : null} lateNote={lateRule?.note ?? null} go={go} />}
      </CcPanel>

      {/* ── owner keep-list · Where the Money Is Standing, internals untouched ── */}
      <CcPanel id="money" store={store} title="Where the money is standing"
        chips={d.money.err ? <CcTag tone="crit">read failed</CcTag>
          : d.money.rows.length === 0 ? <CcTag tone="attn" title="v_money_position served no rows — the bar below stays empty for that reason, not by design.">no rows served</CcTag>
          : <CcTag tone="neutral">{d.money.rows.length} bands</CcTag>}>
        <MoneyBar go={go} />
      </CcPanel>

      {/* ── owner keep-list · Stock by Stream cards, internals untouched ── */}
      <CcPanel id="stock" store={store} title="Stock by stream"
        chips={d.stock.err ? <CcTag tone="crit">read failed</CcTag> : <CcTag tone="neutral">{d.stock.rows.length} streams</CcTag>}>
        {d.stock.err ? <CcErr what="The stock streams" err={d.stock.err} />
          : d.stock.rows.length === 0
            ? <div className="cc-fine">No stock streams served — v_stock_summary returned no rows.</div>
            : <StockByStreamCards stock={d.stock.rows} openTile={openTile} setOpenTile={setOpenTile} />}
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
  );
}
