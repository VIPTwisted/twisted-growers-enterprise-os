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

console.log(`all-checks-wired: PASS — all ${checks.length + 1} guards run in BOTH GitHub Actions and the Netlify build.`);
