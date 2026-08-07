#!/usr/bin/env node
/* PHASE 0 guard — the schema baseline must not go stale.
 *
 * A baseline is only recoverability if it matches the database. On 7 Aug 2026 the repo held 6
 * migration files describing 4 tables while production held 244 - the baseline is the fix, and
 * a stale baseline is the same failure wearing a hat.
 *
 * Fails if no baseline exists, or if the newest one is older than MAX_AGE_HOURS. Deliberately
 * time-based rather than content-based: comparing to the live schema would need a database
 * connection in CI, and a check that cannot run in CI is not a gate.
 *
 *   node tools/checks/schema-baseline-fresh.mjs
 *   regenerate with: node tools/checks/dump-schema.mjs
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_AGE_HOURS = 168; // one week. Tighten once the schema settles.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = join(ROOT, "supabase", "migrations");

if (!existsSync(dir)) {
  console.error("schema-baseline: FAIL - supabase/migrations does not exist.");
  console.error("  The schema exists only in production. Run: node tools/checks/dump-schema.mjs");
  process.exit(1);
}
const files = readdirSync(dir).filter((f) => f.includes("baseline") && f.endsWith(".sql"));
if (!files.length) {
  console.error("schema-baseline: FAIL - no baseline found.");
  console.error("  Nothing can be rebuilt outside production. Run: node tools/checks/dump-schema.mjs");
  process.exit(1);
}
if (files.length > 1) {
  console.error("schema-baseline: FAIL - " + files.length + " baselines present:");
  files.forEach((f) => console.error("    " + f));
  console.error("  Two baselines means nobody knows which is current. Keep one.");
  process.exit(1);
}
const f = files[0];
const st = statSync(join(dir, f));
const hours = (Date.now() - st.mtimeMs) / 3.6e6;
const lines = st.size;
if (lines < 100_000) {
  console.error("schema-baseline: FAIL - " + f + " is only " + lines + " bytes.");
  console.error("  A full baseline of this database is around 1 MB. This one is truncated.");
  process.exit(1);
}
if (hours > MAX_AGE_HOURS) {
  console.error("schema-baseline: FAIL - " + f + " is " + Math.round(hours) + "h old (limit " + MAX_AGE_HOURS + "h).");
  console.error("  Regenerate: node tools/checks/dump-schema.mjs");
  process.exit(1);
}
console.log("schema-baseline: PASS - " + f + ", " + Math.round(hours) + "h old, " + (st.size / 1024).toFixed(0) + " KB.");
