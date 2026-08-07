#!/usr/bin/env node
/* eslint-ratchet.mjs — ESLint as a ratchet, not a cliff.
 *
 * WHAT I GOT WRONG, AND WHY THIS EXISTS
 *
 * I put `npx eslint app/web/src --max-warnings 0` into ci.yml while 24 warnings
 * were outstanding. That gate is red the moment it is switched on. The eslint
 * config's own comment had already said not to do it:
 *
 *     "the CI step runs with --max-warnings 0 on changed files only once the
 *      backlog is cleared ... otherwise the gate is red on arrival and gets
 *      switched off."
 *
 * A gate nobody can go green on is not enforcement. It is a broken build that
 * teaches people to ignore the build — the same failure as the eslint run that
 * carried two permanent known errors while a real hook-order crash shipped past.
 *
 * The remaining 20 warnings are NOT cosmetic and must not be auto-fixed:
 *   - 9 react-hooks/exhaustive-deps. Adding a dependency to a live useEffect can
 *     turn it into an infinite render loop. Each one is a judgement call against
 *     the surrounding code, on a 7,800-line file serving a licensed business.
 *   - 4 no-empty. An empty catch is where an error disappears; the fix is to
 *     report it, which means deciding what "report" means at each site.
 *   - 7 react/no-unescaped-entities in the owner's own prose.
 *
 * So: ERRORS always fail. WARNINGS may never exceed the recorded baseline. Add a
 * warning and the build goes red naming the rule and the file. Remove warnings
 * and the check tells you to lower the baseline, so the ratchet only turns one
 * way — the same shape as no-hardcoded-numbers, which this repo already uses.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const BASELINE = resolve(here, "eslint-baseline.json");

let raw = "";
try {
  raw = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["eslint", "app/web/src", "--format", "json"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
} catch (e) {
  /* ESLint exits non-zero whenever it reports anything. That is the normal path
     here, and stdout still holds the JSON. Only a genuinely empty stdout means
     ESLint itself failed to run — which must fail loudly, never pass quietly. */
  raw = e.stdout?.toString() ?? "";
  if (!raw.trim()) {
    console.error("eslint-ratchet: FAIL — ESLint did not run.\n");
    console.error(String(e.stderr ?? e.message).slice(0, 800));
    process.exit(1);
  }
}

const report = JSON.parse(raw);
const errors = [];
const byRule = {};

for (const file of report) {
  for (const m of file.messages) {
    const rule = m.ruleId ?? "(no rule — parse or directive)";
    if (m.severity === 2) {
      errors.push(`${file.filePath.replace(root, "").replace(/\\/g, "/")}:${m.line}  ${rule}  ${m.message}`);
    } else {
      byRule[rule] = (byRule[rule] ?? 0) + 1;
    }
  }
}

const warnings = Object.values(byRule).reduce((a, b) => a + b, 0);

/* An error is never negotiable — jsx-no-comment-textnodes, rules-of-hooks,
   no-undef and friends are exactly the defects this repo has already shipped. */
if (errors.length) {
  console.error(`eslint-ratchet: FAIL — ${errors.length} ESLint ERROR(s). These block regardless of the baseline:\n`);
  for (const e of errors.slice(0, 40)) console.error(`  ✗ ${e}`);
  process.exit(1);
}

if (!existsSync(BASELINE)) {
  writeFileSync(BASELINE, JSON.stringify({ warnings, byRule }, null, 2) + "\n");
  console.log(`eslint-ratchet: baseline written at ${warnings} warnings. Commit tools/checks/eslint-baseline.json.`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, "utf8"));

if (warnings > base.warnings) {
  console.error(`eslint-ratchet: FAIL — warnings went UP: ${base.warnings} → ${warnings}.\n`);
  for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
    const was = base.byRule?.[rule] ?? 0;
    if (n > was) console.error(`  ✗ ${rule}: ${was} → ${n}`);
  }
  console.error(`\nRun: npx eslint app/web/src`);
  console.error(`Fix the new warning. Raising the baseline to make this pass defeats the check.\n`);
  process.exit(1);
}

if (warnings < base.warnings) {
  writeFileSync(BASELINE, JSON.stringify({ warnings, byRule }, null, 2) + "\n");
  console.log(`eslint-ratchet: PASS — warnings went DOWN: ${base.warnings} → ${warnings}. Baseline lowered; commit it.`);
  process.exit(0);
}

console.log(`eslint-ratchet: PASS — 0 errors, ${warnings} warnings, baseline held.`);
for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(3)}  ${rule}`);
}
