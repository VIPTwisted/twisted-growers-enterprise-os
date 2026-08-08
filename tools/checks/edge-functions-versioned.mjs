#!/usr/bin/env node
/* edge-functions-versioned.mjs — nothing runs in production without source here.
 *
 * WHY THIS EXISTS
 *
 * On 8 August 2026 THREE edge functions were running in production with no
 * source in this repository at all:
 *
 *   bridge-queue      every question the assistant answers passes through it
 *   document          every print and download button in the platform
 *   parse-documents   reads every COA and manifest
 *
 * The only copy of each was the deployment itself. Nothing to review, nothing to
 * diff, no history of who changed what, and no way to rebuild them if the
 * project were lost. Two of the three I deployed myself and never committed.
 *
 * That is not a documentation problem. It is production code that cannot be read
 * before it is changed, and it stayed invisible because nothing looked.
 *
 * WHAT THIS ASSERTS
 *
 * Every slug in DEPLOYED.json has a directory with an index.ts. The list is a
 * committed snapshot of what the project actually has deployed, refreshed by an
 * operator - the same shape as schema-baseline-fresh, which this repo already
 * uses for the same class of problem.
 *
 * A LIST HAS TO BE MAINTAINED, WHICH IS ITS WEAKNESS, so it is also checked for
 * AGE. A stale list would pass forever while new functions appeared behind it -
 * that is precisely the failure this file exists to catch, wearing a different
 * hat. Over the limit and the build fails asking for a refresh.
 *
 * It deliberately does NOT call Supabase. A gate that needs live credentials
 * does not run in CI, and a gate that does not run is not a gate.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FUNCTIONS = join(root, "app", "supabase", "functions");
const MANIFEST = join(FUNCTIONS, "DEPLOYED.json");
/* Long enough not to nag, short enough that a function added this month is
   caught this month. */
const MAX_AGE_DAYS = 30;

if (!existsSync(MANIFEST)) {
  console.error("edge-functions-versioned: FAIL — app/supabase/functions/DEPLOYED.json is missing.");
  console.error("   It is the list of what is actually deployed. Without it this check proves nothing.");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch (e) {
  console.error(`edge-functions-versioned: FAIL — DEPLOYED.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

const slugs = manifest.functions ?? [];
if (!Array.isArray(slugs) || !slugs.length) {
  console.error("edge-functions-versioned: FAIL — DEPLOYED.json lists no functions.");
  process.exit(1);
}

let failed = 0;

/* 1. Everything deployed has source. */
for (const slug of slugs) {
  const entry = join(FUNCTIONS, slug, "index.ts");
  if (existsSync(entry)) continue;
  console.error(`edge-functions-versioned: FAIL — "${slug}" is deployed and has NO SOURCE in this repository.`);
  console.error(`   Expected: app/supabase/functions/${slug}/index.ts`);
  console.error(`   Recover it with the live copy before changing anything, or it is written from memory.`);
  failed++;
}

/* 2. The list itself has not gone stale. Checked against the COMMIT that last
      touched it, not the file's mtime - a fresh clone rewrites mtime and would
      report a two-year-old list as new. */
let ageDays = null;
try {
  const iso = execFileSync("git", ["log", "-1", "--format=%cI", "--", MANIFEST],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (iso) ageDays = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
} catch { /* not a git tree: age cannot be judged, and that is not a failure */ }

if (ageDays !== null && ageDays > MAX_AGE_DAYS) {
  console.error(`edge-functions-versioned: FAIL — DEPLOYED.json was last updated ${ageDays} days ago.`);
  console.error(`   A stale list passes forever while new functions appear behind it, which is`);
  console.error(`   exactly the failure this check exists to catch. Refresh it and commit.`);
  failed++;
}

/* 3. Source with no deployment is worth SAYING, not failing on: a function may
      be written and not yet shipped, which is normal. Silence would let the list
      quietly diverge in the other direction. */
import { readdirSync, statSync } from "node:fs";
const onDisk = readdirSync(FUNCTIONS)
  .filter((d) => { try { return statSync(join(FUNCTIONS, d)).isDirectory(); } catch { return false; } });
const notDeployed = onDisk.filter((d) => !slugs.includes(d));
for (const d of notDeployed) {
  console.log(`edge-functions-versioned: note    — "${d}" has source but is not in DEPLOYED.json (written, not shipped?)`);
}

if (failed) {
  console.error(`\nedge-functions-versioned: ${failed} problem(s).`);
  console.error(`Production code that cannot be read before it is changed is the whole issue here.`);
  process.exit(1);
}

console.log(`edge-functions-versioned: PASS — all ${slugs.length} deployed functions have source` +
            (ageDays === null ? "." : `, list ${ageDays} day(s) old.`));
