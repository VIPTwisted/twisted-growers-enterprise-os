#!/usr/bin/env node
/* routing.mjs — the guard behind the navigation invariants.
 *
 * Written after checking a claim rather than acting on it. The senior audit
 * states the application has "no router — no deep links, no working Back
 * button, no bookmarks." That is not correct: App.jsx reads the initial view
 * from window.location.hash, pushes state on every change, and listens for
 * popstate. Deep links, bookmarks and Back all work and have all along.
 *
 * Two things were genuinely missing, and both are now asserted here:
 *
 *   1. hashchange was unhandled. popstate fires for Back and Forward but NOT
 *      when the hash is edited in the address bar or a same-page anchor is
 *      followed — so the URL changed while the screen did not.
 *
 *   2. An address resolving to nothing fell through to the Control Tower in
 *      silence. A stale bookmark or a renamed view_key looked exactly like
 *      landing on the home page deliberately. Same failure shape as a query
 *      returning [] on error: broken and empty are indistinguishable.
 *
 * Exits non-zero on failure so it can gate a push.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = readFileSync(resolve(root, "app/web/src/App.jsx"), "utf8");

const failures = [];
const check = (ok, label, why) => {
  if (ok) console.log(`routing: ok — ${label}`);
  else failures.push(`${label}\n      ${why}`);
};

check(
  /useState\(\(\)\s*=>\s*window\.location\.hash\.slice\(1\)/.test(app),
  "the initial view is read from the URL",
  "Without this a deep link or bookmark always lands on the default page."
);

check(
  /history\.pushState\([^)]*`#\$\{view\}`\)/.test(app),
  "navigating updates the address bar",
  "Without this the URL never changes, so nothing can be linked or bookmarked."
);

check(
  /addEventListener\("popstate"/.test(app),
  "Back and Forward are handled (popstate)",
  "Without this the browser Back button changes the URL and leaves the screen where it was."
);

check(
  /addEventListener\("hashchange"/.test(app),
  "editing the address bar is handled (hashchange)",
  "popstate does NOT fire for a manually edited hash or a same-page anchor. Without hashchange the URL changes and the screen silently does not follow."
);

check(
  /unknownView/.test(app) && /No page called/.test(app),
  "an address that matches nothing says so",
  "Falling back to the Control Tower in silence makes a stale bookmark, a renamed view_key and a typo look identical to arriving on the home page on purpose."
);

if (failures.length) {
  console.error(`\nrouting: FAIL — ${failures.length} invariant(s) broken:\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  console.error("Each of these makes a navigation failure invisible to the person it happens to.\n");
  process.exit(1);
}
console.log("routing: PASS — deep links, Back, address-bar edits and unknown pages all behave.");
