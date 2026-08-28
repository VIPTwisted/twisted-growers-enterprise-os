/* ═══════════════════════════════════════════════════════════════════════════
   WEIGHTS AND GRADING. Agent B, 15 Aug 2026.
   nav_registry view_key `grading`, declared against v_harvest_mass_balance.

   THE FIRST THING THIS PAGE HAS TO DO IS TELL THE TRUTH ABOUT ITSELF.
   Its declared view returns NO ROWS, measured today, because the two tables
   behind it — the manual grade sheet and the manual weight sheet — have never
   had a row entered. Rendered through the generic grid this page was simply
   blank, and a blank page is indistinguishable from a broken one. So the mass
   balance section states, in words, that nothing has been graded by hand, what
   would fill it, and who fills it.

   WHAT IT SHOWS INSTEAD OF NOTHING. The grading that DOES exist is Metrc's own
   product category on every package taken off a harvest — buds, shake and
   trim, fresh frozen, concentrate — and that is real, current and countable.
   So the page is built on the split: what came off each harvest, in which
   category, how many packages, and where a weight is genuinely in pounds, the
   pounds.

   THE UNIT TRAP ON THIS PAGE, AND HOW IT IS AVOIDED. mv_package_harvest has a
   quantity column and NO unit of measure. Its quantities are grams for some
   categories and each for others, so a total across them would be meaningless
   and dangerous. THIS PAGE NEVER TOTALS THAT COLUMN. Category totals here are
   PACKAGE COUNTS, which are safe; the only weights shown in pounds are the two
   the harvest register serves as pounds, and they are labelled as such.

   HOW IT IS LAID OUT. A split summary across the top, then one row per harvest
   showing its own category mix. Not a band, not a spine, not a card grid.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { DateRangeSelect } from "./App.jsx";
import {
  useDefaultRange, DkRangeSearch, rangeSearch,
  grab, listOf, DkTag, DkErr, DkEmpty, DkKpiStrip, DkDrill, DrillRoot, DkHead,
  TagEvidenceProvider, TagEvidence, useSectionStore,
  useWidgetLayout, Widget, WidgetBoard, WidgetBarControls, DkReports,
} from "./dashkit.jsx";
import {
  CULT_DEPT, useCultMeasures, cultTargetMap, cultTrendMap, cultLicenceMap, cultRoomLabel,
  cultTile, cultInPlace, CultShare, cultNum, cultQty, useCultPackages,
} from "./cult-kit.jsx";

const VIEW_KEY = "grading";
const PAGE_KEY = "cult_grading";

const SOURCE_NOTE = {
  label: "package counts from Metrc categories, pounds only where the record is in pounds",
  why: "Category figures are COUNTS OF PACKAGES, because the package table carries a quantity "
    + "with no unit of measure and totalling grams against each would be meaningless. The two "
    + "pound figures come from the harvest register, which serves them as pounds.",
};

export default function Grading({ go, session, role, viewAs, reports }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, PAGE_KEY);
  /* THE SECTIONS ARE ARRANGEABLE AND THE ARRANGEMENT IS THE USER'S OWN. Owner,
     16 Aug 2026: "every single dashboard need to have section as I stated where
     i can drag and put where i want to arreange dash for user preference." This
     mounts the SAME primitive the department dashboards use, saved per user
     through tg_save_dashboard_layout; the page contributes only its own list. */
  const WIDGETS = React.useMemo(() => [
    { key: "mb", title: "Hand-entered mass balance and grade sheet", span: 2 },
    { key: "split", title: "The grading that does exist — Metrc product categories", span: 2 },
    { key: "perharvest", title: "Every harvest and the grades that came off it", span: 2 },
    { key: "reports", title: "Cultivation reports", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);
  const measures = useCultMeasures();
  const [d, setD] = useState(null);
  const [openKpi, setOpenKpi] = useState(null);
  const [ver, setVer] = useState(0);
  const [pickHarvest, setPickHarvest] = useState(null);
  /* ON THE BUS. The range is resolved by useDefaultRange over f_date_presets —
     the same catalog every other page reads. Nothing is defined here. */
  const [range, setRange] = useState({ from: "", to: "" });
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const [mb, hf, pk] = await Promise.all([
        supabase.from("v_harvest_mass_balance").select("*"),
        supabase.from("v_harvest_forensic").select("*").order("harvest_started", { ascending: false, nullsFirst: false }),
        supabase.from("mv_harvest_pkg_rollup").select("*"),
      ]);
      if (!live) return;
      setD({ mb: grab(mb), hf: grab(hf), pk: grab(pk) });
    })();
    return () => { live = false; };
  }, [ver]);

  const targets = useMemo(() => cultTargetMap(measures), [measures]);
  const trend = useMemo(() => cultTrendMap(measures), [measures]);
  const licMap = useMemo(() => cultLicenceMap(measures), [measures]);

  const allHarvests = useMemo(() => (d ? d.hf.rows : []), [d]);
  /* Range and search in one place, shared with every other page. A harvest with
     no close date is kept rather than dropped — it is unplaceable, not absent. */
  const rs = useMemo(() => rangeSearch(allHarvests, {
    from: range.from, to: range.to, dateField: "harvest_closed", q,
    fields: ["harvest_name", "strain", "room", "categories_made"],
  }), [allHarvests, range.from, range.to, q]);
  const harvests = rs.rows;
  const rollup = useMemo(() => (d ? d.pk.rows : []), [d]);
  const massBalance = useMemo(() => (d ? d.mb.rows : []), [d]);

  const rollupBy = useMemo(() => new Map(listOf(rollup).map((r) => [r.harvest_name, r])), [rollup]);

  /* Every distinct category Metrc has used, with how many harvests produced it.
     A count of harvests and a count of packages are both safe across units. */
  const categories = useMemo(() => {
    const m = new Map();
    for (const r of listOf(rollup)) {
      for (const c of String(r.categories_made ? r.categories_made : "").split(",").map((x) => x.trim()).filter(Boolean)) {
        const cur = m.get(c) ? m.get(c) : { harvests: 0 };
        cur.harvests += 1;
        m.set(c, cur);
      }
    }
    return [...m.entries()].sort((a, b) => b[1].harvests - a[1].harvests);
  }, [rollup]);

  const graded = useMemo(() => listOf(harvests).filter((r) => rollupBy.get(r.harvest_name)), [harvests, rollupBy]);
  const budLb = useMemo(() => listOf(harvests).reduce((a, r) => a + Number(r.bud_lb ? r.bud_lb : 0), 0), [harvests]);
  const trimLb = useMemo(() => listOf(harvests).reduce((a, r) => a + Number(r.shake_trim_lb ? r.shake_trim_lb : 0), 0), [harvests]);
  const noCategory = useMemo(() => listOf(harvests).filter((r) => !r.categories_made), [harvests]);

  const tiles = useMemo(() => {
    let n = 0;
    return [
      cultTile(n++, "Harvests graded by hand", listOf(massBalance).length, "harvests",
        listOf(massBalance).length ? "ok" : "bad",
        "Rows in the manual mass-balance view. Where this is nothing, nobody has entered a grade sheet and the section below says so in words rather than showing a blank."),
      cultTile(n++, "Harvests with a Metrc category recorded", graded.length, "harvests", "ok",
        "Metrc records a product category on every package. That is the grading that exists today, and it is counted here from the harvest package rollup."),
      cultTile(n++, "Harvests with no category recorded at all", noCategory.length, "harvests",
        noCategory.length ? "warn" : "ok",
        "Nothing has been packaged off these, or the packages carry no product category, so there is no grade to report."),
      cultTile(n++, "Distinct categories produced", categories.length, "categories", "plain",
        "Every product category Metrc has recorded against a harvest package."),
      cultTile(n++, "Bud weight recorded", Number(budLb.toFixed(1)), "lb", "plain",
        "Totalled from the harvest register, which serves this column in pounds. It is never added to a package quantity, which carries no unit."),
      cultTile(n++, "Shake and trim weight recorded", Number(trimLb.toFixed(1)), "lb", "plain",
        "Also from the harvest register and also in pounds."),
    ];
  }, [massBalance, graded, noCategory, categories, budLb, trimLb]);

  const inPlace = useMemo(() => cultInPlace(tiles, openKpi, (k) => setOpenKpi((c) => (c === k ? null : k))), [tiles, openKpi]);
  const drillRows = useMemo(() => {
    if (openKpi === "Harvests graded by hand") return { kind: "mb", rows: listOf(massBalance) };
    if (openKpi === "Harvests with a Metrc category recorded") return { kind: "hf", rows: graded };
    if (openKpi === "Harvests with no category recorded at all") return { kind: "hf", rows: noCategory };
    if (openKpi === "Distinct categories produced") return { kind: "cat", rows: categories };
    if (openKpi === "Bud weight recorded") return { kind: "hf", rows: listOf(harvests).filter((r) => r.bud_lb !== null) };
    if (openKpi === "Shake and trim weight recorded") return { kind: "hf", rows: listOf(harvests).filter((r) => r.shake_trim_lb !== null) };
    return null;
  }, [openKpi, massBalance, graded, noCategory, categories, harvests]);

  if (d === null) {
    return <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Reading the grading position…</div></div>;
  }

  const HfRows = ({ rows }) => (
    <div className="tablewrap">
      <table>
        <thead><tr><th>Harvest</th><th>Strain</th><th>Drying room</th><th>Categories produced</th>
          <th>Packages</th><th>Bud</th><th>Shake and trim</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.harvest_name}>
              <td>{r.harvest_name}</td>
              <td>{r.strain ? r.strain : "not recorded"}</td>
              <td>{cultRoomLabel(r.drying_room, r.license, licMap)}</td>
              <td>{r.categories_made ? r.categories_made : "no category recorded on any package"}</td>
              <td>{r.packages_made === null || r.packages_made === undefined ? "none" : cultNum(r.packages_made, 0)}</td>
              <td>{r.bud_lb === null || r.bud_lb === undefined ? "no bud weight recorded" : `${cultNum(r.bud_lb)} lb`}</td>
              <td>{r.shake_trim_lb === null || r.shake_trim_lb === undefined ? "no shake or trim weight recorded" : `${cultNum(r.shake_trim_lb)} lb`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <DrillRoot label="Weights and grading">
      <div className="ccpage">
        <DkHead title="Weights and grading" viewKey={VIEW_KEY} dept={CULT_DEPT} role={role}
          viewAs={viewAs} computed={null} busy={false}>
          <DkTag tone={listOf(massBalance).length ? "ok" : "crit"}>
            {listOf(massBalance).length ? `${listOf(massBalance).length} hand-graded` : "nothing graded by hand yet"}
          </DkTag>
          <DkTag tone="neutral">{categories.length} Metrc categories in use</DkTag>
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
            <DateRangeSelect label="Closed between" from={range.from} to={range.to}
              onFrom={(v) => setRange((prev) => ({ ...prev, from: v }))}
              onTo={(v) => setRange((prev) => ({ ...prev, to: v }))}
              presetKey={dateDefault.presetKey} session={session} viewKey={VIEW_KEY} allowSave />
          </div>
          <div className="cc-tools-r">
            <button type="button" className="cc-btn" onClick={() => go("harvests")}>Harvest register →</button>
            <button type="button" className="cc-btn" onClick={() => go("moisture_loss_register")}>Moisture loss →</button>
            <button type="button" className="cc-btn" onClick={() => go("dept_dash_cultivation")}>Cultivation dashboard →</button>
          </div>
        </div>

        <DkRangeSearch id="gr-q" label="Search harvest name, strain, room or category"
          q={q} onQ={setQ} result={rs} noun="harvests" rangeLabel="this range"
          source="v_harvest_forensic" err={d.hf.err} />

        {d.hf.err ? <DkErr what="The harvest register behind this page" err={d.hf.err} /> : (
          <DkKpiStrip dept={CULT_DEPT} tiles={tiles} trend={trend} targets={targets} go={go}
            inPlace={inPlace} sourceNote={SOURCE_NOTE} onAssigned={() => setVer((v) => v + 1)}
            emptyNote="Nothing has been graded and no harvest carries a Metrc category." />
        )}
        {d.mb.err && <DkErr what="The hand-entered mass balance" err={d.mb.err} />}
        {d.pk.err && <DkErr what="The harvest package rollup" err={d.pk.err} />}
        {measures && measures.targets.err && <DkErr what="The owner-set targets" err={measures.targets.err} />}

        {drillRows && (
          <DkDrill label={`${openKpi} — every record behind the figure`} onClose={() => setOpenKpi(null)}>
            <div className="cc-fine">
              <b>{drillRows.rows.length.toLocaleString()}</b> record{drillRows.rows.length === 1 ? "" : "s"}. This
              is the same array the figure counted.
            </div>
            {drillRows.rows.length === 0
              ? <DkEmpty why="Nothing sits behind this figure right now."
                  fills="The figure counts this same list, so an empty list here is the real position rather than a failed read." />
              : drillRows.kind === "cat"
                ? <div className="cult-grades">
                    {drillRows.rows.map(([c, v]) => (
                      <div className="cult-graderow" key={c}>
                        <span>{c}</span>
                        <span><CultShare pct={(v.harvests / Math.max(1, listOf(rollup).length)) * 100} tone="ok"
                          title={`${v.harvests} harvests produced this category.`} /></span>
                        <span className="cult-figure">{cultNum(v.harvests, 0)} harvests</span>
                        <span className="cult-note">a count of harvests, which is safe across units</span>
                      </div>
                    ))}
                  </div>
                : drillRows.kind === "mb"
                  ? <div className="tablewrap">
                      <table>
                        <thead><tr><th>Harvest date</th><th>Flower room</th><th>Cultivar</th><th>Grade A</th>
                          <th>Grade B</th><th>Grade C and smalls</th><th>Trim</th><th>Unaccounted</th><th>Status</th></tr></thead>
                        <tbody>
                          {drillRows.rows.map((r, i) => (
                            <tr key={`${r.harvest_date}|${r.cultivar}|${i}`}>
                              <td>{r.harvest_date ? String(r.harvest_date).slice(0, 10) : "not recorded"}</td>
                              <td>{cultRoomLabel(r.flower_room, r.license, licMap)}</td>
                              <td>{r.cultivar ? r.cultivar : "not recorded"}</td>
                              <td>{r.grade_a_lb === null || r.grade_a_lb === undefined ? "not graded" : `${cultNum(r.grade_a_lb)} lb`}</td>
                              <td>{r.grade_b_lb === null || r.grade_b_lb === undefined ? "not graded" : `${cultNum(r.grade_b_lb)} lb`}</td>
                              <td>{r.grade_c_smalls_lb === null || r.grade_c_smalls_lb === undefined ? "not graded" : `${cultNum(r.grade_c_smalls_lb)} lb`}</td>
                              <td>{r.trim_lb === null || r.trim_lb === undefined ? "not graded" : `${cultNum(r.trim_lb)} lb`}</td>
                              <td>{r.unaccounted_variance_lb === null || r.unaccounted_variance_lb === undefined ? "not worked out" : `${cultNum(r.unaccounted_variance_lb)} lb`}</td>
                              <td>{r.status ? r.status : "not recorded"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  : <HfRows rows={drillRows.rows} />}
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            switch (w.key) {
                        case "mb": return (
              <Widget key={w.key} w={w} layout={layout} store={store} chips={<><DkTag tone="neutral">{Number(listOf(massBalance).length).toLocaleString()}</DkTag>{listOf(massBalance).length
              ? <DkTag tone="ok">entered</DkTag>
              : <DkTag tone="crit">nothing entered yet</DkTag>}</>}>
            {listOf(massBalance).length === 0
              ? <DkEmpty
                  why="No harvest has been graded by hand. This is not a failed read and it is not a rendering problem: the mass-balance view returns no rows because the grade sheet and the weight sheet behind it have never had an entry made in them."
                  fills="A row appears here the moment somebody records a grade split for a harvest — grade A, grade B, grade C and smalls, trim, fresh frozen, samples and destruction — against the wet weight it came from. Until then, the only grading this company has is the product category Metrc records on each package, which is shown in the section below and is real."
                  action={<button type="button" className="cc-btn" onClick={() => go("harvests")}>See what came off each harvest instead →</button>} />
              : <div className="tablewrap">
                  <table>
                    <thead><tr><th>Harvest date</th><th>Flower room</th><th>Cultivar</th><th>Grade A</th>
                      <th>Grade B</th><th>Grade C and smalls</th><th>Saleable yield</th><th>Status</th></tr></thead>
                    <tbody>
                      {listOf(massBalance).map((r, i) => (
                        <tr key={`${r.harvest_date}|${r.cultivar}|${i}`}>
                          <td>{r.harvest_date ? String(r.harvest_date).slice(0, 10) : "not recorded"}</td>
                          <td>{cultRoomLabel(r.flower_room, r.license, licMap)}</td>
                          <td>{r.cultivar ? r.cultivar : "not recorded"}</td>
                          <td>{r.grade_a_lb === null || r.grade_a_lb === undefined ? "not graded" : `${cultNum(r.grade_a_lb)} lb`}</td>
                          <td>{r.grade_b_lb === null || r.grade_b_lb === undefined ? "not graded" : `${cultNum(r.grade_b_lb)} lb`}</td>
                          <td>{r.grade_c_smalls_lb === null || r.grade_c_smalls_lb === undefined ? "not graded" : `${cultNum(r.grade_c_smalls_lb)} lb`}</td>
                          <td>{r.saleable_yield_pct === null || r.saleable_yield_pct === undefined ? "not worked out" : `${cultNum(r.saleable_yield_pct)} per cent`}</td>
                          <td>{r.status ? r.status : "not recorded"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
          </Widget>
              );

                        case "split": return (
              <Widget key={w.key} w={w} layout={layout} store={store} chips={<><DkTag tone="neutral">{Number(categories.length).toLocaleString()}</DkTag>{<DkTag tone="info">counts of harvests, never a total across units</DkTag>}</>}>
            {categories.length === 0
              ? <DkEmpty why="No package carries a product category against any harvest."
                  fills="A category appears here as soon as a package is created off a harvest with a product category on it." />
              : <div className="cult-grades">
                  {categories.map(([c, v]) => (
                    <div className="cult-graderow" key={c}>
                      <span>{c}</span>
                      <span><CultShare pct={(v.harvests / Math.max(1, listOf(rollup).length)) * 100} tone="ok"
                        title={`${v.harvests} harvests produced this category.`} /></span>
                      <span className="cult-figure">{cultNum(v.harvests, 0)} harvests</span>
                      <span className="cult-note">
                        {cultNum((v.harvests / Math.max(1, listOf(rollup).length)) * 100)} per cent of harvests
                      </span>
                    </div>
                  ))}
                </div>}
          </Widget>
              );

                        case "perharvest": return (
              <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false} chips={<><DkTag tone="neutral">{Number(listOf(harvests).length).toLocaleString()}</DkTag></>}>
            {listOf(harvests).length === 0
              ? <DkEmpty why="No harvest is on record." fills="Harvests arrive from the Metrc mirror." />
              : <div className="cult-grades">
                  {listOf(harvests).map((r) => (
                    <div className="cult-graderow" key={r.harvest_name}>
                      <span>
                        <button type="button" className="cult-rowbtn"
                          onClick={() => setPickHarvest(pickHarvest === r.harvest_name ? null : r.harvest_name)}
                          aria-expanded={pickHarvest === r.harvest_name}
                          title="List every package taken off this harvest with its certificate and its manifest">
                          {r.harvest_name}
                        </button>
                        <span className="cult-hrow-sub">{cultRoomLabel(r.drying_room, r.license, licMap)}</span>
                      </span>
                      <span className="cult-note">{r.categories_made ? r.categories_made : "no category recorded on any package"}</span>
                      <span className="cult-figure">
                        {r.bud_lb === null || r.bud_lb === undefined ? "no bud weight" : `${cultNum(r.bud_lb)} lb bud`}
                      </span>
                      <span className="cult-figure">
                        {r.shake_trim_lb === null || r.shake_trim_lb === undefined ? "no shake or trim weight" : `${cultNum(r.shake_trim_lb)} lb shake and trim`}
                      </span>
                    </div>
                  ))}
                </div>}
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

        {pickHarvest && (
          <DkDrill label={`${pickHarvest} — every package and its documents`} onClose={() => setPickHarvest(null)}>
            <GradePackages harvest={pickHarvest} />
          </DkDrill>
        )}
      </div>
    </DrillRoot>
  );
}

/* The packages behind one harvest, with the tag and the unit fetched in one
   batched read so a quantity is never printed without the unit it is in. */
function GradePackages({ harvest }) {
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
  const tags = useMemo(() => (pk.map ? [...pk.map.values()].map((p) => p.tag).filter(Boolean) : []), [pk.map]);

  if (state.err) return <DkErr what={`The packages taken off ${harvest}`} err={state.err} />;
  if (state.rows === null) return <div className="cc-fine">Reading the packages taken off this harvest…</div>;
  if (!state.rows.length) {
    return <DkEmpty why="No package in Metrc names this harvest as its source."
      fills="Nothing has been packaged off it, or the packages were created without the source harvest recorded." />;
  }
  return (
    <>
      {pk.err && <DkErr what="The tag and unit of measure for these packages" err={pk.err} />}
      <div className="cc-fine">
        Every package, its grade as Metrc records it, and its quantity in the unit the record
        actually carries. Quantities in different units are never added together on this page.
      </div>
      <TagEvidenceProvider tags={tags}>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Package tag</th><th>Grade as Metrc records it</th><th>Quantity</th>
              <th>Packaged on</th><th>Laboratory state</th><th>Where this record came from</th><th>Certificate and manifest</th></tr></thead>
            <tbody>
              {state.rows.map((r) => {
                const p = pk.map ? pk.map.get(String(r.package_id)) : null;
                return (
                  <tr key={r.package_id}>
                    <td>{p && p.tag ? p.tag
                      : pk.map ? "This package carries no tag in the mirror, so its documents cannot be resolved from this row."
                        : "reading…"}</td>
                    <td>{r.category ? r.category : "no category recorded"}</td>
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
    </>
  );
}
