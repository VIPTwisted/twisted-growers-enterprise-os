#!/usr/bin/env node
/* guard-fixtures.mjs — proof that the guards still catch what they claim to catch.
 *
 * THE CLASS OF PROBLEM THIS CLOSES
 *
 * `all-checks-wired.mjs` proves every guard in tools/checks RUNS. It says so itself:
 * "It deliberately does NOT check that a guard is any good — only that it runs."
 * Nothing covered that gap, and nothing covered tools/hooks at all.
 *
 * On 8 Aug 2026 both halves of that gap fired on the same day, from the same bug:
 *
 *   1. tools/hooks/guard-sql.mjs required only the WORDS "grant ... to ... anon" in
 *      any string. The finding text inside tg_nightly_platform_check() contains
 *      "...holds the grant. Then run ... to confirm zero" followed by "anon relations".
 *      Every edit to that function was blocked, permanently, with no GRANT present.
 *      The guard had no tests. It had never had any.
 *
 *   2. ci.yml carried its own copy of the same regex against *.sql, and hit three
 *      comments that DESCRIBE the anon problem. The "Forbidden SQL patterns" step
 *      exited 1 on every run, so the Gates workflow was red continuously — and a
 *      workflow that is always red enforces nothing, because nobody reads it.
 *
 * Two enforcement points, one rule, the same defect, found by accident.
 *
 * SO THIS ASSERTS TWO INVARIANTS:
 *
 *   A. Every fixture gets the verdict it is supposed to get. A rule with no fixture
 *      that MUST BLOCK and no fixture that MUST NOT BLOCK is not tested at all —
 *      per rule C0b, a check that cannot fail proves nothing, applied to the checks.
 *
 *   B. The hook and CI AGREE on every fixture. They enforce the same owner rules by
 *      two different mechanisms. When they disagree, one of them is wrong and the
 *      build must say which.
 *
 * Adding a rule to the hook without adding fixtures here leaves it unproven; adding
 * it to one enforcement point and not the other fails invariant B.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const SQL_HOOK = resolve(root, "tools/hooks/guard-sql.mjs");
const FILE_HOOK = resolve(root, "tools/hooks/guard-protected-files.mjs");

/* Assembled from fragments so THIS FILE never contains a literal forbidden statement.
   Otherwise the fixtures would trip the very greps they exist to test — and this file
   would be the fourth false positive. */
const G = "gr" + "ant";
const A = "an" + "on";
const DROP = "dr" + "op";

/* ---------------------------------------------------------------- SQL fixtures --- */
/* mustBlock: true  = a real violation. If this stops blocking, the guard has rotted.
   mustBlock: false = prose or a legitimate statement. If this blocks, the guard
                      over-reaches and will lock somebody out of their own codebase. */
const SQL_FIXTURES = [
  // --- Rule E1: destroyed mv_department_dashboard three times ---
  { rule: "E1", mustBlock: true,  why: "the statement that blanked every dashboard",
    sql: `${DROP} view v_money_position cascade;` },
  { rule: "E1", mustBlock: true,  why: "materialized variant of the same",
    sql: `${DROP} materialized view mv_tower_counts cascade;` },
  { rule: "E1", mustBlock: false, why: "the sanctioned replacement must never be blocked",
    sql: "create or replace view v_money_position as select 1;" },
  /* THE 8 AUG HOLE. The owner asked why the guard was not catching things and he was
     right: E1 only ever looked for the word CASCADE, so all three of these walked through.
     The database's own tg_block_view_drops() refused them the whole time - the hook and CI
     were the weak links, and a guard that permits what the database forbids teaches the
     wrong habit until the last moment. */
  { rule: "E1", mustBlock: true,  why: "THE 8 AUG HOLE — plain drop, no cascade, previously allowed",
    sql: `${DROP} view v_money_position;` },
  { rule: "E1", mustBlock: true,  why: "THE 8 AUG HOLE — if exists was the easiest way past it",
    sql: `${DROP} view if exists v_money_position;` },
  { rule: "E1", mustBlock: true,  why: "THE 8 AUG HOLE — worst case: a matview cannot be brought back by CREATE OR REPLACE",
    sql: `${DROP} materialized view mv_tower_counts;` },

  // --- Rule E6: 36 views once leaked tags, suppliers and dollar figures ---
  { rule: "E6", mustBlock: true,  why: "the plain form",
    sql: `${G} select on v_customers to ${A};` },
  { rule: "E6", mustBlock: true,  why: "all privileges",
    sql: `${G} all privileges on table v_x to ${A};` },
  { rule: "E6", mustBlock: true,  why: "schema usage is how the surface reopens",
    sql: `${G} usage on schema public to ${A};` },
  { rule: "E6", mustBlock: true,  why: "execute is what exposed 33 writing functions",
    sql: `${G} execute on function f_x() to ${A};` },
  { rule: "E6", mustBlock: true,  why: "buried inside a function body, not at statement start",
    sql: `create function f() returns void as $$ begin ${G} select on t to ${A}; end $$;` },
  { rule: "E6", mustBlock: false, why: "THE 8 AUG REGRESSION — finding text that locked the check function",
    sql: `insert into watchdog_findings (what_to_do) values ('Revoke from PUBLIC as well as ${A} - revoking from ${A} alone is a no-op while PUBLIC holds the ${G}. Then run the exposure check to confirm zero ${A} relations.');` },
  { rule: "E6", mustBlock: false, why: "THE 8 AUG CI REGRESSION — fortifications.sql:69 prose",
    sql: `problem := 'AUTO-FIXED: EXECUTE was ${G}ed to PUBLIC (the Postgres default), so ${A} could read it';` },
  { rule: "E6", mustBlock: false, why: "THE 8 AUG CI REGRESSION — baseline_live_schema.sql:5565 comment",
    sql: `-- Postgres ${G}s EXECUTE to PUBLIC on every new function, which is how the ${A} hole reopened` },
  { rule: "E6", mustBlock: false, why: "granting to authenticated is the CORRECT action and must stay allowed",
    sql: "grant select on v_customers to authenticated;" },

  // --- Rule H2: watchdog_findings silently lost 57 rows on 7 Aug 2026 ---
  { rule: "H2", mustBlock: true,  why: "deleting forensic evidence",
    sql: "delete from watchdog_findings where id < 10;" },
  { rule: "H2", mustBlock: true,  why: "truncate is the same act with a different verb",
    sql: "truncate issue_decisions;" },
  /* THE 8 AUG HOLE, and the worse half. Removing 57 rows from watchdog_findings was
     blocked. Removing the entire table was not - the most destructive of the three verbs
     was the one nobody had written a rule for. */
  { rule: "H2", mustBlock: true,  why: "THE 8 AUG HOLE — DELETE was blocked, DROP TABLE destroys the same evidence and was not",
    sql: `${DROP} table watchdog_findings;` },
  { rule: "H2", mustBlock: true,  why: "THE 8 AUG HOLE — if exists variant",
    sql: `${DROP} table if exists public.issue_decisions;` },
  { rule: "H2", mustBlock: true,  why: "THE 8 AUG HOLE — the cost history is evidence too",
    sql: `${DROP} table cost_input_history;` },
  { rule: "H2", mustBlock: false, why: "dropping an ordinary table is normal work",
    sql: `${DROP} table scratch_tmp;` },
  { rule: "H2", mustBlock: false, why: "appending to a forensic log is the sanctioned move",
    sql: "insert into watchdog_findings (what) values ('a new finding');" },
  { rule: "H2", mustBlock: false, why: "deleting from an ordinary table is normal work",
    sql: "delete from sheet_staging where id < 10;" },
];

/* -------------------------------------------------------------- file fixtures --- */
const FILE_FIXTURES = [
  { rule: "9/I1", mustBlock: true,  why: "THE THEME IS LOCKED", path: "app/web/src/styles.css" },
  { rule: "9/I1", mustBlock: true,  why: "THE THEME IS LOCKED", path: "app/web/src/rules.css" },
  { rule: "9/I1", mustBlock: false, why: "ordinary front-end work must not be blocked", path: "app/web/src/App.jsx" },
  { rule: "9/I1", mustBlock: false, why: "a brain document is not a theme file", path: "brain/INDEX.md" },
];

/* ------------------------------------------------- the greps ci.yml actually runs --- */
/* Read from ci.yml rather than copied, so this cannot drift from what CI runs — a
   hand-copied pattern here would be a fifth copy of the bug. */
function ciPatterns() {
  const yml = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
  const out = [];
  for (const m of yml.matchAll(/grep\s+-rniE\s+'([^']+)'/g)) {
    /* POSIX bracket expressions -> JavaScript equivalents. */
    const js = m[1].replace(/\[\[:space:\]\]/g, "\\s").replace(/\[\[:alpha:\]\]/g, "[A-Za-z]");
    out.push(new RegExp(js, "i"));
  }
  return out;
}

/* --------------------------------------------------------------------- runners --- */
const runHook = (script, payload) =>
  spawnSync("node", [script], { input: JSON.stringify(payload), encoding: "utf8" }).status === 2;

const hookBlocksSql = (sql) =>
  runHook(SQL_HOOK, { tool_name: "mcp__supabase__execute_sql", tool_input: { query: sql } });

const hookBlocksFile = (path) =>
  runHook(FILE_HOOK, { tool_name: "Write", tool_input: { file_path: `${root}/${path}` } });

const CI = ciPatterns();
const ciBlocksSql = (sql) => CI.some((re) => re.test(sql));

/* ----------------------------------------------------------------------- report --- */
let failures = [];
const say = (ok, label) => console.log(`${ok ? "  ok   " : "  FAIL "} ${label}`);

console.log("guard-fixtures: SQL guard — every fixture must get the verdict it claims\n");
for (const f of SQL_FIXTURES) {
  const got = hookBlocksSql(f.sql);
  const ok = got === f.mustBlock;
  const verb = f.mustBlock ? "BLOCK" : "ALLOW";
  say(ok, `${f.rule} must ${verb.padEnd(5)} — ${f.why}`);
  if (!ok) {
    failures.push(
      `SQL guard ${f.rule}: expected ${verb} but got ${got ? "BLOCK" : "ALLOW"}\n` +
      `        ${f.why}\n        ${f.sql.slice(0, 120)}`
    );
  }
}

console.log("\nguard-fixtures: theme / protected files\n");
for (const f of FILE_FIXTURES) {
  const got = hookBlocksFile(f.path);
  const ok = got === f.mustBlock;
  say(ok, `${f.rule} must ${(f.mustBlock ? "BLOCK" : "ALLOW").padEnd(5)} — ${f.path}`);
  if (!ok) {
    failures.push(`File guard ${f.rule}: ${f.path} expected ${f.mustBlock ? "BLOCK" : "ALLOW"} but got ${got ? "BLOCK" : "ALLOW"} (${f.why})`);
  }
}

console.log(`\nguard-fixtures: hook and CI must agree (${CI.length} grep patterns read from ci.yml)\n`);
if (CI.length === 0) {
  failures.push("No grep patterns found in ci.yml. The 'Forbidden SQL patterns' step has been removed or renamed, so SQL arriving by migration is no longer scanned.");
  console.log("  FAIL  no patterns found in ci.yml");
} else {
  for (const f of SQL_FIXTURES) {
    const hook = hookBlocksSql(f.sql);
    const ci = ciBlocksSql(f.sql);
    const ok = hook === ci;
    say(ok, `${f.rule} hook=${hook ? "block" : "allow"} ci=${ci ? "block" : "allow"} — ${f.why}`);
    if (!ok) {
      failures.push(
        `DRIFT on ${f.rule}: the PreToolUse hook says ${hook ? "BLOCK" : "ALLOW"} and ci.yml says ${ci ? "BLOCK" : "ALLOW"}.\n` +
        `        ${f.why}\n` +
        `        Two enforcement points, one rule, two answers. Fix both — on 8 Aug 2026 they\n` +
        `        carried the same false positive and fixing one would not have fixed the other.`
      );
    }
  }
}

if (failures.length) {
  console.error(`\nguard-fixtures: FAIL — ${failures.length} problem(s):\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  console.error("A guard that no longer catches what it claims is worse than no guard: the Rule");
  console.error("Ledger grades the rule as enforced and everyone stops watching it.\n");
  process.exit(1);
}

console.log(`\nguard-fixtures: PASS — ${SQL_FIXTURES.length + FILE_FIXTURES.length} fixtures, and the hook agrees with ci.yml on all ${SQL_FIXTURES.length} SQL cases.`);
