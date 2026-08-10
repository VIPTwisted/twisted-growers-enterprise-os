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

  /* ── 9 AUG 2026: COMMENTS ARE NOT CODE ────────────────────────────────────────
   * The hook whitespace-collapsed the entire payload into one line and then matched
   * keywords, so a `${DROP} view` statement on line 12 paired with the word cascade in a
   * COMMENT on line 3 and was refused as a CASCADE. It contained no cascade at all.
   *
   * ci.yml learned this on 8 Aug and excludes comment lines. The hook did not, so the two
   * enforcement points disagreed for a day in the direction nobody checks: the strict one
   * was strict about the wrong thing. Three refusals in a row were phantoms of this kind,
   * on migrations whose comments merely NAMED the rule they were obeying.
   *
   * This is why it matters beyond tidiness. Every migration in this repo carries a paragraph
   * explaining itself, because the charter demands it. A guard that reads that paragraph as
   * code punishes exactly the behaviour the charter asks for — and the author of a
   * blocked-but-correct statement cannot tell a real catch from a phantom, so they stop
   * believing the guard. That is how a guard dies while still showing green. */
  { rule: "E1", mustBlock: false, why: "COMMENT IS NOT CODE — a legal replacement whose comment names the forbidden form",
    sql: `-- ${DROP} view ... cascade blanked every dashboard three times; never again.\n`
       + `create or replace view v_money_position as select 1;` },
  /* ci.yml excludes `-- ` comment LINES but knows nothing of C-style block comments, because
     grep is line-based and cannot strip one that opens and closes mid-line. Measured 9 Aug: 17
     .sql files, one uses block comments, none names a forbidden verb inside one — so this is
     latent, not live. Declared rather than hidden: if someone makes CI comment-aware, this
     fixture fails and the flag comes off. */
  { rule: "E1", mustBlock: false, ciStricter: true,
    why: "COMMENT IS NOT CODE — block-comment form; grep cannot see block comments, so CI stays stricter",
    sql: `/* never ${DROP} view with cascade */ create or replace view v_x as select 1;` },
  { rule: "E1", mustBlock: true,  why: "a comment nearby must NOT excuse the statement beside it",
    sql: `-- this migration is careful and reviewed\n${DROP} view v_money_position;` },

  /* ── 9 AUG 2026: THE ESCAPE THE GUARD ITSELF PRESCRIBES ───────────────────────
   * The hook's refusal message has told callers since 8 Aug to prove nothing depends on the
   * view and then declare `set local tg.allow_drop = 'yes'`. The code never honoured it: the
   * drop branch ignored the declaration entirely. So the only documented way to comply was
   * refused, and a comment in the hook claimed hook and database "now agree" when they did
   * not — the database has honoured this escape all along.
   *
   * An instruction that cannot be followed is worse than a flat prohibition. A flat
   * prohibition gets escalated to the owner; a false one teaches that the guard is broken and
   * the next person routes around it. CASCADE stays forbidden with or without the escape. */
  { rule: "E1", mustBlock: false, ciStricter: true,
    why: "THE UNHONOURED ESCAPE — the guard's own prescribed path must actually work",
    sql: `set local tg.allow_drop = 'yes';\n${DROP} view zz_guard_probe_secure;` },
  { rule: "E1", mustBlock: true,  why: "the escape must NOT unlock cascade — that is the damage itself",
    sql: `set local tg.allow_drop = 'yes';\n${DROP} view v_money_position cascade;` },
  { rule: "E1", mustBlock: true,  why: "a matview drop is unrecoverable, so the escape must not cover it either",
    sql: `set local tg.allow_drop = 'yes';\n${DROP} materialized view mv_tower_counts;` },

  /* ── 9 AUG 2026: FORBIDDEN TEXT AS DATA, the phantom that will recur ──────────
   * Seeding policy_registry with the 51 rules from CLAUDE.md was refused, because rule E1's
   * own title is the statement it forbids. A register whose PURPOSE is to catalogue forbidden
   * statements cannot be written by a guard that greps for them, and the same collision waits
   * for every finding, work order and audit note that quotes a rule.
   *
   * The skip is decided on the code SKELETON with literals removed, so nothing inside a
   * literal can vote on whether literals are trusted. The last two cases here are the ones
   * that matter: they are why this is narrow rather than convenient. */
  /* These three are CI-stricter and it is LIVE, not latent, unlike the block-comment case:
     grep cannot tell a quoted rule title from a statement, so a policy seed COMMITTED as a
     .sql file would fail CI. The seed is applied by migration, which CI does not scan, and the
     honest consequence is recorded here rather than discovered by someone else later. */
  { rule: "E1", mustBlock: false, ciStricter: true,
    why: "DATA NOT CODE — the policy register must be able to hold the text of rule E1",
    sql: `insert into policy_registry (policy_key, title) values ('E1', 'NEVER ${DROP} view ... cascade');` },
  { rule: "E6", mustBlock: false, ciStricter: true,
    why: "DATA NOT CODE — and the text of rule E6",
    sql: `insert into policy_registry (policy_key, title) values ('E6', 'never ${G} select to ${A}');` },
  { rule: "E1", mustBlock: false, ciStricter: true,
    why: "DATA NOT CODE — a finding may quote the statement that caused it",
    sql: `update watchdog_note set body = 'someone ran ${DROP} view v_money_position cascade' where id = 1;` },
  { rule: "E1", mustBlock: true,  why: "DYNAMIC SQL — a function body may not hide the drop in a literal",
    sql: `create function f() returns void as $$ begin execute '${DROP} view v_money_position cascade'; end $$ language plpgsql;` },
  { rule: "E1", mustBlock: true,  why: "the skip must not extend past the data write to a real statement",
    sql: `insert into policy_registry (policy_key) values ('E1'); ${DROP} view v_money_position;` },
  { rule: "H2", mustBlock: true,  why: "naming a forensic table forfeits the skip entirely, whatever the verb",
    sql: `insert into audit_events (note) values ('x'); delete from watchdog_findings where id = 1;` },

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
  /* Capture the whole `if grep -rniE '...' ... ; then` clause, not just the pattern.
   *
   * WHY, 9 Aug 2026: this function modelled only the INCLUSION patterns. Two of the three
   * CI rules pipe their hits through `grep -viE ':[0-9]+:[[:space:]]*--'` to drop comment
   * lines, and that pipe was invisible here — so the harness believed CI blocks prose that
   * CI in fact allows. It would have reported DRIFT against a hook that agrees with CI, and
   * the fix for the phantom would have been applied to the wrong side.
   *
   * A harness that models an enforcement point inaccurately is worse than one that admits it
   * cannot see it: invariant B is only worth its name if both sides are read as they run. */
  for (const m of yml.matchAll(/grep\s+-rniE\s+'([^']+)'([\s\S]*?);\s*then/g)) {
    /* POSIX bracket expressions -> JavaScript equivalents. */
    const js = m[1].replace(/\[\[:space:\]\]/g, "\\s").replace(/\[\[:alpha:\]\]/g, "[A-Za-z]");
    out.push({
      re: new RegExp(js, "i"),
      /* Does this rule pipe its hits through a comment-line exclusion? */
      skipsComments: /grep\s+-viE\s+'[^']*--/.test(m[2]),
    });
  }
  return out;
}

/* ------------------------------------------------------- Bash-carried fixtures ---
 * THE FOURTH PHANTOM, 9 Aug 2026. The guard scans Bash payloads too, and a commit message
 * describing rule E1 contains the words it forbids. The commit that fixed the SQL-comment
 * phantom was itself refused by the guard it was fixing.
 *
 * Commit messages here are long by policy: they carry the reasoning, the measurement and the
 * rule names. That policy and this guard were on a collision course, and the tempting exit —
 * write the message to a file so the hook never sees it — is the working-around the guard's own
 * message forbids.
 *
 * These are NOT part of the hook-versus-ci comparison: ci.yml greps *.sql files and never sees
 * a git command, so there is nothing to compare against. */
const BASH_FIXTURES = [
  { rule: "E1", mustBlock: false, why: "a commit message may DESCRIBE the rule it fixes (heredoc)",
    cmd: `git commit -F - <<'EOF'\nFix the E1 phantom\n\nThe hook read a comment as code, so a ${DROP} view statement paired with the\nword cascade in a comment. CASCADE stays absolutely forbidden either way.\nEOF` },
  { rule: "E1", mustBlock: false, why: "the -m form of the same",
    cmd: `git commit -m "E1: ${DROP} view ... cascade is still refused, the phantom is not"` },
  { rule: "H2", mustBlock: false, why: "a commit message naming the forensic tables is documentation",
    cmd: `git commit -m "H2: block delete from watchdog_findings and truncate of issue_decisions"` },
  /* The hole this could have opened, closed by construction: any SQL client anywhere in the
     command means every byte is scanned again, message or not. */
  { rule: "E1", mustBlock: true,  why: "SMUGGLING — a commit chained to psql must scan the whole command",
    cmd: `git commit -m "tidy" && psql -c '${DROP} view v_money_position cascade;'` },
  { rule: "E1", mustBlock: true,  why: "SMUGGLING — psql heredoc is a real execution path and is never treated as prose",
    cmd: `git commit -m "tidy" ; psql <<'SQL'\n${DROP} view v_money_position;\nSQL` },
  { rule: "E6", mustBlock: true,  why: "SMUGGLING — the grant surface, same route",
    cmd: `git commit -m "tidy" && psql -c '${G} select on v_customers to ${A};'` },
  { rule: "E1", mustBlock: true,  why: "a bare psql drop, no commit involved, must still block",
    cmd: `psql -c '${DROP} view v_money_position;'` },
];

/* --------------------------------------------------------------------- runners --- */
const runHook = (script, payload) =>
  spawnSync("node", [script], { input: JSON.stringify(payload), encoding: "utf8" }).status === 2;

const hookBlocksSql = (sql) =>
  runHook(SQL_HOOK, { tool_name: "mcp__supabase__execute_sql", tool_input: { query: sql } });

const hookBlocksFile = (path) =>
  runHook(FILE_HOOK, { tool_name: "Write", tool_input: { file_path: `${root}/${path}` } });

const hookBlocksBash = (cmd) =>
  runHook(SQL_HOOK, { tool_name: "Bash", tool_input: { command: cmd } });

const CI = ciPatterns();
/* grep is LINE-based. Testing the pattern against the whole blob let a `drop view` on line 12
   pair with a `cascade` on line 3, which is precisely the false positive that blocked three
   legitimate migrations. Evaluate per line, and honour each rule's comment exclusion. */
const ciBlocksSql = (sql) =>
  CI.some(({ re, skipsComments }) =>
    sql.split(/\r?\n/).some((line) =>
      re.test(line) && !(skipsComments && /^\s*--/.test(line))));

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

console.log("\nguard-fixtures: SQL guard reading Bash — prose must pass, execution must not\n");
for (const f of BASH_FIXTURES) {
  const got = hookBlocksBash(f.cmd);
  const ok = got === f.mustBlock;
  const verb = f.mustBlock ? "BLOCK" : "ALLOW";
  say(ok, `${f.rule} must ${verb.padEnd(5)} — ${f.why}`);
  if (!ok) {
    failures.push(
      `Bash payload ${f.rule}: expected ${verb} but got ${got ? "BLOCK" : "ALLOW"}\n` +
      `        ${f.why}\n        ${f.cmd.replace(/\n/g, " ⏎ ").slice(0, 140)}`
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

    /* ONE DELIBERATE ASYMMETRY, AND ONLY IN THE SAFE DIRECTION.
     *
     * The interactive hook honours `set local tg.allow_drop = 'yes'` because a person can
     * prove, in that moment, that nothing depends on the view. ci.yml scans COMMITTED .sql
     * files, where the same declaration would become a permanent, copyable licence to drop
     * views — so CI stays absolute. The database's tg_block_view_drops() is the final word
     * either way.
     *
     * ciStricter is allowed ONLY where CI blocks and the hook allows. The reverse — the hook
     * refusing what CI waves through — is never declarable, because that is the direction in
     * which something bad reaches main. An undeclared difference in EITHER direction fails. */
    if (f.ciStricter) {
      if (ci && !hook) {
        say(true, `${f.rule} hook=allow ci=block — DECLARED: ${f.why}`);
        continue;
      }
      failures.push(
        `DECLARED ASYMMETRY NO LONGER HOLDS on ${f.rule}: expected hook=ALLOW ci=BLOCK, ` +
        `got hook=${hook ? "BLOCK" : "ALLOW"} ci=${ci ? "BLOCK" : "ALLOW"}.\n` +
        `        ${f.why}\n` +
        `        Either the hook stopped honouring the escape it prescribes, or CI stopped\n` +
        `        being the stricter of the two. Both need a decision, not a baseline bump.`
      );
      say(false, `${f.rule} declared asymmetry broken — ${f.why}`);
      continue;
    }

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

console.log(`\nguard-fixtures: PASS — ${SQL_FIXTURES.length + BASH_FIXTURES.length + FILE_FIXTURES.length} fixtures, and the hook agrees with ci.yml on all ${SQL_FIXTURES.length} SQL cases.`);
