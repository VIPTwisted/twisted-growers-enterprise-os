#!/usr/bin/env node
/* rule-ledger.mjs — how much of the rulebook is real, as a number that must not go down.
 *
 * brain/RULE_LEDGER.md exists to record "which rules are enforced, and which are hope."
 * It was a document, so it had the same problem as every other hand-maintained document
 * here: brain/INDEX.md was 24 files out of date, and HANDOFF.md once stated the exact
 * opposite of the truth about anon access. A ledger of enforcement that is itself
 * maintained by hand will eventually claim enforcement that no longer exists — which is
 * strictly worse than claiming nothing, because the rule stops being watched.
 *
 * SO IT IS DERIVED, NOT WRITTEN. The rules come from CLAUDE.md. The enforcement comes
 * from the guards themselves: a guard claims a rule by NAMING it, in the form the
 * codebase already uses — "Rule E1", "Rules A1 / A2 / G1", "RULE E6:". Nothing to keep
 * in sync, and the incentive points the right way: to count a rule as enforced, you must
 * name it in the thing that enforces it.
 *
 * THREE INVARIANTS:
 *
 *   1. Every enforcement claim points at a file that EXISTS. A guard deleted while its
 *      claim survives is how a rule silently reverts to hope.
 *   2. The number of enforced rules NEVER DECREASES. A ratchet, matching eslint-ratchet
 *      and no-hardcoded-numbers: ci.yml already says a gate that fails on everything from
 *      day one is a gate people switch off. Most rules are unenforced today; that is the
 *      starting position, not a build failure. Going backwards is.
 *   3. Every rule in CLAUDE.md is accounted for — enforced, or explicitly counted as hope.
 *      A rule nobody has decided about does not exist.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const BASELINE = join(here, "rule-ledger.baseline.json");
const read = (p) => { try { return readFileSync(join(ROOT, p), "utf8"); } catch { return null; } };

/* ------------------------------------------------------------------ the rules --- */
const claudeMd = read("CLAUDE.md");
if (!claudeMd) {
  console.error("rule-ledger: FAIL — CLAUDE.md is missing. It is the source of truth for rules.");
  process.exit(1);
}
/* Rules are declared as "**A1. Never invent a number.**" at the start of a line. */
const RULES = [...claudeMd.matchAll(/^\*\*([A-I]\d+[a-z]?)\./gm)].map((m) => m[1]);
const UNIQUE = [...new Set(RULES)];

/* Section titles, so the report reads in plain English rather than as letters. */
const SECTION = {
  A: "Data honesty", B: "Weights, units and conversions", C: "Traceability and proof",
  D: "Metrc", E: "Database safety", F: "Front-end safety", G: "Configuration",
  H: "Issues and accountability", I: "Brand and voice",
};

/* ------------------------------------------------------------- the enforcers --- */
/* Anything that can actually stop or catch a violation. Documents are excluded on
   purpose: brain/ describes rules, it does not enforce them, and counting a markdown
   mention as enforcement is precisely the illusion this file exists to remove. */
/* Files that MENTION rule ids without enforcing them. Excluded with a reason, because
   a file that merely discusses a rule counting as enforcement is the exact illusion
   this check exists to remove — and the first version of this file inflated its own
   score by six by counting itself. */
const NOT_AN_ENFORCER = {
  "tools/checks/rule-ledger.mjs":
    "This file. It names rules as examples in its own documentation; it enforces the meta-rule that enforcement cannot silently disappear, not any individual rule.",
  "tools/checks/dump-schema.mjs":
    "Operator tool, not a gate — already exempt in all-checks-wired.mjs for the same reason. It needs live credentials and produces a dump, not a verdict.",
};

function enforcers() {
  const out = [];
  const dirs = [
    { dir: "tools/checks", kind: "build gate", ext: /\.mjs$/ },
    { dir: "tools/hooks", kind: "live hook", ext: /\.mjs$/ },
    { dir: "supabase/checks", kind: "database check", ext: /\.sql$/ },
  ];
  for (const d of dirs) {
    let files = [];
    try { files = readdirSync(join(ROOT, d.dir)); } catch { continue; }
    for (const f of files.filter((f) => d.ext.test(f))) {
      const path = `${d.dir}/${f}`;
      if (NOT_AN_ENFORCER[path]) continue;
      out.push({ path, kind: d.kind, text: read(path) ?? "" });
    }
  }
  const ci = read(".github/workflows/ci.yml");
  if (ci) out.push({ path: ".github/workflows/ci.yml", kind: "CI step", text: ci });
  return out;
}

/* A claim looks like "Rule E1", "Rules A1 / A2 / G1", "RULE E6:", "Rule 9 / I1". */
function claimed(text) {
  const found = new Set();
  /* "and" is a separator too — guard-protected-files.mjs writes "CLAUDE.md rules 9 and
     I1", and reading only "/" and "," missed it, so the theme lock looked unenforced. */
  for (const m of text.matchAll(/\brules?\s+((?:\d+|[A-I]\d+[a-z]?)(?:\s*(?:[/,]|and)\s*(?:\d+|[A-I]\d+[a-z]?))*)/gi)) {
    for (const tok of m[1].split(/[/,]|\band\b/i)) {
      const t = tok.trim().toUpperCase();
      if (/^[A-I]\d+[A-Z]?$/.test(t)) found.add(t);
    }
  }
  return found;
}

const ENFORCERS = enforcers();
const map = new Map(UNIQUE.map((r) => [r, []]));
for (const e of ENFORCERS) {
  if (!existsSync(join(ROOT, e.path))) continue;          // invariant 1
  for (const r of claimed(e.text)) {
    if (map.has(r)) map.get(r).push(e);
  }
}

const enforced = UNIQUE.filter((r) => map.get(r).length > 0);
const hope = UNIQUE.filter((r) => map.get(r).length === 0);

/* ---------------------------------------------------------------------- report --- */
console.log(`rule-ledger: ${UNIQUE.length} rules in CLAUDE.md, ${ENFORCERS.length} possible enforcers scanned\n`);
console.log(`ENFORCED — ${enforced.length} of ${UNIQUE.length}\n`);
for (const r of enforced) {
  const by = map.get(r);
  console.log(`  ${r.padEnd(4)} ${SECTION[r[0]]}`);
  for (const e of by) console.log(`         ${e.kind.padEnd(15)} ${e.path}`);
}

console.log(`\nHOPE — ${hope.length} of ${UNIQUE.length} have nothing mechanical behind them`);
const byLetter = {};
for (const r of hope) (byLetter[r[0]] ??= []).push(r);
for (const [letter, rs] of Object.entries(byLetter)) {
  console.log(`  ${SECTION[letter]}: ${rs.join(", ")}`);
}

const pct = Math.round((enforced.length / UNIQUE.length) * 100);
console.log(`\nrule-ledger: ${enforced.length}/${UNIQUE.length} enforced (${pct}%). The rest hold only while somebody remembers them.`);

/* --------------------------------------------------------------------- ratchet --- */
let base = null;
try { base = JSON.parse(readFileSync(BASELINE, "utf8")); } catch { base = null; }

if (!base) {
  writeFileSync(BASELINE, JSON.stringify({
    _comment: [
      "High-water mark for enforced rules. Derived by rule-ledger.mjs, never hand-edited",
      "upward. The count may RISE (commit the new baseline with the guard that raised it)",
      "but may never FALL: a rule that loses its enforcement is a rule that quietly went",
      "back to being hope, and that is the failure this ratchet exists to catch.",
    ],
    enforced_count: enforced.length,
    enforced: enforced,
    recorded: "2026-08-08",
  }, null, 2) + "\n");
  console.log(`\nrule-ledger: baseline created at ${enforced.length}. Commit it.`);
  process.exit(0);
}

const lost = (base.enforced ?? []).filter((r) => !enforced.includes(r));
if (lost.length) {
  console.error(`\nrule-ledger: FAIL — ${lost.length} rule(s) LOST their enforcement:\n`);
  for (const r of lost) console.error(`  ✗ ${r} — ${SECTION[r[0]]}: nothing names it any more.`);
  console.error("\nEither restore the guard, or name the rule in whatever replaced it. A rule that");
  console.error("loses enforcement without anyone noticing is exactly how the rulebook rots.\n");
  process.exit(1);
}

if (enforced.length > (base.enforced_count ?? 0)) {
  writeFileSync(BASELINE, JSON.stringify({ ...base, enforced_count: enforced.length, enforced }, null, 2) + "\n");
  console.log(`\nrule-ledger: baseline RAISED ${base.enforced_count} -> ${enforced.length}. Commit it.`);
}
console.log(`\nrule-ledger: PASS — no rule has lost its enforcement (baseline ${base.enforced_count}).`);
