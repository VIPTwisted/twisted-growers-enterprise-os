/* ═══════════════════════════════════════════════════════════════════════════
   HARVESTS — the take-down register. Agent B, 15 Aug 2026.
   nav_registry view_key `harvests`, serving v_harvest_forensic.

   WHAT IT REPLACES. This page was registered and enabled but had no component,
   so it fell through to the generic data browser: a flat filterable grid of
   thirty-six columns with no key figure, no target, no drill and no way to
   assign anything to anybody. A grid is not a register.

   HOW IT IS LAID OUT, AND WHY NOT LIKE ANYTHING ELSE. Harvests are read by
   SEVERITY, because the question a grower asks this page is "which of these is
   going wrong". So the body is severity bands, worst band first, and each band
   states how many it holds before it is opened. It is not the loss ledger's
   date spine and not the strain catalogue's card grid, because it is not
   answering their question.

   EVERY FIGURE ON THE STRIP IS COUNTED FROM THE ROWS LISTED BELOW IT. Nothing
   here is read from a snapshot matview and nothing is invented: the tile counts
   an array, and pressing the tile lists that same array. The two cannot
   disagree because they are the same object. The two limits that define
   "too long" are owner-set rows in conversion_factors, read with the page —
   where a limit is absent the figure is NOT shown, because a guessed limit
   counts the wrong harvests under the right heading.

   THE ROOM ALWAYS CARRIES ITS DEPARTMENT. v_harvest_forensic serves the
   licence beside the drying room, so the department is resolved from
   company_licenses and printed with the name. Room names are reused across the
   two buildings and a bare name is not an identity.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { DateRangeSelect } from "./App.jsx";
import {
  useDefaultRange, grab, listOf, DkTag, DkErr, DkEmpty, DkKpiStrip, DkDrill, DrillRoot, DkHead,
  DkCaret, TagEvidenceProvider, TagEvidence, useSectionStore,
  useWidgetLayout, Widget, WidgetBoard, WidgetBarControls, DkReports,
} from "./dashkit.jsx";
import {
  CULT_DEPT, useCultMeasures, cultTargetMap, cultTrendMap, cultLicenceMap,
  cultRoomLabel, cultTile, cultInPlace, CultActivity, CultShare,
  cultNum, cultQty, useCultPackages,
} from "./cult-kit.jsx";

const VIEW_KEY = "harvests";
const PAGE_KEY = "cult_harvests";
const RULE_OPEN_MAX = "harvest_open_max_days";
const RULE_DRY_MAX = "dry_window_max_days";

/* Presentation order for the severity bands. This is the order a grower reads
   in, not a business figure: the values themselves come from the view and any
   value it serves that is not named here still renders, at the end, under its
   own name. Nothing is dropped for being unrecognised. */
const BAND_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, INFO: 3, OK: 4 };
const BAND_TONE = { CRITICAL: "crit", HIGH: "warn", MEDIUM: "attn", INFO: "info", OK: "ok" };

const SOURCE_NOTE = {
  label: "counted from the records listed below, live",
  why: "Every figure on this strip is counted from the harvest rows this page has just read from "
    + "v_harvest_forensic, and pressing a figure lists those very rows. Nothing here comes from a "
    + "pre-computed snapshot, so nothing here can be stale relative to the list underneath it.",
};

/* One harvest row, expandable to the packages that came off it — and every one
   of those packages carries its certificate and its manifest, or the served
   sentence saying why it has neither. */
function HxRow({ r, licMap }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="cult-hrow">
        <span className="cult-hrow-name">
          <button type="button" className="cult-rowbtn" onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            title={open ? "Close the packages taken off this harvest" : "List every package taken off this harvest, with its certificate and its manifest"}>
            <DkCaret open={open} /> {r.harvest_name}
          </button>
          <span className="cult-hrow-sub">
            {r.strain ? r.strain : "strain not recorded"} · {cultRoomLabel(r.drying_room, r.license, licMap)}
          </span>
        </span>
        <span className="cult-figure">{r.plants === null || r.plants === undefined ? "plants not recorded" : `${cultNum(r.plants, 0)} plants`}</span>
        <span className="cult-figure">{r.wet_lb === null ? "wet weight not recorded" : `${cultNum(r.wet_lb)} lb wet`}</span>
        <span className="cult-figure">{r.packaged_lb === null ? "nothing packaged" : `${cultNum(r.packaged_lb)} lb packaged`}</span>
        <span>
          {r.conversion_pct === null || r.conversion_pct === undefined
            ? <em className="cult-note">conversion cannot be worked out</em>
            : <><CultShare pct={r.conversion_pct} tone={Number(r.conversion_pct) >= 15 ? "ok" : "warn"}
                title={`${cultNum(r.conversion_pct)} per cent of the wet weight became packaged weight.`} />
              <span className="cult-note"> {cultNum(r.conversion_pct)} per cent converted</span></>}
        </span>
        <span className="cult-note">{r.what_is_wrong ? r.what_is_wrong : "nothing flagged against this harvest"}</span>
      </div>
      {open && <HxPackages harvest={r.harvest_name} />}
    </>
  );
}

/* The packages behind one harvest. mv_package_harvest keys them by internal
   identifier and carries neither the tag nor the unit of measure, so both are
   fetched for exactly these rows in one batched read. A quantity whose unit is
   unknown is NEVER printed as though it were pounds, and the totals below are
   grouped by unit rather than added across units — adding grams to each is the
   defect that once published tens of thousands of units as nothing. */
function HxPackages({ harvest }) {
  const [state, setState] = useState({ rows: null, err: null });
  useEffect(() => {
    let live = true;
    supabase.from("mv_package_harvest").select("*").eq("harvest_name", harvest)
      .order("packaged_on", { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setState({ rows: null, err: error.message }); return; }
        setState({ rows: listOf(data), err: null });
      });
    return () => { live = false; };
  }, [harvest]);
  const ids = useMemo(() => listOf(state.rows).map((r) => String(r.package_id)), [state.rows]);
  const pk = useCultPackages(ids);
  const tags = useMemo(() => {
    if (!pk.map) return [];
    return [...pk.map.values()].map((p) => p.tag).filter(Boolean);
  }, [pk.map]);

  if (state.err) return <DkErr what={`The packages taken off ${harvest}`} err={state.err} />;
  if (state.rows === null) return <div className="cc-fine">Reading the packages taken off this harvest…</div>;
  if (!state.rows.length) {
    return <DkEmpty why="No package in Metrc names this harvest as its source."
      fills="That is the real position for a harvest that has been cut but not yet packaged, and for one whose packages were created without the source harvest recorded against them." />;
  }
  return (
    <div className="cult-pkgs">
      {pk.err && <DkErr what="The tag and unit of measure for these packages" err={pk.err} />}
      <div className="cc-fine">
        Every package Metrc names against this harvest, newest first. The certificate and the
        manifest open from the row; where a row has neither, it states which of the two reasons
        applies rather than showing a blank.
      </div>
      <TagEvidenceProvider tags={tags}>
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Package tag</th><th>Category</th><th>Quantity</th><th>Packaged on</th>
                <th>Laboratory state</th><th>Where this record came from</th><th>Certificate and manifest</th></tr>
            </thead>
            <tbody>
              {state.rows.map((r) => {
                const p = pk.map ? pk.map.get(String(r.package_id)) : null;
                return (
                  <tr key={r.package_id}>
                    <td>{p && p.tag ? p.tag
                      : pk.map ? "This package carries no tag in the mirror, so its documents cannot be resolved from this row."
                        : "reading…"}</td>
                    <td>{r.category ? r.category : "category not recorded"}</td>
                    <td>{p ? cultQty(p.quantity, p.uom) : cultQty(r.quantity, null)}</td>
                    <td>{r.packaged_on ? String(r.packaged_on).slice(0, 10) : "not recorded"}</td>
                    <td>{r.lab_state ? r.lab_state : "not recorded"}</td>
                    <td>{!p ? "reading…" : p.provenance === "metrc report"
                      ? `Loaded from a Metrc report, so it is a historical record and not stock on hand${p.source_state ? ` (${p.source_state})` : ""}.`
                      : `${p.provenance ? p.provenance : "provenance not recorded"}${p.source_state ? `, ${p.source_state}` : ""}`}</td>
                    <td>{p && p.tag ? <TagEvidence tag={p.tag} compact />
                      : <span className="cult-note">no tag on this row to resolve documents against</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TagEvidenceProvider>
    </div>
  );
}

export default function HarvestsRegister({ go, session, role, viewAs, reports }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, PAGE_KEY);
  /* THE SECTIONS ARE ARRANGEABLE, AND THE ARRANGEMENT IS THE USER'S OWN.
     Owner, 16 Aug 2026: "every single dashboard need to have section as I stated
     where i can drag and put where i want to arreange dash for user preference."
     This is the SAME primitive the department dashboards mount — dragged,
     hidden, sized half or full, and saved to the caller's own row through
     tg_save_dashboard_layout. A second implementation of it would be the
     defect; the page supplies only its own list of sections. */
  const WIDGETS = React.useMemo(() => [
    { key: "bands", title: "Every harvest, worst severity first", span: 2 },
    { key: "activity", title: "Most recent take-downs in these records", span: 1 },
    { key: "reports", title: "Cultivation reports", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const measures = useCultMeasures();
  const [range, setRange] = useState({ from: "", to: "" });
  /* Opens on the company default (this month) rather than all history —
     owner charter, 19 Aug 2026: no page may show all history by default. */
  useDefaultRange(session, VIEW_KEY, setRange);
  const [d, setD] = useState(null);
  const [openKpi, setOpenKpi] = useState(null);
  const [ver, setVer] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      const [h, limits] = await Promise.all([
        supabase.from("v_harvest_forensic").select("*").order("harvest_started", { ascending: false, nullsFirst: false }),
        supabase.from("conversion_factors").select("key, value, set_by, what_it_means").in("key", [RULE_OPEN_MAX, RULE_DRY_MAX]),
      ]);
      if (!live) return;
      setD({ h: grab(h), limits: grab(limits) });
    })();
    return () => { live = false; };
  }, [ver]);

  const targets = useMemo(() => cultTargetMap(measures), [measures]);
  const trend = useMemo(() => cultTrendMap(measures), [measures]);
  const licMap = useMemo(() => cultLicenceMap(measures), [measures]);

  const rows = useMemo(() => (d ? d.h.rows : []), [d]);
  const limitRows = useMemo(() => (d ? d.limits.rows : []), [d]);
  const rule = (key) => {
    const row = listOf(limitRows).find((x) => x.key === key);
    return row && row.value != null ? { value: Number(row.value), setBy: row.set_by } : null;
  };
  const openMax = rule(RULE_OPEN_MAX);
  const dryMax = rule(RULE_DRY_MAX);

  /* The date filter narrows the POPULATION every figure and every band is then
     computed from, so the strip and the list always describe the same set. */
  const inRange = useMemo(() => listOf(rows).filter((r) => {
    if (!range.from && !range.to) return true;
    const d0 = r.harvest_started ? String(r.harvest_started).slice(0, 10) : null;
    if (!d0) return false;
    if (range.from && d0 < range.from) return false;
    if (range.to && d0 > range.to) return false;
    return true;
  }), [rows, range]);

  const stillOpen = useMemo(() => inRange.filter((r) => !r.harvest_closed), [inRange]);
  const openTooLong = useMemo(() => (openMax === null ? null
    : stillOpen.filter((r) => Number(r.total_days_start_to_now) > openMax.value)), [stillOpen, openMax]);
  const driedTooLong = useMemo(() => (dryMax === null ? null
    : inRange.filter((r) => r.dry_days_to_first_package !== null && Number(r.dry_days_to_first_package) > dryMax.value)), [inRange, dryMax]);
  const withDryTime = useMemo(() => inRange.filter((r) => r.dry_days_to_first_package !== null), [inRange]);
  const avgDry = withDryTime.length
    ? withDryTime.reduce((a, r) => a + Number(r.dry_days_to_first_package), 0) / withDryTime.length
    : null;
  const untested = useMemo(() => inRange.filter((r) => r.lab_state === "NotSubmitted"), [inRange]);
  const critical = useMemo(() => inRange.filter((r) => r.severity === "CRITICAL"), [inRange]);

  const tiles = useMemo(() => {
    const t = [];
    let n = 0;
    t.push(cultTile(n++, "Harvests still open", stillOpen.length, "harvests",
      stillOpen.length ? "warn" : "ok",
      "Cut, and not yet closed out in Metrc. An open harvest still holds its room."));
    if (openTooLong) {
      t.push(cultTile(n++, "Harvests open too long", openTooLong.length, "harvests",
        openTooLong.length ? "bad" : "ok",
        `Open longer than the owner-set limit, which is read from the business rules with this page and set by ${openMax.setBy}.`));
    }
    if (driedTooLong) {
      t.push(cultTile(n++, "Harvests dried too long", driedTooLong.length, "harvests",
        driedTooLong.length ? "bad" : "ok",
        `Dry time from cut to first package ran past the owner-set longest acceptable dry time, set by ${dryMax.setBy}. Every day past it burns off saleable weight permanently.`));
    }
    if (avgDry !== null) {
      t.push(cultTile(n++, "Average dry time", Number(avgDry.toFixed(1)), "days", "plain",
        "The mean of the cut-to-first-package column across exactly the harvests that have one. A harvest never packaged has no dry time to average, so it is absent rather than counted as nothing."));
    }
    t.push(cultTile(n++, "Harvests never submitted for testing", untested.length, "harvests",
      untested.length ? "bad" : "ok",
      "Metrc records no laboratory submission against the harvest itself. Testing is recorded on the packages taken off it, which open from each row."));
    t.push(cultTile(n++, "Harvests the view flags critical", critical.length, "harvests",
      critical.length ? "bad" : "ok",
      "The severity is the view's own judgement, served with the row and repeated here unchanged."));
    return t;
  }, [stillOpen, openTooLong, driedTooLong, avgDry, untested, critical, openMax, dryMax]);

  const inPlace = useMemo(() => cultInPlace(tiles, openKpi, (k) => setOpenKpi((c) => (c === k ? null : k))), [tiles, openKpi]);

  const drillRows = useMemo(() => {
    if (openKpi === "Harvests still open") return stillOpen;
    if (openKpi === "Harvests open too long") return listOf(openTooLong);
    if (openKpi === "Harvests dried too long") return listOf(driedTooLong);
    if (openKpi === "Average dry time") return withDryTime;
    if (openKpi === "Harvests never submitted for testing") return untested;
    if (openKpi === "Harvests the view flags critical") return critical;
    return null;
  }, [openKpi, stillOpen, openTooLong, driedTooLong, withDryTime, untested, critical]);

  const bands = useMemo(() => {
    const m = new Map();
    for (const r of inRange) {
      const k = r.severity ? r.severity : "severity not recorded";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()].sort((a, b) => {
      const ra = BAND_RANK[a[0]] === undefined ? 99 : BAND_RANK[a[0]];
      const rb = BAND_RANK[b[0]] === undefined ? 99 : BAND_RANK[b[0]];
      return ra - rb;
    });
  }, [inRange]);

  const activity = useMemo(() => inRange
    .filter((r) => r.harvest_started)
    .slice(0, 12)
    .map((r) => ({
      when: r.harvest_started,
      what: `${r.harvest_name} cut in ${cultRoomLabel(r.drying_room, r.license, licMap)}`,
      detail: r.harvest_state,
      tone: r.severity === "CRITICAL" ? "crit" : r.severity === "HIGH" ? "warn" : "ok",
    })), [inRange, licMap]);

  if (d === null) {
    return <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Reading every harvest on record…</div></div>;
  }

  return (
    <DrillRoot label="Harvests">
      <div className="ccpage">
        <DkHead title="Harvests" viewKey={VIEW_KEY} dept={CULT_DEPT} role={role} viewAs={viewAs}
          computed={null} busy={false}>
          <DkTag tone="neutral">{inRange.length.toLocaleString()} of {rows.length.toLocaleString()} in range</DkTag>
        </DkHead>

        <div className="cc-tools">
          <div className="cc-tools-l">
            <button type="button" className="cc-btn" onClick={() => setVer((v) => v + 1)}
              title="Read every harvest again from the live records">↻ read again</button>
            <button type="button" className="cc-btn" onClick={() => window.print()}
              title="Print this register exactly as it appears">🖨 print</button>
            <button type="button" className="cc-btn" title="Collapse every section — remembered on your own account"
              onClick={() => store.setAll(WIDGETS.map((x) => x.key), false)}>− collapse all</button>
            <button type="button" className="cc-btn" title="Expand every section"
              onClick={() => store.setAll(WIDGETS.map((x) => x.key), true)}>+ expand all</button>
            <WidgetBarControls layout={layout} />
          </div>
          <div className="cc-tools-c">
            <DateRangeSelect label="Cut between" from={range.from} to={range.to}
              onFrom={(v) => setRange((p) => ({ ...p, from: v }))}
              onTo={(v) => setRange((p) => ({ ...p, to: v }))} />
          </div>
          <div className="cc-tools-r">
            <button type="button" className="cc-btn" onClick={() => go("harvest_lifecycle")}
              title="The same harvests read as deadlines rather than as severity">Lifecycle and deadlines →</button>
            <button type="button" className="cc-btn" onClick={() => go("moisture_loss_register")}
              title="Where the water went on each of these harvests">Moisture loss →</button>
            <button type="button" className="cc-btn" onClick={() => go("dept_dash_cultivation")}>Cultivation dashboard →</button>
          </div>
        </div>

        {d.h.err ? <DkErr what="The harvest register" err={d.h.err} /> : (
          <DkKpiStrip dept={CULT_DEPT} tiles={tiles} trend={trend} targets={targets} go={go}
            inPlace={inPlace} sourceNote={SOURCE_NOTE} onAssigned={() => setVer((v) => v + 1)}
            emptyNote="No harvest is on record in the chosen date range, so there is nothing to count." />
        )}
        {d.limits.err && <DkErr what="The owner-set harvest and drying limits" err={d.limits.err} />}
        {!d.limits.err && openMax === null && (
          <div className="cc-fine">
            No harvest-open limit is set, so <b>no figure is shown for harvests open too long</b>. The
            limit is a business-rule row and this page will not guess one: a guessed limit counts the
            wrong harvests under the right heading.
          </div>
        )}
        {!d.limits.err && dryMax === null && (
          <div className="cc-fine">
            No longest acceptable dry time is set, so <b>no figure is shown for harvests dried too
            long</b>. The limit is a business-rule row and this page will not guess one.
          </div>
        )}
        {measures && measures.targets.err && <DkErr what="The owner-set targets" err={measures.targets.err} />}
        {measures && measures.trend.err && <DkErr what="The trend snapshots" err={measures.trend.err} />}

        {drillRows && (
          <DkDrill label={`${openKpi} — every harvest behind the figure`} onClose={() => setOpenKpi(null)}>
            <div className="cc-fine">
              <b>{drillRows.length.toLocaleString()}</b> harvest{drillRows.length === 1 ? "" : "s"},
              listed individually and grouped away from nothing. This is the same array the figure
              counted, so the two cannot disagree. Open a row to see every package taken off it with
              its certificate and its manifest.
            </div>
            {drillRows.length === 0
              ? <DkEmpty why="Nothing sits behind this figure right now." fills="The figure counts this same list, so an empty list here is the real position rather than a failed read." />
              : <div className="cult-band-body">{drillRows.map((r) => <HxRow key={r.harvest_name} r={r} licMap={licMap} />)}</div>}
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            switch (w.key) {
              case "bands": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={<><DkTag tone="neutral">{inRange.length.toLocaleString()} harvests</DkTag>
                  <DkTag tone="info">the view&rsquo;s own severity, unchanged</DkTag></>}>
            {inRange.length === 0
              ? <DkEmpty why="No harvest was cut in the chosen date range."
                  fills="Widen the range above, or choose all dates, to see the whole register."
                  action={<button type="button" className="cc-btn" onClick={() => setRange({ from: "", to: "" })}>Show all dates</button>} />
              : bands.map(([sev, list]) => (
                <div key={sev} className={`cult-band ${BAND_TONE[sev] ? BAND_TONE[sev] : "info"}`}>
                  <div className="cult-band-head">
                    <span className="cult-band-title">{sev}</span>
                    <DkTag tone="neutral">{list.length.toLocaleString()} harvests</DkTag>
                    <span className="cult-note">
                      {list.length && list[0].what_is_wrong ? list[0].what_is_wrong : "no explanation served with these rows"}
                    </span>
                  </div>
                  <div className="cult-band-body">
                    {list.map((r) => <HxRow key={r.harvest_name} r={r} licMap={licMap} />)}
                  </div>
                </div>
              ))}
              </Widget>
              );
              case "activity": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                chips={<DkTag tone="neutral">{activity.length} shown</DkTag>}>
            <CultActivity items={activity} what="the harvest register"
              none="No harvest in the chosen range carries a cut date." />
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
