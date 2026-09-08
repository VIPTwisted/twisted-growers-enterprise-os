/* ═══════════════════════════════════════════════════════════════════════════
   TAX CENTER — the empty-GL shell. 29 August 2026.
   nav_registry view_key `tax_center`, Finance › Tax.

   ─────────────────────────────────────────────────────────────────────────────
   THE THREE SYSTEMS OF RECORD, AND THIS PAGE OWNS NONE OF THEM.

     QBO    is the general ledger. Money, accounts, balances, the return.
     Metrc  is custody. What existed, where it was, who held it.
     Apex   is the order book. What was sold and to whom.

   NO SECOND LEDGER. This page computes no balance, holds no account and
   totals no money. Where a figure belongs to the GL it is not derived here
   from custody data that happens to be nearby — it is named as QBO's and left
   empty until QBO is connected. A cannabis return turns on one question, what
   legitimately belongs in COGS, and answering it from the wrong system is how
   a penalty case starts rather than a tax dispute.

   THE GL IS NOT CONNECTED, MEASURED NOT ASSUMED. `qbo_account_map` holds ten
   purposes and every `qbo_account_id` is NULL. There is no QBO transaction
   table in this database at all. So every GL surface below opens empty AND
   NAMES QBO, rather than showing a zero. A zero is a claim that something was
   counted and came to nothing; an empty state naming its source is the truth.

   WHAT IS REAL HERE TODAY. The doctrine, the cost classes, and the certified
   Metrc positions. Those are read live and they carry real figures. The
   Metrc/Apex half does not wait on QBO.

   THE BANNER IS THE DOCTRINE'S OWN FIRST SENTENCE, read from
   `tax_280e_doctrine` rather than typed here. If the owner and the CPA change
   the doctrine, this page changes with it and nobody has to remember to edit a
   string in a component.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { DateRangeSelect } from "./App.jsx";
import {
  useDefaultRange, grab, listOf, DkTag, DkErr, DkEmpty, DkHead, DkCaret,
  Widget, WidgetBoard, WidgetBarControls, useWidgetLayout, useSectionStore,
} from "./dashkit.jsx";

const DEPT = "Finance";
const VIEW_KEY = "tax_center";
const PAGE_KEY = "tax_center";

/* THE RULE THAT GOVERNS THE BANNER. Read by key, not by position: a doctrine
   row reordered must not silently change what this page leads with. */
const BANNER_RULE = "agents-do-not-take-positions";

/* ═══════════ an empty state that names its system of record ═══════════
   Owner, 29 Aug 2026: "Empty states name the SoR."

   THE DEFECT IT REPLACES. "No data" tells a reader the screen is empty, which
   they can see, and nothing about whose data is missing or who can supply it.
   Worse is a zero: on a tax surface, "COGS $0" reads as a computed answer and
   is not one. Every empty GL panel here says which system owns the figure and
   what has to happen for it to appear. */
function TaxEmpty({ sor, what, why, unblocks }) {
  return (
    <div className="cc-empty">
      <div className="cc-fine">
        <b>{what}</b> is not shown because this platform does not hold it.
      </div>
      <div className="cc-fine">
        <b>System of record: {sor}.</b> {why}
      </div>
      {unblocks && <div className="cc-fine">What would fill it: {unblocks}</div>}
      <DkTag tone="attn" title={`No figure is shown rather than a zero. A zero on a tax surface reads as a computed answer, and nothing here has been computed. ${sor} owns this number.`}>
        no figure shown — a zero would be a claim ⓘ
      </DkTag>
    </div>
  );
}

export default function TaxCenter({ go, session, role, viewAs, isAdmin, onViewAs, reports }) {
  const store = useSectionStore(session?.user?.id, VIEW_KEY);
  const [range, setRange] = useState({ from: "", to: "" });
  /* The period bus. Tax is a year question, so nav_registry governs the
     default; this page does not pick one. */
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [d, setD] = useState(null);

  const WIDGETS = React.useMemo(() => [
    { key: "doctrine", title: "The doctrine — what an agent may and may not do with a tax figure", span: 2 },
    { key: "gl", title: "The general ledger — QuickBooks Online", span: 2 },
    { key: "cogs", title: "Cost of goods sold under 471, and what 280E disallows", span: 2 },
    { key: "closes", title: "Certified positions — Metrc, counted", span: 2 },
    { key: "classes", title: "Cost classes — what may be absorbed into inventory", span: 1 },
    { key: "sor", title: "Which system answers which question", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);

  useEffect(() => {
    let live = true;
    (async () => {
      const [doctrine, classes, qbo, closes, files] = await Promise.all([
        supabase.from("tax_280e_doctrine").select("*").order("sort_order"),
        supabase.from("cost_classes").select("*").order("code"),
        /* Read to prove the GL is unmapped, never to publish a figure from it. */
        supabase.from("qbo_account_map").select("purpose, qbo_account_id, gl_code, cost_class"),
        supabase.from("metrc_rpt_point_in_time")
          .select("as_of_date, licence_number, tag"),
        supabase.from("source_export")
          .select("file_name, licence, period_stated, rows_in_file, sha256_16")
          .eq("report", "Inventory Point in Time"),
      ]);
      if (!live) return;
      setD({
        doctrine: grab(doctrine), classes: grab(classes), qbo: grab(qbo),
        closes: grab(closes), files: grab(files),
      });
    })();
    return () => { live = false; };
  }, []);

  if (dateDefault.error) {
    return <div className="ccpage"><DkErr what="The governed date range" err={dateDefault.error} /></div>;
  }
  if (!dateDefault.ready || d === null) {
    return <div className="ccpage"><div className="cc-empty">Reading the doctrine and the certified positions…</div></div>;
  }

  const banner = listOf(d.doctrine.rows).find((r) => r.rule_key === BANNER_RULE);

  /* THE GL, MEASURED. Ten purposes exist; how many are actually mapped to a
     QuickBooks account is the whole question, and it is counted rather than
     assumed to be zero. */
  const qboRows = listOf(d.qbo.rows);
  const qboMapped = qboRows.filter((r) => r.qbo_account_id).length;

  /* THE CERTIFIED POSITIONS. Counted per (as-of, licence) from the rows this
     platform holds, then set beside what the Metrc grid itself states in
     source_export. The comparison is the owner's locked certified-match rule
     and it is also enforced in the database by data_assertion
     `pit.os_matches_the_metrc_grid`; this page reports it, it does not decide
     it. Only the COUNT is compared, because the Metrc Inventory Point in Time
     report carries no quantity at all. */
  const held = new Map();
  for (const r of listOf(d.closes.rows)) {
    const k = `${r.licence_number}|${String(r.as_of_date).slice(0, 10)}`;
    held.set(k, (held.get(k) ?? 0) + 1);
  }
  const usDate = (s) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? "").trim());
    return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
  };
  const certified = listOf(d.files.rows).map((f) => {
    const asOf = usDate(f.period_stated);
    const os = asOf ? (held.get(`${f.licence}|${asOf}`) ?? 0) : null;
    const grid = Number(f.rows_in_file ?? 0);
    return { ...f, asOf, os, grid, match: asOf !== null && os === grid };
  }).filter((r) => r.asOf).sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : a.licence.localeCompare(b.licence)));
  const breaches = certified.filter((r) => !r.match).length;

  return (
    <div className="ccpage">
      <DkHead title="Tax Center" viewKey={VIEW_KEY} dept={DEPT} role={role} viewAs={viewAs}
        computed={null} busy={false}>
        <DkTag tone={breaches === 0 ? "ok" : "crit"}
          title="The owner's certified-match rule, locked 29 Aug 2026: an OS figure equals the Metrc grid, or it is a named exception. Enforced in the database by data_assertion pit.os_matches_the_metrc_grid at max_allowed 0.">
          certified positions {certified.length - breaches}/{certified.length} match ⓘ
        </DkTag>
      </DkHead>

      {/* THE DOCTRINE'S OWN SENTENCE, not one written here. */}
      {d.doctrine.err
        ? <DkErr what="The 280E doctrine" err={d.doctrine.err} />
        : banner && (
          <div className="cc-tools">
            <div className="cc-tools-l">
              <DkTag tone="info" title={banner.the_rule}>{banner.headline} ⓘ</DkTag>
              <span className="cc-fine">{banner.the_rule}</span>
            </div>
          </div>
        )}

      <div className="cc-tools">
        <div className="cc-tools-l">
          <DateRangeSelect label="Period" from={range.from} to={range.to}
            onFrom={(v) => setRange((p) => ({ ...p, from: v }))}
            onTo={(v) => setRange((p) => ({ ...p, to: v }))}
            presetKey={dateDefault.presetKey} session={session}
            viewKey={VIEW_KEY} allowSave />
          <DkTag tone="info" title="Nothing on this page is narrowed by the period yet, and it says so rather than letting you assume it moved. The doctrine, the cost classes and the certified positions are each a standing position, not a flow. The period will govern the COGS computation when the general ledger is connected — which is the figure it actually belongs to.">
            period governs the COGS computation, once the GL is connected ⓘ
          </DkTag>
          <WidgetBarControls layout={layout} />
        </div>
      </div>

      <WidgetBoard layout={layout}>
        {(w) => {
          switch (w.key) {
            case "doctrine": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={<DkTag tone="neutral">{listOf(d.doctrine.rows).length} rules</DkTag>}>
                {d.doctrine.err ? <DkErr what="The 280E doctrine" err={d.doctrine.err} /> : (
                  <div className="tablewrap">
                    <table>
                      <thead><tr><th>Rule</th><th>What it means</th><th>An agent must</th><th>An agent must never</th><th>Seen here</th><th>Authority</th></tr></thead>
                      <tbody>
                        {listOf(d.doctrine.rows).map((r) => (
                          <tr key={r.rule_key}>
                            <td><b>{r.headline}</b></td>
                            <td>{r.the_rule}</td>
                            <td>{r.agents_must ?? "—"}</td>
                            <td>{r.agents_must_never ?? "—"}</td>
                            <td>{r.trap_seen_here
                              ? <span className="cc-fine">{r.trap_seen_here}</span>
                              : <span className="cc-fine">not yet seen on this data</span>}</td>
                            <td>
                              {r.authority ?? "not cited"}
                              {r.authority_status === "unverified" && (
                                <DkTag tone="attn" title="The citation has not been checked against the source text by a qualified person. It is shown as written, not as verified.">
                                  unverified ⓘ
                                </DkTag>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Widget>
            );

            case "gl": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={<DkTag tone="crit" title="Counted on this page load from qbo_account_map, not assumed.">
                  {qboMapped} of {qboRows.length} purposes mapped to a QuickBooks account
                </DkTag>}>
                <TaxEmpty
                  sor="QuickBooks Online"
                  what="The general ledger — accounts, balances, journal entries and the trial balance"
                  why={`QBO is the ledger of record for this company. This platform holds no QBO transaction table, and of the ${qboRows.length} account purposes registered in qbo_account_map, ${qboMapped} are mapped to a QuickBooks account. Nothing here is derived from Metrc or Apex to stand in for it: custody data is not a ledger, and presenting it as one is the substitution an examiner looks for.`}
                  unblocks="A QuickBooks Online connection, and the ten purposes in qbo_account_map pointed at real accounts. Then this panel shows QBO's own figures, labelled as QBO's."
                />
                {!d.qbo.err && (
                  <div className="tablewrap" style={{ marginTop: 10 }}>
                    <table>
                      <thead><tr><th>Purpose</th><th>QuickBooks account</th><th>GL code</th><th>Cost class</th></tr></thead>
                      <tbody>
                        {qboRows.map((r) => (
                          <tr key={r.purpose}>
                            <td>{r.purpose}</td>
                            <td>{r.qbo_account_id ?? <span className="cc-fine">not mapped</span>}</td>
                            <td>{r.gl_code ?? <span className="cc-fine">not mapped</span>}</td>
                            <td>{r.cost_class ?? <span className="cc-fine">not set</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {d.qbo.err && <DkErr what="The QuickBooks account map" err={d.qbo.err} />}
              </Widget>
            );

            case "cogs": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={<DkTag tone="attn">waiting on the ledger</DkTag>}>
                <TaxEmpty
                  sor="QuickBooks Online, classified against cost_classes"
                  what="Cost of goods sold, and the deductions 280E disallows"
                  why="This is the figure the whole federal outcome turns on, and it is a classification of LEDGER costs — not something custody data can produce. Deriving a COGS number from Metrc weights and calling it cost is the trap the doctrine names as transfer-price-is-not-cost: a declared transfer price on a compliance manifest is a regulatory declaration, not an invoice and not a payment."
                  unblocks="The GL connected above, and every cost carrying a class from cost_classes. cost_classes covers LABOUR only today — non-labour costs have no classifier yet, which the doctrine records as a live gap rather than a solved problem."
                />
              </Widget>
            );

            case "closes": return (
              <Widget key={w.key} w={w} layout={layout} store={store}
                chips={<>
                  <DkTag tone={breaches === 0 ? "ok" : "crit"}>{certified.length - breaches} of {certified.length} match the Metrc grid</DkTag>
                  <DkTag tone="attn" title="The Metrc Inventory Point in Time report has no weight, count or unit-of-measure column at all. It certifies WHICH TAGS were held, never how much. Any pound or dollar figure for a close is a reconstruction from other sources and says so.">
                    tags only — this report carries no quantity ⓘ
                  </DkTag>
                </>}>
                {d.closes.err ? <DkErr what="The certified positions" err={d.closes.err} />
                  : certified.length === 0
                    ? <DkEmpty why="No Inventory Point in Time export is registered in source_export."
                        fills="A Point in Time export downloaded from the Metrc web UI and registered. It is not an API endpoint, so it cannot be pulled automatically." />
                    : (
                      <div className="tablewrap">
                        <table>
                          <thead><tr><th>Licence</th><th>As of</th><th className="num">Metrc grid</th><th className="num">This platform</th><th>Verdict</th><th>File</th></tr></thead>
                          <tbody>
                            {certified.map((r) => (
                              <tr key={`${r.licence}|${r.asOf}`}>
                                <td>{r.licence}</td>
                                <td>{r.asOf}</td>
                                <td className="num">{r.grid.toLocaleString()}</td>
                                <td className="num">{r.os.toLocaleString()}</td>
                                <td>
                                  {r.match
                                    ? <DkTag tone="ok">match</DkTag>
                                    : <DkTag tone="crit" title="The owner's certified-match rule is locked: an OS figure equals the Metrc grid or it is a named exception. This one is neither.">
                                        breach {r.os - r.grid > 0 ? "+" : ""}{r.os - r.grid}
                                      </DkTag>}
                                </td>
                                <td className="cc-fine">
                                  {r.file_name}
                                  {r.sha256_16 && <DkTag tone="neutral" title={`The file is hashed in source_export: ${r.sha256_16}. The copy on disk can be checked against the copy that was counted.`}>hashed ⓘ</DkTag>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
              </Widget>
            );

            case "classes": return (
              <Widget key={w.key} w={w} layout={layout} store={store}>
                {d.classes.err ? <DkErr what="The cost classes" err={d.classes.err} /> : (
                  <>
                    <div className="tablewrap">
                      <table>
                        <thead><tr><th>Class</th><th>Into COGS</th><th>Deductible under 280E</th></tr></thead>
                        <tbody>
                          {listOf(d.classes.rows).map((r) => (
                            <tr key={r.code}>
                              <td><b>{r.name}</b><div className="cc-fine">{r.note}</div></td>
                              <td>{r.cogs ? <DkTag tone="ok">yes</DkTag> : <DkTag tone="crit">no</DkTag>}</td>
                              <td>{r.irc_280e_deductible ? <DkTag tone="ok">yes</DkTag> : <DkTag tone="crit">no</DkTag>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <DkTag tone="attn" title="The doctrine records this as a live gap: cost_classes today covers LABOUR only, in four classes. Non-labour costs have no classifier, so they cannot yet be classified against 471 at all.">
                      labour only — non-labour costs have no classifier yet ⓘ
                    </DkTag>
                  </>
                )}
              </Widget>
            );

            case "sor": return (
              <Widget key={w.key} w={w} layout={layout} store={store}>
                <div className="tablewrap">
                  <table>
                    <thead><tr><th>Question</th><th>Answered by</th></tr></thead>
                    <tbody>
                      <tr><td>What did it cost, and what was it booked to?</td><td><b>QuickBooks Online</b> — the general ledger</td></tr>
                      <tr><td>What existed, where was it, who held it?</td><td><b>Metrc</b> — custody</td></tr>
                      <tr><td>What was sold, to whom, for how much?</td><td><b>Apex</b> — the order book</td></tr>
                      <tr><td>What may be absorbed into inventory?</td><td><b>cost_classes</b>, against IRC 471</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="cc-fine" style={{ marginTop: 8 }}>
                  This platform is a read-only mirror. It holds no write credential for any of
                  the three, publishes no second ledger, and does not reconcile one of them into
                  another silently — where two disagree, both are shown with their own basis.
                </div>
              </Widget>
            );

            default: return null;
          }
        }}
      </WidgetBoard>
    </div>
  );
}
