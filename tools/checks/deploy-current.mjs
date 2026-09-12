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
import { verifyDeployment } from "../lib/deployment-proof.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SITE = process.env.TG_SITE_URL || "https://twisted-growers-enterprise-os.netlify.app";
const git = (...args) => execFileSync("git", args, {
  cwd: ROOT, encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"],
}).trim();

const result = await verifyDeployment({
  site: SITE,
  readExpected: () => {
    // Explicit destination avoids stale origin/main in unusual checkout refspecs.
    git("fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main");
    return git("rev-parse", "refs/remotes/origin/main");
  },
});
console.log(`deploy-current: ${result.status} — checked ${result.checkedAt}`);
console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
