#!/usr/bin/env node
/* migration-drift.mjs — Supabase runs code this repository does not contain.
 *
 * ENFORCES standard rule 6: what runs in production is in the repository.
 *
 * THE HOLE, measured 11 Aug 2026.
 *
 *   supabase/migrations/   1 file
 *   supabase_migrations.schema_migrations   590 rows
 *
 * `apply_migration` writes a row into Supabase's own migration history and DOES NOT
 * write a file here. Nothing noticed. Agent I opened the gap himself for three hours
 * with two migrations before catching it by eye, and every agent doing schema work
 * opens it again on every call. The names that were live in production with no source
 * in this repository included `database_governance`, `tag_event_ledger`,
 * `v_data_inventory` and `apex_split_nesting_cost_control` — all applied that day.
 *
 * A schema you cannot rebuild from the repository is a schema you cannot restore, cannot
 * review, and cannot reason about. Rule 6 said so and nothing enforced it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS "IN THE REPOSITORY", and why the answer is not simply "a file per row"
 *
 * `tools/checks/dump-schema.mjs` writes `<version>_baseline_live_schema.sql`: a full dump
 * of the live schema. Everything applied at or before that version IS in the repository —
 * that is what a squash migration means, and demanding 580 individual files as well would
 * make this gate red forever on day one, which is how a gate gets switched off.
 *
 * So the invariant is narrower and sharper:
 *
 *     EVERY MIGRATION APPLIED AFTER THE NEWEST BASELINE DUMP HAS ITS OWN FILE HERE.
 *
 * The escape hatch — "regenerate the dump instead of writing the file" — is legitimate
 * (it genuinely puts production into the repository) and is bounded by
 * schema-baseline-fresh.mjs, which fails the build if the dump is over 48 hours old.
 * Both gates are needed: a fresh dump with no per-migration files loses the REASONING,
 * and this repository's whole discipline is that a migration explains itself.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR CLASSES, three of which are reported and one of which fails.
 *
 *   1. MISSING       applied after the baseline, no file.  ← the hole. Ratcheted.
 *   2. DUPLICATE     the same migration NAME under two versions. Ratcheted.
 *                    One apply_migration call on 11 Aug was recorded twice, 28 seconds
 *                    apart (20260811154152 and 20260811154220, both
 *                    metrc_backfill_window_driver). The tool retried. It was harmless
 *                    only because the SQL happened to be idempotent — the same retry on
 *                    an INSERT or an ALTER runs it twice.
 *   3. UNAPPLIED     a file here with no row in production. REPORTED, never failed:
 *                    supabase/migrations/20260811160000_cron_ops_dashboard_and_backfill.sql
 *                    is a deliberate record of cron changes made with execute_sql, and
 *                    calling that drift would be a wrong label on correct work.
 *   4. UNTRACKED     a migration file on disk and not in git. REPORTED locally, and
 *                    IMPOSSIBLE in CI by construction — a checkout contains only what git
 *                    contains, so CI is strict here with no special case. A working tree
 *                    mid-change legitimately has untracked files and failing on them would
 *                    punish the author for not having committed yet.
 *
 * NO DATABASE, NO VERDICT. netlify.toml documents the established pattern for the three
 * gates that need a connection and have none there — schema-baseline, docs-vs-database,
 * page-architecture answer PASS (DEGRADED) and say so. This follows it exactly. It is
 * meaningful where a connection exists: locally through .mcp.json in `npm run check`, and
 * registered in checker_registry as gate.migration_drift.
 *
 * Reads public.v_migration_history, not supabase_migrations directly — the reporting role
 * is refused that schema (see 20260811161014_watchdog_migration_history_visible.sql).
 *
 *   node tools/checks/migration-drift.mjs
 *   node tools/checks/migration-drift.mjs --selftest   (fixtures only, no database)
 *   node tools/checks/migration-drift.mjs --bless      (rewrite the ratchet from reality)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openClient, refuse } from "../lib/db.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const BASELINE_FILE = join(here, "migration-drift.baseline.json");

/* ───────────────────────────────────────────────────────── the pure functions ───
 * Everything the fixtures exercise lives here and takes its inputs as arguments. A
 * detector that can only be tested by having a real database in a real state is a
 * detector nobody tests.
 */

/** `20260811161014_watchdog_migration_history_visible.sql` → {version, name}. */
export function parseFileName(f) {
  const m = /^(\d{14})_(.+)\.sql$/.exec(f);
  return m ? { version: m[1], name: m[2] } : null;
}

const isBaselineDump = (name) => name === "baseline_live_schema";

/**
 * @param {{version:string,name:string}[]} files   parsed repo files
 * @param {{version:string,name:string}[]} applied rows from v_migration_history
 */
export function compare(files, applied) {
  const baselineVersion = files
    .filter((f) => isBaselineDump(f.name))
    .map((f) => f.version)
    .sort()
    .pop() ?? null;

  const haveVersion = new Set(files.map((f) => f.version));
  const appliedVersion = new Set(applied.map((a) => a.version));

  /* Covered by the dump, and therefore genuinely in the repository. Counted and shown,
     never failed — but shown, because "580 migrations exist only as one 2 MB dump" is a
     fact a reviewer should have to look at rather than infer. */
  const coveredByBaseline = applied.filter(
    (a) => baselineVersion && a.version <= baselineVersion && !haveVersion.has(a.version),
  );

  const missing = applied.filter(
    (a) => (!baselineVersion || a.version > baselineVersion) && !haveVersion.has(a.version),
  );

  /* A baseline dump is a squash, so it never has a row of its own. Excluding it here is
     not a hole: it is the one file whose absence from the history is expected. */
  const unapplied = files.filter(
    (f) => !isBaselineDump(f.name) && !appliedVersion.has(f.version),
  );

  const byName = new Map();
  for (const a of applied) byName.set(a.name, [...(byName.get(a.name) ?? []), a.version]);
  const duplicates = [...byName.entries()]
    .filter(([, vs]) => vs.length > 1)
    .map(([name, versions]) => ({ name, versions: versions.sort() }));

  return { baselineVersion, coveredByBaseline, missing, unapplied, duplicates };
}

/* ─────────────────────────────────────────────────────────────────── fixtures ───
 * BOTH HALVES, and the negative half is the one that matters. Every defect in the
 * 9 Aug register was a check firing on something legitimate.
 */
function selfTest() {
  const B = { version: "20260810000000", name: "baseline_live_schema" };
  const cases = [
    {
      why: "POSITIVE — a migration applied after the baseline with no file. The hole itself.",
      files: [B],
      applied: [{ version: "20260811115130", name: "database_governance" }],
      expect: (r) => r.missing.length === 1 && r.missing[0].name === "database_governance",
    },
    {
      why: "POSITIVE — the same NAME recorded twice. apply_migration retried on 11 Aug.",
      files: [B, { version: "20260811154220", name: "metrc_backfill_window_driver" },
                 { version: "20260811154152", name: "metrc_backfill_window_driver" }],
      applied: [{ version: "20260811154152", name: "metrc_backfill_window_driver" },
                { version: "20260811154220", name: "metrc_backfill_window_driver" }],
      expect: (r) => r.duplicates.length === 1 && r.duplicates[0].versions.length === 2,
    },
    {
      why: "NEGATIVE — applied AFTER the baseline and the file exists. Must stay quiet.",
      files: [B, { version: "20260811132816", name: "fix_dashboard_refresh_target_base_matview" }],
      applied: [{ version: "20260811132816", name: "fix_dashboard_refresh_target_base_matview" }],
      expect: (r) => r.missing.length === 0 && r.duplicates.length === 0 && r.unapplied.length === 0,
    },
    {
      why: "NEGATIVE — 580 migrations applied BEFORE the baseline dump. The squash covers them; "
         + "demanding a file each would make this gate red on arrival and get it switched off.",
      files: [B],
      applied: Array.from({ length: 580 }, (_, i) =>
        ({ version: String(20260801000000 + i), name: `old_${i}` })),
      expect: (r) => r.missing.length === 0 && r.coveredByBaseline.length === 580,
    },
    {
      why: "NEGATIVE — the baseline dump itself has no row in schema_migrations, by design. "
         + "It must never be reported as an unapplied file.",
      files: [B],
      applied: [],
      expect: (r) => r.unapplied.length === 0,
    },
    {
      why: "NEGATIVE — two DIFFERENT migrations at adjacent versions are not a duplicate. "
         + "Duplication is a repeated NAME, not a near timestamp.",
      files: [B],
      applied: [{ version: "20260811012808", name: "a_thing" },
                { version: "20260811012828", name: "another_thing" }],
      expect: (r) => r.duplicates.length === 0,
    },
    {
      why: "POSITIVE — a file recording work that production has NOT got. Detected as "
         + "unapplied; reported, not failed.",
      files: [B, { version: "20260811160000", name: "cron_ops_dashboard_and_backfill" }],
      applied: [],
      expect: (r) => r.unapplied.length === 1 && r.missing.length === 0,
    },
    {
      why: "POSITIVE — NO baseline dump at all. Every applied migration is then missing; "
         + "nothing may be silently forgiven for want of a squash to hide behind.",
      files: [{ version: "20260811132816", name: "some_migration" }],
      applied: [{ version: "20260811132816", name: "some_migration" },
                { version: "20260811154220", name: "unfiled" }],
      expect: (r) => r.baselineVersion === null && r.missing.length === 1
                     && r.missing[0].name === "unfiled",
    },
  ];

  const bad = [];
  for (const c of cases) {
    let r;
    try { r = compare(c.files, c.applied); } catch (e) { bad.push({ ...c, err: e.message }); continue; }
    if (!c.expect(r)) bad.push({ ...c, got: JSON.stringify({
      baseline: r.baselineVersion, missing: r.missing.length, dup: r.duplicates.length,
      unapplied: r.unapplied.length, covered: r.coveredByBaseline.length }) });
  }

  const names = ["parseFileName accepts the real shape",
                 "parseFileName rejects a file with no version prefix"];
  if (parseFileName("20260811161014_watchdog_migration_history_visible.sql")?.version !== "20260811161014")
    bad.push({ why: names[0], got: "parsed wrong" });
  if (parseFileName("README.sql") !== null) bad.push({ why: names[1], got: "parsed something" });

  if (bad.length) {
    console.error("migration-drift: FAIL — the comparator is broken:\n");
    for (const b of bad) console.error(`  x ${b.why}\n      got ${b.got ?? b.err}`);
    console.error("\nNothing was reported. Every verdict below would be unreliable.\n");
    process.exit(1);
  }
  console.log(`migration-drift: comparator self-test PASSED (${cases.length + 2} cases, `
            + `5 of them negative — the half that stops a wrong label).`);
}

/* RUN AS A GATE, IMPORTABLE AS A LIBRARY.
 *
 * Without this guard, importing the module to exercise compare() against a hypothetical
 * file set runs the whole gate and calls process.exit — so the only way to test the
 * comparator would be to reproduce it, and a reproduction is not the thing under test.
 * Ordinary Node convention; noted because the exports above exist for exactly that. */
const RUN_AS_GATE = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (!RUN_AS_GATE) { /* imported: expose the functions, run nothing */ }
else {

selfTest();
if (process.argv.includes("--selftest")) process.exit(0);

/* ───────────────────────────────────────────────────────────── the repo side ─── */
if (!existsSync(MIGRATIONS)) {
  console.error("migration-drift: FAIL — supabase/migrations does not exist.");
  console.error("      There is nowhere for a migration to live, so production is running");
  console.error("      code this repository cannot contain by construction.\n");
  process.exit(1);
}

const onDisk = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
const unparsed = onDisk.filter((f) => !parseFileName(f));

/* THE COMPARISON RUNS AGAINST WHAT GIT HAS, NOT WHAT THIS DISK HAS.
 *
 * "In the repository" means what a clone gets. Judging the working tree instead would
 * make the verdict depend on who is sitting at the machine: an uncommitted baseline dump
 * would report zero drift here and ten in CI, and the two numbers would be argued about
 * rather than fixed. Measured against git, local and CI agree by construction.
 *
 * A tree with no git at all falls back to disk and says so, rather than declaring every
 * file missing — fail loudly on drift, never on a missing tool. */
const ls = spawnSync("git", ["ls-files", "supabase/migrations"], { cwd: ROOT, encoding: "utf8" });
const gitWorks = ls.status === 0;
const tracked = new Set(
  (ls.stdout ?? "").split(/\r?\n/).map((s) => s.trim().split("/").pop()).filter(Boolean),
);
const untracked = gitWorks ? onDisk.filter((f) => !tracked.has(f)) : [];
const inRepo = gitWorks ? onDisk.filter((f) => tracked.has(f)) : onDisk;
const files = inRepo.map(parseFileName).filter(Boolean);

/* ─────────────────────────────────────────────────────────── the database side ─── */
async function applied() {
  const client = await openClient("migration-drift", ROOT);
  try {
    const { rows } = await client.query("select version, name from public.v_migration_history");
    return rows;
  } catch (e) {
    /* A connection that opens and then cannot read the history is not a softer failure than
       no connection at all — it is the same absence of a verdict. */
    refuse("migration-drift", `v_migration_history could not be read: ${e.message.trim()}`);
  } finally {
    await client.end().catch(() => {});
  }
}

/* NO DATABASE, NO VERDICT — see tools/lib/db.mjs.
 *
 * This block used to print PASS (DEGRADED) and exit zero. CI never set PGURL, so that is what
 * it did on every run from the day it was written. The `missing: 0` ratchet below was set by
 * hand on 11 Aug specifically to catch a migration reaching production with no file here, and
 * it caught nothing, because it never once ran. Fourteen migrations drifted underneath it. */
const rows = await applied();

if (rows.length === 0) {
  console.error("migration-drift: FAIL — v_migration_history returned zero rows.");
  console.error("      This database has applied at least one migration to exist at all, so");
  console.error("      an empty history means the view is broken or pointed at nothing. A");
  console.error("      comparison against an empty set would pass on any repository at all.\n");
  process.exit(1);
}

const r = compare(files, rows);

/* ───────────────────────────────────────────────────────────────── the ratchet ───
 * 10 migrations were live with no file when this gate was written. Failing on all 10
 * today turns the build red for every agent on a debt none of them created this hour,
 * and a red build gets switched off. The counts may fall and may never rise: the next
 * apply_migration without a file takes missing to 11 and fails on the spot.
 */
let base = { missing: 0, duplicates: 0 };
if (existsSync(BASELINE_FILE)) {
  try { base = { ...base, ...JSON.parse(readFileSync(BASELINE_FILE, "utf8")).limits }; }
  catch { /* the defaults are the strict answer, so a corrupt file cannot loosen anything */ }
}

if (process.argv.includes("--bless")) {
  writeFileSync(BASELINE_FILE, JSON.stringify({
    _what_this_is:
      "Migration drift already present when this gate was written. These are DEBT: each "
      + "number may fall and may never rise. Lowering one is free and always welcome. "
      + "Raising one is a decision for the owner, not an edit to this file.",
    limits: { missing: r.missing.length, duplicates: r.duplicates.length },
    measured_on: new Date().toISOString().slice(0, 10),
    missing_at_baseline: r.missing.map((m) => `${m.version}_${m.name}`),
    duplicates_at_baseline: r.duplicates.map((d) => `${d.name} (${d.versions.join(", ")})`),
  }, null, 2) + "\n");
  console.log(`migration-drift: baseline written — missing ${r.missing.length}, `
            + `duplicates ${r.duplicates.length}.`);
  process.exit(0);
}

console.log(`migration-drift: ${rows.length} migration(s) applied, ${files.length} file(s) `
          + `${gitWorks ? "tracked in git" : "on disk (git unavailable — see note below)"}.`);
console.log(`migration-drift: newest baseline dump ${r.baselineVersion ?? "NONE"} `
          + `covers ${r.coveredByBaseline.length} of them as a squash.`);
if (!gitWorks) {
  console.log("migration-drift: note    — git could not list the tracked files, so this run");
  console.log("    judged the WORKING TREE. An uncommitted file counted as present here would");
  console.log("    be absent in CI. Treat a pass from this run as provisional.");
}

let failed = false;

/* A ratchet nobody tightens is a rubber stamp. When the real count drops below the
   recorded limit, say so in the passing output — the middle of a green build is where
   the last stale baseline hid for a day. */
function tighten(key, now, limit) {
  console.log(`migration-drift: TIGHTEN  — "${key}" is ${now}, recorded limit ${limit}.`);
  console.log(`    Lower it: node tools/checks/migration-drift.mjs --bless`);
  console.log("    A limit left above the truth is headroom for the next regression.");
}

if (unparsed.length) {
  failed = true;
  console.error(`\nmigration-drift: FAIL — ${unparsed.length} file(s) in supabase/migrations `
              + "are not named <14-digit-version>_<name>.sql:");
  for (const f of unparsed) console.error(`  x ${f}`);
  console.error("      A file that cannot be matched to a version can never be proved to be");
  console.error("      the migration it claims to be. Rename it to the version it was applied as.");
}

/* ONE FACT, ONE FINDING.
 *
 * With no baseline dump tracked, every applied migration is technically unsourced — and
 * printing 588 lines says "588 problems" when there is exactly one, and buries it. The
 * first run of this gate did precisely that, during a window in which another agent had
 * staged the deletion of the old dump and not yet committed the new one.
 *
 * schema-baseline-fresh.mjs already owns regenerating the dump. This states the
 * consequence for rule 6 and points there rather than competing with it. */
if (!r.baselineVersion) {
  failed = true;
  console.error("\nmigration-drift: FAIL — the repository tracks NO schema baseline dump.");
  console.error(`      All ${rows.length} applied migration(s) are therefore unsourced: there is`);
  console.error("      no file, and no squash covering them either. Rule 6 is not met in the");
  console.error("      largest possible way, and this database cannot be rebuilt from this repo.");
  console.error("");
  console.error("      Expected: supabase/migrations/<version>_baseline_live_schema.sql, TRACKED.");
  console.error("      Regenerate with tools/checks/dump-schema.mjs; schema-baseline-fresh.mjs");
  console.error("      owns its age. If a dump is sitting untracked on this disk, `git add` it —");
  console.error("      see the untracked note below.");
  console.error("");
  console.error("      Deliberately NOT listing the migrations individually. There is one");
  console.error("      problem here, not " + rows.length + ", and a wall of names hides it.");
} else if (r.missing.length > base.missing) {
  failed = true;
  console.error(`\nmigration-drift: FAIL — ${r.missing.length} migration(s) run in production `
              + `with NO file in this repository (limit ${base.missing}):\n`);
  for (const m of r.missing.slice(0, 25)) console.error(`  x ${m.version}  ${m.name}`);
  if (r.missing.length > 25) console.error(`  ... and ${r.missing.length - 25} more.`);
  console.error("");
  console.error("  Standard rule 6: what runs in production is in the repository.");
  console.error("  `apply_migration` writes Supabase's history and does NOT write a file here.");
  console.error("");
  console.error("  TO FIX, in this order — the version is assigned by Supabase, so the file");
  console.error("  cannot be named until after the call:");
  console.error("    1. read the version back:  select version, name from v_migration_history");
  console.error("                               order by version desc limit 5;");
  console.error("    2. write supabase/migrations/<version>_<name>.sql with the EXACT SQL");
  console.error("       that was applied, and the paragraph explaining why.");
  console.error("    3. git add it. A file on one laptop is not in the repository.");
  console.error("");
  console.error("  Regenerating the baseline dump (tools/checks/dump-schema.mjs) also closes");
  console.error("  this, because it genuinely puts production into the repository — but it");
  console.error("  loses the REASONING, and the reasoning is the part nobody can reconstruct.");
} else if (r.missing.length) {
  console.log(`migration-drift: ok      — ${r.missing.length} migration(s) with no file, `
            + `at the recorded limit of ${base.missing}. Debt, not a regression.`);
  for (const m of r.missing) console.log(`      ${m.version}  ${m.name}`);
  if (r.missing.length < base.missing) tighten("missing", r.missing.length, base.missing);
} else {
  console.log("migration-drift: ok      — every applied migration since the baseline has a file.");
  if (base.missing > 0) tighten("missing", 0, base.missing);
}

if (r.duplicates.length > base.duplicates) {
  failed = true;
  console.error(`\nmigration-drift: FAIL — ${r.duplicates.length} migration NAME(s) recorded `
              + `more than once (limit ${base.duplicates}):\n`);
  for (const d of r.duplicates) console.error(`  x ${d.name}  at ${d.versions.join(" and ")}`);
  console.error("");
  console.error("  One apply_migration call on 11 Aug 2026 was recorded twice, 28 seconds");
  console.error("  apart. The tool retried. It was harmless ONLY because that SQL happened to");
  console.error("  be idempotent — the same retry around an INSERT or an ALTER applies it");
  console.error("  twice, and the history then shows one intention and two executions.");
  console.error("  Check whether the second run had any effect before recording it.");
} else if (r.duplicates.length) {
  console.log(`migration-drift: ok      — ${r.duplicates.length} duplicate name(s), at the `
            + `recorded limit of ${base.duplicates}.`);
  for (const d of r.duplicates) console.log(`      ${d.name}  at ${d.versions.join(" and ")}`);
  if (r.duplicates.length < base.duplicates) tighten("duplicates", r.duplicates.length, base.duplicates);
} else if (base.duplicates > 0) {
  tighten("duplicates", 0, base.duplicates);
}

/* Reported, never failed. See class 3 in the header. */
if (r.unapplied.length) {
  console.log(`\nmigration-drift: note    — ${r.unapplied.length} file(s) here have no row in `
            + "production:");
  for (const f of r.unapplied) console.log(`      ${f.version}_${f.name}.sql`);
  console.log("      Legitimate when the file records a change made with execute_sql or by");
  console.log("      hand. Not legitimate if it was meant to be applied and never was —");
  console.log("      this gate cannot tell the two apart, so it reports and does not judge.");
}

if (untracked.length) {
  console.log(`\nmigration-drift: note    — ${untracked.length} migration file(s) on disk are `
            + "not tracked by git and were NOT counted as present:");
  for (const f of untracked) console.log(`      ${f}`);
  console.log("      A file on one laptop is not in the repository. Whatever these cover is");
  console.log("      counted as MISSING above until they are committed, which is exactly what");
  console.log("      CI will see. `git add` them and the count falls.");
}

if (failed) {
  console.error("\nmigration-drift: FAIL\n");
  process.exit(1);
}
console.log("\nmigration-drift: PASS (VERIFIED against v_migration_history).");

}
