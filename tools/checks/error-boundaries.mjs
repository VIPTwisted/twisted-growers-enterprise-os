#!/usr/bin/env node
/* error-boundaries.mjs — the guard behind work-queue item 2.
 *
 * Item 1 proved this application can throw: a hook called after an early return
 * crashes React the moment data arrives. With no boundary that white-screens the
 * whole OS and leaves no record, so the only person who knows is the one person
 * who cannot fix it.
 *
 * Boundaries were added. This is what stops them being removed, or added without
 * the reporting that makes a crash visible. It asserts four invariants:
 *
 *   1. main.jsx wraps <App /> in <RootBoundary>            — the shell can fail too
 *   2. RootBoundary and Boundary both implement componentDidCatch — they report
 *   3. Both call reportCrash                                — to the findings layer
 *   4. reportCrash is deduplicated and capped               — a crash loop must not
 *                                                             hammer the database
 *
 * Invariant 4 is the one most likely to be lost in a refactor, and the one that
 * turns a bad afternoon into an outage.
 *
 * Exits non-zero on failure so it can gate a push.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

const failures = [];
const check = (ok, label, why) => {
  if (ok) console.log(`error-boundaries: ok — ${label}`);
  else failures.push(`${label}\n      ${why}`);
};

let main = "", app = "";
try {
  main = read("app/web/src/main.jsx");
  app = read("app/web/src/App.jsx");
} catch (e) {
  console.error(`error-boundaries: FAIL — cannot read source: ${e.message}`);
  process.exit(1);
}

/* 1 — the root is wrapped. Without this, a throw in the shell itself (nav, top
       bar, a hook-order change in App) unmounts everything. */
check(
  /<RootBoundary>[\s\S]*<App\s*\/>[\s\S]*<\/RootBoundary>/.test(main),
  "main.jsx wraps <App /> in <RootBoundary>",
  "A section boundary only helps while App is standing. If the shell throws, React unmounts the page and the user gets a blank screen with no way back."
);

/* 2 — both boundaries actually catch. getDerivedStateFromError renders the
       fallback; componentDidCatch is the only place the error can be reported. */
for (const cls of ["RootBoundary", "Boundary"]) {
  const body = app.split(new RegExp(`class ${cls}\\b`))[1]?.slice(0, 1600) ?? "";
  check(
    body.includes("componentDidCatch"),
    `${cls} implements componentDidCatch`,
    "Without it the boundary shows a message and the error dies in the browser. Nobody else ever learns the page broke."
  );
  check(
    body.includes("reportCrash"),
    `${cls} calls reportCrash`,
    "A caught crash that is not reported is indistinguishable from no crash at all."
  );
}

/* 3 — the reporter must be safe under a crash loop. A boundary that hammers the
       database while the page is failing turns one broken page into an incident. */
const reporter = app.split("function reportCrash")[1]?.slice(0, 1400) ?? "";
check(
  reporter.includes("REPORTED_CRASHES") && /\.has\(/.test(reporter),
  "reportCrash deduplicates by view and message",
  "The same crash hit by twelve people must be one finding seen twelve times, not twelve findings."
);
check(
  /size\s*>=\s*\d+/.test(reporter),
  "reportCrash is capped for a render loop",
  "A component that throws on every render would otherwise write without limit."
);
check(
  /try\s*{/.test(reporter) && /catch\s*{/.test(reporter),
  "reportCrash cannot itself throw",
  "A reporter that throws inside componentDidCatch escalates a contained failure into an unmounted tree."
);

if (failures.length) {
  console.error(`\nerror-boundaries: FAIL — ${failures.length} invariant(s) broken:\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  console.error("These are not style rules. Each one is a way a crash becomes invisible.\n");
  process.exit(1);
}
console.log("error-boundaries: PASS — crashes are contained, reported, and cannot flood.");
