#!/usr/bin/env node
/* bridge-direct.mjs — the guard behind the desktop bridge fix.
 *
 * THE FINDING, and why an unguarded fix would expire.
 *
 * A comment in BridgeChip asserted: "the browser cannot call http://127.0.0.1
 * from an https page, so the bridge reports in to the database and we read that
 * instead." That is FALSE. 127.0.0.1 is a potentially-trustworthy origin and is
 * exempt from mixed-content blocking.
 *
 * Proven from the DEPLOYED site, 7 Aug 2026:
 *     fetch('http://127.0.0.1:8765/health')
 *       -> {ok:true, service:'tg-claude-bridge', port:8765}
 *     POST /ask with x-tg-token
 *       -> 200 {"ok":true,"reply":"OK","seconds":7}
 *
 * WHAT THE FALSE BELIEF COST: because the bridge was routed through
 * ai_bridge_jobs in the database, it needed a database credential — and it used
 * the PUBLISHABLE key that ships in every visitor's browser. Closing the
 * anonymous-access hole killed the bridge. The tempting "fix" was to re-grant
 * anon, which would have reopened an internet-reachable write path into the
 * database of a licensed cannabis business.
 *
 * So this guard protects TWO things at once:
 *   - the bridge keeps working
 *   - and it never again becomes a reason to re-grant anon
 *
 * That second one is why this check exists rather than a comment. A comment is
 * what created the problem.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

const app = read("app/web/src/App.jsx");
const budz = read("app/web/src/budz.jsx");

/* Test the CODE, not the comments. The first version of this check failed on
   its own first run, because the comments explaining why ai_bridge_jobs was
   removed contain the words "ai_bridge_jobs". A guard that fires on its own
   documentation is a guard people learn to ignore — the same failure as the
   eslint rule that carried two permanent known errors while a real defect
   shipped past it. Comments are stripped before any assertion. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")     // block comments
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // line comments, sparing the // in a URL

const appCode = stripComments(app);
const budzCode = stripComments(budz);
const both = appCode + "\n" + budzCode;

const failures = [];
const check = (ok, label, why) => {
  if (ok) console.log(`bridge-direct: ok — ${label}`);
  else failures.push(`${label}\n      ${why}`);
};

check(
  /const BRIDGE_URL\s*=\s*"http:\/\/127\.0\.0\.1:\d+"/.test(appCode) &&
  /const BRIDGE_URL\s*=\s*"http:\/\/127\.0\.0\.1:\d+"/.test(budzCode),
  "both files address the bridge directly on 127.0.0.1",
  "Without a direct address the only way to reach the bridge is through the database, which is what required a credential and broke it."
);

check(
  /fetch\(`\$\{BRIDGE_URL\}\/health`/.test(appCode),
  "the status chip asks the bridge itself",
  "Reading a heartbeat row from the database means the chip reports on a table, not on whether the bridge is actually answering."
);

check(
  /fetch\(`\$\{BRIDGE_URL\}\/ask`/.test(budzCode),
  "questions go straight to the bridge",
  "Writing a job row and polling it needs database access, took up to 210 seconds, and failed silently when the row never came back."
);

/* The important one. If either of these reappears, the bridge has been put back
   on the database and someone will shortly be asked to re-grant anon. */
for (const banned of ["ai_bridge_jobs", "v_bridge_status", "ai_bridge_heartbeat"]) {
  check(
    !both.includes(banned),
    `the front end does not touch ${banned}`,
    `Routing the bridge through the database is what made it need a credential. It authenticated with the PUBLISHABLE key, so closing the anon hole killed it — and the obvious "fix" is to re-grant anon, which reopens an internet-reachable write path. Ask the bridge directly instead.`
  );
}

check(
  !/cannot call http:\/\/127\.0\.0\.1/i.test(both),
  "the false mixed-content claim is gone from the source",
  "That comment is what caused the whole detour. Disproved from the deployed site on 7 Aug 2026."
);

if (failures.length) {
  console.error(`\nbridge-direct: FAIL — ${failures.length} invariant(s) broken:\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  console.error("The bridge must never again depend on database access.\n");
  process.exit(1);
}
console.log("bridge-direct: PASS — the bridge is asked directly and needs no database credential.");
