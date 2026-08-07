#!/usr/bin/env node
/* all-checks-wired.mjs — the guard that guards the guards.
 *
 * THE CLASS OF PROBLEM THIS CLOSES
 *
 * Five checks were written on 7 August. Four of them — routing,
 * error-boundaries, trend-sentiment and bridge-direct — were never added to
 * ci.yml, so they enforced NOTHING. They passed when run by hand and were never
 * run by anything else. The Rule Ledger records the same shape:
 *
 *     "Wire the guards that exist but nothing runs. Free enforcement,
 *      already written."
 *
 * That is the meta-trap from the agent briefing, applied to enforcement itself:
 * a guard written is not a guard running. Every unwired check is a rule the
 * ledger will grade as enforced while it holds nothing.
 *
 * So this asserts a single invariant, and it is the only one that scales:
 *
 *     EVERY check in tools/checks/ IS REFERENCED BY ci.yml.
 *
 * Write a new guard tomorrow and forget to wire it, and CI fails on this file
 * with the name of the guard you forgot. Nobody has to remember; the omission
 * is what breaks the build.
 *
 * It deliberately does NOT check that a guard is any good — only that it runs.
 * A bad check that runs is visible and can be fixed. A good check that never
 * runs is invisible and rots.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

const SELF = basename(fileURLToPath(import.meta.url));

/* Not every file here is a gate. A few are operator tools that need live
   credentials and produce output rather than a verdict — running them in CI
   would fail for the wrong reason, or worse, pass while proving nothing.
   Exemptions are listed HERE, with a reason, so they are visible and arguable.
   An unexplained exemption is how a real guard quietly stops running. */
const NOT_A_GATE = {
  "dump-schema.mjs":
    "Operator tool, not a gate. Reads the live database with credentials CI does not hold, and writes a schema dump. Run by hand when the schema needs rebuilding.",
};

let ci = "";
try {
  ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
} catch {
  console.error("all-checks-wired: FAIL — .github/workflows/ci.yml is missing.");
  console.error("      Without it nothing in tools/checks runs automatically and every");
  console.error("      guard in this folder is decoration.\n");
  process.exit(1);
}

const checks = readdirSync(here)
  .filter((f) => f.endsWith(".mjs"))
  .filter((f) => f !== SELF)
  .filter((f) => !NOT_A_GATE[f])
  .sort();

for (const [f, why] of Object.entries(NOT_A_GATE)) {
  console.log(`all-checks-wired: exempt  — ${f}: ${why.split(".")[0]}.`);
}

if (checks.length === 0) {
  console.error("all-checks-wired: FAIL — no checks found in tools/checks.");
  process.exit(1);
}

const unwired = checks.filter((f) => !ci.includes(f));

for (const f of checks) {
  console.log(`all-checks-wired: ${unwired.includes(f) ? "MISSING" : "ok     "} — ${f}`);
}

/* This file must be wired too, or the whole mechanism is opt-in. */
const selfWired = ci.includes(SELF);
console.log(`all-checks-wired: ${selfWired ? "ok     " : "MISSING"} — ${SELF} (this file)`);

if (unwired.length || !selfWired) {
  const missing = [...unwired, ...(selfWired ? [] : [SELF])];
  console.error(`\nall-checks-wired: FAIL — ${missing.length} guard(s) exist but nothing runs them:\n`);
  for (const f of missing) {
    console.error(`  ✗ ${f}`);
    console.error(`      Written, passing by hand, enforcing nothing. Add a step to`);
    console.error(`      .github/workflows/ci.yml:\n`);
    console.error(`        - name: ${f.replace(/\.mjs$/, "").replace(/-/g, " ")}`);
    console.error(`          run: node tools/checks/${f}\n`);
  }
  console.error("A guard that never runs is worse than no guard: the ledger grades the");
  console.error("rule as enforced and everyone stops watching it.\n");
  process.exit(1);
}

console.log(`all-checks-wired: PASS — all ${checks.length + 1} guards are wired into CI.`);
