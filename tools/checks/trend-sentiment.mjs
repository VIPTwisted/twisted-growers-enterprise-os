#!/usr/bin/env node
/* trend-sentiment.mjs — the guard behind task #34.
 *
 * THE DEFECT: the sparkline and the delta each decided independently whether a
 * movement was good or bad, using the direction of travel alone. styles.css
 * encodes sentiment in OPPOSITE class names on the two elements —
 * .sparkline.up is green, .dddelta.up is red — so the same movement drew one
 * green indicator and one red indicator on the same tile.
 *
 * Live on Command Center that rendered "Never submitted for testing +4.1" as a
 * green rising line: untestable, unsellable product increasing, presented as a
 * win to the person who would act on it.
 *
 * THE RULE, which this file exists to keep true:
 *   Direction of travel carries no meaning on its own. Only the target does.
 *     at_most  → rising is bad
 *     at_least → rising is good
 *     no target → NEUTRAL, never a guess
 *
 * 36 of 43 tiles have no target, so most render neutral. That is correct — it
 * shows the gap rather than inventing a verdict for it.
 *
 * This asserts the RULE rather than the current shape of the code, so a
 * refactor that keeps the behaviour passes and one that quietly reintroduces
 * "rising is green" does not.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = readFileSync(resolve(root, "app/web/src/App.jsx"), "utf8");
const css = readFileSync(resolve(root, "app/web/src/styles.css"), "utf8");

const failures = [];
const check = (ok, label, why) => {
  if (ok) console.log(`trend-sentiment: ok — ${label}`);
  else failures.push(`${label}\n      ${why}`);
};

/* 1 — one decision, not two. This is what stops them diverging again. */
check(
  /function movementVerdict\s*\(/.test(app),
  "a single movementVerdict() decides good / bad / neutral",
  "When the sparkline and the delta each judge a movement themselves, they drift apart and contradict each other on the same tile."
);

/* 2 — the verdict must come from the target, not from the arrow. */
check(
  /at_most[\s\S]{0,80}rising\s*\?\s*"bad"/.test(app),
  "at_most treats rising as bad",
  "For a KPI that must stay at or below a number — untested product, schedule violations, failed testing — an increase is a loss. Drawing it green tells the reader the opposite of the truth."
);
check(
  /at_least[\s\S]{0,80}rising\s*\?\s*"good"/.test(app),
  "at_least treats rising as good",
  "For a KPI with a floor, an increase is progress."
);

/* 3 — no target means no verdict. Only 7 of 43 tiles have one. */
check(
  /return\s*"neutral"/.test(app) && /SPARK_CLASS\s*=\s*{[^}]*neutral:\s*""/.test(app),
  "no target renders neutral rather than guessing",
  "Inventing a verdict for the 36 tiles with no target hides the fact that nobody has set one. Rule 7 forbids guessing a default."
);

/* 4 — both elements consume the same verdict. */
check(
  /<Spark[^>]*direction=/.test(app),
  "the sparkline is given the target direction",
  "Without it the sparkline is back to judging by arrow direction alone."
);
check(
  /DELTA_CLASS\[movementVerdict\(/.test(app),
  "the delta resolves its class through the same verdict",
  "The delta previously mapped dl.d > 0 straight to a class, independently of the sparkline. That is the divergence."
);

/* 5 — the stylesheet inversion is real and must stay documented. If someone
       ever unlocks the theme and makes these consistent, this check must fail
       loudly so the translation maps are removed at the same time. */
const inverted = /\.sparkline\.up\{stroke:var\(--neon\)\}/.test(css) &&
                 /\.dddelta\.up\{color:#ff6b6b\}/.test(css);
check(
  inverted,
  "styles.css still encodes .up oppositely on the two elements",
  "The stylesheet changed. SPARK_CLASS and DELTA_CLASS exist ONLY to translate that inversion — if the CSS is now consistent, delete the maps and map verdict straight to a class, or the colours will invert again."
);

if (failures.length) {
  console.error(`\ntrend-sentiment: FAIL — ${failures.length} invariant(s) broken:\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  console.error("Each of these makes a tile assert the opposite of what happened.\n");
  process.exit(1);
}
console.log("trend-sentiment: PASS — movement is judged by the target, or not judged at all.");
