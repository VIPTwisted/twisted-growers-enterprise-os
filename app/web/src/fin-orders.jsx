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

   `nav_registry` points this page at `sales_orders`. That table is EMPTY, and
   so is every other order table this platform owns. Measured 15 Aug 2026:

     sales_orders 0 · sales_order_lines 0 · shipments 0 · invoices 0
     purchase_orders 0 · work_orders 0 · demand_forecasts 0
     customer_notes 0 · sales_rep 0

   The real order book is Apex, mirrored into apex_raw as 1,739 shipping-orders
   and reconciled to Metrc by `v_apex_order_metrc_link`. A page that rendered
   `sales_orders` would show an empty grid and a manager would reasonably
   conclude no orders exist. Nine empty tables are stated as nine empty tables,
   and the orders are read from where they actually are.

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
} from "./dashkit.jsx";
import {
  FinKpiStrip, FinMoney, FinQty, FinBasis, FinDefect, FinCard, FinActions,
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
      supabase.from("v_apex_order_metrc_link").select("*").order("order_date", { ascending: false, nullsFirst: false }),
      finReadAll("metrc_rpt_wholesale", "manifest_number,invoice_number,amount,voided,created_on,destination_facility,destination_licence"),
      supabase.from("v_dashboard_tasks").select("*"),
      ...OWN_TABLES.map(([t]) => supabase.from(t).select("*", { count: "exact", head: true })),
    ]);
    return {
      orders: grab(orders), wholesale, tasks: grab(tasks),
      own: OWN_TABLES.map(([t, label], i) => ({
        table: t, label,
        count: own[i].error ? null : own[i].count,
        err: own[i].error ? own[i].error.message : null,
      })),
    };
  }, [], ver);

  if (d === null) return <div className="finpage"><FinReading what="the Apex order book and every shipment matched to it" /></div>;

  const orders = d.orders.rows;
  const byStatus = new Map();
  for (const o of orders) {
    const g = byStatus.get(o.link_status) ?? { status: o.link_status, orders: [], value: 0 };
    g.orders.push(o);
    g.value += Number(o.total_dollars ?? 0);
    byStatus.set(o.link_status, g);
  }
  const states = [...byStatus.values()].sort((a, b) => b.value - a.value);
  const pick = (s) => byStatus.get(s)?.orders ?? [];

  const matched = pick("MATCHED");
  const unexplained = pick("APEX ONLY — UNEXPLAINED");
  const cancelled = pick("EXPLAINED — cancelled");
  const ambiguous = pick("AMBIGUOUS INVOICE NUMBER");
  const noInvoice = pick("NO INVOICE NUMBER");

  const filtered = q.trim()
    ? orders.filter((o) => `${o.invoice_number ?? ""} ${o.apex_order_id} ${o.buyer_state_license ?? ""} ${o.link_status}`
        .toLowerCase().includes(q.trim().toLowerCase()))
    : orders;

  const openTasks = d.tasks.rows.filter((t) => t.department === DEPT);
  const T = (k) => tile === k;
  const toggle = (k) => setTile(tile === k ? null : k);

  const tiles = [
    {
      key: "all", label: "Orders in the Apex order book", value: orders.length, unit: "orders",
      tone: "plain", open: T("all"), onOpen: () => toggle("all"),
      basis: "Every row of v_apex_order_metrc_link, which is apex_raw entity shipping-orders. Opens all of them.",
    },
    {
      key: "matched", label: "Orders matched to a Metrc manifest", value: money(matched, "total_dollars"), unit: "$",
      tone: "good", open: T("matched"), onOpen: () => toggle("matched"),
      context: `${matched.length.toLocaleString()} orders. Matched on the invoice number with every non-digit stripped from both sides.`,
      basis: "Order value from total_dollars, already converted from minor units by the owner-set conversion factor.",
    },
    {
      key: "unexplained", label: "Order value with no shipment behind it", value: money(unexplained, "total_dollars"), unit: "$",
      tone: "bad", open: T("unexplained"), onOpen: () => toggle("unexplained"),
      context: `${unexplained.length.toLocaleString()} orders that are not cancelled, not empty and not zero, and that match no manifest.`,
      basis: "link_status APEX ONLY — UNEXPLAINED. Each one opens to show that nothing on the Metrc report carries its invoice number.",
    },
    {
      key: "cancelled", label: "Cancelled in Apex", value: cancelled.length, unit: "orders",
      tone: "plain", open: T("cancelled"), onOpen: () => toggle("cancelled"),
      context: `Worth ${Math.round(money(cancelled, "total_dollars")).toLocaleString()} dollars had they gone ahead. Correctly absent from the shipment record.`,
      basis: "link_status EXPLAINED — cancelled.",
    },
    {
      key: "unmatchable", label: "Orders that can never be matched", value: ambiguous.length + noInvoice.length, unit: "orders",
      tone: (ambiguous.length + noInvoice.length) > 0 ? "warn" : "good",
      open: T("unmatchable"), onOpen: () => toggle("unmatchable"),
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

        <FinDefect
          object="sales_orders is empty"
          what="This page is registered against the sales_orders table, and that table holds nothing. Neither does any other order table this platform owns. The real order book is Apex, mirrored into apex_raw and reconciled to Metrc's own reports by v_apex_order_metrc_link."
          measured={`Counted live on this page load: ${d.own.map((o) => `${o.table} ${o.err ? "could not be read" : o.count}`).join(" · ")}. Against that, the Apex book holds ${orders.length.toLocaleString()} orders.`}
          instead="Every order below comes from the Apex book. The empty platform tables are listed in their own section rather than rendered as a blank grid, because an empty grid reads as “no orders exist”."
          filed="Whether the platform should own its own order records or continue mirroring Apex is an owner decision. It is stated here rather than decided here." />

        {d.orders.err && <DkErr what="The Apex order book" err={d.orders.err} />}
        {d.wholesale.err && <DkErr what="The Metrc wholesale report" err={d.wholesale.err} />}
        <FinCapped read={d.wholesale} what="The Metrc wholesale report" />

        <FinKpiStrip department={DEPT} tiles={tiles} targets={targets} trend={trend}
          targetErr={targetErr} onAssigned={() => setVer((v) => v + 1)} />

        {T("all") && (
          <DkDrill label="Every order in the Apex book" onClose={() => setTile(null)}>
            <OrderTable orders={orders} wholesale={d.wholesale.rows} emptyWhy="The Apex order book holds no orders." />
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
                  chips={<DkTag tone="neutral">{states.length} states</DkTag>}>
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
                  chips={<DkTag tone="neutral">{filtered.length.toLocaleString()} shown of {orders.length.toLocaleString()}</DkTag>}>
                  <div className="fin-filters">
                    <label htmlFor="fin-ord-q">Search invoice number, buyer licence or state</label>
                    <input id="fin-ord-q" className="cc-input fin-search" value={q}
                      onChange={(e) => setQ(e.target.value)} placeholder="type any part of it" />
                    {q.trim() && <button className="cc-btn" onClick={() => setQ("")} title="Clear the search and show every order.">clear</button>}
                    <span className="fin-count">
                      {q.trim()
                        ? `${filtered.length.toLocaleString()} of ${orders.length.toLocaleString()} orders match.`
                        : `All ${orders.length.toLocaleString()} orders shown — nothing is paged away.`}
                    </span>
                  </div>
                  <OrderTable orders={filtered} wholesale={d.wholesale.rows}
                    emptyWhy={q.trim() ? `Nothing matches “${q}”.` : "The Apex order book holds no orders."} />
                </Widget>
              );
              case "own": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                  chips={<DkTag tone="attn">{d.own.filter((o) => o.count === 0).length} of {d.own.length} empty</DkTag>}>
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
                            <td className="num">{o.err
                              ? <span className="fin-docwhy">Could not be read: {o.err}</span>
                              : o.count === 0
                                ? <span className="fin-docwhy">Empty — nothing has ever been written to it.</span>
                                : Number(o.count).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Widget>
              );
              case "words": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}>
                  <DkNarrative page={PAGE_KEY} range={{ from: "", to: "" }} role={role} session={session} go={go} />
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
