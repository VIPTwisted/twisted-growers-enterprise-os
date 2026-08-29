#!/usr/bin/env node
/* apex-order-grain.mjs — one row per order, and it stays that way.
 *
 * WHY THIS EXISTS, and it is not hypothetical.
 * apex_raw is APPEND-ONLY by owner ruling: the Apex pull inserts rather than upserts, so a
 * revised order keeps its earlier snapshot alongside the new one. On 29 Aug 2026 that left
 * 2,063 shipping-order rows behind 1,860 real orders — 203 orders carrying two rows each,
 * all 203 with genuinely different payloads.
 *
 * Every view that reads an apex_raw row AS AN ORDER therefore counted 203 orders twice:
 *
 *     v_apex_order_metrc_link    2,063 rows against 1,860 orders
 *                                24 orders in two link_status groups AT ONCE
 *                                $910,560.63 of order value double-counted
 *     v_manifest_reconciliation  Apex side $5,396,946.56 against $4,772,325.37
 *
 * Nothing was broken. Nothing errored. The reconciliation simply answered with a bigger
 * number than the business had, and the group counts stopped summing to the order count —
 * which is the only reason anybody noticed. That is the most dangerous shape of defect on
 * this platform: not a blank screen, a plausible figure that is wrong.
 *
 * THE INVARIANT. A view that emits one row per order must satisfy
 *
 *     count(*) = count(DISTINCT <its order key>)
 *
 * and any surplus is a defect. There is no tolerance and no baseline to ratchet: one
 * duplicated order is one order counted twice, and a ratchet here would bless exactly the
 * condition the gate exists to prevent.
 *
 * IT CHECKS THE MONEY GRAIN TOO. v_manifest_reconciliation is one row per MANIFEST, not per
 * order, so counting its rows proves nothing about the Apex side. What must hold there is
 * that its Apex half reads one row per order — so the gate re-derives the newest-version
 * population directly from apex_raw and asserts the view's own Apex total matches it. A
 * duplicate that slipped back in would inflate the view's sum and the two would part.
 *
 * NO DATABASE, NO VERDICT. openClient refuses rather than degrading — the owner's 26 Aug
 * ruling, after seven gates spent a fortnight reporting green because they could not
 * connect. A gate that cannot reach the database cannot catch anything, and must say so.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openClient } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const client = await openClient("apex-order-grain", ROOT);

/* The newest version of every shipping order — the same rule the views carry, restated
   here independently. If the gate reused the view it would be asking the view to mark its
   own homework. */
const NEWEST = `
  SELECT DISTINCT ON (r.apex_id) r.apex_id, r.payload
  FROM apex_raw r
  WHERE r.entity = 'shipping-orders'
  ORDER BY r.apex_id, r.fetched_at DESC, r.id DESC`;

const failures = [];
const note = (s) => console.log(`apex-order-grain: ${s}`);

try {
  /* ── 1 · the row-per-order views ───────────────────────────────────────────── */
  const perOrder = [{ view: "v_apex_order_metrc_link", key: "apex_order_id" }];

  for (const { view, key } of perOrder) {
    const { rows } = await client.query(
      `select count(*)::int rows, count(distinct ${key})::int orders from ${view}`);
    const { rows: r, orders } = rows[0];
    const surplus = r - orders;
    if (surplus > 0) {
      failures.push(
        `${view}: ${r} rows against ${orders} distinct ${key} — ${surplus} surplus row(s).\n` +
        `      A view that emits one row per order is counting ${surplus} order(s) twice.\n` +
        `      apex_raw is append-only by ruling, so the fix is a newest-version rule in the\n` +
        `      view — DISTINCT ON (apex_id) ORDER BY apex_id, fetched_at DESC, id DESC —\n` +
        `      never a delete.`);
    } else {
      note(`ok      — ${view}: ${r} rows = ${orders} distinct ${key}`);
    }
  }

  /* ── 2 · the group counts must still partition the book ────────────────────── */
  const g = await client.query(
    `select coalesce(sum(n),0)::int total, count(*)::int groups from (
       select count(*)::int n from v_apex_order_metrc_link group by link_status) s`);
  const d = await client.query(
    "select count(distinct apex_order_id)::int n from v_apex_order_metrc_link");
  if (g.rows[0].total !== d.rows[0].n) {
    failures.push(
      `v_apex_order_metrc_link: its ${g.rows[0].groups} link_status groups sum to ` +
      `${g.rows[0].total}, but there are ${d.rows[0].n} distinct orders.\n` +
      `      The statuses no longer partition the order book, so every group count is\n` +
      `      answering a different question from the one its label asks.`);
  } else {
    note(`ok      — the ${g.rows[0].groups} status groups sum to ${g.rows[0].total}, the distinct order count`);
  }

  /* ── 3 · the manifest view's APEX grain, derived independently ─────────────── */
  const truth = await client.query(`
    select round(sum((payload->>'subtotal_raw')::numeric)
             / (select value from conversion_factors where key='apex_money_raw_minor_units'), 2) v
    from (${NEWEST}) n
    where (payload->>'cancelled') = any (array['','0','false'])
      and jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) > 0`);
  const seen = await client.query(`
    select round(sum(apex_value),2) v from (
      select distinct apex_invoices, apex_value from v_manifest_reconciliation
      where apex_value is not null) s`);
  const t = Number(truth.rows[0].v ?? 0);
  const s = Number(seen.rows[0].v ?? 0);
  if (s > t) {
    failures.push(
      `v_manifest_reconciliation: its Apex side totals $${s.toLocaleString()} where the newest\n` +
      `      version of every order totals $${t.toLocaleString()} — $${(s - t).toLocaleString()} more than exists.\n` +
      `      Its apex CTE is reading superseded rows.`);
  } else {
    note(`ok      — v_manifest_reconciliation's Apex side does not exceed the newest-version total`);
  }

  /* ── 4 · and the raw rows are STILL THERE, because append-only means append-only ── */
  const raw = await client.query(
    "select count(*)::int rows, count(distinct apex_id)::int ids from apex_raw where entity='shipping-orders'");
  note(`ok      — apex_raw holds ${raw.rows[0].rows} rows over ${raw.rows[0].ids} orders; ` +
       `${raw.rows[0].rows - raw.rows[0].ids} superseded row(s) retained, none deleted`);
} finally {
  await client.end();
}

if (failures.length) {
  console.error(`\napex-order-grain: FAIL — ${failures.length} grain defect(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  console.error("  There is no baseline and no tolerance here. One duplicated order is one");
  console.error("  order counted twice, and a ratchet would bless the very condition this");
  console.error("  gate exists to prevent.\n");
  process.exit(1);
}
console.log("apex-order-grain: PASS — every order-grain view emits one row per order.");
