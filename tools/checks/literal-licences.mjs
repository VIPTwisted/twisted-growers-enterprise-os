#!/usr/bin/env node
/* literal-licences.mjs — a licence number in code is a business fact frozen into a build.
 *
 * ENFORCES Rule G2 — "licences come from company_licenses via f_is_ours(), never
 * literals", which serves Rule G1 — "nothing is hardcoded. Config = rows, never code."
 *
 * WHY IT MATTERS HERE SPECIFICALLY
 * This company holds two licences today: cultivation MC281714 and manufacturing
 * MP281909. A third licence, a renewal, a transfer, or a second site means every literal
 * is silently wrong — and "is this ours?" is not a cosmetic question here. Rule C0 makes
 * it the hinge of the whole ownership chain: 191 active packages / 420.6 lb read as ours
 * and traced to outside licences. A hardcoded licence list answers that question with a
 * value nobody can change without a deploy.
 *
 * A RATCHET, NOT A CLIFF. 55 literals exist today. ci.yml already states the principle:
 * "a gate that fails on everything from day one is a gate people switch off." So the
 * count may fall and may never rise. Every new one fails the build; the existing ones
 * are printed on every run so they cannot be forgotten.
 *
 * DOCUMENTATION IS EXEMPT ON PURPOSE. CLAUDE.md, HANDOFF.md and brain/ record the real
 * licence numbers as locked facts, and they should. This is about executable code.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const BASELINE = join(here, "literal-licences.baseline.json");

/* Where executable code lives. Everything else is documentation or data. */
const CODE_DIRS = ["app/web/src", "app/supabase", "supabase/checks", "tools", "bridge"];
const CODE_EXT = /\.(mjs|js|jsx|ts|tsx|sql|py)$/i;
/* "worktrees" — an agent worktree is a SECOND CHECKOUT of this same repo under
   .claude/worktrees/. Scanning it re-reports findings the real checkout already
   answers for, and it fails the build LOCALLY while Netlify (a fresh clone with
   no worktrees) passes — a gate whose verdict depends on whether an agent is
   running is a gate nobody can trust. Added 19 Aug 2026. */
const SKIP = new Set(["node_modules", ".git", "dist", "chrome-profile", "__pycache__", ".cache", "migrations", "worktrees"]);

/* The pattern for a Massachusetts licence in this programme: MC or MP then six digits.
   Written generically so a THIRD licence is caught too — the whole point of the rule. */
const LICENCE = /\bM[CP]\d{6}\b/g;

const SELF = "tools/checks/literal-licences.mjs";
const EXEMPT = {
  "supabase/checks/role_clearance.sql":
    "Names the licences while asserting they are read from company_licenses, not used as values.",
};

function selfTest() {
  const cases = [
    ["MC281714", true], ["MP281909", true], ["MC999999", true],
    ["metrc_packages", false], ["MC28171", false], ["XMC281714X", false],
  ];
  const bad = cases.filter(([s, want]) => new RegExp(LICENCE.source).test(s) !== want);
  if (bad.length) {
    console.error("literal-licences: FAIL — the licence pattern is broken:");
    bad.forEach(([s, want]) => console.error(`  ✗ "${s}" should ${want ? "" : "NOT "}match`));
    process.exit(1);
  }
  console.log(`literal-licences: pattern self-test PASSED (${cases.length} cases).`);
}

function walk(dir, out = []) {
  let entries; try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, out);
    else if (CODE_EXT.test(e)) out.push(p);
  }
  return out;
}

selfTest();

const findings = [];
for (const d of CODE_DIRS) {
  const abs = join(ROOT, d);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const rel = file.replace(/\\/g, "/").replace(ROOT.replace(/\\/g, "/") + "/", "");
    if (rel === SELF || EXEMPT[rel]) continue;
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, i) => {
      const hits = line.match(LICENCE);
      if (hits) findings.push({ rel, line: i + 1, count: hits.length });
    });
  }
}
const total = findings.reduce((n, f) => n + f.count, 0);

for (const [f, why] of Object.entries(EXEMPT)) console.log(`literal-licences: exempt  — ${f}: ${why}`);

const byFile = {};
for (const f of findings) byFile[f.rel] = (byFile[f.rel] ?? 0) + f.count;
console.log(`\nliteral-licences: ${total} literal licence number(s) in executable code:\n`);
for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${f}`);
}

let base = null;
try { base = JSON.parse(readFileSync(BASELINE, "utf8")); } catch { base = null; }

if (!base) {
  writeFileSync(BASELINE, JSON.stringify({
    _comment: [
      "High-water mark for hardcoded licence numbers (rule G2). This number may FALL and",
      "may never RISE. Recorded 8 Aug 2026 so the gate is green on arrival and therefore",
      "survives; every NEW literal fails the build.",
      "To reduce it: read the licence from company_licenses, or ask f_is_ours(licence).",
    ],
    max_allowed: total,
    recorded: "2026-08-08",
  }, null, 2) + "\n");
  console.log(`\nliteral-licences: baseline created at ${total}. Commit it.`);
  process.exit(0);
}

if (total > base.max_allowed) {
  console.error(`\nliteral-licences: FAIL — ${total} literals, baseline allows ${base.max_allowed}.`);
  console.error(`      ${total - base.max_allowed} new hardcoded licence number(s).`);
  console.error("      Rule G2: licences come from company_licenses via f_is_ours(), never literals.");
  console.error("      A licence frozen into code is wrong the day a licence is renewed, added or");
  console.error("      transferred — and 'is this ours?' is the hinge of the whole ownership chain.\n");
  process.exit(1);
}

if (total < base.max_allowed) {
  writeFileSync(BASELINE, JSON.stringify({ ...base, max_allowed: total }, null, 2) + "\n");
  console.log(`\nliteral-licences: baseline LOWERED ${base.max_allowed} -> ${total}. Commit it.`);
}
console.log(`\nliteral-licences: PASS — ${total} literal(s), no more than the baseline of ${base.max_allowed}.`);
