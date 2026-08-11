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
  "run-gates.mjs":
    "The RUNNER, not a gate. It executes every check:* in the `check` chain and reports which one failed. Chaining it INTO that chain would make it invoke itself, and then invoke itself again, forever - it parses `check` out of package.json precisely so the list is never duplicated. It is wired in at netlify.toml, which calls `npm run gates` on the deploy path, and that wiring is asserted below rather than left to trust.",
  "deploy-current.mjs":
    "A POST-deploy assertion, and it CANNOT be a pre-deploy gate. It asks whether the LIVE SITE is serving current main. Run before the build, the answer is necessarily no - that is the whole reason a deploy is happening - so it fails, blocks the build, and prevents the very deploy that would make it pass. A permanent deadlock, not a temporary red. Its verdict is only meaningful AFTER a publish, so it belongs in a post-deploy hook or a scheduled watch, which is Agent D's lane. Exempt on architecture, not on convenience.",
  "lane-discipline.mjs":
    "TEMPORARY, and Agent D's to remove. Agent D's guard, deliberately not yet wired. It currently fails on two unowned files that sit in two different agents' work, and it reports 0 of 56 commits carrying an 'Agent: X' trailer - so by its own output its cross-lane rule is dormant. Wiring it now would block EVERY agent's deploy on a commit convention nobody has adopted yet, which is a process decision for D and the owner, not something the pipeline should impose by stealth. TO REMOVE THIS: claim the unowned files in agent_lane (or list them in that file's UNOWNED_OK), get agents emitting the Agent trailer, then add check:lane to the chain and delete this entry.",
};

/* THERE ARE TWO PLACES THAT RUN THESE, AND CHECKING ONLY ONE MISSED FOUR.
 *
 * This originally read ci.yml alone and reported PASS. Meanwhile the Netlify
 * build — which is the gate that can actually stop a ship, because it runs on
 * the deploy path — called `npm run check`, and that script was missing
 * trend-sentiment, bridge-direct, all-checks-wired and the eslint ratchet. Four
 * guards, green in Actions, absent from the thing that publishes the site.
 *
 * netlify.toml says it plainly: "Actions and Netlify build independently and in
 * parallel, so a failing Action could never stop a ship." A guard in ci.yml and
 * not in `npm run check` is advisory. Both are required.
 */
const RUNNERS = [
  { file: ".github/workflows/ci.yml", what: "GitHub Actions" },
  { file: "package.json",             what: "the Netlify build, via `npm run check`" },
];

let ci = "";
const sources = {};
for (const r of RUNNERS) {
  let text = "";
  try {
    text = readFileSync(resolve(root, r.file), "utf8");
  } catch {
    console.error(`all-checks-wired: FAIL — ${r.file} is missing.`);
    console.error(`      Without it nothing in tools/checks runs in ${r.what}, and every`);
    console.error("      guard in this folder is decoration.\n");
    process.exit(1);
  }
  /* package.json only counts if the `check` script actually chains them — a
     script defined and never called by `check` is exactly the gap this closes. */
  if (r.file === "package.json") {
    const pkg = JSON.parse(text);
    const chain = String(pkg.scripts?.check ?? "");
    const named = chain.match(/check:[a-z-]+/g) ?? [];
    text = named.map((n) => pkg.scripts?.[n] ?? "").join("\n");
  }
  sources[r.file] = { text, what: r.what };
  ci += "\n" + text;
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

/* EVERY runner must run it — not either. The first version of this concatenated
   both files and asked whether the name appeared anywhere in the result, which
   passes a guard that is in Actions and missing from the Netlify gate. That is
   precisely the case that existed: four guards green in Actions and absent from
   the build that publishes the site. Present-in-either is not enforcement. */
const missingFrom = (f) =>
  Object.entries(sources).filter(([, v]) => !v.text.includes(f)).map(([k]) => k);

const unwired = checks.filter((f) => missingFrom(f).length > 0);

for (const f of checks) {
  const gaps = missingFrom(f);
  console.log(
    gaps.length
      ? `all-checks-wired: MISSING — ${f}  (absent from ${gaps.join(" and ")})`
      : `all-checks-wired: ok      — ${f}`
  );
}

/* This file must be wired everywhere too, or the whole mechanism is opt-in. */
const selfGaps = missingFrom(SELF);
const selfWired = selfGaps.length === 0;
console.log(
  selfWired
    ? `all-checks-wired: ok      — ${SELF} (this file)`
    : `all-checks-wired: MISSING — ${SELF} (this file, absent from ${selfGaps.join(" and ")})`
);

if (unwired.length || !selfWired) {
  const missing = [...unwired, ...(selfWired ? [] : [SELF])];
  console.error(`\nall-checks-wired: FAIL — ${missing.length} guard(s) are not run everywhere:\n`);
  for (const f of missing) {
    console.error(`  ✗ ${f}`);
    for (const gap of missingFrom(f)) {
      console.error(`      Not run by ${sources[gap].what}. Add:`);
      if (gap.endsWith("ci.yml")) {
        console.error(`        - name: ${f.replace(/\.mjs$/, "").replace(/-/g, " ")}`);
        console.error(`          run: node tools/checks/${f}`);
      } else {
        const slug = f.replace(/\.mjs$/, "").split("-")[0];
        console.error(`        "check:${slug}": "node tools/checks/${f}"`);
        console.error(`        ...and chain it into the "check" script, or it still never runs.`);
      }
    }
    console.error("");
  }
  console.error("A guard that never runs is worse than no guard: the ledger grades the");
  console.error("rule as enforced and everyone stops watching it. And a guard that runs only");
  console.error("in Actions cannot stop a ship — netlify.toml is the gate on the deploy path.\n");
  process.exit(1);
}

/* THE DEPLOY PATH MUST ACTUALLY INVOKE THE CHAIN.
 *
 * Everything above proves each guard is LISTED in package.json's `check` chain. It
 * does not prove anything RUNS that chain on the deploy path - and netlify.toml is
 * the only gate that can stop a ship, because Actions builds in parallel and cannot.
 *
 * Deleting `npm run gates` from the build command would leave every check above
 * still listed, still passing this gate, and never executed on a deploy again. That
 * is the exact shape of a vacuous guard this file was written to prevent, one level
 * up from where it was looking. */
const NETLIFY = "netlify.toml";
let toml = "";
try {
  toml = readFileSync(resolve(root, NETLIFY), "utf8");
} catch {
  console.error(`all-checks-wired: FAIL — ${NETLIFY} is missing.`);
  console.error("      It is the only place a failing guard can stop a deploy.\n");
  process.exit(1);
}
/* Either entry point is acceptable: `gates` is the runner that executes the chain and
   names the failure, `check` is the raw chain itself. What is NOT acceptable is neither. */
if (!/npm run (gates|check)\b/.test(toml)) {
  console.error(`all-checks-wired: FAIL — ${NETLIFY} does not run the gates.`);
  console.error("      Its build command invokes neither `npm run gates` nor `npm run check`,");
  console.error("      so every guard in tools/checks is listed, green, and never executed on");
  console.error("      the deploy path. Actions cannot stop a ship; only this can.\n");
  process.exit(1);
}
const entry = /npm run gates\b/.test(toml) ? "npm run gates" : "npm run check";

console.log(`all-checks-wired: PASS — all ${checks.length + 1} guards run in BOTH GitHub Actions and the Netlify build.`);
console.log(`all-checks-wired: ok      — netlify.toml runs them on the deploy path via \`${entry}\`.`);
