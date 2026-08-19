# THE PAGE TEMPLATE — every page in the OS, built the same way

**Issued by the owner 19 August 2026. Corrected the same day against the live
source before anything was built on it.**

Every page MUST declare `VIEW_KEY`, seed THIS MONTH, mount the shared strip,
pass the range into **all** queries, refetch atomically when the range moves,
drill to tags/manifests/COAs/invoices/movement, respect role and viewAs, never
fabricate, never hardcode a business number, never break the tag chain, and
never bypass Agents → Reviewers → Watchers → Guard.

Those requirements stand exactly as issued. What follows is the version that
**compiles, passes the 41 gates, and runs** — the issued draft did none of the
three, and every page built from it would have carried the same six faults.

---

## The six corrections, and why each one mattered

| # | Issued draft | Reality | What would have happened |
|---|---|---|---|
| 1 | `grab("KEY", {from, to}).then(...)` | `grab` is a **pure result-shaper**, not a fetcher: `grab({data, error}) → {rows, err}` (`dashkit.jsx:45`) | `grab(...).then is not a function` — a runtime crash on **every page**, on first render |
| 2 | `<DateRangeSelect range={range} setRange={setRange} />` | Real props are `{label, from, to, onFrom, onTo, onPreset}` (`App.jsx:1382`) | Every prop `undefined`. The control renders and does nothing — a dead control on every page, which the `dead-controls` gate exists to stop |
| 3 | Imports `TagDrill, ManifestDrill, CoaDrill, InvoiceDrill, MovementDrill` | **None of the five exists.** App.jsx exports `RoomDrill`, `RoomStockDrill`, `InTransitDrill` and no others | Build fails: *does not provide an export named 'TagDrill'* |
| 4 | `useSectionStore` imported from `dashkit.jsx` | It lives in **`App.jsx:10110`** | Build fails on the import |
| 5 | `from "../App.jsx"` | Pages live in `src/`, beside App.jsx — `./App.jsx` | Build fails: path resolves outside `src/` |
| 6 | `DkKpiStrip` given `range` but **not** `computedFor` | The guard is `range && computedFor && rangeKey(range) !== rangeKey(computedFor)` (`dashkit.jsx:823`) | `stale` is permanently false. The draft's own comment promises the strip "refuses to show numbers under a label they were not computed for" — without `computedFor` it never refuses. The exact defect the strip was built for, reintroduced by the template meant to prevent it |

A seventh, smaller: the draft used `?? []` four times in the tile list. The
silent-failure ratchet sits at its ceiling of 263 and counts every occurrence
**including inside comments**. Four per page across even three pages fails the
build. `dashkit.jsx:48` keeps one frozen empty array for exactly this reason —
use `rowsOr()` or the shared empty, never a fresh nullish fallback.

---

## The template

```jsx
/* ─────────────────────────────────────────────────────────────────────────────
   <PAGE NAME> — <one line on what question this page answers>
   view_key: <PAGE_KEY>   ·   archetype: dashboard | report | drill | queue

   Every figure below is read from Supabase for the ACTIVE RANGE. Nothing on
   this page is computed in the browser from a literal, and no tile renders
   under a label it was not computed for.
   ───────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import {
  AssignTask, DateRangeSelect, rowsOr, useSectionStore,
  RoomDrill, RoomStockDrill, InTransitDrill,
} from "./App.jsx";
import {
  useDefaultRange, grab, DkHead, DkKpiStrip, DkErr, DkEmpty, DkTag,
  useWidgetLayout, WidgetBoard, Widget,
} from "./dashkit.jsx";

const VIEW_KEY = "PAGE_KEY_HERE";   // must match an enabled nav_registry row
const DEPT     = "Cultivation";     // the department this page reports for

export default function PageName({ go, session, reports, role, viewAs, onViewAs,
                                   isAdmin, viewRoles }) {
  const store = useSectionStore(session?.user?.id, VIEW_KEY);

  /* THE RANGE. Seeds THIS MONTH once per user per page from f_date_default,
     then gets out of the way — the company default is a database row, never a
     literal in this file. */
  const [range, setRange] = useState({ from: "", to: "" });
  useDefaultRange(session, VIEW_KEY, setRange);

  const [busy, setBusy] = useState(true);
  const [ver, setVer]   = useState(0);
  const [d, setD]       = useState(null);

  useEffect(() => {
    let live = true;
    setBusy(true);
    (async () => {
      /* EVERY read takes the range. A read that ignores it is the defect the
         owner has reported more times than any other on this platform. */
      const [tiles, trend, targets, rows] = await Promise.all([
        supabase.rpc("f_department_dashboard",
          { p_dept: DEPT, p_from: range.from || null, p_to: range.to || null }),
        supabase.from("v_dashboard_trend").select("*").eq("department", DEPT),
        supabase.from("kpi_targets").select("*").eq("department", DEPT),
        supabase.from("YOUR_VIEW").select("*")
          .gte("YOUR_DATE_COL", range.from || "0001-01-01")
          .lte("YOUR_DATE_COL", range.to || "9999-12-31")
          .order("YOUR_DATE_COL", { ascending: false, nullsFirst: false }),
      ]);
      if (!live) return;
      setD({
        /* The range these rows were computed FOR. DkKpiStrip compares it to the
           range now selected and shows "recomputing" rather than a figure under
           a label it does not belong to. Omit this and the guard never fires. */
        computedFor: { from: range.from, to: range.to },
        tiles: grab(tiles), trend: grab(trend),
        targets: grab(targets), rows: grab(rows),
      });
      setBusy(false);
    })();
    return () => { live = false; };
  }, [range.from, range.to, ver]);   // range in the deps, or nothing recomputes

  const defs = [{ key: "main", title: "Section title", span: 12 }];
  const layout = useWidgetLayout(VIEW_KEY, defs);

  return (
    <div className="page">
      <DkHead title="PAGE TITLE" role={role} viewAs={viewAs}
              onViewAs={onViewAs} isAdmin={isAdmin} />

      <DateRangeSelect label="Dates" from={range.from} to={range.to}
        onFrom={(v) => setRange((p) => ({ ...p, from: v }))}
        onTo={(v) => setRange((p) => ({ ...p, to: v }))} />

      {/* An error is never an empty page. Say which read failed and why. */}
      {d?.tiles.err
        ? <DkErr what="The key figures" err={d.tiles.err} />
        : <DkKpiStrip dept={DEPT} tiles={rowsOr(d?.tiles.rows)}
            range={range} computedFor={d?.computedFor}
            go={go} onAssigned={() => setVer((v) => v + 1)} />}

      <WidgetBoard layout={layout}>
        <Widget key="main">
          {d?.rows.err ? <DkErr what="The records" err={d.rows.err} />
           : !rowsOr(d?.rows.rows).length
             ? <DkEmpty what="records on this object for this range" />
             : rowsOr(d.rows.rows).map((r) => (
                 <DkTag key={r.tag} tag={r.tag} go={go} />
               ))}
        </Widget>
      </WidgetBoard>
    </div>
  );
}
```

## The drills — what actually exists

`RoomDrill`, `RoomStockDrill` and `InTransitDrill` are the three exported from
App.jsx. The tag → COA → manifest → invoice chain is **not** five separate
components: it is `DkTag` / `TagEvidence` from dashkit, backed by
`f_drill_tags`, `f_drill_events`, `f_drill_stays` and `mv_tag_documents`. One
resolver, every page — which is the ruling against 522 pages behind one screen
applied in the direction it was meant: **share primitives, never layouts.**

## Before the page ships

1. `npx vite build` — a malformed import cannot reach a gate.
2. `npm run gates` — all 41.
3. The page needs an **enabled `nav_registry` row** and **`nav_role_visibility`
   rows**, or `v_page_wiring.roles_who_can_see` is 0 and the report-contract
   gate correctly calls it a page nobody can open. Inherit the visibility of a
   sibling page rather than inventing an access rule.
4. Confirm the range actually moves the numbers — change the dates and watch a
   figure change. A picker that renders is not a picker that works.
