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
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

const failures = [];
const check = (ok, label, why) => {
  if (ok) console.log(`error-boundaries: ok — ${label}`);
  else failures.push(`${label}\n      ${why}`);
};

let main = "", app = "", receiptSql = "";
try {
  main = read("app/web/src/main.jsx");
  app = read("app/web/src/App.jsx");
  const migrationDir = resolve(root, "supabase/migrations");
  const receiptFile = readdirSync(migrationDir).sort().reverse()
    .find((name) => readFileSync(join(migrationDir, name), "utf8").includes("CLIENT_ERROR_RECEIPT_CONTRACT"));
  if (receiptFile) receiptSql = readFileSync(join(migrationDir, receiptFile), "utf8");
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
  const body = app.split(new RegExp(`class ${cls}\\b`))[1]?.slice(0, 2600) ?? "";
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
  check(
    body.includes("<CrashReceipt"),
    `${cls} discloses the durable receipt or the reporting failure`,
    "A boundary may not claim a crash was recorded until it can show the returned finding ID, and it must say when recording failed."
  );
}

/* 3 — the reporter must be safe under a crash loop. A boundary that hammers the
       database while the page is failing turns one broken page into an incident. */
const reporter = app.split("function reportCrash")[1]?.split("function CrashReceipt")[0] ?? "";
check(
  reporter.includes("REPORTED_CRASHES") && /\.has\(/.test(reporter) && /\.get\(/.test(reporter),
  "reportCrash deduplicates by view and message",
  "The same crash hit by twelve people must be one finding seen twelve times, not twelve findings."
);
check(
  /size\s*>=\s*\d+/.test(reporter),
  "reportCrash is capped for a render loop",
  "A component that throws on every render would otherwise write without limit."
);
check(
  /try\s*{/.test(reporter) && /catch\s*(?:\([^)]*\))?\s*{/.test(reporter),
  "reportCrash cannot itself throw",
  "A reporter that throws inside componentDidCatch escalates a contained failure into an unmounted tree."
);
check(
  reporter.includes('supabase.rpc("tg_log_client_error_receipt"') && reporter.includes("data?.finding_id"),
  "reportCrash requires the receipt RPC and a finding ID",
  "RPC success without a durable watchdog_findings.id is not proof that the incident was recorded."
);
check(
  /return\s+request/.test(reporter) && /ok:\s*false/.test(reporter),
  "reportCrash returns an explicit success or failure result",
  "Fire-and-forget reporting leaves the boundary unable to distinguish a durable incident from a failed write."
);
check(
  !/It has been recorded automatically|Recorded as a finding\. Nobody has to remember/i.test(app),
  "the UI contains no unconditional recorded claim",
  "The old copy promised a durable incident while deliberately discarding both RPC success and failure."
);
check(
  receiptSql.includes("tg_log_client_error_receipt") && /returns\s+jsonb/i.test(receiptSql),
  "the receipt RPC is committed as a migration",
  "A front end calling an unversioned live-only function cannot be rebuilt, reviewed, or recovered."
);
check(
  /if\s+v_finding\s+is\s+null[\s\S]*where\s+fingerprint\s*=\s*v_fingerprint/i.test(receiptSql),
  "the receipt RPC handles the duplicate-fingerprint trigger",
  "The existing trigger swallows duplicate inserts. INSERT RETURNING alone yields no finding ID on the repeated-crash path."
);
check(
  /'finding_id'\s*,\s*v_finding/i.test(receiptSql) && /'run_id'\s*,\s*v_run/i.test(receiptSql),
  "the database receipt names both durable IDs",
  "The UI needs the finding ID; operations needs the browser run ID linking the report to its ingestion event."
);
check(
  /revoke all on function public\.tg_log_client_error_receipt\(text,text,text,text\) from public, anon/i.test(receiptSql)
    && /grant execute on function public\.tg_log_client_error_receipt\(text,text,text,text\) to authenticated/i.test(receiptSql),
  "the receipt RPC is authenticated-only",
  "An internet-reachable anonymous function that writes critical forensic findings is an integrity and denial-of-service risk."
);

if (failures.length) {
  console.error(`\nerror-boundaries: FAIL — ${failures.length} invariant(s) broken:\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  console.error("These are not style rules. Each one is a way a crash becomes invisible.\n");
  process.exit(1);
}
console.log("error-boundaries: PASS — crashes are contained, reported, and cannot flood.");
