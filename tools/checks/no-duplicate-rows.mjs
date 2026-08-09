#!/usr/bin/env node
/* no-duplicate-rows.mjs — duplicates, checked against the REGISTERED key.
 *
 * WHY THIS EXISTS, AND WHY IT REGISTERS A KEY INSTEAD OF GUESSING ONE
 *
 * Owner, 9 August 2026: "REMOVE DUPLICATES AND PUT IN SOMETHING AGAINST DUPLICATES."
 *
 * Measured before removing anything, and there was nothing to remove — twice over,
 * and both times a blind dedupe would have destroyed real records:
 *
 *   metrc_packages showed SEVEN tags appearing twice. Each appears once under
 *   MC281714 and once under MP281909: the same 84g package in transit between this
 *   company's own two licences, the sender seeing 'intransit' and the receiver
 *   'active'. On (license, tag) there are zero duplicates.
 *
 *   metrc_rpt_transfer_manifests showed 975 groups and 1,851 extra rows. ALL 975
 *   differ in content; none is byte-identical. It is a report SNAPSHOT table — the
 *   same manifest is re-imported as its weights and received date move. Versions,
 *   not duplicates. Deduping them deletes transfer history.
 *
 * So the lesson is not "check for duplicates". It is: A DUPLICATE IS ONLY A
 * DUPLICATE AGAINST THE RIGHT KEY, and "dedupe" run against the wrong key is a
 * data-loss event. The key therefore lives in the database, in duplicate_key,
 * next to the reason it is that key — reviewable, and impossible to guess wrong
 * silently.
 *
 * It also caught an error of mine within a minute of existing: I had built the Apex
 * reconciliation baseline across every snapshot of the manifests table, counting the
 * same manifest several times, and reported outbound manifests as 4,072 when the
 * latest-snapshot figure is 2,355.
 *
 * THE PARAMETERS THIS ENFORCES
 *
 *   1. dup_groups        must be 0 for every registered table.
 *   2. unique_indexes    must be >= 1. A table with no unique index has nothing
 *                        stopping the next duplicate; the audit would only find it
 *                        afterwards, which is a report, not a guard.
 *   3. coverage          every table written by a sync MUST be registered in
 *                        duplicate_key. An unregistered table is unchecked, and an
 *                        unchecked table reads as a pass — the exact shape of a check
 *                        that cannot fail.
 *
 * IT DOES NOT DELETE ANYTHING, EVER. It reports and fails the build. Deciding which
 * of two rows is wrong needs a person who knows why they both exist.
 *
 * NO DATABASE, NO VERDICT. Without a connection this SKIPS and says so loudly rather
 * than printing a pass. A green line that means "I could not look" is worse than a
 * red one.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/* Every table a sync writes to. If a sync writes somewhere not on this list, the list
   is wrong — that is the point of rule 3. */
const SYNC_TARGETS = [
  "metrc_packages", "metrc_transfers", "metrc_rpt_transfer_manifests",
  "product_inventory", "third_party_material", "apex_raw", "customers",
];

function connString() {
  if (process.env.PGURL) return process.env.PGURL;
  const p = join(ROOT, ".mcp.json");
  if (!existsSync(p)) return null;
  try {
    const url = JSON.parse(readFileSync(p, "utf8"))?.mcpServers?.["twisted-growers"]?.args?.[0];
    return url ? url.replace(/sslmode=[a-z-]+/, "uselibpqcompat=true&sslmode=require") : null;
  } catch { return null; }
}

const conn = connString();
if (!conn) {
  console.log("no-duplicate-rows: SKIPPED — no PGURL and no .mcp.json, so the database could not be read.");
  console.log("               This is NOT a pass. Nothing was checked.");
  process.exit(0);
}

let pg;
try { pg = (await import("pg")).default; }
catch {
  console.log("no-duplicate-rows: SKIPPED — the pg module is not installed. Nothing was checked.");
  process.exit(0);
}

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false },
                               statement_timeout: 60000 });
let failed = 0;

try {
  await client.connect();

  const { rows: audit } = await client.query(
    "select table_name, key_columns, dup_groups, extra_rows, unique_indexes from v_duplicate_audit order by table_name");

  if (!audit.length) {
    console.error("no-duplicate-rows: FAIL — v_duplicate_audit returned nothing.");
    console.error("   Either duplicate_key is empty or the view is gone. Either way nothing is being");
    console.error("   checked, and an unchecked table reads exactly like a clean one.");
    failed++;
  }

  /* ── 1. duplicates against the registered key ─────────────────────────────── */
  for (const r of audit) {
    if (Number(r.dup_groups) > 0) {
      console.error(`no-duplicate-rows: FAIL — ${r.table_name}: ${r.dup_groups} duplicate group(s), ${r.extra_rows} extra row(s)`);
      console.error(`   key: ${r.key_columns}`);
      console.error(`   DO NOT DELETE ANYTHING YET. Confirm the key is right first — on this platform`);
      console.error(`   two "duplicate" findings were both legitimate: a package under two licences,`);
      console.error(`   and report snapshots of one manifest over time.`);
      failed++;
    }
  }

  /* ── 2. every registered table must have a unique index ───────────────────── */
  for (const r of audit) {
    if (Number(r.unique_indexes) === 0) {
      console.error(`no-duplicate-rows: FAIL — ${r.table_name} has NO unique index.`);
      console.error(`   Nothing prevents the next duplicate. Add one on: ${r.key_columns}`);
      failed++;
    }
  }

  /* ── 3. coverage: no sync target may go unregistered ──────────────────────── */
  const registered = new Set(audit.map((r) => r.table_name));
  const { rows: present } = await client.query(
    `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname = any($1)`, [SYNC_TARGETS]);
  const missing = present.map((r) => r.relname).filter((t) => !registered.has(t));
  if (missing.length) {
    console.error(`no-duplicate-rows: FAIL — ${missing.length} sync target(s) not registered in duplicate_key:`);
    for (const m of missing) console.error(`   ${m}`);
    console.error(`   An unregistered table is never audited, and never being audited reads as clean.`);
    failed++;
  }

  if (!failed) {
    const worst = audit.reduce((a, r) => Math.max(a, Number(r.unique_indexes)), 0);
    console.log(`no-duplicate-rows: PASS — ${audit.length} registered table(s), 0 duplicates against their own keys,`);
    console.log(`               every one carrying a unique index (max ${worst}). Nothing was deleted.`);
    for (const r of audit) console.log(`               ${r.table_name}  key: ${r.key_columns}`);
  }
} catch (e) {
  console.error(`no-duplicate-rows: FAIL — could not complete: ${String(e).slice(0, 200)}`);
  failed++;
} finally {
  try { await client.end(); } catch { /* closing is best-effort */ }
}

if (failed) {
  console.error(`\nno-duplicate-rows: ${failed} problem(s).`);
  console.error(`Nothing here deletes a row. Which of two rows is wrong needs a person who knows`);
  console.error(`why they both exist — and on this platform, twice, the answer was "both are right".`);
  process.exit(1);
}
