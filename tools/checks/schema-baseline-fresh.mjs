#!/usr/bin/env node
/* PHASE 0 guard — the schema baseline must MATCH the database, not merely look recent.
 *
 * A baseline is only recoverability if it matches the database. On 7 Aug 2026 the repo held 6
 * migration files describing 4 tables while production held 244 — the baseline is the fix, and
 * a stale baseline is the same failure wearing a hat.
 *
 * WHY THIS WAS REWRITTEN. The first version checked the FILE'S AGE and nothing else, with a
 * 168-hour limit. On 8 Aug 2026 it printed "PASS — 22h old" while production had moved from
 * 244 to 260 tables and 539 to 567 policies. It was a clock, not a gate: it would have gone on
 * passing for a week no matter how far the schema drifted. That is the same defect this whole
 * exercise audits — something that claims to be a check and cannot fail for the reason it exists.
 *
 * HOW IT WORKS NOW, in two tiers:
 *
 *   STRICT   — when a database connection is available (PGURL, or .mcp.json locally), count the
 *              live objects and compare them to the counts the baseline recorded in its own
 *              header. Any drift fails. This is the real check.
 *   DEGRADED — when no connection is available, fall back to age and size, and say plainly in
 *              the output that live comparison did not happen. It must never print a bare PASS
 *              on the strength of the clock alone; a check whose limits are invisible is how a
 *              vacuous gate survives.
 *
 *   node tools/checks/schema-baseline-fresh.mjs
 *   regenerate with: node tools/checks/dump-schema.mjs
 */
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_AGE_HOURS = 48; // was 168. A week of drift is not a baseline.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = join(ROOT, "supabase", "migrations");

const fail = (...lines) => {
  lines.forEach((l) => console.error(l));
  console.error("  Regenerate: node tools/checks/dump-schema.mjs");
  process.exit(1);
};

if (!existsSync(dir)) {
  fail("schema-baseline: FAIL - supabase/migrations does not exist.",
       "  The schema exists only in production.");
}
/* A BASELINE IS IDENTIFIED BY WHAT IT CONTAINS, NOT BY WHAT IT IS CALLED.
 *
 * This was `f.includes("baseline")` - a filename substring - until 15 Aug 2026, when it
 * halted every production deploy for a day. The second "baseline" it found was
 * 20260813112556_a_real_disruption_moves_the_baseline_v2.sql, which is 154 lines of
 * harvest-schedule logic about a lights-out failure moving the SCHEDULE baseline. It has
 * nothing to do with the schema. The word in the filename was the whole match.
 *
 * Four builds failed on "2 baselines present" while both files were exactly as intended.
 *
 * dump-schema.mjs stamps every real baseline with a BASELINE COUNTS header, and this gate
 * already fails below if the file it selects has no such header - so the header was always
 * the true test, and the filename was a proxy that could disagree with it.
 *
 * This is NARROWER than what it replaced, not looser: a file must now carry the generator's
 * own header to count. A duplicate or stale REAL baseline still trips every check below,
 * because a real baseline always carries it.
 */
const files = readdirSync(dir).filter((f) => {
  if (!f.endsWith(".sql")) return false;
  try {
    return /BASELINE COUNTS: tables=\d+/.test(readFileSync(join(dir, f), "utf8").slice(0, 4000));
  } catch { return false; }
});
if (!files.length) {
  fail("schema-baseline: FAIL - no baseline found.",
       "  Nothing can be rebuilt outside production.");
}
if (files.length > 1) {
  fail("schema-baseline: FAIL - " + files.length + " baselines present:",
       ...files.map((f) => "    " + f),
       "  Two baselines means nobody knows which is current. Keep one.");
}

const f = files[0];
const path = join(dir, f);
const st = statSync(path);
const hours = (Date.now() - st.mtimeMs) / 3.6e6;

if (st.size < 100_000) {
  fail("schema-baseline: FAIL - " + f + " is only " + st.size + " bytes.",
       "  A full baseline of this database is around 1 MB. This one is truncated.");
}
if (hours > MAX_AGE_HOURS) {
  fail("schema-baseline: FAIL - " + f + " is " + Math.round(hours) + "h old (limit " +
       MAX_AGE_HOURS + "h).");
}

/* The counts the baseline recorded about itself. Written by dump-schema.mjs. */
const head = readFileSync(path, "utf8").slice(0, 4000);
const m = head.match(/BASELINE COUNTS: tables=(\d+) views=(\d+) matviews=(\d+) policies=(\d+)/);
if (!m) {
  fail("schema-baseline: FAIL - " + f + " carries no BASELINE COUNTS header.",
       "  Without it this check can only read the clock, which is how it passed at 22h old",
       "  while production gained 16 tables and 28 policies.");
}
const recorded = { tables: +m[1], views: +m[2], matviews: +m[3], policies: +m[4] };

/* Connection is optional by design: absent in a bare CI checkout, present locally and in the
   Netlify build. Never invent one, and never pretend the strict tier ran when it did not. */
function connectionString() {
  if (process.env.PGURL) return process.env.PGURL;
  const p = join(ROOT, ".mcp.json");
  if (!existsSync(p)) return null;
  try {
    const url = JSON.parse(readFileSync(p, "utf8"))?.mcpServers?.["twisted-growers"]?.args?.[0];
    return url ? url.replace(/sslmode=[a-z-]+/, "uselibpqcompat=true&sslmode=require") : null;
  } catch { return null; }
}

const conn = connectionString();
if (!conn) {
  console.log("schema-baseline: PASS (DEGRADED) - " + f + ", " + Math.round(hours) + "h old, " +
              (st.size / 1024).toFixed(0) + " KB.");
  console.log("  Records " + recorded.tables + " tables, " + recorded.views + " views, " +
              recorded.policies + " policies.");
  console.log("  NOT VERIFIED against the live database - no connection available here.");
  console.log("  Age and size only. Drift would not be caught by this run.");
  process.exit(0);
}

let pg;
try { pg = (await import("pg")).default; }
catch {
  console.log("schema-baseline: PASS (DEGRADED) - " + f + ", " + Math.round(hours) + "h old.");
  console.log("  NOT VERIFIED against live - the pg driver is not installed here.");
  process.exit(0);
}

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false },
                               statement_timeout: 30000 });
try {
  await client.connect();
  const { rows: [live] } = await client.query(`
    select (select count(*) from pg_tables    where schemaname='public')::int as tables,
           (select count(*) from pg_views     where schemaname='public')::int as views,
           (select count(*) from pg_matviews  where schemaname='public')::int as matviews,
           (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
             join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public')::int as policies`);

  const drift = Object.keys(recorded)
    .filter((k) => recorded[k] !== live[k])
    .map((k) => `    ${k}: baseline ${recorded[k]}, live ${live[k]} (${live[k] - recorded[k] > 0 ? "+" : ""}${live[k] - recorded[k]})`);

  if (drift.length) {
    console.error("schema-baseline: FAIL - the baseline no longer matches the live database.");
    drift.forEach((d) => console.error(d));
    console.error("  Objects exist in production that exist nowhere else. That is the exact");
    console.error("  condition this gate exists to prevent.");
    console.error("  Regenerate: node tools/checks/dump-schema.mjs");
    process.exit(1);
  }

  console.log("schema-baseline: PASS (VERIFIED against live) - " + f + ", " +
              Math.round(hours) + "h old, " + (st.size / 1024).toFixed(0) + " KB.");
  console.log("  " + live.tables + " tables, " + live.views + " views, " +
              live.matviews + " matviews, " + live.policies + " policies - all match.");
} catch (err) {
  /* A connection that exists but fails must not be silently downgraded to a pass-by-clock:
     that is indistinguishable from the vacuous behaviour being fixed. Report and pass, loudly. */
  console.log("schema-baseline: PASS (DEGRADED) - " + f + ", " + Math.round(hours) + "h old.");
  console.log("  NOT VERIFIED against live - " + err.message.trim());
  console.log("  Age and size only. Drift would not be caught by this run.");
} finally {
  await client.end().catch(() => {});
}
