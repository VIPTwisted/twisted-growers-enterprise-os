/* ═══════════════════════════════════════════════════════════════════════════
   ORDERS — the order book. Agent B, 15 Aug 2026.
   nav_registry view_key `orders`, Finance › Orders & Customers.

   THIS PAGE IS AN ORDER BOOK. It is organised around the LIFE OF AN ORDER —
   raised, priced, shipped or not, matched to a manifest or unexplained — which
   is a different question from the ledger (Sales History), the directory
   (Customers) and the document room (Customer Manifests). It shares their
   primitives and none of their layout.

   ─────────────────────────────────────────────────────────────────────────────
   THE FIRST THING A READER MUST KNOW, AND IT IS ON THE PAGE.

   `nav_registry` points this page at `sales_orders`, and that table is empty —
   BY DESIGN, not by fault. Owner ruling, 29 Aug 2026: Apex remains the order
   book, the platform's own order tables are NOT populated from it in Phase 1,
   and this page stays on `v_apex_order_metrc_link`.

   This page carried a "Known defect: sales_orders is empty" banner until that
   ruling. It now carries a SOURCE line instead. The distinction matters: a
   defect banner over a deliberate choice teaches a reader to scroll past defect
   banners, which is how the real one gets missed.

   The nine empty platform tables are still counted and still listed in their own
   section — an empty table and a table nobody read look identical on a screen
   and mean opposite things, so both are named. What changed is that "empty" is
   no longer dressed as a warning while the Apex book has rows.

   THE COUNT IS ONE ROW PER ORDER. apex_raw is append-only: the Apex pull inserts
   rather than upserts, so a revised order keeps its earlier snapshot. 2,063 raw
   rows stand behind 1,860 real orders as at 29 Aug 2026, and the view emits the
   newest version of each. Every figure on this page counts orders, never rows.

   ─────────────────────────────────────────────────────────────────────────────
   THE MONEY BASIS, STATED BECAUSE IT IS THE ONE THAT CATCHES PEOPLE.

   Apex holds money in MINOR UNITS in its `_raw` fields, and `order_price_raw`
   on a LINE is a unit price rather than a line total — summing either bare
   understates revenue by about 59%. This page never touches a `_raw` field. It
   reads `total_dollars` from v_apex_order_metrc_link, which divides `total_raw`
   by `conversion_factors.value` where the key is `apex_money_raw_minor_units` —
   an owner-set row, not a literal in a view and not a literal here.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { rowsOr } from "./App.jsx";
import {
  grab, listOf, DkTag, DkErr, DkEmpty, DkHead, DkDrill, DrillRoot, DkCaret,
  Widget, WidgetBoard, WidgetBarControls, useWidgetLayout, useSectionStore,
  TagEvidence, TagEvidenceProvider, DkNarrative, DkReports, DkTasks,
  useDefaultRange, DkFrameNote,
} from "./dashkit.jsx";
/* The range/search rule itself, written once and unit-tested. This page used to
   spell it out inline — a `matchesQ` and an `inPeriod` that reimplemented rules
   1 and 2 of lib/range-search.js in this file's own words. */
import { rangeSearch } from "./lib/range-search.js";
/* The one date control the rest of the OS already uses. Imported, not rebuilt:
   docs/PERIOD_BUS_SPEC.md — "Do not fork a second catalog in React." */
import { DateRangeSelect } from "./App.jsx";
import {
  FinKpiStrip, FinMoney, FinQty, FinBasis, FinCard, FinActions,
  FinReading, FinCapped, finReadAll, useFinTargets, useFinRead,
} from "./fin-kit.jsx";

const DEPT = "Finance";
const VIEW_KEY = "orders";
const PAGE_KEY = "fin_orders";

const ymd = (v) => (v ? String(v).slice(0, 10) : null);
const digits = (v) => {
  const s = String(v ?? "").replace(/\D/g, "");
  return s === "" ? null : s;
};
const money = (rows, f) => listOf(rows).reduce((a, r) => a + Number(r[f] ?? 0), 0);

/* The platform's own order tables, counted rather than assumed. Rendered as a
   section rather than hidden, because "this table is empty" and "this table was
   never read" look identical on a screen and mean opposite things. */
const OWN_TABLES = [
  ["sales_orders", "Orders raised in this platform"],
  ["sales_order_lines", "Lines on those orders"],
  ["shipments", "Shipments planned in this platform"],
  ["invoices", "Invoices raised in this platform"],
  ["purchase_orders", "Purchase orders"],
  ["work_orders", "Work orders"],
  ["demand_forecasts", "Demand forecasts"],
  ["customer_notes", "Notes against a customer"],
  ["sales_rep", "Sales representatives on file"],
];

/* ═══════════ what one order actually shipped ═══════════ */
function OrderShipments({ order, wholesale }) {
  const key = order.invoice_digits ?? digits(order.invoice_number);
  const lines = useMemo(
    () => (key ? listOf(wholesale).filter((r) => digits(r.invoice_number) === key) : []),
    [wholesale, key]);
  const manifestNumbers = useMemo(
    () => [...new Set(lines.map((r) => r.manifest_number).filter(Boolean))], [lines]);

  const pkgs = useFinRead(async () => {
    if (!manifestNumbers.length) return { rows: [], err: null };
    const r = await supabase.from("metrc_rpt_package_transfers")
      .select("manifest_number,package_tag,item,category,strain,shipped_qty,shipped_uom,shipped_lb,shipper_wholesale_price,status")
      .in("manifest_number", manifestNumbers.slice(0, 200));
    return grab(r);
  }, [manifestNumbers.join(",")], 0);

  const shipped = money(lines.filter((r) => !r.voided), "amount");
  const ordered = Number(order.total_dollars ?? 0);
  const gap = shipped - ordered;

  return (
    <>
      <FinBasis
        source="v_apex_order_metrc_link for the order, and metrc_rpt_wholesale matched on the invoice number with every non-digit stripped from both sides"
        included={key ? `invoice digits “${key}”` : "nothing — this order carries no invoice number to match on"}
        caution="The invoice number on the Metrc side is free text typed by an operator. A mistype breaks the match, and this page cannot tell a mistype from a genuinely unshipped order. That is why an unmatched order is called unexplained rather than unshipped." />

      <div className="fin-answers">
        <div className="fin-answer">
          <span className="fin-answer-lbl">Ordered, from the Apex order book</span>
          <span className="fin-answer-val"><FinMoney cents value={ordered} /></span>
          <span className="fin-answer-note">
            {order.line_count ?? 0} lines on the order. Converted from minor units by the owner-set
            factor, never summed from a raw field.
          </span>
        </div>
        <div className="fin-answer">
          <span className="fin-answer-lbl">Shipped and priced, on Metrc&rsquo;s wholesale report</span>
          <span className="fin-answer-val"><FinMoney cents value={shipped} /></span>
          <span className="fin-answer-note">
            {lines.length} priced lines across {manifestNumbers.length} manifests, voided lines excluded.
          </span>
        </div>
        <div className="fin-answer">
          <span className="fin-answer-lbl">The difference between them</span>
          <span className="fin-answer-val"><FinMoney cents value={gap} /></span>
          <span className="fin-answer-note">
            {Math.abs(gap) < 0.005
              ? "The order and the shipment agree to the cent."
              : gap > 0
                ? "More value shipped than the order says was bought. Either the order was amended after shipping or lines shipped against the wrong invoice number."
                : "Less value shipped than the order says was bought. Either part of the order has not gone out, or it went out under a different invoice number."}
          </span>
        </div>
      </div>

      <h4 className="cc-striplabel">Every manifest this order shipped on</h4>
      {!manifestNumbers.length
        ? <DkEmpty
            why={key
              ? `No line on Metrc's wholesale report carries the invoice digits “${key}”.`
              : "This order carries no invoice number, so there is nothing to match it to on the Metrc side."}
            fills="The order is real and it is in the Apex book. What is missing is a shipment carrying the same invoice number — that is what makes it unexplained rather than shipped." />
        : (
          <TagEvidenceProvider tags={listOf(pkgs?.rows).map((r) => r.package_tag).filter(Boolean)}>
            {pkgs === null
              ? <FinReading what="the packages on this order's manifests" />
              : pkgs.err
                ? <DkErr what="The packages on this order's manifests" err={pkgs.err} />
                : (
                  <div className="fin-tablewrap">
                    <table className="fin-table">
                      <thead>
                        <tr>
                          <th>Manifest</th><th>Package tag</th><th>Item</th><th>Cultivar</th>
                          <th className="num">Quantity</th><th className="num">Price</th>
                          <th>Status</th><th>Certificate of Analysis and manifest</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pkgs.rows.map((r, i) => (
                          <tr key={(r.package_tag ?? "no-tag") + i}>
                            <td>{r.manifest_number}</td>
                            <td>{r.package_tag ?? <span className="fin-docwhy">No package tag on this row.</span>}</td>
                            <td>{r.item ?? <span className="fin-docwhy">Item not recorded.</span>}</td>
                            <td>{r.strain ?? <span className="fin-docwhy">No single cultivar — a blend has none.</span>}</td>
                            <td className="num"><FinQty qty={r.shipped_qty} uom={r.shipped_uom} /></td>
                            <td className="num">{r.shipper_wholesale_price == null
                              ? <span className="fin-docwhy">No price on this package row.</span>
                              : <FinMoney cents value={r.shipper_wholesale_price} />}</td>
                            <td>{r.status ?? <span className="fin-docwhy">Status not recorded.</span>}</td>
                            <td>{r.package_tag
                              ? <TagEvidence tag={r.package_tag} compact />
                              : <span className="fin-docwhy">No tag, so no certificate or manifest can be resolved.</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
          </TagEvidenceProvider>
        )}
    </>
  );
}

/* ═══════════ the order table ═══════════ */
function OrderTable({ orders, wholesale, emptyWhy }) {
  const [open, setOpen] = useState(null);
  if (!orders.length) return <DkEmpty why={emptyWhy} fills="That is a real position from the rows read for this page, not a failed read." />;
  return (
    <div className="fin-tablewrap">
      <table className="fin-table">
        <thead>
          <tr>
            <th>Invoice number</th><th>Ordered</th><th>Delivery</th><th>Buyer licence</th>
            <th className="num">Lines</th><th className="num">Order value</th>
            <th className="num">Manifests</th><th>State</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <React.Fragment key={o.apex_order_id}>
              <tr>
                <td>
                  <button className="fin-rowbtn" aria-expanded={open === o.apex_order_id}
                    onClick={() => setOpen(open === o.apex_order_id ? null : o.apex_order_id)}
                    title={open === o.apex_order_id ? "Close this order." : "Open what this order actually shipped, down to each package and its certificate."}>
                    <DkCaret open={open === o.apex_order_id} />
                    {o.invoice_number || `Apex order ${o.apex_order_id}`}
                  </button>
                  {!o.invoice_number && <div className="fin-docwhy">No invoice number on the Apex order, so it can never be matched to a shipment.</div>}
                  {o.split_from_order_id && <div className="fin-docwhy">Split from Apex order {o.split_from_order_id}.</div>}
                </td>
                <td>{ymd(o.order_date) ?? <span className="fin-docwhy">No order date.</span>}</td>
                <td>{ymd(o.delivery_date) ?? <span className="fin-docwhy">No delivery date set.</span>}</td>
                <td>{o.buyer_state_license ?? <span className="fin-docwhy">No buyer licence on the order.</span>}</td>
                <td className="num">{o.line_count ?? 0}</td>
                <td className="num"><FinMoney cents value={o.total_dollars} /></td>
                <td className="num">{o.metrc_manifests == null
                  ? <span className="fin-docwhy">None matched.</span>
                  : Number(o.metrc_manifests).toLocaleString()}</td>
                <td>
                  {o.link_status}
                  {o.cancelled && <div className="fin-docwhy">Cancelled in Apex.</div>}
                  {o.invoice_number_is_ambiguous && <div className="fin-docwhy">More than one Apex order carries these invoice digits, so the match is not safe.</div>}
                </td>
              </tr>
              {open === o.apex_order_id && (
                <tr>
                  <td colSpan={8}>
                    <DkDrill label={`${o.invoice_number || `Apex order ${o.apex_order_id}`} — what it ordered and what actually shipped`}
                      onClose={() => setOpen(null)}>
                      <OrderShipments order={o} wholesale={wholesale} />
                    </DkDrill>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>{orders.length.toLocaleString()} orders — the total is the sum of exactly these rows</td>
            <td className="num"><FinMoney cents value={money(orders, "total_dollars")} /></td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ═══════════════════ the page ═══════════════════ */
export default function OrdersPage({ go, session, reports, role, viewAs, onViewAs, isAdmin, viewRoles }) {
  const store = useSectionStore(session?.user?.id, VIEW_KEY);
  const [ver, setVer] = useState(0);
  const [tile, setTile] = useState(null);
  const [q, setQ] = useState("");
  /* THE PERIOD COMES FROM THE BUS NOW, AND THE 26 AUG RULE STILL HOLDS.
   *
   * This page used to hold its own catalogue — all / ytd / 12m / custom, with the
   * calendar arithmetic written in JavaScript a few lines below. That is the second
   * catalogue docs/PERIOD_BUS_SPEC.md forbids, and it drifted: its "Last 12 months"
   * was a rolling year from today, while the governed one is twelve whole calendar
   * months. Two controls with the same label and different answers.
   *
   * The default is no longer "all". It is nav_registry.default_range for view_key
   * 'orders', which is this_month_td. The owner rule of 26 Aug — "any invoice from
   * any period must be reachable" — is NOT weakened by that, because it was never
   * the default that made an invoice reachable: it is the search, which sets the
   * range aside entirely (see `rangeSetAside` below and the line the UI prints).
   * Typing 303 still finds Twiste-303 from May 2025 on a page opened on August.
   *
   * The whole book is still read in one go. The range decides what is SHOWN, never
   * what was read, so narrowing can never hide an order from the search. */
  const [range, setRange] = useState({ from: "", to: "" });
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const { targets, trend, err: targetErr } = useFinTargets(DEPT);

  const WIDGETS = useMemo(() => [
    { key: "states", title: "Every order by what happened to it", span: 2 },
    { key: "orders", title: "The order book — every order, opening to what it shipped", span: 2 },
    { key: "own", title: "This platform's own order tables, counted", span: 2 },
    { key: "words", title: "In plain words — and signed notes", span: 2 },
    { key: "tasks", title: "Tasks raised from this page", span: 1 },
    { key: "reports", title: "Finance reports — by group", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);

  const d = useFinRead(async () => {
    const [orders, wholesale, tasks, ...own] = await Promise.all([
      /* THE WHOLE BOOK, NOT THE FIRST PAGE OF IT.
         PostgREST caps a response at 1,000 rows and this read had no pagination.
         The book is ordered newest-first, so the page received the 1,000 most
         recent orders and silently discarded the other 739 — every order before
         roughly the start of 2026. That is why invoice Twiste-303, dated 18 May
         2025, could not be found by typing its number: it was never in the
         browser to search. The search box filters an array that had already been
         cut, and the line under it printed "nothing is paged away" while 739
         orders had been.
         `finReadAll` is the primitive that pages, and this same file was already
         using it on the very next line for the wholesale report. */
      finReadAll("v_apex_order_metrc_link", "*", (qy) => qy.order("order_date", { ascending: false, nullsFirst: false })),
      finReadAll("metrc_rpt_wholesale", "manifest_number,invoice_number,amount,voided,created_on,destination_facility,destination_licence"),
      supabase.from("v_dashboard_tasks").select("*"),
      /* NOT `head: true`. A HEAD request has no response body, so PostgREST's
         error message never arrives and supabase-js can hand back error null
         AND count null together — a refused read that looks exactly like a
         successful count of nothing. That shape is what put "0 records" on the
         Control Tower when permission was denied, and it stuck five tiles on
         "counting…" tonight. Asking for one real row costs one row and makes
         the refusal arrive as a message that can be printed. */
      ...OWN_TABLES.map(([t]) => supabase.from(t).select("*", { count: "exact" }).limit(1)),
    ]);
    return {
      /* `finReadAll` already returns { rows, err, capped, pages } — the same
         shape `grab` produces plus the cap flag, so it is passed straight
         through and the cap can be rendered rather than swallowed. */
      orders, wholesale, tasks: grab(tasks),
      /* THREE STATES, NEVER TWO. A count that is refused, a count that came
         back empty without an error, and a count of zero are three different
         facts and only the last one is "nothing here". `count` stays null for
         the first two and `state` says which, so no branch can turn an absent
         number into a zero. */
      own: OWN_TABLES.map(([t, label], i) => {
        const r = own[i];
        if (r.error) return { table: t, label, count: null, state: "refused", err: r.error.message };
        if (r.count == null) return { table: t, label, count: null, state: "no-count", err: null };
        return { table: t, label, count: Number(r.count), state: "counted", err: null };
      }),
    };
  }, [], ver);

  if (d === null) return <div className="finpage"><FinReading what="the Apex order book and every shipment matched to it" /></div>;

  const orders = d.orders.rows;

  /* ─── THE WHOLE PAGE NARROWS TOGETHER, OR THE PICKER IS A LIE ───────────
     Owner, 29 August 2026: "Every number on those pages must take the bus."

     THE DEFECT THIS CLOSES. Until now the date control moved the order LIST and
     nothing else. Every key figure above it — orders in the book, matched value,
     unexplained value, cancelled, unmatchable — and every state card below it
     were computed from the whole book, because `byStatus` was built from
     `orders` rather than from the rows the reader had actually asked for. Open
     the page on this_month_td, read "$2.1m matched", and the layout has told you
     that is this month's figure. Nothing on the screen said otherwise.

     It is the same defect in the drills, too, and worse there: a tile that
     counts the period and opens a drawer holding the whole book is a tile whose
     own evidence contradicts it. `pick()` now serves the same rows the tiles
     counted, so tile and drill cannot disagree.

     `rangeSearch` decides, not this file. Rule 1 (a search beats the range) and
     rule 2 (an undated order is kept, never dropped) live in one unit-tested
     place and this page consumes them. The two hand-written copies that used to
     stand here are gone. */
  const rs = rangeSearch(orders, {
    from: range.from, to: range.to, dateField: "order_date", q,
    fields: ["invoice_number", "apex_order_id", "buyer_state_license", "link_status"],
  });
  const shown = rs.rows;

  const byStatus = new Map();
  for (const o of shown) {
    const g = byStatus.get(o.link_status) ?? { status: o.link_status, orders: [], value: 0 };
    g.orders.push(o);
    g.value += Number(o.total_dollars ?? 0);
    byStatus.set(o.link_status, g);
  }
  const states = [...byStatus.values()].sort((a, b) => b.value - a.value);
  const pick = (s) => listOf(byStatus.get(s)?.orders);

  const matched = pick("MATCHED");
  const unexplained = pick("APEX ONLY — UNEXPLAINED");
  const cancelled = pick("EXPLAINED — cancelled");
  const ambiguous = pick("AMBIGUOUS INVOICE NUMBER");
  const noInvoice = pick("NO INVOICE NUMBER");

  /* SEARCH BEATS THE DATE RANGE, ALWAYS — and the decision is `rangeSearch`'s,
     above, not this file's. Owner rule: when an invoice number is typed, the
     period filter is ignored. A person who types "303" is asking a question
     about one invoice, not about a date range, and answering "no results"
     because their range happened to exclude it is the same defect in a new
     costume. The UI says out loud that the range was set aside, so the reader is
     never quietly overruled. */
  const searching = rs.searching;
  const periodNarrowed = Boolean(range.from || range.to);
  const rangeSetAside = rs.setAside;
  const filtered = shown;

  const openTasks = d.tasks.rows.filter((t) => t.department === DEPT);
  const T = (k) => tile === k;
  const toggle = (k) => setTile(tile === k ? null : k);

  /* A refused read is not zero. Every tile on this page counts the Apex book;
     without it there is no order book to describe, and "0 orders" would say the
     company sold nothing rather than that the read failed. */
  const ordUnknown = d.orders.err && `The Apex order book could not be read: ${d.orders.err}.`;

  const tiles = [
    {
      key: "all",
      /* The label states the population, because the population now moves. A
         figure that changes with the picker under a heading that says "the
         order book" is the defect this ticket closes, not a smaller version
         of it. */
      label: searching ? "Orders matching your search, every period" : "Orders in the period",
      value: shown.length, unit: "orders",
      tone: "plain", open: T("all"), onOpen: () => toggle("all"), unknown: ordUnknown,
      context: searching
        ? `The date range is set aside while you search. ${shown.length.toLocaleString()} of ${orders.length.toLocaleString()} orders in the whole book match.`
        : periodNarrowed
          ? `${orders.length.toLocaleString()} orders in the whole book; ${rs.outOfRange.toLocaleString()} fall outside this period${rs.undated ? `, and ${rs.undated.toLocaleString()} carry no order date and are kept rather than dropped` : ""}.`
          : `Every period. ${rs.undated ? `${rs.undated.toLocaleString()} carry no order date.` : "Every order carries an order date."}`,
      basis: "Rows of v_apex_order_metrc_link — apex_raw entity shipping-orders — narrowed to the selected period on order_date. Opens exactly the orders counted.",
    },
    {
      key: "matched", label: "Orders matched to a Metrc manifest", value: money(matched, "total_dollars"), unit: "$",
      tone: "good", open: T("matched"), onOpen: () => toggle("matched"), unknown: ordUnknown,
      context: `${matched.length.toLocaleString()} orders. Matched on the invoice number with every non-digit stripped from both sides.`,
      basis: "Order value from total_dollars, already converted from minor units by the owner-set conversion factor.",
    },
    {
      key: "unexplained", label: "Order value with no shipment behind it", value: money(unexplained, "total_dollars"), unit: "$",
      tone: "bad", open: T("unexplained"), onOpen: () => toggle("unexplained"), unknown: ordUnknown,
      context: `${unexplained.length.toLocaleString()} orders that are not cancelled, not empty and not zero, and that match no manifest.`,
      basis: "link_status APEX ONLY — UNEXPLAINED. Each one opens to show that nothing on the Metrc report carries its invoice number.",
    },
    {
      key: "cancelled", label: "Cancelled in Apex", value: cancelled.length, unit: "orders",
      tone: "plain", open: T("cancelled"), onOpen: () => toggle("cancelled"), unknown: ordUnknown,
      context: `Worth ${Math.round(money(cancelled, "total_dollars")).toLocaleString()} dollars had they gone ahead. Correctly absent from the shipment record.`,
      basis: "link_status EXPLAINED — cancelled.",
    },
    {
      key: "unmatchable", label: "Orders that can never be matched", value: ambiguous.length + noInvoice.length, unit: "orders",
      tone: (ambiguous.length + noInvoice.length) > 0 ? "warn" : "good",
      open: T("unmatchable"), onOpen: () => toggle("unmatchable"), unknown: ordUnknown,
      context: "Either two orders share one invoice number, or the order carries none at all.",
      basis: "link_status AMBIGUOUS INVOICE NUMBER or NO INVOICE NUMBER. The invoice number is the only bridge between the two systems.",
    },
  ];

  return (
    <DrillRoot label="Orders">
      <div className="finpage">
        <DkHead title="Orders — the order book" viewKey={VIEW_KEY} dept={DEPT}
          role={role} viewAs={viewAs} computed={null} busy={false} />

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

        {/* SOURCE, NOT A DEFECT — owner ruling, 29 Aug 2026.
            This carried a "Known defect: sales_orders is empty" banner. The
            ruling settles what that banner was asking: Apex REMAINS the order
            book, the platform will not be populated from it in Phase 1, and this
            page stays on v_apex_order_metrc_link. An empty sales_orders is
            therefore the design, not a fault, and a defect banner over a
            deliberate choice trains a reader to ignore defect banners.

            N IS THE DISTINCT NEWEST-VERSION COUNT. apex_raw is append-only, so a
            revised order keeps its earlier snapshot: 2,063 raw rows stand behind
            1,860 real orders today. The view now emits one row per order, so
            orders.length IS that distinct count — and the number here is the
            same number the tile below opens, one read used twice, which is why
            they cannot disagree. */}
        <FinBasis
          source={`Apex (mirrored) · ${orders.length.toLocaleString()} orders · reconciled to Metrc`}
          included="one row per order, newest version — apex_raw is append-only and superseded revisions are not counted"
          caution="Platform sales_orders is unused in Phase 1. That is the owner's ruling, not a gap: Apex is the order book and this page reads it directly." />

        {d.orders.err && <DkErr what="The Apex order book" err={d.orders.err} />}
        {d.wholesale.err && <DkErr what="The Metrc wholesale report" err={d.wholesale.err} />}
        <FinCapped read={d.orders} what="The Apex order book" />
        <FinCapped read={d.wholesale} what="The Metrc wholesale report" />

        {/* THE FRAME, STATED ABOVE THE FIGURES IT GOVERNS. Every tile below is
            now computed for the selected period; saying so is what stops the
            next reader assuming the opposite, which is what the previous
            version of this page taught them to do. */}
        <div className="cc-tools-l" style={{ marginBottom: 8 }}>
          <DkFrameNote basis={searching ? "queue" : "period"} range={range}
            what="Every key figure and every state card below"
            why={searching
              ? "A search asks about one invoice, so the period is set aside and the whole book is searched. The figures below count what matched, across every period."
              : "These figures are computed from the orders that fall in the selected period on order_date, and they change when you move it. Orders with no order date are kept and counted separately rather than dropped."} />
        </div>

        <FinKpiStrip department={DEPT} tiles={tiles} targets={targets} trend={trend}
          targetErr={targetErr} onAssigned={() => setVer((v) => v + 1)} />

        {T("all") && (
          /* The drill opens exactly the orders the tile counted. It used to open
             the whole book under a tile that counted the period — a tile whose
             own evidence contradicted it. */
          <DkDrill label={searching ? "Every order matching your search, any period" : "Every order in the period"} onClose={() => setTile(null)}>
            <OrderTable orders={shown} wholesale={d.wholesale.rows}
              emptyWhy={searching
                ? `Nothing in the whole order book matches “${q.trim()}”.`
                : periodNarrowed
                  ? "No order falls in this period. Widen the range, or search by invoice number to ignore it."
                  : "The Apex order book holds no orders."} />
          </DkDrill>
        )}
        {T("matched") && (
          <DkDrill label="Every order matched to a Metrc manifest" onClose={() => setTile(null)}>
            <OrderTable orders={matched} wholesale={d.wholesale.rows} emptyWhy="No order matches a manifest." />
          </DkDrill>
        )}
        {T("unexplained") && (
          <DkDrill label="Orders with no shipment behind them" onClose={() => setTile(null)}>
            <OrderTable orders={unexplained} wholesale={d.wholesale.rows}
              emptyWhy="Every live order matches a shipment." />
          </DkDrill>
        )}
        {T("cancelled") && (
          <DkDrill label="Orders cancelled in Apex" onClose={() => setTile(null)}>
            <OrderTable orders={cancelled} wholesale={d.wholesale.rows} emptyWhy="No order has been cancelled." />
          </DkDrill>
        )}
        {T("unmatchable") && (
          <DkDrill label="Orders that can never be matched to a shipment" onClose={() => setTile(null)}>
            <OrderTable orders={[...ambiguous, ...noInvoice]} wholesale={d.wholesale.rows}
              emptyWhy="Every order carries a unique invoice number." />
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            switch (w.key) {
              case "states": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={ordUnknown
                    ? <DkTag tone="crit" title={ordUnknown}>read failed — no states</DkTag>
                    : <DkTag tone="neutral">{states.length} states</DkTag>}>
                  <FinBasis source="v_apex_order_metrc_link.link_status — the view's own classification, not one computed here"
                    included="every order in the Apex book"
                    caution="These values are never added into one revenue figure. A cancelled order and a shipped one are both real rows with a value on them, and only one of them is money." />
                  <div className="fin-cards">
                    {states.map((s) => (
                      <FinCard key={s.status} open={false}
                        onToggle={() => toggle(
                          s.status === "MATCHED" ? "matched"
                          : s.status === "APEX ONLY — UNEXPLAINED" ? "unexplained"
                          : s.status === "EXPLAINED — cancelled" ? "cancelled"
                          : s.status === "AMBIGUOUS INVOICE NUMBER" || s.status === "NO INVOICE NUMBER" ? "unmatchable"
                          : "all")}
                        name={s.status}
                        sub={`${s.orders.length.toLocaleString()} orders`}
                        title={`Open the orders in the state “${s.status}”. It opens above the sections, under the key figures.`}
                        figures={[{ k: "value on the orders", v: s.value, money: true }, { k: "orders", v: s.orders.length.toLocaleString() }]}
                        chips={s.status === "APEX ONLY — UNEXPLAINED"
                          ? <DkTag tone="crit" title="Not cancelled, not empty, not zero — and nothing on the Metrc side carries its invoice number.">unexplained</DkTag>
                          : null} />
                    ))}
                  </div>
                </Widget>
              );
              case "orders": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={ordUnknown
                    ? <DkTag tone="crit" title={ordUnknown}>read failed — the list below is not the order book</DkTag>
                    : <DkTag tone="neutral">{filtered.length.toLocaleString()} shown of {orders.length.toLocaleString()}</DkTag>}>
                  <div className="fin-filters">
                    <label htmlFor="fin-ord-q">Search invoice number, buyer licence or state</label>
                    <input id="fin-ord-q" className="cc-input fin-search" value={q}
                      onChange={(e) => setQ(e.target.value)} placeholder="type any part of it — any period" />
                    {searching && <button className="cc-btn" onClick={() => setQ("")} title="Clear the search and show every order.">clear</button>}

                    <DateRangeSelect label="Ordered between" from={range.from} to={range.to}
                      onFrom={(v) => setRange((p) => ({ ...p, from: v }))}
                      onTo={(v) => setRange((p) => ({ ...p, to: v }))}
                      presetKey={dateDefault.presetKey} session={session}
                      viewKey={VIEW_KEY} allowSave />
                    {dateDefault.error && <span className="note bad" role="alert">{dateDefault.error}</span>}
                    {periodNarrowed && !searching && (
                      <button className="cc-btn" onClick={() => setRange({ from: "", to: "" })}
                        title="Show every period again. The whole book is already loaded, so this only decides what is shown — it never decides what was read.">show all periods</button>
                    )}

                    <span className="fin-count">
                      {searching
                        ? `${filtered.length.toLocaleString()} of ${orders.length.toLocaleString()} orders match “${q.trim()}”.`
                        : periodNarrowed
                          ? `${filtered.length.toLocaleString()} of ${orders.length.toLocaleString()} orders fall in this period. The other ${(orders.length - filtered.length).toLocaleString()} are still loaded — search finds them.`
                          : `All ${orders.length.toLocaleString()} orders shown, every period. Read in ${d.orders.pages} page${d.orders.pages === 1 ? "" : "s"} of 1,000.`}
                    </span>
                    {/* The reader is told when their own filter was overruled.
                        Silently widening a range is better than silently
                        narrowing one, but neither may happen without a sentence. */}
                    {rangeSetAside && (
                      <DkTag tone="attn"
                        title="A search asks about a specific invoice, so the date range is set aside for it. Clear the search to return to the range.">
                        date range set aside while searching — every period is being searched
                      </DkTag>
                    )}
                  </div>
                  <OrderTable orders={filtered} wholesale={d.wholesale.rows}
                    emptyWhy={searching
                      ? `Nothing in the whole order book matches “${q.trim()}” — all ${orders.length.toLocaleString()} orders were searched, not just the recent ones.`
                      : periodNarrowed
                        ? "No order falls in this period. Widen the range, or search by invoice number to ignore it."
                        : "The Apex order book holds no orders."} />
                </Widget>
              );
              case "own": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                  chips={<>
                    {/* EMPTY IS EXPECTED HERE, so it is not dressed as a warning.
                        The tone is attn only when the Apex book ALSO has nothing —
                        that combination would mean the page has no order source at
                        all, which is the real failure this chip should catch. */}
                    <DkTag tone={orders.length > 0 ? "neutral" : "attn"}
                      title={orders.length > 0
                        ? `Expected: Phase 1 does not populate the platform's own order tables. The order book is Apex, and it holds ${orders.length.toLocaleString()} orders on this page load.`
                        : "Both the platform tables AND the Apex book are empty. That is not the Phase 1 design — this page has no order source at all."}>
                      {d.own.filter((o) => o.state === "counted" && o.count === 0).length} of {d.own.length} counted and empty
                      {orders.length > 0 ? " — expected in Phase 1" : " — AND the Apex book is empty too"}
                    </DkTag>
                    {d.own.some((o) => o.state !== "counted") && (
                      <DkTag tone="crit" title="A table whose count could not be read is not an empty table. These are shown as unknown, never folded into the empty count.">
                        {d.own.filter((o) => o.state !== "counted").length} could not be counted
                      </DkTag>
                    )}
                  </>}>
                  <FinBasis source="an exact row count taken against each table on this page load"
                    included="the nine order and sales tables this platform owns"
                    caution="These are counted, not assumed. An empty table and a table nobody read look the same on a screen, and only one of them is a fact." />
                  <div className="fin-tablewrap">
                    <table className="fin-table">
                      <thead><tr><th>Table</th><th>What it is for</th><th className="num">Rows</th></tr></thead>
                      <tbody>
                        {d.own.map((o) => (
                          <tr key={o.table}>
                            <td>{o.table}</td>
                            <td>{o.label}</td>
                            <td className="num">{
                              o.state === "refused"
                                ? <span className="fin-docwhy">The read was REFUSED, which is not zero: {o.err}</span>
                                : o.state === "no-count"
                                  ? <span className="fin-docwhy">No count came back and no error was given. This is a failed or refused read, not an empty table — it is shown as unknown rather than as zero.</span>
                                  : o.count === 0
                                    ? <span className="fin-docwhy">Empty — the count was read successfully and it is zero.</span>
                                    : o.count.toLocaleString()
                            }</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Widget>
              );
              case "words": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}>
                  {/* The narrative describes the period the reader is actually looking at.
                      It was pinned to an empty range, so it narrated all time while the
                      page showed a slice. */}
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
