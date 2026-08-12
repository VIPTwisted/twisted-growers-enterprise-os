#!/usr/bin/env node
/* CHECK: no frozen business figures inside dashboard components.
 *
 * Rule A1 — never invent a number. Rule A2 — every figure carries its provenance.
 * Rule G1 — nothing is hardcoded; config is database rows, never code.
 *
 * This exists because of a real defect. budz.jsx CeoDashboard states figures as live "proof"
 * that were typed in by hand and are now permanent:
 *     "Fulfillment Vault 7,962 lb sitting across 16 open"
 *     "Average across all open harvests is 65 days"
 *     "only 29 of 143 harvests dried inside the 10 to 14 day window"
 * The same page also computes `${dryOk} of ${dry.length}` live, so it contradicts itself and
 * an executive cannot tell which number is real. Under rule C2 that is a bug, not a cosmetic
 * issue — and the numbers drift further from the truth every day.
 *
 * What it flags: a quoted string or template literal that contains BOTH a business-sized
 * number AND a unit word. That pairing is what makes a claim; a bare number is usually a
 * layout value and is deliberately ignored to keep the signal high.
 *
 * Escape hatch, for a figure that genuinely belongs in code:
 *     // provenance: <conversion_factors key or a one-line source>
 * on the same line or the line above. Visible, greppable, and reviewable — which is the
 * point. Silence is what caused this.
 *
 * Exit 1 if anything is found, so CI fails.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Only the files that present numbers to a decision-maker. */
const TARGETS = ["app/web/src/budz.jsx", "app/web/src/App.jsx",
  "app/web/src/commandcenter.jsx", "app/web/src/dashkit.jsx",
  "app/web/src/dash-cultivation.jsx", "app/web/src/dash-inventory.jsx"];

const UNITS =
  "lb|lbs|pound|pounds|gram|grams|g\\b|kg|oz|%|percent|day|days|plant|plants|" +
  "package|packages|harvest|harvests|unit|units|dollar|dollars";

/* A business-sized number: 3+ digits, or comma-grouped, or currency, or a decimal average. */
const NUMBER = "(?:\\$\\s?\\d|\\d{1,3}(?:,\\d{3})+|\\d{3,}|\\d+\\.\\d+)";

const NUM_THEN_UNIT = new RegExp(NUMBER + "\\s*(?:" + UNITS + ")", "i");
const UNIT_THEN_NUM = new RegExp("(?:" + UNITS + ")\\s*(?:of|:)?\\s*" + NUMBER, "i");

/* Pull out quoted strings and template literals, ignoring import paths and className. */
function literals(line) {
  const out = [];
  const re = /`([^`]*)`|"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

const findings = [];

for (const rel of TARGETS) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const lines = readFileSync(abs, "utf8").split(/\r?\n/);

  lines.forEach((line, i) => {
    const prev = i > 0 ? lines[i - 1] : "";
    if (/\/\/\s*provenance:/i.test(line) || /\/\/\s*provenance:/i.test(prev)) return;
    if (/^\s*(import|export)\s/.test(line)) return;
    if (/className\s*=/.test(line) && !/`/.test(line)) return;
    if (/viewBox|strokeWidth|d=|width=|height=|cx=|cy=|\br=/.test(line)) return;

    for (const lit of literals(line)) {
      if (lit.length < 4) continue;
      if (NUM_THEN_UNIT.test(lit) || UNIT_THEN_NUM.test(lit)) {
        /* A template literal that interpolates is computing, not asserting — unless it also
           contains a hardcoded business number alongside the interpolation, which is exactly
           the CeoDashboard pattern. */
        const interpolates = /\$\{/.test(lit);
        const stillHardcoded = new RegExp("(?<!\\$\\{[^}]{0,40})" + NUMBER).test(
          lit.replace(/\$\{[^}]*\}/g, "\u0000")
        );
        if (interpolates && !stillHardcoded) continue;

        findings.push({
          file: rel,
          line: i + 1,
          text: lit.length > 150 ? lit.slice(0, 150) + "…" : lit,
        });
        break;
      }
    }
  });
}

/* ---- Ratchet ---------------------------------------------------------------
   There are 27 pre-existing violations in CeoDashboard on the day this check was written.
   Failing on all of them would leave the build red from the first commit, and a permanently
   red build is one nobody reads — which is how the rule stopped being followed in the first
   place. So: fail on anything NEW, and let the baseline only ever shrink.

   Baseline entries are matched on file + text, NOT line number, so unrelated edits above them
   do not cause false failures.

   Regenerate after genuinely fixing some:  node tools/checks/no-hardcoded-numbers.mjs --update-baseline
--------------------------------------------------------------------------- */
const BASELINE = join(ROOT, "tools/checks/no-hardcoded-numbers.baseline.json");
const key = (f) => f.file + "::" + f.text;

if (process.argv.includes("--update-baseline")) {
  const { writeFileSync } = await import("node:fs");
  /* Dedupe: the same literal can appear twice, and a duplicated key would otherwise be
     reported as "1 baseline entry no longer present" on every subsequent run. */
  const uniq = [...new Set(findings.map(key))].sort();
  writeFileSync(BASELINE, JSON.stringify(uniq, null, 2) + "\n");
  console.log("baseline rewritten with " + findings.length + " entry(ies).");
  process.exit(0);
}

let baseline = [];
if (existsSync(BASELINE)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  } catch {
    console.error("no-hardcoded-numbers: baseline file is unreadable — treating it as empty.");
  }
}
const known = new Set(baseline);
const isNew = findings.filter((f) => !known.has(key(f)));
const fixed = baseline.filter((b) => !findings.some((f) => key(f) === b));

if (fixed.length) {
  console.log("no-hardcoded-numbers: " + fixed.length + " baseline entry(ies) no longer present.");
  console.log("  Good — run with --update-baseline to lock the improvement in so it cannot regress.");
}

if (!isNew.length) {
  console.log(
    "no-hardcoded-numbers: PASS — no NEW frozen figures. " +
      (known.size - fixed.length) + " known, still to be moved to data (see BUG 2 in the audit)."
  );
  process.exit(0);
}

console.error("no-hardcoded-numbers: FAIL — " + isNew.length + " NEW frozen business figure(s).\n");
console.error("A tile, total or headline is a CLAIM. A number typed into code stops being true");
console.error("the moment the data moves, and it will still be asserted with full confidence.");
console.error("This is rule A1 (never invent a number) and G1 (config is rows, never code).\n");
for (const f of isNew) {
  console.error("  " + f.file + ":" + f.line);
  console.error("    " + f.text + "\n");
}
console.error("Move each to a view with provenance, or delete it. If a figure genuinely");
console.error("belongs in code, annotate it so the exception is visible and reviewable:");
console.error("    // provenance: <conversion_factors key, or a one-line source>");
process.exit(1);
