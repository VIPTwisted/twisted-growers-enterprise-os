#!/usr/bin/env node
/* CHECK: every deployed function declares its verify_jwt, and the value is not guessed.
 *
 * WHY THIS EXISTS
 *
 * Edge functions on this project are deployed by hand, one at a time, by pasting the whole
 * file through an agent's context into an MCP call. On 10 Aug 2026 that was the only route
 * available: no Supabase CLI installed, no config.toml, no deploy step in CI. Deploying the
 * revenue sync that way means retyping 29,168 bytes and hoping.
 *
 * That is the same failure that put THREE functions into production with no source in this
 * repository at all - bridge-queue, document and parse-documents - wearing different clothes.
 * A manual deploy path is why "what runs in production is in the repository" has to be
 * remembered instead of being true by construction.
 *
 * THE PIECE THAT MAKES AUTOMATION SAFE, AND THE REASON THIS FILE EXISTS
 *
 * verify_jwt is per-function and it is NOT recoverable from the source. Fourteen of the 25
 * functions run verify_jwt=false and authenticate in the body instead - apex-sync checks
 * app_users for owner/executive on every request; integration-settings and bridge-queue do
 * their own thing. Deploy one of those with the default (true) and you lock out its real
 * callers. Deploy a true one as false and you have published an authenticated endpoint to
 * the internet.
 *
 * So any deploy - by hand or by CI - must carry the value from DEPLOYED.json, and
 * DEPLOYED.json must cover every function. This asserts exactly that, and nothing more.
 *
 * It deliberately does NOT call Supabase: a gate needing live credentials does not run in
 * CI, and a gate that does not run is not a gate. The freshness of the snapshot is already
 * enforced by edge-functions-versioned.mjs.
 *
 *   node tools/checks/deployed-manifest-complete.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = join(root, "app", "supabase", "functions", "DEPLOYED.json");

if (!existsSync(MANIFEST)) {
  console.error("deployed-manifest: FAIL — app/supabase/functions/DEPLOYED.json is missing.");
  console.error("  Without it nothing knows which functions are deployed, and any automated");
  console.error("  deploy would have to guess verify_jwt for every one of them.\n");
  process.exit(1);
}

let m;
try { m = JSON.parse(readFileSync(MANIFEST, "utf8")); }
catch (e) {
  console.error(`deployed-manifest: FAIL — DEPLOYED.json is not valid JSON: ${String(e).slice(0, 160)}`);
  process.exit(1);
}

const functions = Array.isArray(m.functions) ? m.functions : [];
const verify = (m.verify_jwt && typeof m.verify_jwt === "object") ? m.verify_jwt : null;

if (functions.length === 0) {
  console.error("deployed-manifest: FAIL — the functions list is empty.");
  console.error("  An empty list passes every downstream check while production runs on.\n");
  process.exit(1);
}

if (!verify) {
  console.error("deployed-manifest: FAIL — DEPLOYED.json has no verify_jwt map.");
  console.error("  verify_jwt cannot be recovered from the source, and deploying without it");
  console.error("  either locks out a function's real callers or exposes an authenticated");
  console.error("  endpoint. Add a verify_jwt object keyed by slug, read from the live");
  console.error("  project via list_edge_functions.\n");
  process.exit(1);
}

const missing = functions.filter((f) => !(f in verify));
const extra = Object.keys(verify).filter((k) => !functions.includes(k));
const notBoolean = Object.entries(verify).filter(([, v]) => typeof v !== "boolean").map(([k]) => k);

for (const f of functions) {
  console.log(`deployed-manifest: ${f in verify ? "ok      " : "MISSING "} — ${f}`
    + (f in verify ? `  verify_jwt=${verify[f]}` : ""));
}

const problems = [];
if (missing.length) problems.push(`${missing.length} deployed function(s) have no verify_jwt declared: ${missing.join(", ")}`);
if (extra.length) problems.push(`${extra.length} verify_jwt entr(y/ies) name a function that is not deployed: ${extra.join(", ")}`);
if (notBoolean.length) problems.push(`verify_jwt must be true or false, not a string: ${notBoolean.join(", ")}`);

if (problems.length) {
  console.error("\ndeployed-manifest: FAIL\n");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("\nverify_jwt is not cosmetic. fourteen of these functions authenticate in the body");
  console.error("and run with verify_jwt=false; deploying one of them with the default locks out");
  console.error("every real caller, and the reverse publishes an authenticated endpoint.\n");
  process.exit(1);
}

const openCount = Object.values(verify).filter((v) => v === false).length;
console.log(`\ndeployed-manifest: PASS — all ${functions.length} deployed function(s) declare verify_jwt `
  + `(${openCount} run with verify_jwt=false and authenticate in the body).`);
