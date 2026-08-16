/* ═══════════════════════════════════════════════════════════════════════════
   GENETICS — the cultivar catalogue. Agent B, 15 Aug 2026.
   nav_registry view_key `genetics`, serving `cultivars`.

   WHAT IT REPLACES. A seven-column generic grid of thirty rows with a date
   filter on it. A catalogue has no date range: the question is what exists and
   what is in use, and a date filter on that question is simply wrong.

   HOW IT IS LAID OUT. SEARCH FIRST, then a card per cultivar. That is the
   catalogue archetype and it is deliberately unlike every other page in this
   lane: no severity band, no date spine, no ranking.

   THE HARD PART, AND WHY THE TWO LISTS ARE SIDE BY SIDE RATHER THAN JOINED.
   `cultivars` is our own canonical list and keys on a clean name. Metrc keys
   its strains on its own names, which carry a house prefix and sometimes a
   number. Identity on this platform is the TAG; a name is a label that
   resolves, and joining these two lists on their names would manufacture
   matches that are not in the data. So the catalogue and the live Metrc strain
   census are shown as what they are — two independent lists — and every figure
   says which list it counted. An alias that IS recorded is shown on the card,
   because a recorded alias is evidence and a guessed one is not.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import {
  grab, listOf, DkTag, DkErr, DkEmpty, DkKpiStrip, DkDrill, DrillRoot, DkHead, useSectionStore,
} from "./dashkit.jsx";
import {
  CULT_DEPT, useCultMeasures, cultTargetMap, cultTrendMap, cultTile, cultInPlace,
  CultSection, cultNum,
} from "./cult-kit.jsx";

const VIEW_KEY = "genetics";
const PAGE_KEY = "cult_genetics";

const SOURCE_NOTE = {
  label: "counted from the two lists below, live, never joined on a name",
  why: "Figures about the catalogue count rows of `cultivars`; figures about live plants count "
    + "rows of the Metrc strain census. The two are never joined on a name, because identity "
    + "here is the tag and a name is only a label that resolves.",
};

export default function Genetics({ go, session, role, viewAs }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, PAGE_KEY);
  const measures = useCultMeasures();
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");
  const [openKpi, setOpenKpi] = useState(null);
  const [ver, setVer] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      const [c, s] = await Promise.all([
        supabase.from("cultivars").select("*").order("canonical_name"),
        supabase.from("mv_strain_census").select("*").order("live_plants_now", { ascending: false, nullsFirst: false }),
      ]);
      if (!live) return;
      setD({ c: grab(c), s: grab(s) });
    })();
    return () => { live = false; };
  }, [ver]);

  const targets = useMemo(() => cultTargetMap(measures), [measures]);
  const trend = useMemo(() => cultTrendMap(measures), [measures]);
  const cats = useMemo(() => (d ? d.c.rows : []), [d]);
  const census = useMemo(() => (d ? d.s.rows : []), [d]);

  const shownCats = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = (text) => !needle || String(text ? text : "").toLowerCase().includes(needle);
    return listOf(cats).filter((r) => hit(r.canonical_name) || hit(r.breeder)
      || listOf(r.aliases).some((a) => hit(a)));
  }, [cats, q]);
  const shownCensus = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return listOf(census).filter((r) => !needle || String(r.strain ? r.strain : "").toLowerCase().includes(needle));
  }, [census, q]);

  const active = useMemo(() => listOf(cats).filter((r) => r.status === "active"), [cats]);
  const withAlias = useMemo(() => listOf(cats).filter((r) => listOf(r.aliases).length > 0), [cats]);
  const withBreeder = useMemo(() => listOf(cats).filter((r) => r.breeder), [cats]);
  const standing = useMemo(() => listOf(census).filter((r) => Number(r.live_plants_now) > 0), [census]);
  const livePlants = useMemo(() => standing.reduce((a, r) => a + Number(r.live_plants_now ? r.live_plants_now : 0), 0), [standing]);

  const tiles = useMemo(() => {
    let n = 0;
    return [
      cultTile(n++, "Cultivars in our catalogue", listOf(cats).length, "cultivars", "plain",
        "Rows of our own canonical cultivar list. This is what we call things, not what Metrc calls them."),
      cultTile(n++, "Catalogue entries marked active", active.length, "cultivars", "ok",
        "The status recorded on the row. An inactive cultivar stays in the catalogue so its history still resolves."),
      cultTile(n++, "Catalogue entries with a recorded alias", withAlias.length, "cultivars",
        withAlias.length ? "ok" : "warn",
        "An alias is the only evidence that two spellings are the same plant. Where none is recorded, no match is assumed anywhere on this platform."),
      cultTile(n++, "Catalogue entries with no breeder recorded", listOf(cats).length - withBreeder.length, "cultivars",
        listOf(cats).length - withBreeder.length ? "warn" : "ok",
        "Breeder is blank on these rows. It is shown as missing rather than filled in from anywhere else."),
      cultTile(n++, "Strains standing in the rooms right now", standing.length, "strains",
        "plain",
        "Counted from the Metrc strain census, which is a different list from the catalogue above and is never joined to it on a name."),
      cultTile(n++, "Live plants across those strains", livePlants, "plants", "plain",
        "Totalled from the live plant count the census serves per strain."),
    ];
  }, [cats, active, withAlias, withBreeder, standing, livePlants]);

  const inPlace = useMemo(() => cultInPlace(tiles, openKpi, (k) => setOpenKpi((c2) => (c2 === k ? null : k))), [tiles, openKpi]);

  const drill = useMemo(() => {
    if (openKpi === "Cultivars in our catalogue") return { kind: "cat", rows: listOf(cats) };
    if (openKpi === "Catalogue entries marked active") return { kind: "cat", rows: active };
    if (openKpi === "Catalogue entries with a recorded alias") return { kind: "cat", rows: withAlias };
    if (openKpi === "Catalogue entries with no breeder recorded") {
      return { kind: "cat", rows: listOf(cats).filter((r) => !r.breeder) };
    }
    if (openKpi === "Strains standing in the rooms right now") return { kind: "census", rows: standing };
    if (openKpi === "Live plants across those strains") return { kind: "census", rows: standing };
    return null;
  }, [openKpi, cats, active, withAlias, standing]);

  if (d === null) {
    return <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Reading the cultivar catalogue…</div></div>;
  }

  return (
    <DrillRoot label="Genetics">
      <div className="ccpage">
        <DkHead title="Genetics — the cultivar catalogue" viewKey={VIEW_KEY} dept={CULT_DEPT}
          role={role} viewAs={viewAs} computed={null} busy={false}>
          <DkTag tone="neutral">{listOf(cats).length} in the catalogue</DkTag>
          <DkTag tone="info" title="A catalogue answers what exists and what is in use. A date range on that question would be meaningless, so this page has none.">
            no date range — a catalogue has no period
          </DkTag>
        </DkHead>

        <div className="cc-tools">
          <div className="cc-tools-l">
            <button type="button" className="cc-btn" onClick={() => setVer((v) => v + 1)}>↻ read again</button>
            <button type="button" className="cc-btn" onClick={() => window.print()}>🖨 print</button>
          </div>
          <div className="cc-tools-r">
            <button type="button" className="cc-btn" onClick={() => go("harvests")}>Harvest register →</button>
            <button type="button" className="cc-btn" onClick={() => go("dept_dash_cultivation")}>Cultivation dashboard →</button>
          </div>
        </div>

        {d.c.err ? <DkErr what="The cultivar catalogue" err={d.c.err} /> : (
          <DkKpiStrip dept={CULT_DEPT} tiles={tiles} trend={trend} targets={targets} go={go}
            inPlace={inPlace} sourceNote={SOURCE_NOTE} onAssigned={() => setVer((v) => v + 1)}
            emptyNote="The catalogue holds no cultivar." />
        )}
        {d.s.err && <DkErr what="The Metrc strain census" err={d.s.err} />}
        {measures && measures.targets.err && <DkErr what="The owner-set targets" err={measures.targets.err} />}

        {drill && (
          <DkDrill label={`${openKpi} — every record behind the figure`} onClose={() => setOpenKpi(null)}>
            <div className="cc-fine">
              <b>{drill.rows.length.toLocaleString()}</b> record{drill.rows.length === 1 ? "" : "s"}, from{" "}
              {drill.kind === "cat" ? "our own catalogue" : "the Metrc strain census"}. This is the same
              array the figure counted.
            </div>
            {drill.rows.length === 0
              ? <DkEmpty why="Nothing sits behind this figure right now." fills="The figure counts this same list." />
              : <div className="tablewrap">
                  <table>
                    {drill.kind === "cat" ? (
                      <>
                        <thead><tr><th>Cultivar</th><th>Recorded aliases</th><th>Breeder</th><th>Status</th></tr></thead>
                        <tbody>
                          {drill.rows.map((r) => (
                            <tr key={r.id}>
                              <td>{r.canonical_name}</td>
                              <td>{listOf(r.aliases).length ? listOf(r.aliases).join(", ") : "no alias recorded"}</td>
                              <td>{r.breeder ? r.breeder : "breeder not recorded"}</td>
                              <td>{r.status ? r.status : "status not recorded"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    ) : (
                      <>
                        <thead><tr><th>Strain in Metrc</th><th>Live now</th><th>Flowering</th>
                          <th>Vegetative</th><th>Rooms</th><th>Lifetime packaged</th><th>Last planted</th></tr></thead>
                        <tbody>
                          {drill.rows.map((r) => (
                            <tr key={`${r.license}|${r.strain}`}>
                              <td>{r.strain}</td>
                              <td>{cultNum(r.live_plants_now, 0)}</td>
                              <td>{cultNum(r.flowering_now, 0)}</td>
                              <td>{cultNum(r.vegetative_now, 0)}</td>
                              <td>{r.in_rooms ? r.in_rooms : "rooms not recorded"}</td>
                              <td>{r.lifetime_packaged_lbs === null || r.lifetime_packaged_lbs === undefined
                                ? "nothing packaged" : `${cultNum(r.lifetime_packaged_lbs)} lb`}</td>
                              <td>{r.last_planted ? String(r.last_planted).slice(0, 10) : "not recorded"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    )}
                  </table>
                </div>}
          </DkDrill>
        )}

        <div className="cult-body">
          <div className="cult-search">
            <label className="cc-fine" htmlFor="gen-q">Search the catalogue and the census</label>
            <input id="gen-q" type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="a cultivar name, an alias or a breeder" />
            {q && <button type="button" className="cc-btn" onClick={() => setQ("")}>clear</button>}
            <span className="cult-note">
              {shownCats.length} of {listOf(cats).length} catalogue entries and{" "}
              {shownCensus.length} of {listOf(census).length} Metrc strains match.
            </span>
          </div>

          <CultSection id="cat" store={store} title="Our catalogue — what we call each cultivar" count={shownCats.length}
            chips={<DkTag tone="info">our own canonical names</DkTag>}>
            {shownCats.length === 0
              ? <DkEmpty why="No catalogue entry matches that search."
                  fills="Search matches the canonical name, any recorded alias, and the breeder."
                  action={<button type="button" className="cc-btn" onClick={() => setQ("")}>Clear the search</button>} />
              : <div className="cult-cards">
                  {shownCats.map((r) => (
                    <div className="cult-card" key={r.id}>
                      <div className="cult-cardname">{r.canonical_name}</div>
                      <div className="cult-cardline">
                        <span>Status</span><b>{r.status ? r.status : "not recorded"}</b>
                      </div>
                      <div className="cult-cardline">
                        <span>Breeder</span><b>{r.breeder ? r.breeder : "not recorded"}</b>
                      </div>
                      <div className="cult-cardline">
                        <span>Recorded aliases</span>
                        <b>{listOf(r.aliases).length ? listOf(r.aliases).join(", ") : "none"}</b>
                      </div>
                      {listOf(r.aliases).length === 0 && (
                        <p className="cult-note">
                          No alias is recorded, so nothing on this platform treats another spelling as
                          this cultivar. If Metrc names it differently, record the alias here and the
                          two resolve everywhere at once.
                        </p>
                      )}
                    </div>
                  ))}
                </div>}
          </CultSection>

          <CultSection id="census" store={store} title="Standing in the rooms — the Metrc strain census"
            count={shownCensus.length}
            chips={<DkTag tone="attn">a separate list, never joined to the catalogue on a name</DkTag>}>
            {d.s.err
              ? <DkErr what="The Metrc strain census" err={d.s.err} />
              : shownCensus.length === 0
                ? <DkEmpty why="No Metrc strain matches that search."
                    fills="This list is Metrc&rsquo;s own strain names, which carry a house prefix and sometimes a number, so a catalogue name may not match one here."
                    action={<button type="button" className="cc-btn" onClick={() => setQ("")}>Clear the search</button>} />
                : <div className="cult-cards">
                    {shownCensus.map((r) => (
                      <div className="cult-card" key={`${r.license}|${r.strain}`}>
                        <div className="cult-cardname">{r.strain}</div>
                        <div className="cult-cardline"><span>Live plants now</span><b>{cultNum(r.live_plants_now, 0)}</b></div>
                        <div className="cult-cardline"><span>Flowering</span><b>{cultNum(r.flowering_now, 0)}</b></div>
                        <div className="cult-cardline"><span>Vegetative</span><b>{cultNum(r.vegetative_now, 0)}</b></div>
                        <div className="cult-cardline"><span>Harvest events</span><b>{cultNum(r.harvest_events, 0)}</b></div>
                        <div className="cult-cardline">
                          <span>Packaged, lifetime</span>
                          <b>{r.lifetime_packaged_lbs === null || r.lifetime_packaged_lbs === undefined
                            ? "none" : `${cultNum(r.lifetime_packaged_lbs)} lb`}</b>
                        </div>
                        <p className="cult-note">
                          {r.in_rooms ? `Standing in ${r.in_rooms}.` : "No room recorded against these plants."}
                        </p>
                      </div>
                    ))}
                  </div>}
          </CultSection>
        </div>
      </div>
    </DrillRoot>
  );
}
