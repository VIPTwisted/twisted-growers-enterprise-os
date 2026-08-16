/* ═══════════════════════════════════════════════════════════════════════════
   CULT-KIT — the Cultivation lane's shared PRIMITIVES. Agent B, 15 Aug 2026.

   WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT. It is a bag of small parts:
   the department's owner-set targets, the licence table that turns a bare room
   name into a qualified one, a proportion bar, a recent-activity list, and the
   batched package lookup that puts a certificate on a grading row. It holds NO
   page layout and no page calls another page's component. 522 pages went
   through one ReportScreen and that is the CAUSE of the defects here, not the
   cure — a takedown register is not a loss ledger is not a strain catalogue,
   and the nine Cultivation pages built on this kit each lay themselves out.

   WHY THE TARGETS AND THE LICENCES ARE READ HERE, ONCE. Every Cultivation page
   must colour a tile against an OWNER-SET target from kpi_targets and must
   never invent one, and every page that prints a room must print the room with
   its department. Nine copies of those two reads is nine chances to drift.

   THE ROOM RULE, WHICH IS THE ONE THIS LANE GETS WRONG MOST. `Pre Trim Storage
   Room` and `Pre-Trim Storage` are two real rooms in two buildings under two
   licences, and a name shared by two departments is not an identity. Where a
   record carries its licence, cultRoomLabel resolves the department from
   company_licenses — the owner-set table, never a literal in this file. Where a
   record does NOT carry a licence the label SAYS the department is not on the
   record. It never guesses and it never prints the bare name as if it were
   whole.

   EVERY READ BINDS ITS ERROR. Nothing here falls back to an empty array on
   failure: a blank Cultivation page is this platform's classic silent failure.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { grab, listOf, DkEmpty } from "./dashkit.jsx";
import "./commandcenter.css";
import "./dashkit.css";
import "./cult.css";

export const CULT_DEPT = "Cultivation";

/* ═══════════ the department's measures, read once per page ═══════════
   kpi_targets  — the owner-set target and its direction, per published label.
   v_dashboard_trend — the daily snapshots a sparkline may be drawn from. Where
   a page's figure has no snapshot the strip prints "no history yet", which is
   the honest answer and the only permitted one: a fabricated line is forbidden.
   company_licenses — licence to department, so no page writes a licence number
   into itself. */
export function useCultMeasures() {
  const [m, setM] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const [t, tr, lic] = await Promise.all([
        supabase.from("kpi_targets").select("*").eq("department", CULT_DEPT),
        supabase.from("v_dashboard_trend").select("*").eq("department", CULT_DEPT),
        supabase.from("company_licenses").select("license, label, kind, active"),
      ]);
      if (!live) return;
      setM({ targets: grab(t), trend: grab(tr), licences: grab(lic) });
    })();
    return () => { live = false; };
  }, []);
  return m;
}

/* The three maps every page builds from that one read. Memoise on the rows. */
export function cultTargetMap(measures) {
  const rows = measures ? measures.targets.rows : [];
  return Object.fromEntries(listOf(rows).map((r) => [r.kpi, r]));
}
export function cultTrendMap(measures) {
  const rows = measures ? measures.trend.rows : [];
  return Object.fromEntries(listOf(rows).map((r) => [r.kpi, r]));
}
export function cultLicenceMap(measures) {
  const rows = measures ? measures.licences.rows : [];
  return new Map(listOf(rows).map((r) => [r.license, r]));
}

/* ═══════════ the room label ═══════════
   A room is NEVER shown without its department. `kind` is whatever
   company_licenses serves — cultivation, manufacturing, or a kind added later —
   and it is title-cased for reading, never translated into a different word. */
export function cultRoomLabel(room, licence, licMap) {
  if (!room) return "room not recorded";
  const l = licence && licMap ? licMap.get(licence) : null;
  if (!l) return `${room} — department not recorded on this record`;
  const kind = String(l.kind);
  return `${room} (${kind.charAt(0).toUpperCase()}${kind.slice(1)}, ${l.license})`;
}

/* The sentence a page prints ONCE where its own view serves a bare room name
   with no licence beside it. Stating the limit is the requirement; inventing a
   department to fill the hole is the defect. */
export const CULT_ROOM_UNQUALIFIED =
  "This view serves the room name without the licence it sits under, so the department "
  + "cannot be resolved on these rows and is not guessed. Room names are reused across the "
  + "two buildings, so a name on its own is not an identity here. Adding the licence to the "
  + "view is filed with the database team.";

/* ═══════════ tiles ═══════════
   A tile row in the exact shape DkKpiStrip already serves, so there is ONE
   definition of a key figure on this platform and not a second one for
   Cultivation. `value` is always a count or a total of records the page has
   ALREADY READ — never a number chosen here, and never a number this file
   computes from anything the database did not serve. The drill for each of
   these opens those very rows, so the tile and its drill cannot disagree:
   they are the same array. */
export function cultTile(ord, kpi, value, unit, tone, context) {
  return { ord, kpi, value, unit, tone, context, drill: null };
}

/* The in-place drill map: every tile on a Cultivation page opens its own
   records BELOW the strip rather than navigating to a report that clears the
   filter on arrival. C1 wants the exact records, not a general report. */
export function cultInPlace(tiles, openKpi, toggle) {
  const m = {};
  for (const t of listOf(tiles)) m[t.kpi] = { open: openKpi === t.kpi, onOpen: () => toggle(t.kpi) };
  return m;
}

/* ═══════════ a collapsible section that remembers itself, per user ═══════════
   WHY THIS EXISTS RATHER THAN dashkit's Widget. Widget is welded to the drag
   board: it needs a `w` descriptor and a `layout` from useWidgetLayout, and
   mounting that on a register page would give nine more pages the department
   dashboard's grid. These pages are not dashboards with rearrangeable tiles;
   they are registers, catalogues and audits, and each lays its own body out.
   What they legitimately share is the collapse behaviour and the memory of it,
   which is this and nothing more.

   It renders the SAME .cc-panel markup the owner graded, so a section here and
   a section on the Command Center are the same object to look at. The count
   sits in the header — a section that hides how much it is hiding is why
   people expand all of them. State is remembered per user and per page through
   the store the caller passes. Collapse HIDES rather than unmounts, so a read
   behind a closed section keeps working, exactly as it does on the dashboards. */
export function CultSection({ id, store, title, count, chips, defaultOpen = true, children }) {
  const open = store.isOpen(id, defaultOpen);
  return (
    <section className="cc-panel">
      <div className="cc-panel-head">
        <button type="button" className="cc-whead" onClick={() => store.set(id, !open)} aria-expanded={open}
          title={open ? "Collapse this section — your choice is remembered on your own account" : "Expand this section"}>
          <span className="cc-panel-title">{title}</span>
          {count !== null && count !== undefined && (
            <span className="cc-panel-chips"><span className="cc-tag neutral">{Number(count).toLocaleString()}</span></span>
          )}
          {chips && <span className="cc-panel-chips">{chips}</span>}
        </button>
        <span className="cc-panel-caret" aria-hidden="true">{open ? "−" : "+"}</span>
      </div>
      <div className="cc-panel-body" style={open ? undefined : { display: "none" }}>{children}</div>
    </section>
  );
}

/* ═══════════ a proportion bar ═══════════
   Geometry only. Every colour is a .ccpage token; nothing here names one. */
export function CultShare({ pct, tone = "ok", title }) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return <span className="cult-bar-none" title={title}>not measured</span>;
  const w = Math.max(0, Math.min(100, n));
  return (
    <span className="cult-bar" title={title} role="img" aria-label={`${w.toFixed(1)} per cent`}>
      <span className={`cult-bar-fill ${tone}`} style={{ width: `${w}%` }} />
    </span>
  );
}

/* ═══════════ recent activity, from the page's own records ═══════════
   It is NOT a platform feed and does not pretend to be one: it is the most
   recent rows of the very population above it, in date order, so a manager can
   see what moved without leaving the page. Where the population carries no
   date the caller passes none and the honest empty state says which. */
export function CultActivity({ items, what, none }) {
  const list = listOf(items).filter((i) => i && i.when);
  if (!list.length) {
    return <DkEmpty why={none ?? `No dated activity in ${what ?? "these records"}.`}
      fills="This list is the most recent rows of the population on this page, in date order — so it is empty exactly when that population is." />;
  }
  return (
    <ol className="cult-feed">
      {list.map((i, n) => (
        <li key={`${i.when}|${i.what}|${n}`} className={`cult-feed-row ${i.tone ?? ""}`}>
          <span className="cult-feed-when">{String(i.when).slice(0, 10)}</span>
          <span className="cult-feed-what">{i.what}</span>
          {i.detail && <span className="cult-feed-detail">{i.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

/* ═══════════ package identity for a grading drill ═══════════
   mv_package_harvest keys a package by its internal id and carries NO tag and
   NO unit of measure. A row with neither cannot show its certificate and its
   quantity cannot be labelled — and an unlabelled quantity summed across
   categories is exactly the defect that once published 18,822 units as
   nothing. So the tag and the unit are fetched for the page of rows on screen,
   in ONE batched read keyed by id, and a row whose id resolves to nothing says
   so rather than showing a blank.

   Filed with the database team: mv_package_harvest should carry tag and uom
   itself. Until it does, this read is the join, and it is done once per page
   rather than once per row. */
export function useCultPackages(ids) {
  const key = useMemo(() => [...new Set(listOf(ids).filter((v) => v != null))].sort().join(","), [ids]);
  const [state, setState] = useState({ map: null, err: null });
  useEffect(() => {
    let live = true;
    const list = key ? key.split(",") : [];
    if (!list.length) { setState({ map: new Map(), err: null }); return undefined; }
    const CHUNK = 200;
    const chunks = [];
    for (let i = 0; i < list.length; i += CHUNK) chunks.push(list.slice(i, i + CHUNK));
    Promise.all(chunks.map((c) =>
      supabase.from("metrc_packages").select("id, tag, item_name, quantity, uom, lab_testing_state").in("id", c)))
      .then((results) => {
        if (!live) return;
        const bad = results.find((r) => r.error);
        if (bad) { setState({ map: null, err: bad.error.message }); return; }
        const m = new Map();
        for (const r of results) for (const row of listOf(r.data)) m.set(String(row.id), row);
        setState({ map: m, err: null });
      });
    return () => { live = false; };
  }, [key]);
  return state;
}

/* One number formatter for this lane, so 380 harvests and 224.8 lb are written
   the same way on all nine pages. It never appends a unit of its own: the
   caller passes the unit the DATABASE served with the figure. */
export const cultNum = (v, dp = 1) =>
  (v === null || v === undefined || v === "")
    ? null
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: dp });

/* A quantity is printed with the unit of measure the record carries, never
   with one assumed. Where the record has no unit the figure is printed with
   the reason it has none, so it is never silently read as pounds. */
export function cultQty(qty, uom) {
  const n = cultNum(qty, 2);
  if (n === null) return "not recorded";
  if (!uom) return `${n} — unit of measure not recorded on this record`;
  return `${n} ${uom}`;
}
