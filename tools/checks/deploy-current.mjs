#!/usr/bin/env node
/* deploy-current.mjs — is what is LIVE the thing we pushed?
 *
 * Owner, 11 August 2026: "THERE IS NO AGENT MONITORING WHAT FAILS SILENT, WHEN
 * AGENTS DEPLOY IF IT FAILS. FOR TWO DAYS AGENTS HAVE BEEN DEPLOYING, WE HAVE BEEN
 * WORKING IN CIRCLES, NONE OF US NOTICED."
 *
 * He is right and this is the hole. Between 9 and 11 August, Netlify failed
 * FOURTEEN consecutive git-triggered builds while the live site kept serving a
 * manual upload from 8 August. Four agents kept committing into it. Every one of us
 * — including me — reported work as shipped because the commit had pushed. Nobody
 * checked the other end.
 *
 * There were three separate ways to not notice, and we managed all of them:
 *   - the deploy log lived in Netlify's UI, which no agent reads
 *   - the live site could not say which commit it was running, so "is it deployed"
 *     was answered by grepping a bundle for a string somebody remembered adding
 *   - a green `npm run check` locally was taken as proof the build would pass,
 *     when the failure only ever happened in an environment without a database
 *
 * WHAT THIS ASSERTS. One thing, and it is the only one that matters: THE COMMIT
 * SERVING ON THE LIVE SITE MATCHES origin/main. Everything else — build states,
 * bundle hashes, deploy sources — is a proxy for that question. This asks it
 * directly, of the live site, over HTTP.
 *
 * It reads the stamp injected by vite.config.js. If the stamp is missing the site
 * is running a build made BEFORE stamping existed, which is itself the finding —
 * "unknown" is never treated as "probably fine".
 *
 * WHY THIS IS NOT WIRED INTO `npm run check`. That runs INSIDE the Netlify build,
 * where the deploy has not happened yet — it would compare the live site against a
 * commit that is still building and fail every time, correctly and uselessly. This
 * is for a human, a cron job, or an agent about to claim something is shipped.
 * A guard has to run where the thing it guards actually happens.
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SITE = process.env.TG_SITE_URL || "https://twisted-growers-enterprise-os.netlify.app";
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();

let failed = 0;

try {
  git("fetch", "-q", "origin");
} catch { /* offline: fall back to the local ref and say so below */ }

let expected = "";
let expectedSource = "origin/main";
try { expected = git("rev-parse", "origin/main"); }
catch { expected = git("rev-parse", "HEAD"); expectedSource = "local HEAD (origin unreachable)"; }

const res = await fetch(`${SITE}/?deploycheck=${Date.now()}`, { redirect: "follow" })
  .catch((e) => ({ ok: false, status: 0, _err: String(e) }));

if (!res.ok) {
  console.error(`deploy-current: FAIL — the live site did not answer: ${res.status || res._err}`);
  console.error(`   ${SITE}`);
  console.error(`   A site that cannot be reached is not a site that is deployed.`);
  process.exit(1);
}

const html = await res.text();
const meta = (name) => (html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`)) || [])[1] || null;
const liveCommit = meta("tg-build-commit");
const builtAt = meta("tg-build-at");

if (!liveCommit) {
  console.error("deploy-current: FAIL — the live site carries NO build stamp.");
  console.error("   It is running a build made before stamping existed, so there is no way to know");
  console.error("   which commit is serving. Deploy once from current main and this answers itself.");
  console.error(`   expected (${expectedSource}): ${expected.slice(0, 7)}`);
  process.exit(1);
}

const short = (s) => (s || "").slice(0, 7);

if (liveCommit === "unknown") {
  console.error("deploy-current: FAIL — the live build stamped itself 'unknown'.");
  console.error("   The build could not read its own commit — a shallow CI checkout with no COMMIT_REF.");
  failed++;
} else if (liveCommit !== expected) {
  /* Say HOW far behind, because "behind by one merge" and "behind by two days" are
     different emergencies and the number is cheap to compute. */
  let behind = "";
  try {
    const n = git("rev-list", "--count", `${liveCommit}..${expected}`);
    behind = ` — ${n} commit(s) behind`;
  } catch { behind = " — and the live commit is not in this repository at all"; }

  console.error(`deploy-current: FAIL — the live site is NOT running ${expectedSource}${behind}.`);
  console.error(`   live      : ${short(liveCommit)}   built ${builtAt ?? "unknown"}`);
  console.error(`   expected  : ${short(expected)}   (${expectedSource})`);
  console.error(`   Work that is committed and not deployed is work nobody can see. Between 9 and 11`);
  console.error(`   Aug 2026 this state held for two days across fourteen failed builds and four`);
  console.error(`   agents, and nothing reported it.`);
  failed++;
} else {
  console.log(`deploy-current: PASS — live site is running ${short(liveCommit)}, matching ${expectedSource}.`);
  console.log(`               built ${builtAt ?? "unknown"}`);
}

if (failed) {
  console.error(`\ndeploy-current: ${failed} problem(s).`);
  console.error(`Check the deploy log before assuming the push was enough:`);
  console.error(`  npx netlify api listSiteDeploys --data '{"site_id":"<id>"}'`);
  process.exit(1);
}
