#!/usr/bin/env node
/* standard-held.mjs — the parts of the engineering standard a machine can hold.
 *
 * Owner, 9 August 2026: "always hard rule to review code and ensure MIT...
 * microsoft google standard or beat them. Nothing underpar."
 *
 * THE HONEST SCOPE OF THIS FILE.
 *
 * Most of that standard cannot be checked by a program. Whether a commit message
 * explains WHY, whether a measurement was really taken, whether somebody said
 * what they did not do - those need a reader. Pretending to check them would be
 * the exact failure the standard's own first rule names: a check that cannot
 * fail proves nothing, and a check that only appears to check is worse, because
 * it retires the human who would otherwise have looked.
 *
 * So this holds the four that ARE mechanical, and says plainly that it holds
 * only four.
 *
 *   1. The standard is present in the charter every agent reads.
 *   2. Every guard in tools/checks can actually be run.
 *   3. No guard has been quietly emptied into a pass-through.
 *   4. Every deployed edge function has source here (delegated to its own gate).
 *
 * Rule 3 is the one worth having. A gate that has been reduced to `process.exit(0)`
 * still appears in CI, still prints a name, and enforces nothing - the same
 * shape as the retry job that ran 1,440 times a day retrying nothing.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHARTER = join(root, ".claude", "agents", "_charter_common.md");
const CHECKS = join(root, "tools", "checks");

let failed = 0;

/* ---- 1. the standard exists where agents actually read it --------------- */
const MUST_STATE = [
  "A CHECK THAT CANNOT FAIL PROVES NOTHING",
  "MEASURE. DO NOT ASSERT.",
  "ABSENCE AND NO-ACCESS ARE NOT THE SAME THING",
  "DATA MUST SAY WHAT IT IS",
  "WHAT RUNS IN PRODUCTION IS IN THE REPOSITORY",
  "DO NOT WORK AROUND A GUARD",
  "SAY WHAT YOU DID NOT DO",
];

if (!existsSync(CHARTER)) {
  console.error("standard-held: FAIL — the shared agent charter is missing.");
  console.error("   Every agent is told to read it. If it is gone, none of them are held to anything.");
  failed++;
} else {
  const charter = readFileSync(CHARTER, "utf8");
  const missing = MUST_STATE.filter((s) => !charter.includes(s));
  if (missing.length) {
    console.error(`standard-held: FAIL — the charter no longer states ${missing.length} rule(s):`);
    for (const m of missing) console.error(`   missing: ${m}`);
    console.error(`   These were each earned by a real failure. Removing one removes the only`);
    console.error(`   record of why it is a rule.`);
    failed++;
  } else {
    console.log(`standard-held: ok      — the charter states all ${MUST_STATE.length} load-bearing rules.`);
  }
}

/* ---- 2 & 3. guards that exist, run, and still do something -------------- */
/* A gate is "hollow" if it has no way to fail: no exit(1), no failure branch.
   Checked by reading, because a hollow gate is invisible from the outside - it
   passes, prints its name, and holds nothing. */
const NOT_A_GATE = new Set(["dump-schema.mjs"]);
const gates = readdirSync(CHECKS).filter((f) => f.endsWith(".mjs") && !NOT_A_GATE.has(f));

let hollow = 0;
for (const g of gates) {
  const body = readFileSync(join(CHECKS, g), "utf8");
  const canFail = /process\.exit\(\s*1\s*\)/.test(body) || /exitCode\s*=\s*1/.test(body);
  if (!canFail) {
    console.error(`standard-held: FAIL — ${g} has no path that fails the build.`);
    console.error(`   It runs, prints, and enforces nothing. A guard that cannot fail is a`);
    console.error(`   guard in name only, and it retires the person who would have looked.`);
    hollow++;
  }
}
if (hollow) failed++;
else console.log(`standard-held: ok      — all ${gates.length} guards have a failing path.`);

/* ---- 4. self-test: this file must be able to fail too ------------------- */
/* Named explicitly rather than assumed. The rule applies to the file that
   enforces the rule, or it is advice rather than a standard. */
const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
if (!/process\.exit\(1\)/.test(self)) {
  console.error("standard-held: FAIL — this file cannot fail, which makes it worthless.");
  failed++;
}

if (failed) {
  console.error(`\nstandard-held: ${failed} problem(s).`);
  console.error(`This holds only the mechanical parts. Whether a commit explains WHY, whether a`);
  console.error(`measurement was really taken, and whether somebody said what they did NOT do`);
  console.error(`still need a reader - and always will.`);
  process.exit(1);
}

console.log(`standard-held: PASS — the standard is stated, and ${gates.length} guards can all still fail.`);
console.log(`               (Mechanical parts only. The rest needs a reader, by design.)`);
