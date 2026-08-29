/* ═══════════════════════════════════════════════════════════════════════════
   SALES HISTORY — every manifest. Agent B, 15 Aug 2026.
   nav_registry view_key `sales_history`, Finance › Sales History.

   THIS PAGE IS A LEDGER. It reads down the months, opens to the manifests in a
   month, and opens again to the priced lines on a manifest with the tag's
   certificate and manifest on the row. It is not a directory (Customers), not a
   document room (Customer Manifests) and not an order book (Orders). Those three
   share this page's primitives and none of its layout.

   ─────────────────────────────────────────────────────────────────────────────
   WHY IT DOES NOT READ ITS OWN REGISTERED VIEW, AND WHY THAT IS SAID ON SCREEN.

   `nav_registry` points this page at `v_sales_history`. That view is wrong, and
   measured wrong today rather than suspected:

     v_sales_history reads  raw ->> 'RecipientFacilityLicenseNumber'
                            raw ->> 'ReceivedDateTime'
                            raw ->> 'ShipmentTypeName'
     Metrc puts those keys at the top level WITH NULL VALUES and the real values
     one level down, in raw -> '_delivery'. Measured over all 2,616 outgoing
     transfers: 0 have a licence at the shallow path and 2,544 have one at the
     deep path; 0 have a received timestamp shallow and 2,503 have one deep.

   The visible consequence is a money-surface figure that is the opposite of the
   truth: the view's delivery_status labels 2,582 manifests "NOT CONFIRMED
   RECEIVED" when 2,503 of them carry Metrc's own received timestamp. The real
   number of unconfirmed outgoing manifests is 113.

   `v_customer_directory` gets this right on the same data — it COALESCEs the two
   paths — so the fix is known and small. It is a database change and this lane
   holds no write, so the defect is stated on the page under its own name and the
   page reads sources that are correct. A page may not silently repeat a figure
   it knows to be wrong, and may not silently correct one either.

   ─────────────────────────────────────────────────────────────────────────────
   REVENUE IS NOT QUOTED HERE, ON PURPOSE.

   The Sales & Cash dashboard already publishes "Revenue — TWO ANSWERS … DO NOT
   QUOTE REVENUE until the two reports reconcile." This page does not overrule
   that with a headline of its own. It shows each answer beside the others with
   its own basis, and states that they are never added. The largest single reason
   they differ is on screen: $1,199,521 of the wholesale report's value is
   consigned to a TRANSPORTER — Eagle Eyes Transport Solutions and MMM Transport —
   which is a custody leg, not a sale to a customer (check_defect CD-2).
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { rowsOr } from "./App.jsx";
import {
  grab, listOf, DkTag, DkErr, DkEmpty, DkHead, DkDrill, DrillRoot, DkCaret,
  useDefaultRange, DkFrameNote,
  Widget, WidgetBoard, WidgetBarControls, useWidgetLayout, useSectionStore,
  TagEvidence, TagEvidenceProvider, DkNarrative, DkReports, DkTasks,
} from "./dashkit.jsx";
/* The range rule itself, written once and unit-tested. This page spelled it out
   inline as `inRange`, and applied it to one of the three reads. */
import { rangeSearch } from "./lib/range-search.js";
/* The one date control the rest of the OS already uses — imported, not rebuilt. */
import { DateRangeSelect } from "./App.jsx";
import {
  FinKpiStrip, FinMoney, FinQty, FinBasis, FinDefect, FinCard, FinActions, FinAnswer,
  FinReading, FinCapped, finReadAll, finTotalsByUnit, useFinTargets, useFinRead,
} from "./fin-kit.jsx";

const DEPT = "Finance";
const VIEW_KEY = "sales_history";
const PAGE_KEY = "fin_sales_history";

/* The wholesale report's own columns. `amount` is the SHIPPER's stated price and
   `receiver_amount` is the receiver's — two different declarations of the same
   line, and they are never added to each other. */
const W_COLS = "manifest_number,invoice_number,item,item_category,destination_licence," +
  "destination_facility,amount,receiver_amount,shipped_qty,shipped_uom,shipped_lb," +
  "voided,created_on,received_on,licence";

const money = (rows, field) => listOf(rows).reduce((a, r) => a + Number(r[field] ?? 0), 0);
const uniq = (rows, field) => new Set(listOf(rows).map((r) => r[field]).filter(Boolean)).size;
const ymd = (v) => (v ? String(v).slice(0, 10) : null);

/* ═══════════ the three answers, side by side, never added ═══════════ */
function FinAnswers({ live, apex, wholesaleErr }) {
  const wUnknown = wholesaleErr && `Metrc's wholesale report could not be read: ${wholesaleErr}.`;
  return (
    <>
      <div className="fin-answers">
        <FinAnswer
          label="Metrc wholesale report — the shipper's own stated price"
          value={live.shipperValue} unit="$" unknown={wUnknown}
          note={`${live.lines.toLocaleString()} priced lines on ${live.manifests.toLocaleString()} manifests, voided lines excluded. This is Metrc's own report of what left the building and what we said it was worth.`} />
        <FinAnswer
          label="The same report — the RECEIVER's stated price"
          value={live.receiverValue} unit="$" unknown={wUnknown}
          note="The counterparty's own declaration on the same lines. It is far smaller because most receivers state nothing; it is shown because a blank is not a zero and the reader should see which it is." />
        <FinAnswer
          label="Apex orders matched to a Metrc manifest"
          value={apex.matchedValue} unit="$"
          unknown={apex.err && `v_apex_order_metrc_link could not be read: ${apex.err}.`}
          note={`${apex.matched.toLocaleString()} orders matched by invoice number. A further ${apex.unexplained.toLocaleString()} Apex orders worth ${Math.round(apex.unexplainedValue).toLocaleString()} dollars match no manifest at all — they are on the Orders page.`} />
      </div>
      <div className="fin-neveradd">
        <b>These are three answers to one question and they are never added together.</b> They
        count overlapping populations on different bases: the first two are the same lines priced by two
        different parties, and the third is a different system&rsquo;s order book joined to a subset of the
        same manifests. The Sales &amp; Cash dashboard&rsquo;s standing instruction applies here —
        <b> do not quote a revenue figure until they reconcile.</b> The largest single named reason they
        differ is directly below: value consigned to a transporter is not a sale.
      </div>
    </>
  );
}

/* ═══════════ the priced lines on one manifest ═══════════
   Every line carries the tag's certificate and manifest, or the served reason
   each is absent (rule C3a). The tags come from Metrc's own package-transfer
   report, so a line with no tag says which — never a blank. */
function ManifestLines({ manifest }) {
  const d = useFinRead(async () => {
    const [w, p] = await Promise.all([
      supabase.from("metrc_rpt_wholesale").select(W_COLS).eq("manifest_number", manifest),
      supabase.from("metrc_rpt_package_transfers")
        .select("package_tag,item,category,strain,source_harvest,source_package,shipped_qty,shipped_uom,shipped_lb,shipper_wholesale_price,receiver_wholesale_price,status,received_on,destination_facility,destination_licence")
        .eq("manifest_number", manifest),
    ]);
    return { w: grab(w), p: grab(p) };
  }, [manifest], 0);

  if (d === null) return <FinReading what={`the lines on manifest ${manifest}`} />;
  if (d.w.err) return <DkErr what={`The priced lines on manifest ${manifest}`} err={d.w.err} />;

  const tags = d.p.rows.map((r) => r.package_tag).filter(Boolean);
  const byUnit = finTotalsByUnit(d.p.rows, "shipped_qty", "shipped_uom");
  const lineValue = money(d.w.rows.filter((r) => !r.voided), "amount");

  return (
    <TagEvidenceProvider tags={tags}>
      <FinBasis
        source={`metrc_rpt_wholesale and metrc_rpt_package_transfers, both filtered to manifest ${manifest}`}
        included={`${d.w.rows.length} priced lines and ${d.p.rows.length} package rows`}
        excluded="nothing — every row Metrc's own reports hold for this manifest is below" />

      {d.p.err && <DkErr what="The package rows for this manifest" err={d.p.err} />}

      <h4 className="cc-striplabel">Packages on the manifest, with their evidence</h4>
      {d.p.rows.length === 0
        ? <DkEmpty why={`Metrc's package-transfer report holds no package rows for manifest ${manifest}.`}
            fills="That report is loaded from Metrc's own exports; a manifest priced on the wholesale report but absent from the package report has not been exported yet, or was priced without itemised packages." />
        : (
          <div className="fin-tablewrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Package tag</th><th>Item</th><th>Category</th><th>Cultivar</th>
                  <th>Source harvest</th><th className="num">Quantity shipped</th>
                  <th className="num">Weight</th><th className="num">Shipper price</th>
                  <th>Status</th><th>Certificate of Analysis and manifest</th>
                </tr>
              </thead>
              <tbody>
                {d.p.rows.map((r, i) => (
                  <tr key={(r.package_tag ?? "no-tag") + i}>
                    <td>{r.package_tag ?? <span className="fin-docwhy">No package tag on this row of Metrc&rsquo;s report.</span>}</td>
                    <td>{r.item ?? <span className="fin-docwhy">Item not recorded.</span>}</td>
                    <td>{r.category ?? <span className="fin-docwhy">Category not recorded.</span>}</td>
                    <td>{r.strain ?? <span className="fin-docwhy">No single cultivar — a blend has none, and the tag is the identity.</span>}</td>
                    <td>{r.source_harvest ?? r.source_package ?? <span className="fin-docwhy">Neither a source harvest nor a source package is named on this row.</span>}</td>
                    <td className="num"><FinQty qty={r.shipped_qty} uom={r.shipped_uom} /></td>
                    <td className="num">{r.shipped_lb == null
                      ? <span className="fin-docwhy">No weight recorded.</span>
                      : <FinQty qty={r.shipped_lb} uom="lb" />}</td>
                    <td className="num">{r.shipper_wholesale_price == null
                      ? <span className="fin-docwhy">No price on this package row.</span>
                      : <FinMoney cents value={r.shipper_wholesale_price} />}</td>
                    <td>{r.status ?? <span className="fin-docwhy">Status not recorded.</span>}</td>
                    <td>{r.package_tag
                      ? <TagEvidence tag={r.package_tag} compact />
                      : <span className="fin-docwhy">No tag on this row, so no certificate or manifest can be resolved for it.</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Totals — kept apart by unit of measure, never added together</td>
                  <td className="num">{byUnit.map((u) => (
                    <div key={u.uom ?? "none"}><FinQty qty={u.qty} uom={u.uom} /></div>
                  ))}</td>
                  <td className="num"><FinQty qty={d.p.rows.reduce((a, r) => a + Number(r.shipped_lb ?? 0), 0)} uom="lb" /></td>
                  <td className="num"><FinMoney cents value={money(d.p.rows, "shipper_wholesale_price")} /></td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

      <h4 className="cc-striplabel">The priced lines on the wholesale report</h4>
      {d.w.rows.length === 0
        ? <DkEmpty why={`The Metrc wholesale report prices nothing on manifest ${manifest}.`}
            fills="1,335 of the 2,616 outgoing manifests are unpriced, and almost all of them are internal moves between our own two licences or laboratory samples — neither is a sale." />
        : (
          <div className="fin-tablewrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Item</th><th>Category</th><th>Invoice number</th><th>Destination</th>
                  <th className="num">Quantity</th><th className="num">Shipper price</th>
                  <th className="num">Receiver price</th><th>Voided</th>
                </tr>
              </thead>
              <tbody>
                {d.w.rows.map((r, i) => (
                  <tr key={r.item + i} className={r.voided ? "fin-voided" : undefined}>
                    <td>{r.item ?? <span className="fin-docwhy">Item not recorded.</span>}</td>
                    <td>{r.item_category ?? <span className="fin-docwhy">Category not recorded.</span>}</td>
                    <td>{r.invoice_number || <span className="fin-docwhy">No invoice number was entered on the Metrc side.</span>}</td>
                    <td>{r.destination_facility ?? <span className="fin-docwhy">Destination facility not named.</span>}
                      {r.destination_licence && <div className="fin-docwhy">licence {r.destination_licence}</div>}</td>
                    <td className="num"><FinQty qty={r.shipped_qty} uom={r.shipped_uom} /></td>
                    <td className="num"><FinMoney cents value={r.amount} /></td>
                    <td className="num">{r.receiver_amount == null || Number(r.receiver_amount) === 0
                      ? <span className="fin-docwhy">The receiver stated no price. Blank is not zero.</span>
                      : <FinMoney cents value={r.receiver_amount} />}</td>
                    <td>{r.voided ? "Voided" : "No"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Value on this manifest, voided lines excluded</td>
                  <td className="num"><FinMoney cents value={lineValue} /></td>
                  <td className="num"><FinMoney cents value={money(d.w.rows.filter((r) => !r.voided), "receiver_amount")} /></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
    </TagEvidenceProvider>
  );
}

/* ═══════════ a set of manifests, listed, each opening to its lines ═══════════ */
function ManifestList({ rows, note }) {
  const [open, setOpen] = useState(null);
  const byManifest = useMemo(() => {
    const m = new Map();
    for (const r of listOf(rows)) {
      const g = m.get(r.manifest_number) ?? {
        manifest_number: r.manifest_number, created_on: r.created_on, received_on: r.received_on,
        destination_facility: r.destination_facility, destination_licence: r.destination_licence,
        invoice_number: r.invoice_number, licence: r.licence,
        lines: 0, voided: 0, value: 0, lb: 0,
      };
      g.lines += 1;
      if (r.voided) g.voided += 1; else g.value += Number(r.amount ?? 0);
      g.lb += Number(r.shipped_lb ?? 0);
      if (!g.created_on || (r.created_on && r.created_on < g.created_on)) g.created_on = r.created_on;
      m.set(r.manifest_number, g);
    }
    return [...m.values()].sort((a, b) => String(b.created_on ?? "").localeCompare(String(a.created_on ?? "")));
  }, [rows]);

  if (!byManifest.length) {
    return <DkEmpty why="No manifest falls in this selection." fills="That is a real position from the rows read for this page, not a failed read." />;
  }
  return (
    <>
      {note && <div className="cc-fine">{note}</div>}
      <div className="fin-tablewrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Manifest</th><th>Shipped</th><th>Received</th><th>Destination</th>
              <th>Invoice number</th><th>Under licence</th>
              <th className="num">Lines</th><th className="num">Weight</th><th className="num">Value</th>
            </tr>
          </thead>
          <tbody>
            {byManifest.map((m) => (
              <React.Fragment key={m.manifest_number}>
                <tr>
                  <td>
                    <button className="fin-rowbtn" aria-expanded={open === m.manifest_number}
                      onClick={() => setOpen(open === m.manifest_number ? null : m.manifest_number)}
                      title={open === m.manifest_number ? "Close this manifest." : "Open every package and every priced line on this manifest, with each tag's certificate."}>
                      <DkCaret open={open === m.manifest_number} />{m.manifest_number}
                    </button>
                  </td>
                  <td>{ymd(m.created_on) ?? <span className="fin-docwhy">No ship date on the report row.</span>}</td>
                  <td>{ymd(m.received_on) ?? <span className="fin-docwhy">Not recorded as received on this report.</span>}</td>
                  <td>{m.destination_facility ?? <span className="fin-docwhy">Destination not named.</span>}
                    {m.destination_licence && <div className="fin-docwhy">licence {m.destination_licence}</div>}</td>
                  <td>{m.invoice_number || <span className="fin-docwhy">No invoice number entered in Metrc.</span>}</td>
                  <td>{m.licence ?? <span className="fin-docwhy">Licence not recorded.</span>}</td>
                  <td className="num">{m.lines.toLocaleString()}{m.voided > 0 && <div className="fin-docwhy">{m.voided} voided</div>}</td>
                  <td className="num">{m.lb > 0 ? <FinQty qty={m.lb} uom="lb" /> : <span className="fin-docwhy">No weight on these lines.</span>}</td>
                  <td className="num"><FinMoney cents value={m.value} /></td>
                </tr>
                {open === m.manifest_number && (
                  <tr>
                    <td colSpan={9}>
                      <DkDrill label={`Manifest ${m.manifest_number} — every package and every priced line`}
                        onClose={() => setOpen(null)}>
                        <ManifestLines manifest={m.manifest_number} />
                      </DkDrill>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>{byManifest.length.toLocaleString()} manifests — the total below is the sum of exactly these rows</td>
              <td className="num">{byManifest.reduce((a, m) => a + m.lines, 0).toLocaleString()}</td>
              <td className="num"><FinQty qty={byManifest.reduce((a, m) => a + m.lb, 0)} uom="lb" /></td>
              <td className="num"><FinMoney cents value={byManifest.reduce((a, m) => a + m.value, 0)} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

/* ═══════════ the month spine ═══════════ */
function MonthLedger({ rows }) {
  const [open, setOpen] = useState(null);
  const months = useMemo(() => {
    const m = new Map();
    for (const r of listOf(rows)) {
      const k = r.created_on ? String(r.created_on).slice(0, 7) : "no date recorded";
      const g = m.get(k) ?? { month: k, manifests: new Set(), lines: 0, value: 0, lb: 0, voided: 0 };
      g.manifests.add(r.manifest_number);
      g.lines += 1;
      g.lb += Number(r.shipped_lb ?? 0);
      if (r.voided) g.voided += 1; else g.value += Number(r.amount ?? 0);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.month.localeCompare(a.month));
  }, [rows]);

  if (!months.length) {
    return <DkEmpty why="The wholesale report holds no priced lines at all."
      fills="metrc_rpt_wholesale is loaded from Metrc's own report exports by the ledger lane. An empty table means no export has been loaded, not that nothing was sold." />;
  }
  return (
    <>
      <FinBasis source="metrc_rpt_wholesale, every row, grouped by the month the transfer was created"
        included="the shipper's own stated price on lines that are not voided"
        excluded="voided lines from the value; they are still counted and shown in the voided column" />
      <div className="fin-months">
        {months.map((m) => (
          <React.Fragment key={m.month}>
            <button className={`fin-month ${open === m.month ? "on" : ""}`}
              aria-expanded={open === m.month}
              onClick={() => setOpen(open === m.month ? null : m.month)}
              title={open === m.month ? "Close this month." : `Open every manifest in ${m.month}.`}>
              <span className="fin-month-k"><DkCaret open={open === m.month} />{m.month}</span>
              <span className="fin-month-v"><em>manifests</em><b>{m.manifests.size.toLocaleString()}</b></span>
              <span className="fin-month-v"><em>priced lines</em><b>{m.lines.toLocaleString()}{m.voided > 0 ? ` (${m.voided} voided)` : ""}</b></span>
              <span className="fin-month-v"><em>weight shipped</em><b>{m.lb > 0 ? `${m.lb.toLocaleString(undefined, { maximumFractionDigits: 1 })} lb` : "none recorded"}</b></span>
              <span className="fin-month-v"><em>value, shipper&rsquo;s price</em><b><FinMoney value={m.value} /></b></span>
            </button>
            {open === m.month && (
              <DkDrill label={`${m.month} — every manifest priced in the month`} onClose={() => setOpen(null)}>
                <ManifestList rows={listOf(rows).filter((r) => (r.created_on ? String(r.created_on).slice(0, 7) : "no date recorded") === m.month)} />
              </DkDrill>
            )}
          </React.Fragment>
        ))}
      </div>
    </>
  );
}

/* ═══════════ counterparty types — who the money actually went to ═══════════ */
function CounterpartyBand({ rows, prefixes }) {
  const [open, setOpen] = useState(null);
  const typeOf = useMemo(() => {
    /* Licence prefixes are OWNER-EDITABLE ROWS in licence_type_prefix, and our
       own licences are rows in company_licenses. Neither a prefix nor a licence
       number is written into this file — rule G2, and the literal-licences gate
       caught the two that were in this very comment, which is the point of it.
       Longest prefix wins, exactly as f_facility_type does it in the database. */
    const sorted = [...listOf(prefixes)].sort((a, b) => String(b.prefix).length - String(a.prefix).length);
    return (lic) => {
      const up = String(lic ?? "").trim().toUpperCase();
      if (!up) return null;
      return sorted.find((p) => up.startsWith(String(p.prefix).toUpperCase()))?.facility_type ?? null;
    };
  }, [prefixes]);

  const groups = useMemo(() => {
    const m = new Map();
    for (const r of listOf(rows)) {
      if (r.voided) continue;
      const t = typeOf(r.destination_licence) ?? "licence prefix not in the owner's list";
      const g = m.get(t) ?? { type: t, value: 0, manifests: new Set(), facilities: new Set() };
      g.value += Number(r.amount ?? 0);
      g.manifests.add(r.manifest_number);
      if (r.destination_licence) g.facilities.add(r.destination_licence);
      m.set(t, g);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [rows, typeOf]);

  if (!groups.length) {
    return <DkEmpty why="No priced line carries a destination licence." fills="Counterparty type is resolved from the destination licence against licence_type_prefix, the owner-editable table. With no licence there is nothing to resolve." />;
  }
  return (
    <>
      <FinBasis
        source="metrc_rpt_wholesale destination licences, typed against licence_type_prefix — the owner-editable table, never a literal in this page"
        included="lines that are not voided"
        caution="A Transporter is not a customer. Value consigned to one is a custody leg on the way somewhere else, and counting it as revenue is the open defect CD-2. It is shown as its own card rather than folded into a total." />
      <div className="fin-cards">
        {groups.map((g) => (
          <FinCard key={g.type} open={open === g.type} onToggle={() => setOpen(open === g.type ? null : g.type)}
            name={g.type}
            sub={`${g.facilities.size} ${g.facilities.size === 1 ? "facility" : "facilities"} · ${g.manifests.size} manifests`}
            title={open === g.type ? "Close." : `Open every manifest that went to a ${g.type}.`}
            figures={[{ k: "value shipped", v: g.value, money: true }, { k: "manifests", v: g.manifests.size.toLocaleString() }]}
            chips={g.type === "Transporter"
              ? <DkTag tone="crit" title="Consigned to a transporter, which is custody in transit rather than a sale to a customer. Open defect CD-2.">not a sale — custody leg</DkTag>
              : g.type.startsWith("licence prefix")
                ? <DkTag tone="attn" title="The destination licence does not match any prefix in licence_type_prefix, so its facility type cannot be resolved. Add the prefix rather than guessing the type.">type cannot be resolved</DkTag>
                : null} />
        ))}
      </div>
      {open && (
        <DkDrill label={`Every manifest consigned to a ${open}`} onClose={() => setOpen(null)}>
          <ManifestList rows={listOf(rows).filter((r) => !r.voided &&
            (typeOf(r.destination_licence) ?? "licence prefix not in the owner's list") === open)} />
        </DkDrill>
      )}
    </>
  );
}

/* ═══════════════════ the page ═══════════════════ */
export default function SalesHistoryPage({ go, session, reports, role, viewAs, onViewAs, isAdmin, viewRoles }) {
  const store = useSectionStore(session?.user?.id, VIEW_KEY);
  const [ver, setVer] = useState(0);
  const [tile, setTile] = useState(null);
  /* Governed by nav_registry.default_range for view_key 'sales_history'
     (this_month_td), resolved by f_date_default. Declared above the early return
     below, because a hook that runs only when the read has landed changes the
     hook order between renders. */
  const [range, setRange] = useState({ from: "", to: "" });
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const { targets, trend, err: targetErr } = useFinTargets(DEPT);

  const WIDGETS = useMemo(() => [
    { key: "answers", title: "Revenue has more than one answer — every one of them, with its basis", span: 2 },
    { key: "months", title: "The ledger — every month, opening to its manifests and their lines", span: 2 },
    { key: "who", title: "Where the money went — by the counterparty's own licence type", span: 2 },
    { key: "unpriced", title: "Outgoing manifests the wholesale report does not price", span: 2 },
    { key: "words", title: "In plain words — the period, and signed notes", span: 2 },
    { key: "tasks", title: "Tasks raised from this page", span: 1 },
    { key: "reports", title: "Finance reports — by group", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);

  const d = useFinRead(async () => {
    const [w, prefixes, out, apex, tasks] = await Promise.all([
      finReadAll("metrc_rpt_wholesale", W_COLS, (q) => q.order("created_on", { ascending: false })),
      supabase.from("licence_type_prefix").select("prefix,facility_type"),
      finReadAll("metrc_transfers", "manifest_number,created_on,recipient,license",
        (q) => q.eq("direction", "outgoing").order("created_on", { ascending: false })),
      /* Same 1,000-row PostgREST cap that hid two thirds of the order book on
         the Orders page. Here it did not hide a row anyone was looking for — it
         silently understated every Apex figure on this strip, because the counts
         were taken over the first 1,000 orders and presented as the book. */
      /* order_date is read for one reason: without it the four Apex figures on
         this strip cannot honour the period, and a figure that cannot honour the
         period must say so. It can, so it does. */
      finReadAll("v_apex_order_metrc_link", "link_status,total_dollars,order_date"),
      supabase.from("v_dashboard_tasks").select("*"),
    ]);
    return { w, prefixes: grab(prefixes), out, apex, tasks: grab(tasks) };
  }, [], ver);

  if (d === null) {
    return <div className="finpage"><FinReading what="the whole sales ledger" /></div>;
  }

  /* ONE PLACE, SO EVERY TILE MOVES TOGETHER. The month ledger, the revenue
     answers, the counterparty split and every manifest list all derive from
     wRows, so narrowing it here is what makes the whole page honour the period
     rather than one widget honouring it and the rest quietly not.

     Compared as ISO text: created_on already starts with YYYY-MM-DD and so does
     the bus, so no timezone can move a line out of its own day.

     A line with no created_on is unplaceable, not excluded — spec: "Undated rows
     are not dropped." It stays in every figure so it can be found and fixed. */
  const periodNarrowed = Boolean(range.from || range.to);
  const wRs = rangeSearch(d.w.rows, { from: range.from, to: range.to, dateField: "created_on" });
  const wRows = wRs.rows;
  const live = {
    lines: wRows.filter((r) => !r.voided).length,
    manifests: uniq(wRows, "manifest_number"),
    shipperValue: money(wRows.filter((r) => !r.voided), "amount"),
    receiverValue: money(wRows.filter((r) => !r.voided), "receiver_amount"),
  };
  const voidedLines = wRows.filter((r) => r.voided);

  /* Transporter value, resolved from the owner's own prefix table. */
  const prefixSorted = [...d.prefixes.rows].sort((a, b) => String(b.prefix).length - String(a.prefix).length);
  const typeOf = (lic) => {
    const up = String(lic ?? "").trim().toUpperCase();
    if (!up) return null;
    return prefixSorted.find((p) => up.startsWith(String(p.prefix).toUpperCase()))?.facility_type ?? null;
  };
  const transporterRows = wRows.filter((r) => !r.voided && typeOf(r.destination_licence) === "Transporter");

  /* ─── THE TWO SIDES OF A DIFFERENCE MUST COVER THE SAME PERIOD ──────────
     The pricing coverage gap, computed from the two reads this page already made
     so the tile and its drill cannot disagree.

     THE DEFECT THIS CLOSES, AND IT WAS A WRONG NUMBER ON A MONEY SURFACE.
     `pricedSet` was built from wRows, which the period narrows, while the
     population it was subtracted from was every outgoing manifest ever recorded.
     Open the page on its governed default of this_month_td and the tile compared
     THREE YEARS of outgoing manifests against ONE MONTH of priced ones, so almost
     every manifest the company has ever shipped read as "left the building, went
     to somebody else, and Metrc puts no price on it". The figure was not slightly
     off; under any narrow frame it was very nearly the whole book, and it sat on a
     tile toned `warn` next to real money.

     A difference is only meaningful when both of its sides answer the same
     question. Both are now narrowed by the same rule on the same field, so the
     tile asks "of the manifests that went out in THIS period, how many does the
     wholesale report price" — which is the question the label always claimed. */
  const outRs = rangeSearch(d.out.rows, { from: range.from, to: range.to, dateField: "created_on" });
  const pricedSet = new Set(wRows.map((r) => r.manifest_number));
  const outByManifest = new Map();
  for (const r of outRs.rows) {
    if (!outByManifest.has(r.manifest_number)) outByManifest.set(r.manifest_number, r);
  }
  const unpriced = [...outByManifest.values()].filter((r) => !pricedSet.has(r.manifest_number));
  /* Internal moves are named by the recipient being us. `company_licenses` names
     our licences and the recipient string carries our company name; the manifest
     ledger classifies on the same basis in the database. */
  const unpricedExternal = unpriced.filter((r) => !/twisted/i.test(String(r.recipient ?? "")));

  /* The Apex side takes the period too. It was the last block on this page
     computed over the whole book while the control above it moved everything
     else — so a reader comparing "value shipped" against "matched in Apex" was
     comparing one month against three years without being told. */
  const apexRs = rangeSearch(d.apex.rows, { from: range.from, to: range.to, dateField: "order_date" });
  const apexRows = apexRs.rows;
  const apexAgg = {
    err: d.apex.err,
    matched: apexRows.filter((r) => r.link_status === "MATCHED").length,
    matchedValue: money(apexRows.filter((r) => r.link_status === "MATCHED"), "total_dollars"),
    unexplained: apexRows.filter((r) => r.link_status === "APEX ONLY — UNEXPLAINED").length,
    unexplainedValue: money(apexRows.filter((r) => r.link_status === "APEX ONLY — UNEXPLAINED"), "total_dollars"),
  };

  const openTasks = d.tasks.rows.filter((t) => t.department === DEPT);
  const T = (k) => tile === k;
  const toggle = (k) => setTile(tile === k ? null : k);

  /* WHICH READ EACH TILE DEPENDS ON. A tile whose source did not come back
     prints no number at all — the reason goes here and FinKpiStrip renders it
     instead of a figure. Fault injection with no session found five tiles on
     this page publishing $0 and 0 manifests while every read behind them had
     been refused, which on a money surface reads as "we shipped nothing". */
  const wUnknown = d.w.err && `Metrc's wholesale report could not be read: ${d.w.err}.`;
  const prefixUnknown = d.prefixes.err
    && `The owner's licence-type table could not be read: ${d.prefixes.err}. Without it no destination licence can be resolved to a facility type, so a transporter cannot be told from a customer.`;
  const outUnknown = d.out.err && `Metrc's outgoing transfer record could not be read: ${d.out.err}.`;

  const tiles = [
    {
      key: "value", label: "Value shipped, shipper's own price", value: live.shipperValue, unit: "$",
      tone: "plain", open: T("value"), onOpen: () => toggle("value"), unknown: wUnknown,
      context: "Not a revenue figure. Three answers exist and they are never added — see the section below.",
      basis: `Sum of metrc_rpt_wholesale.amount over ${live.lines.toLocaleString()} non-voided lines. Opens exactly those lines.`,
    },
    {
      key: "manifests", label: "Manifests priced on the wholesale report", value: live.manifests, unit: "manifests",
      tone: "plain", open: T("manifests"), onOpen: () => toggle("manifests"), unknown: wUnknown,
      basis: "Distinct manifest numbers in metrc_rpt_wholesale.",
    },
    {
      key: "transporter", label: "Value consigned to a transporter, not sold", value: money(transporterRows, "amount"), unit: "$",
      tone: "bad", open: T("transporter"), onOpen: () => toggle("transporter"),
      unknown: wUnknown || prefixUnknown,
      context: "A custody leg on the way somewhere else. Counting it as revenue is open defect CD-2.",
      basis: "Destination licences whose facility type is Transporter in licence_type_prefix — the owner's own table.",
    },
    {
      key: "voided", label: "Voided lines on the report", value: voidedLines.length, unit: "lines",
      tone: voidedLines.length > 0 ? "warn" : "good", open: T("voided"), onOpen: () => toggle("voided"),
      unknown: wUnknown,
      context: "Excluded from every value on this page, and shown so the exclusion is visible rather than assumed.",
      basis: "metrc_rpt_wholesale rows where voided is true.",
    },
    {
      key: "unpriced", label: "Outgoing manifests with no price, not internal", value: unpricedExternal.length, unit: "manifests",
      tone: unpricedExternal.length > 0 ? "warn" : "good", open: T("unpriced"), onOpen: () => toggle("unpriced"),
      /* This one needs BOTH reads: the transfer record for the population and
         the wholesale report for what is priced. Either missing makes the
         difference between them meaningless rather than zero. */
      unknown: outUnknown || wUnknown,
      context: "Left the building, went to somebody else, and Metrc's wholesale report puts no price on it.",
      basis: `${unpriced.length.toLocaleString()} of ${outByManifest.size.toLocaleString()} outgoing manifests ${periodNarrowed ? "in this period " : ""}are unpriced; ${(unpriced.length - unpricedExternal.length).toLocaleString()} of those are moves to ourselves and are excluded here. Both sides of that difference are narrowed by the same period on the same field — comparing every manifest ever sent against one month of priced ones is what this tile used to do.`,
    },
  ];

  return (
    <DrillRoot label="Sales History">
      <div className="finpage">
        <DkHead title="Sales history — every manifest" viewKey={VIEW_KEY} dept={DEPT}
          role={role} viewAs={viewAs} computed={null} busy={false} />
        <div className="fin-filters">
          <DateRangeSelect label="Shipped between" from={range.from} to={range.to}
            onFrom={(v) => setRange((p) => ({ ...p, from: v }))}
            onTo={(v) => setRange((p) => ({ ...p, to: v }))}
            presetKey={dateDefault.presetKey} session={session}
            viewKey={VIEW_KEY} allowSave />
          {dateDefault.error && <span className="note bad" role="alert">{dateDefault.error}</span>}
          {periodNarrowed && (
            <button className="cc-btn" onClick={() => setRange({ from: "", to: "" })}
              title="Show every period again.">show all periods</button>
          )}
          <span className="fin-count">
            {periodNarrowed
              ? `${wRows.length.toLocaleString()} of ${d.w.rows.length.toLocaleString()} wholesale lines fall in this period.`
              : `All ${d.w.rows.length.toLocaleString()} wholesale lines shown, every period.`}
          </span>
        </div>

        <div className="cc-tools">
          <div className="cc-tools-l">
            <button className="cc-btn" onClick={() => store.setAll(WIDGETS.map((w) => w.key), false)}
              title="Collapse every section — remembered for you on this device.">− collapse all</button>
            <button className="cc-btn" onClick={() => store.setAll(WIDGETS.map((w) => w.key), true)}
              title="Expand every section.">+ expand all</button>
            <WidgetBarControls layout={layout} />
            {isAdmin && (
              <select className="cc-input cc-viewsel" value={viewAs ?? ""}
                aria-label="View this page as another role — presentation preview only"
                onChange={(e) => onViewAs(e.target.value || null)}>
                <option value="">view as…</option>
                {rowsOr(viewRoles).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
          </div>
          <FinActions onReread={() => setVer((v) => v + 1)} busy={false} go={go} />
        </div>

        <FinDefect
          object="v_sales_history"
          what="This page is registered against v_sales_history, and that view reads three Metrc fields at the wrong depth. Metrc puts RecipientFacilityLicenseNumber, ReceivedDateTime and ShipmentTypeName at the top of the transfer object with null values, and the real values one level down inside _delivery. The view reads only the top level."
          measured="Over all 2,616 outgoing transfers: 0 carry a recipient licence at the path the view reads and 2,544 carry one at the real path; 0 carry a received timestamp at the path the view reads and 2,503 carry one at the real path. The view therefore labels 2,582 manifests “NOT CONFIRMED RECEIVED” when the true number of unconfirmed outgoing manifests is 113."
          instead="Nothing on this page is read from v_sales_history. Value comes from Metrc's own wholesale report, packages from Metrc's own package-transfer report, and counterparty type from the owner's licence-prefix table. Each figure names its source underneath itself."
          filed="v_customer_directory already COALESCEs both paths on the same data, so the correction is known and small. It is a database change and this lane holds no write; it is filed with the database owner rather than worked around in the browser." />

        {d.w.err && <DkErr what="The Metrc wholesale report" err={d.w.err} />}
        {d.out.err && <DkErr what="The Metrc transfer record" err={d.out.err} />}
        {d.prefixes.err && <DkErr what="The owner's licence-type prefixes" err={d.prefixes.err} />}
        <FinCapped read={d.w} what="The Metrc wholesale report" />
        <FinCapped read={d.out} what="The Metrc outgoing transfer record" />
        <FinCapped read={d.apex} what="The Apex order book" />

        {/* THREE READS, ONE FRAME, SAID OUT LOUD. The wholesale report, the
            outgoing transfer record and the Apex order book are now narrowed by
            the same period on their own business date. Until today only the first
            of the three was, and the tiles that subtracted one from another were
            silently comparing different spans of time. */}
        <div className="cc-tools-l" style={{ marginBottom: 8 }}>
          <DkFrameNote basis="period" range={range}
            what="Every figure on this strip — the wholesale report, the outgoing manifests and the Apex book"
            why="All three sources are narrowed by the selected period on their own date: created_on for the two Metrc reports, order_date for Apex. Any tile that subtracts one from another therefore compares the same span on both sides. Lines carrying no date are kept and counted rather than dropped." />
          {(wRs.undated > 0 || outRs.undated > 0 || apexRs.undated > 0) && (
            <DkTag tone="attn" title="A row with no date is unplaceable, not outside the window. These are kept in every figure so they can be found and fixed rather than quietly reducing a total.">
              undated and kept — {wRs.undated.toLocaleString()} priced lines, {outRs.undated.toLocaleString()} outgoing manifests, {apexRs.undated.toLocaleString()} Apex orders ⓘ
            </DkTag>
          )}
        </div>

        <FinKpiStrip department={DEPT} tiles={tiles} targets={targets} trend={trend}
          targetErr={targetErr} onAssigned={() => setVer((v) => v + 1)} />

        {T("value") && (
          <DkDrill label="Every non-voided priced line behind the value shipped" onClose={() => setTile(null)}>
            <ManifestList rows={wRows.filter((r) => !r.voided)}
              note="These are exactly the rows the tile totalled. Open any manifest for its packages and each tag's certificate." />
          </DkDrill>
        )}
        {T("manifests") && (
          <DkDrill label="Every manifest the wholesale report prices" onClose={() => setTile(null)}>
            <ManifestList rows={wRows} />
          </DkDrill>
        )}
        {T("transporter") && (
          <DkDrill label="Every line consigned to a transporter — custody, not a sale" onClose={() => setTile(null)}>
            <ManifestList rows={transporterRows}
              note="A transporter holds material on the way to somebody else. Until the counterparty ruling is wired into the sales views, this value is still being counted as revenue elsewhere in the platform — that is open defect CD-2." />
          </DkDrill>
        )}
        {T("voided") && (
          <DkDrill label="Every voided line on the wholesale report" onClose={() => setTile(null)}>
            <ManifestList rows={voidedLines}
              note="Voided lines are excluded from every value on this page. They are listed here so the exclusion can be checked rather than taken on trust." />
          </DkDrill>
        )}
        {T("unpriced") && (
          <DkDrill label="Outgoing manifests with no price on the wholesale report" onClose={() => setTile(null)}>
            <FinBasis source="metrc_transfers where direction is outgoing, less every manifest number present in metrc_rpt_wholesale"
              included="manifests whose recipient is not ourselves"
              caution="Most unpriced manifests are laboratory samples or moves between our own two licences and are correctly unpriced. What is below is what remains after moves to ourselves are removed — it still includes laboratory samples, which are named on each row by their recipient." />
            {unpricedExternal.length === 0
              ? <DkEmpty why="Every outgoing manifest that went to somebody else carries a price on Metrc's wholesale report." />
              : (
                <div className="fin-tablewrap">
                  <table className="fin-table">
                    <thead><tr><th>Manifest</th><th>Shipped</th><th>Went to</th><th>Under licence</th></tr></thead>
                    <tbody>
                      {unpricedExternal.map((r) => (
                        <tr key={r.manifest_number}>
                          <td>{r.manifest_number}</td>
                          <td>{ymd(r.created_on) ?? <span className="fin-docwhy">No date on the transfer row.</span>}</td>
                          <td>{r.recipient ?? <span className="fin-docwhy">No recipient named on the transfer.</span>}</td>
                          <td>{r.license ?? <span className="fin-docwhy">Licence not recorded.</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            switch (w.key) {
              case "answers": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={<DkTag tone="attn" title="The Sales & Cash dashboard publishes this as a standing instruction and this page does not overrule it.">do not quote a revenue figure yet</DkTag>}>
                  <FinAnswers live={live} apex={apexAgg} wholesaleErr={d.w.err} />
                </Widget>
              );
              case "months": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={d.w.err
                    ? <DkTag tone="crit" title={d.w.err}>read failed — no count</DkTag>
                    : <DkTag tone="neutral">{live.manifests.toLocaleString()} manifests priced</DkTag>}>
                  {d.w.err ? <DkErr what="The ledger" err={d.w.err} /> : <MonthLedger rows={wRows} />}
                </Widget>
              );
              case "who": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={(d.w.err || d.prefixes.err)
                    ? <DkTag tone="crit" title={d.w.err || d.prefixes.err}>read failed — nothing can be typed</DkTag>
                    : <DkTag tone="info" title="Resolved from the destination licence against licence_type_prefix.">typed from the owner&rsquo;s licence table</DkTag>}>
                  {d.w.err ? <DkErr what="The Metrc wholesale report" err={d.w.err} />
                    : d.prefixes.err ? <DkErr what="The owner's licence-type prefixes" err={d.prefixes.err} />
                    : <CounterpartyBand rows={wRows} prefixes={d.prefixes.rows} />}
                </Widget>
              );
              case "unpriced": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                  chips={(d.out.err || d.w.err)
                    ? <DkTag tone="crit" title={d.out.err || d.w.err}>read failed — no count</DkTag>
                    : <DkTag tone={unpricedExternal.length ? "attn" : "ok"}>{unpricedExternal.length.toLocaleString()} to somebody else</DkTag>}>
                  {(d.out.err || d.w.err)
                    ? <DkErr what="The unpriced-manifest comparison" err={d.out.err || d.w.err} />
                    : (
                      <>
                        <FinBasis source="metrc_transfers outgoing, less the manifests metrc_rpt_wholesale prices"
                          included={`${unpriced.length.toLocaleString()} unpriced manifests in total`}
                          excluded={`${(unpriced.length - unpricedExternal.length).toLocaleString()} moves between our own two licences`} />
                        <div className="cc-fine">
                          Press the tile above named &ldquo;Outgoing manifests with no price, not internal&rdquo; to
                          open the list. It is the same set of rows this section counts, read once.
                        </div>
                      </>
                    )}
                </Widget>
              );
              case "words": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}>
                  <DkNarrative page={PAGE_KEY} range={range} role={role} session={session} go={go} />
                </Widget>
              );
              case "tasks": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={d.tasks.err ? <DkTag tone="crit">read failed</DkTag> : <DkTag tone="neutral">{openTasks.length} open</DkTag>}>
                  {d.tasks.err ? <DkErr what="The task list" err={d.tasks.err} /> : <DkTasks tasks={d.tasks.rows} dept={DEPT} go={go} />}
                </Widget>
              );
              case "reports": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}>
                  <DkReports reports={reports} dept={DEPT} go={go} />
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
