#!/usr/bin/env node
/* schema-map-fresh.mjs — the bridge's schema map must describe the real database.
 *
 * WHY THIS EXISTS
 *
 * bridge/schema-map.txt lists the tables and columns the desktop assistant reads
 * without having to discover them. It took a real database question from 30
 * seconds to 13, because discovery was three round trips and a full model turn
 * each before any work began on the question actually asked.
 *
 * It is GENERATED, and nothing regenerated it. The file itself says "this is a
 * hint, not a contract" and tells the assistant to look a column up if a query
 * fails - but that is an instruction, and an instruction is not a guard. A map
 * that quietly drifts is worse than no map: it is confidently wrong, and the
 * assistant trusts it precisely because it is there to be trusted.
 *
 * WHAT THIS ASSERTS
 *
 * Every table the map names still exists in the committed schema baseline, and
 * every column it lists is still on that table. Checked against
 * supabase/migrations/*baseline*.sql - the dump this repo already keeps fresh
 * with its own gate - so this needs no database credentials and therefore
 * actually runs in CI. A check that needs live secrets does not run, and a check
 * that does not run is not a check.
 *
 * It deliberately does NOT require the map to be complete. Naming fewer tables
 * than exist is a smaller map, which is only slower. Naming a table or column
 * that is GONE is a wrong answer, and that is what fails the build.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAP = join(root, "bridge", "schema-map.txt");

if (!existsSync(MAP)) {
  console.log("schema-map-fresh: SKIP — bridge/schema-map.txt does not exist, so there is nothing to drift.");
  process.exit(0);
}

/* The baseline dump is the repository's own record of the live schema, and
   schema-baseline-fresh already fails the build when it goes stale. Reusing it
   means this check inherits that freshness instead of inventing its own. */
const MIG = join(root, "supabase", "migrations");
let baseline = null;
if (existsSync(MIG)) {
  const f = readdirSync(MIG).filter((n) => n.includes("baseline") && n.endsWith(".sql")).sort().pop();
  if (f) baseline = readFileSync(join(MIG, f), "utf8");
}
if (!baseline) {
  console.log("schema-map-fresh: SKIP — no baseline schema dump found to compare against.");
  process.exit(0);
}

/* Lines look like:  metrc_packages (13): id, license, tag, ...
   Anything else in the file is prose and is not a claim about the schema. */
const claims = [];
for (const line of readFileSync(MAP, "utf8").split("\n")) {
  const m = line.match(/^([a-z_][a-z0-9_]*)\s*\((\d+)\):\s*(.+)$/i);
  if (!m) continue;
  claims.push({ table: m[1], columns: m[3].split(",").map((c) => c.trim()).filter(Boolean) });
}

if (!claims.length) {
  console.error("schema-map-fresh: FAIL — the map contains no table lines at all. Has its format changed?");
  process.exit(1);
}

/* Read the dump once into table -> body. Views and tables both count: the
   assistant does not care which it is querying. */
const bodies = new Map();
const re = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?([\s\S]*?);/gi;
let m;
while ((m = re.exec(baseline)) !== null) {
  const name = m[1].toLowerCase();
  bodies.set(name, (bodies.get(name) ?? "") + m[2]);
}

let failed = 0;
let checkedCols = 0;
for (const c of claims) {
  const body = bodies.get(c.table.toLowerCase());
  if (body === undefined) {
    console.error(`schema-map-fresh: FAIL — the map names "${c.table}", which is not in the schema dump.`);
    console.error(`   The assistant is told it can query that. Regenerate bridge/schema-map.txt.`);
    failed++;
    continue;
  }
  const missing = c.columns.filter((col) => {
    checkedCols++;
    return !new RegExp(`\\b${col.replace(/[^a-z0-9_]/gi, "")}\\b`, "i").test(body);
  });
  if (missing.length) {
    console.error(`schema-map-fresh: FAIL — ${c.table} no longer has: ${missing.join(", ")}`);
    console.error(`   A column named in the map and absent from the table is a wrong answer waiting to happen.`);
    failed++;
  }
}

if (failed) {
  console.error(`\nschema-map-fresh: ${failed} problem(s) across ${claims.length} tables.`);
  console.error(`The map exists to stop the assistant discovering the schema on every question.`);
  console.error(`A map that has drifted is worse than none - it is confidently wrong, and it is`);
  console.error(`trusted precisely because somebody put it there.`);
  process.exit(1);
}

console.log(`schema-map-fresh: PASS — ${claims.length} tables, ${checkedCols} columns, all still present in the baseline.`);
