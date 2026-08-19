#!/usr/bin/env node
/* aggregate-count.mjs — counting rows of an aggregate view counts the wrong thing.
 *
 * ENFORCES Rule E4 — "aggregate views: use sum(packages), not count(*)".
 *
 * WHY THIS EXISTS
 * HANDOFF.md §5 lists it as one of the five ways this project has actually broken:
 * "count(*) on v_stock_on_hand returns group count, not packages." The view groups by
 * stream, so counting its rows answers "how many streams are there" while looking
 * exactly like "how many packages do we hold". It is the most dangerous shape of bug in
 * this platform — not an error, not a blank screen, just a smaller number that reads as
 * true. Rule C2 says totals must reconcile to the items; this is how they silently stop.
 *
 * HOW IT DECIDES, rather than guessing:
 * Aggregate views are derived from the committed schema dump — the same file
 * schema-baseline-fresh.mjs already keeps current — by reading each view's real
 * definition and asking whether it groups. Nothing is hardcoded (rule G1), so a view
 * that gains a GROUP BY tomorrow is protected tomorrow, and one that loses it stops
 * being flagged without anybody editing a list.
 *
 * IT CHECKS BOTH DIALECTS, because the front end never writes SQL:
 *   SQL         count(*) from v_stock_on_hand
 *   supabase-js .from('v_stock_on_hand').select('*', { count: 'exact' })
 * The JavaScript form is the one that actually ships to users, and a check that only
 * read SQL would have declared this rule enforced while the real risk went unexamined.
 *
 * PRECISION IS THE POINT. On 8 Aug 2026 two guards fired on English prose and one of
 * them held CI red for a day. So this only ever flags a view it has PROVEN aggregates,
 * never a bare count(*), and never a name it cannot resolve.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

/* Replace the contents of every balanced (...) with spaces, preserving length and line
   breaks so reported positions stay honest. What remains is the statement's own top
   level: CTE bodies, subqueries and aggregate arguments are all gone. */
function maskParens(sql) {
  const out = sql.split("");
  let depth = 0;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (c === "(") { depth++; if (depth === 1) continue; }
    else if (c === ")") { depth--; if (depth === 0) continue; }
    if (depth > 0 && c !== "\n") out[i] = " ";
  }
  return out.join("");
}

/* SELF-TEST. The classifier is the entire basis of this guard, so it proves itself
   before it judges anything — on synthetic SQL, so it holds even if the schema changes
   completely. Rule C0b: a check that cannot fail proves nothing.
   The first version of this file classified on "GROUP BY anywhere" and got 39 of 89
   views wrong, flagging correct production code on its first run. These two cases are
   exactly that mistake, frozen so it cannot come back. */
function selfTest() {
  const cases = [
    { name: "grouping inside a CTE only", aggregate: false,
      sql: "with a as (select x, count(*) from t group by x) select * from a join b on b.id = a.id" },
    { name: "grouping inside a scalar subquery only", aggregate: false,
      sql: "select id, (select count(*) from c group by c.k limit 1) as n from t" },
    { name: "outer query genuinely grouped", aggregate: true,
      sql: "with a as (select * from t) select stream, sum(packages) from a group by stream" },
    { name: "plain grouped view, no CTE", aggregate: true,
      sql: "select stream, count(*) as packages from stock group by stream" },
    { name: "no grouping at all", aggregate: false,
      sql: "select id, name from t where active" },
  ];
  const bad = cases.filter((c) => /\bgroup\s+by\b/i.test(maskParens(c.sql)) !== c.aggregate);
  if (bad.length) {
    console.error("aggregate-count: FAIL — the aggregate classifier is broken:\n");
    for (const c of bad) {
      console.error(`  ✗ "${c.name}" should be ${c.aggregate ? "AGGREGATE" : "NOT aggregate"}`);
      console.error(`      ${c.sql}`);
    }
    console.error("\nEvery verdict below would be unreliable, so nothing is reported.\n");
    process.exit(1);
  }
  console.log(`aggregate-count: classifier self-test PASSED (${cases.length} cases).`);
}

/* ------------------------------------------------- which views actually aggregate --- */
function aggregateViews() {
  if (!existsSync(MIGRATIONS)) return null;
  const dumps = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  if (!dumps.length) return null;

  const agg = new Map();
  for (const f of dumps) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    /* Each definition runs from `create [or replace] view public.<name> as` to the
       statement terminator. Non-greedy to the first `;\n`, which is how the dump ends
       every statement. */
    const re = /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?"?([a-z0-9_]+)"?\s+as\b([\s\S]*?);\s*\n/gi;
    for (const m of sql.matchAll(re)) {
      const name = m[1].toLowerCase();
      const body = m[2];
      /* ONLY THE OUTER QUERY COUNTS. The first version of this asked whether GROUP BY
         appeared anywhere in the definition, and its very first run flagged
         app/web/src/App.jsx:7032 counting v_fg_metrc_check. That was WRONG: the view is
         `WITH fg AS (...), matched AS (... group by ...) SELECT ... FROM fg JOIN matched
         ON ma.id = f.id` — one row per finished-goods item. The grouping is inside a
         CTE, the output is not grouped, and count(*) there is exactly right.
         A guard that cries wolf on correct code gets switched off, which is how the
         rule it protects quietly stops being enforced.
         So: mask every balanced parenthesised group — CTE bodies, subqueries, function
         arguments — and ask whether GROUP BY survives in what is left, which is the
         outer query's own clauses and nothing else. */
      const grouped = /\bgroup\s+by\b/i.test(maskParens(body));
      if (grouped) agg.set(name, "groups its rows in its OUTER query");
    }
  }
  return agg;
}

selfTest();
const AGG = aggregateViews();
if (AGG === null) {
  console.error("aggregate-count: FAIL — no schema dump found in supabase/migrations.");
  console.error("      Without it this cannot know which views aggregate, and a check that");
  console.error("      cannot fail proves nothing (rule C0b). Run tools/checks/dump-schema.mjs.");
  process.exit(1);
}

/* ------------------------------------------------------------------- the codebase --- */
/* "worktrees" — an agent worktree is a SECOND CHECKOUT of this same repo under
   .claude/worktrees/. Scanning it re-reports findings the real checkout already
   answers for, and it fails the build LOCALLY while Netlify (a fresh clone with
   no worktrees) passes — a gate whose verdict depends on whether an agent is
   running is a gate nobody can trust. Added 19 Aug 2026. */
const SKIP = new Set(["node_modules", ".git", "dist", "env", "__pycache__", ".netlify", "workbook_extract", "migrations", "worktrees"]);
const EXT = /\.(mjs|js|jsx|ts|tsx|sql|py)$/i;
const SELF = "tools/checks/aggregate-count.mjs";

function walk(dir, out = []) {
  let entries; try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, out);
    else if (EXT.test(e)) out.push(p);
  }
  return out;
}

const findings = [];
const names = [...AGG.keys()];
if (names.length === 0) {
  console.error("aggregate-count: FAIL — parsed the schema but found zero aggregate views.");
  console.error("      That is implausible for this schema and means the parser has broken.");
  console.error("      A guard that silently matches nothing is worse than no guard.");
  process.exit(1);
}
const nameAlt = names.join("|");

/* SQL: count(*) ... from <view>. Tolerates whitespace and a public. prefix. */
const sqlRe = new RegExp(`count\\s*\\(\\s*\\*\\s*\\)[\\s\\S]{0,200}?\\bfrom\\s+(?:public\\.)?"?(${nameAlt})"?\\b`, "gi");
/* supabase-js: .from('<view>') ... count: 'exact' | 'planned' | 'estimated' */
const jsRe = new RegExp(`\\.from\\(\\s*['"\`](${nameAlt})['"\`]\\s*\\)[\\s\\S]{0,300}?count\\s*:\\s*['"\`](?:exact|planned|estimated)['"\`]`, "gi");

for (const file of walk(ROOT)) {
  const rel = file.replace(/\\/g, "/").replace(ROOT.replace(/\\/g, "/") + "/", "");
  if (rel === SELF) continue;
  let text; try { text = readFileSync(file, "utf8"); } catch { continue; }

  const at = (idx) => text.slice(0, idx).split("\n").length;
  for (const m of text.matchAll(sqlRe)) {
    findings.push({ rel, line: at(m.index), view: m[1].toLowerCase(), dialect: "SQL count(*)" });
  }
  for (const m of text.matchAll(jsRe)) {
    findings.push({ rel, line: at(m.index), view: m[1].toLowerCase(), dialect: "supabase-js count:" });
  }
}

/* ------------------------------------------------------------------------ report --- */
console.log(`aggregate-count: ${AGG.size} aggregate view(s) derived from the committed schema dump.`);
console.log(`aggregate-count: scanned the repository for row-counts against them, in SQL and supabase-js.\n`);

if (findings.length) {
  console.error(`aggregate-count: FAIL — ${findings.length} row-count(s) against an aggregate view:\n`);
  for (const f of findings) {
    console.error(`  ✗ ${f.rel}:${f.line}`);
    console.error(`      ${f.dialect} on ${f.view}, which ${AGG.get(f.view)}.`);
    console.error(`      This returns the number of GROUPS, not the number of items. The figure`);
    console.error(`      will look plausible and be wrong, and rule C2 says totals must reconcile`);
    console.error(`      to the rows behind them.`);
    console.error(`      Instead: sum the column that holds the count — sum(packages) — or count`);
    console.error(`      the base table the view aggregates.\n`);
  }
  process.exit(1);
}

console.log(`aggregate-count: PASS — no row-count against any of the ${AGG.size} aggregate views.`);
