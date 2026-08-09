#!/usr/bin/env node
/* locked-facts-in-prompts.mjs — the assistant may not contradict the locked facts.
 *
 * WHY THIS EXISTS
 *
 * brain/LESSONS.md recorded on 7 August 2026 that budz-chat's system prompt
 * contradicted CLAUDE.md's locked facts: it called grams per plant "NOT a valid
 * benchmark" and named grams per square foot as the real one - a measurement
 * this business does not possess, because grow_rooms.sqft is null by design and
 * the number once held there was a plant count in the wrong column.
 *
 * On 9 August it was still live, in SIX places, including a dashboard card
 * telling the owner his own benchmark was invalid. And an agent had read the
 * prompt, believed it, and hardened it into the seats training in between.
 *
 * The lesson was written down and nothing enforced it. That is the actual
 * failure: LESSONS.md is read by people who already know, and by nobody at the
 * moment it matters. A lesson with no guard behind it is a diary entry.
 *
 * WHAT THIS ASSERTS
 *
 * No prompt, training file or user-facing card may contain a claim the locked
 * facts contradict. The list is small and specific on purpose - a vague check
 * would fire on prose that merely mentions square footage, get switched off, and
 * then hold nothing. Every entry names the locked fact it protects.
 *
 * IT DOES NOT try to judge whether a prompt is CORRECT. It catches the exact
 * phrasings that were shipped and were wrong. New contradictions need new
 * entries - which is the honest limit of a string check, and is written here so
 * nobody mistakes a pass for proof of agreement.
 *
 * AND IT CANNOT TELL USE FROM MENTION. On its first run it correctly caught a
 * seventh instance nobody had found by hand - and then flagged a CORRECTION that
 * quoted the wrong claim in order to refute it. There is no reliable way for a
 * string check to distinguish making a claim from disowning it, so the rule is
 * the other way round: TEXT THAT CORRECTS AN ERROR MUST NOT RESTATE IT VERBATIM.
 * Describe the mistake, do not quote it. Making this check cleverer instead
 * would hand it a false positive, and a check that cries wolf gets switched off.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/* Everywhere a claim can reach a person: the canonical rules, each runtime copy,
   and the product itself. The card lived in App.jsx and budz.jsx and was held by
   nothing, which is why it outlived the prompts. */
const SURFACES = [
  "brain/AGENT_DATA_RULES.md",
  "bridge/server.mjs",
  "app/supabase/functions/budz-chat/index.ts",
  "app/web/src/budz.jsx",
  "app/web/src/App.jsx",
];

const FORBIDDEN = [
  {
    /* Matches the CLAIM, not the word. "grams per square foot" appears in the
       corrected text too - explaining why it is wrong - so a bare mention must
       not fire or this check gets switched off within a week. */
    pattern: /grams per plant is not a (valid|real) benchmark/i,
    fact: "CLAUDE.md locked facts: yield is GRAMS PER PLANT. Target 70.6, actual 82.3 across 87 closed harvests.",
    why: "The harvest calendar column headed 'Projected grams/sqft' is MISLABELLED and is grams per plant, proved from the Pull Summary.",
  },
  {
    pattern: /(real|published) benchmark is grams per square foot/i,
    fact: "CLAUDE.md locked facts: there is NO square footage anywhere in this business.",
    why: "grow_rooms.sqft is null by design - the 1,140 once held there was a PLANT COUNT in the wrong column, which is why it matched Flower Room 3's plant count exactly. An assistant cannot benchmark on a measurement that does not exist.",
  },
  {
    /* The owner set 70-77 on a measured 73.5. 75-80 is published guidance, and
       quoting it as ours is rule A2: a figure must carry its provenance. */
    pattern: /(fresh cannabis is|moisture (loss )?(is|of)) *~?75[-–]80 percent/i,
    fact: "CLAUDE.md locked facts: moisture loss is 70-77%, OWNER-SET on a MEASURED 73.5% across the 271 harvests that actually dried.",
    why: "75-80% is published guidance, not our harvests. Quoting it as ours is a figure without its provenance.",
  },
];

let failed = 0;
let scanned = 0;

for (const rel of SURFACES) {
  const path = join(root, rel);
  if (!existsSync(path)) continue;
  scanned++;
  const body = readFileSync(path, "utf8");
  for (const f of FORBIDDEN) {
    const m = body.match(f.pattern);
    if (!m) continue;
    const line = body.slice(0, m.index).split("\n").length;
    console.error(`locked-facts-in-prompts: FAIL — ${rel}:${line}`);
    console.error(`   found:  "${m[0]}"`);
    console.error(`   fact:   ${f.fact}`);
    console.error(`   why:    ${f.why}`);
    failed++;
  }
}

if (failed) {
  console.error(`\nlocked-facts-in-prompts: ${failed} contradiction(s) of the owner's locked facts.`);
  console.error(`An assistant primed with a superseded fact will argue against the owner's own`);
  console.error(`record, confidently and with no citation. This exact contradiction was written`);
  console.error(`into brain/LESSONS.md on 7 Aug 2026 and shipped for two more days, because`);
  console.error(`nothing read the lesson at the moment it mattered.`);
  process.exit(1);
}

console.log(`locked-facts-in-prompts: PASS — ${scanned} surfaces, none contradicts a locked fact.`);
console.log(`               (Catches known wrong phrasings only. A pass is not proof of agreement.)`);
