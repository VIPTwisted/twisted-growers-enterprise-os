/* THE DEPLOY PIPELINE'S OWN GATE RUNNER.
 *
 * WHY THIS EXISTS. Fourteen production builds failed across 9-11 Aug 2026 and nobody
 * could say which gate stopped them. `npm run check` chains 37 gates with `&&`, so the
 * first non-zero exit kills the chain and Netlify prints its generic line:
 *
 *     Build script returned non-zero exit code: 2
 *
 * The failing gate's own message is somewhere in several thousand lines above that, and
 * the gates that never got to run are indistinguishable from the ones that passed. The
 * only way anybody diagnosed a red build was to clone the repo and run the chain locally
 * - which is why two days of red builds went unread.
 *
 * A failing gate is not the problem. An UNREADABLE failing gate is the problem.
 *
 * SECOND, AND WORSE. Three gates cannot reach a database from Netlify and answer
 * PASS (DEGRADED):
 *
 *     schema-baseline · docs-vs-database · page-architecture
 *
 * They are honest about it in their own output, and that honesty then scrolls past
 * unread inside a green build. A build that reports success for a check that never ran
 * is the vacuous gate this repo already got bitten by - "the schema baseline gate read a
 * clock for a full day while production drifted 16 tables". The gates were right; the
 * PIPELINE was silently accepting an unverified answer.
 *
 * WHAT THIS DOES. Runs the same chain, in the same order, with the same fail-fast
 * semantics - a doomed bundle is still never produced. It changes only what is REPORTED:
 * the failing gate is named in a banner at the very bottom where Netlify's own error
 * sits, every skipped gate is listed as skipped rather than silently absent, and every
 * degraded gate is counted in the summary of a GREEN build too.
 *
 * THE CHAIN IS NOT DUPLICATED HERE. It is parsed out of package.json's `check` script,
 * so adding a gate there needs no change in this file and the two can never disagree.
 * A second copy of the list is a second thing to forget.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const chain = String(pkg.scripts?.check ?? "")
  .split("&&")
  .map((s) => s.trim())
  .filter((s) => /^npm run [\w:-]+$/.test(s))
  .map((s) => s.replace(/^npm run /, ""));

if (chain.length === 0) {
  console.error("run-gates: could not parse the gate chain out of package.json `check`.");
  console.error("  Refusing to pass. A runner that silently runs NOTHING is worse than a red build.");
  process.exit(1);
}

const bar = (c) => c.repeat(78);
console.log(`run-gates: ${chain.length} gates, in the order package.json declares them.\n`);

const results = [];
let failed = null;

for (const [i, gate] of chain.entries()) {
  const label = `[${String(i + 1).padStart(2)}/${chain.length}] ${gate}`;
  const r = spawnSync(NPM, ["run", gate], { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;

  /* npm's own wrapper noise is not the gate speaking. */
  const speech = out
    .split(/\r?\n/)
    .filter((l) => !/^\s*$/.test(l) && !/^>/.test(l) && !/^npm (notice|warn|ERR!)/.test(l));

  const degraded = /\bDEGRADED\b/.test(out);
  const ok = r.status === 0;

  results.push({ gate, ok, degraded, speech });
  console.log(`${label}  ${ok ? (degraded ? "DEGRADED" : "pass") : "FAIL"}`);
  if (!ok) { failed = { gate, speech, status: r.status }; break; }
}

const ran = results.length;
const skipped = chain.slice(ran);
const degradedGates = results.filter((r) => r.degraded).map((r) => r.gate);

console.log(`\n${bar("=")}`);
if (failed) {
  console.log(`GATE FAILED:  ${failed.gate}`);
  console.log(bar("="));
  console.log("\nWhat it said:\n");
  /* The tail carries the verdict and the instruction; the head is usually a per-file log. */
  for (const line of failed.speech.slice(-40)) console.log(`  ${line}`);
  console.log(`\n${bar("-")}`);
  console.log(`Gate ${ran} of ${chain.length}. ${skipped.length} gate(s) never ran and are UNKNOWN,`);
  console.log(`not passing: ${skipped.join(", ") || "none"}`);
  console.log(`\nReproduce exactly this, locally:\n\n    npm run ${failed.gate}\n`);
  console.log("Netlify's own next line will say 'non-zero exit code'. THIS is the reason for it.");
  console.log(bar("="));
  process.exit(failed.status || 1);
}

console.log(`ALL ${chain.length} GATES PASSED`);
console.log(bar("="));

if (degradedGates.length) {
  /* A green build that quietly contains unverified gates is exactly how a vacuous gate
     survives. Print it on SUCCESS - nobody reads the middle of a passing build log. */
  console.log(`\n!! ${degradedGates.length} gate(s) ran DEGRADED and verified NOTHING here:\n`);
  for (const g of degradedGates) console.log(`     ${g}`);
  console.log(`
   These need a database and this build environment has none, so they answered
   PASS without checking anything. That is the gates being honest, not a bug -
   but it means drift they exist to catch CANNOT be caught in this build. They
   are only meaningful where a connection exists.

   Do not read this build as proof that the schema, the documents or the page
   registry match the database.\n`);
}
