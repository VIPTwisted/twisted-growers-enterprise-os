#!/usr/bin/env node
/* bridge-queue.mjs (still named bridge-direct.mjs) — and the guard was WRONG.
 *
 * WHAT THIS FILE USED TO ASSERT, AND WHY IT WAS WRONG
 *
 * Written 7 Aug 2026, one day before this rewrite, it required the front end to
 * fetch `http://127.0.0.1:8765` directly and BANNED it from touching
 * ai_bridge_jobs, v_bridge_status or ai_bridge_heartbeat. Its reasoning was
 * sound and its conclusion is now false:
 *
 *   "127.0.0.1 is a potentially-trustworthy origin and is exempt from
 *    mixed-content blocking. Verified from the deployed site."
 *
 * Still true. Also no longer sufficient. Chrome 151 treats a public https page
 * reaching a LOCAL address as a user PERMISSION — `local-network-access`,
 * alongside camera and microphone. On the owner's machine it reads DENIED, and
 * Chrome does not re-prompt once denied.
 *
 * Proved in his own Chrome on 7 Aug 2026: a fetch with `mode:'no-cors'` — which
 * bypasses CORS entirely — still threw `TypeError: Failed to fetch`, and the
 * bridge's log showed NOTHING arrived. The request never left the browser.
 *
 * THE LESSON WORTH KEEPING. The original was verified with curl, which does not
 * send the header that triggers the permission check, so the terminal reported
 * healthy while the browser reported offline — same port, same request. A guard
 * can only be as right as the thing that verified it, and this one inherited a
 * verification that could not see the failure.
 *
 * So it is rewritten, not deleted. The invariant it always MEANT to protect is
 * the one that still matters, and it survives the reversal untouched:
 *
 *   THE BRIDGE MUST NEVER AGAIN DEPEND ON ANONYMOUS DATABASE ACCESS.
 *
 * That is what actually broke it in August — the bridge authenticated with the
 * publishable key that ships in every visitor's browser, so closing the
 * anonymous hole killed it, and the tempting fix was to re-grant anon and
 * reopen an internet-reachable write path into a licensed cannabis business.
 *
 * Going back through the database is fine. Going back through ANON is not.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

const app = read("app/web/src/App.jsx");
const budz = read("app/web/src/budz.jsx");
const server = read("bridge/server.mjs");

/* Test the CODE, not the comments. The first version of this check failed on its
   own first run because the comments explaining the design contained the words
   they were banning. A guard that fires on its own documentation is one people
   learn to ignore — the same failure as the eslint run that carried two
   permanent known errors while a real hook-order crash shipped past it. */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const appCode = strip(app);
const budzCode = strip(budz);
const serverCode = strip(server);
const frontEnd = appCode + "\n" + budzCode;

const failures = [];
const check = (ok, label, why) => {
  if (ok) console.log(`bridge-queue: ok — ${label}`);
  else failures.push(`${label}\n      ${why}`);
};

/* ---- 1. The invariant that outlived the reversal ------------------------- */

for (const [file, code] of [["the front end", frontEnd], ["bridge/server.mjs", serverCode]]) {
  check(
    !/eyJ[A-Za-z0-9._-]{30,}/.test(code),
    `no JWT literal is written into ${file}`,
    `bridge/server.mjs used to carry the project's ANON key in full, in a file that is in the public repository. It worked only because anonymous access was wide open. Credentials belong in gitignored files or in Supabase function secrets, never in tracked source.`
  );
}

check(
  !/sb_secret_|SERVICE_ROLE_KEY/.test(frontEnd),
  "no service-role credential reaches the browser",
  `A service key in a bundle is a total compromise — it bypasses every RLS policy in the database. The browser gets the publishable key and a user session, and nothing else.`
);

check(
  !/anon/i.test(serverCode),
  "the bridge does not authenticate as anon",
  `This is the failure that started all of it: the bridge used the anonymous key, closing the anon hole killed it, and the obvious "fix" is to re-grant anon and reopen an internet-reachable write path. The bridge authenticates with the token it shares with the platform, through the bridge-queue function.`
);

/* ---- 2. The browser must not depend on reaching the local machine -------- */

check(
  !/fetch\(\s*[`"']https?:\/\/(127\.0\.0\.1|localhost)/.test(frontEnd) &&
  !/fetch\(`\$\{BRIDGE_URL\}/.test(frontEnd),
  "the front end never fetches the local machine",
  `Chrome 151 blocks it behind the local-network-access permission, which reads DENIED on the owner's machine and cannot be re-prompted. A page that depends on it reports "AI offline" while the bridge answers in nine seconds. Put the question in ai_bridge_jobs and let the desktop collect it.`
);

check(
  /from\(["']ai_bridge_jobs["']\)/.test(budzCode),
  "questions go onto the queue the desktop collects from",
  `The signed-in owner is already permitted to write ai_bridge_jobs under the abj_own policy. Nothing local is called, so no browser permission applies.`
);

check(
  /from\(["']v_bridge_status["']\)/.test(appCode),
  "the status chip reads the heartbeat instead of calling the computer",
  `A chip that pings 127.0.0.1 reports on what THIS browser is permitted to do, not on whether the bridge is working. It said "AI offline" for hours while the bridge was answering.`
);

/* ---- 3. The false claim that caused the detour must stay dead ------------ */

check(
  !/cannot call http:\/\/127\.0\.0\.1/i.test(frontEnd + serverCode),
  "the false mixed-content claim has not come back",
  `A comment once asserted a browser cannot call 127.0.0.1 from https because of mixed content. That was never the reason — 127.0.0.1 is potentially-trustworthy and exempt. The real reason is a user permission, and writing down the wrong reason is what cost the first afternoon.`
);

if (failures.length) {
  console.error(`\nbridge-queue: FAIL — ${failures.length} invariant(s) broken:\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  console.error("The bridge must never again depend on anonymous database access, and the");
  console.error("browser must never again depend on reaching the local machine.\n");
  process.exit(1);
}
console.log("bridge-queue: PASS — no anon, no credential in tracked source, and the browser never calls the desktop.");
