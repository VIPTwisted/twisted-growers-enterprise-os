#!/usr/bin/env node
/* The agent data rules exist in one place and are COPIED into runtimes that cannot
 * read a file at run time. This gate fails the build when a copy drifts from the
 * source, or when a declared runtime is missing them entirely.
 *
 * WHY THIS EXISTS
 * On 8 Aug 2026 brain/AGENT_DATA_RULES.md told every agent that
 * metrc_rpt_package_transfers "holds ONLY 6-7 Aug 2026; it is a two-day snapshot,
 * not history." Its as_of_date holds two values because the EXPORT WAS PULLED on
 * those two days; the rows cover manifests from 19 Jan 2024 to 7 Aug 2026 - two and
 * a half years. An agent obeying it would refuse a historical shipment question and
 * report data missing, which is the exact error the paragraph above it forbids.
 *
 * The wrong text had been pasted into two more files. The source file says "change
 * it here first, then re-inject" - but nothing enforced the re-injection, so a
 * correction at the source would silently leave the copies wrong. It also claimed
 * FOUR runtimes carried the rules; only three did. The fourth, the budz-chat edge
 * function, had none at all - a runtime that answers questions with no rules is
 * worse than one with stale rules, and nothing was watching for it.
 *
 * THE APPROACH is the one used for generated code everywhere: a single source, and
 * CI rejects any copy that does not match. Copies are not hand-maintained; they are
 * verified. A rule with four copies is four rules until something proves otherwise.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = "brain/AGENT_DATA_RULES.md";

/* Every runtime that must carry the rules. Adding a runtime that answers questions
 * about this data WITHOUT adding it here is the failure this file exists to catch. */
const TARGETS = [
  { path: "app/web/src/budz.jsx",                     why: "Budz assistant, browser" },
  { path: "bridge/server.mjs",                        why: "desktop bridge, local model path" },
  { path: "app/supabase/functions/budz-chat/index.ts", why: "budz-chat edge function" },
];

/* Compare on meaning, not on formatting: comment prefixes, indentation and line
 * wrapping differ legitimately between a markdown file, JSX and TypeScript. */
const normalise = (s) =>
  s.replace(/\r\n/g, "\n")
   .split("\n")
   .map((l) => l.replace(/^\s*(\/\/|\*|#|>)?\s?/, "").trimEnd())
   .join("\n")
   .replace(/\s+/g, " ")
   .trim();

const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : null);

const src = read(SOURCE);
if (!src) {
  console.error(`rules-in-sync: FAIL — ${SOURCE} is missing. It is the source of truth.`);
  process.exit(1);
}

/* The canonical block is the fenced section in the source file. */
const fence = src.match(/```([\s\S]*?)```/);
if (!fence) {
  console.error(`rules-in-sync: FAIL — no fenced canonical block found in ${SOURCE}.`);
  process.exit(1);
}
const canonical = normalise(fence[1]);

/* Sentences that must appear verbatim in every copy. Checking the whole block would
 * fail on harmless wrapping; these are the load-bearing rules, and a copy missing
 * any one of them is a copy that will give a wrong answer. */
const MUST_CARRY = [
  "NEVER READ A PACKAGE ONE LEVEL DEEP",
  "NEVER REPORT DATA MISSING WITHOUT COUNTING IT",
  "FOUR REVENUE LINES, NEVER BLENDED",
  "THAT IS WHEN THE EXPORT WAS PULLED, NOT THE PERIOD IT COVERS",
  "The COA carries the TESTING",
  "The MANIFEST carries the CHAIN OF CUSTODY",
  /* Added 8 Aug 2026 with the seats training. Without these two lines the gate
     read green while a runtime carried no seats section at all - the training
     is only enforced to the extent it is named here. */
  "YOU HOLD EVERY SEAT IN THIS COMPANY",
  "THAT LIST IS A SNAPSHOT, NOT THE LIMIT",
  /* The owner's write rulings, 8 Aug 2026. A runtime that carries the seats
     training but not these would act on a system it must only explain. */
  "NOTHING IS EVER AUTOMATIC",
  "METRC IS READ ONLY. YOU NEVER WRITE TO IT",
  "NOTHING ELSE ON ANYONE'S PHONE",
  "THE PHONE IS STRICT",
  /* Rule J7, owner-directed 8 Aug 2026: "need to train all ai". A room name alone is not
     a room - ELEVEN names exist under both licences as physically different rooms, and
     557 of 862 held packages sit in one, so a bare name is wrong two thirds of the time.
     Named here because a rule is only trained to the extent this list enforces it: the
     seats training sat in the canonical file for hours while one runtime carried none of
     it, and the gate read green throughout. */
  "A ROOM NAME ALONE IS NOT A ROOM",
  "ELEVEN room names exist under BOTH licences",
  "PRE TRIM STORAGE IS TWO REAL ROOMS",
  /* Owner ruling 18 Aug 2026, forced on every agent, the brain, the second brain and
     every loop — for BOTH Metrc and Apex. Named here because this gate passed for
     hours while the rule sat in the canonical file and no runtime carried it: the
     list below is the enforcement, not the markdown. */
  "PARSE THE MANUAL BEFORE GUESSING",
  "the DOCUMENTATION is the first stop",
];

let failed = 0;
for (const t of TARGETS) {
  const body = read(t.path);
  if (body === null) {
    console.error(`rules-in-sync: FAIL — ${t.path} does not exist (${t.why}).`);
    failed++;
    continue;
  }
  const norm = normalise(body);
  const missing = MUST_CARRY.filter((phrase) => !norm.includes(normalise(phrase)));
  if (missing.length === MUST_CARRY.length) {
    console.error(`rules-in-sync: FAIL — ${t.path} (${t.why}) carries NONE of the rules.`);
    console.error(`   A runtime that answers questions with no rules is worse than one with stale rules.`);
    failed++;
  } else if (missing.length) {
    console.error(`rules-in-sync: FAIL — ${t.path} (${t.why}) has drifted from ${SOURCE}.`);
    for (const m of missing) console.error(`   missing: "${m}"`);
    console.error(`   Fix ${SOURCE} first, then re-inject into this file.`);
    failed++;
  } else {
    console.log(`rules-in-sync: ok      — ${t.path}  (${t.why})`);
  }
}

/* The source must not contain a claim that was measured false. Named explicitly so
 * the exact wording cannot come back. */
const RETIRED = [
  { text: "two-day snapshot", why: "as_of_date is when the export was PULLED, not the period it covers. 19,256 rows span 19 Jan 2024 to 7 Aug 2026." },
];
for (const r of RETIRED) {
  for (const p of [SOURCE, ...TARGETS.map((t) => t.path)]) {
    const body = read(p);
    if (body && body.includes(r.text)) {
      console.error(`rules-in-sync: FAIL — ${p} still contains the retired claim "${r.text}".`);
      console.error(`   ${r.why}`);
      failed++;
    }
  }
}

if (failed) {
  console.error(`\nrules-in-sync: ${failed} problem(s). The rules are the training every agent`);
  console.error(`obeys — a stale copy is not a documentation issue, it is wrong training that`);
  console.error(`is trusted. Nothing ships until the copies agree with ${SOURCE}.`);
  process.exit(1);
}
console.log(`rules-in-sync: PASS — ${TARGETS.length} runtimes all carry the current rules from ${SOURCE}.`);
