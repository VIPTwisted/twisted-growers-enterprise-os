/* The first automated test in this repository.
 *
 * Owner, 11 August 2026, on whether the repo meets a Google or Microsoft bar:
 * it does not, and the largest single reason is that there were NO tests. Forty CI
 * gates checked PROPERTIES - no duplicate rows, no hard-coded licences, nothing
 * untracked - and not one of them checked BEHAVIOUR. Does this function return the
 * right answer for this input? Nothing asked.
 *
 * That is why bugs kept being found by running things in production and watching
 * what broke. The gates are an immune system on a body with no skeleton.
 *
 * Uses node --test, built into Node 24. NO new dependency, deliberately: the
 * Netlify build has been fragile all week and adding a package to fix a quality
 * problem would have been a good way to cause an outage.
 *
 * Run:  node --test tools/tests/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { likeMatch, likeToRegExp } from "../lib/sqlglob.mjs";

test("% matches any sequence, including empty", () => {
  assert.ok(likeMatch("brain/INDEX.md", "brain/%"));
  assert.ok(likeMatch("brain/", "brain/%"), "% must match the empty string");
  assert.ok(likeMatch("tools/checks/deep/nested.mjs", "tools/%"));
  assert.ok(!likeMatch("brainstem/x.md", "brain/%"), "must not match a longer directory name");
});

test("_ matches exactly one character, never zero and never many", () => {
  assert.ok(likeMatch("a.jsx", "_.jsx"));
  assert.ok(!likeMatch(".jsx", "_.jsx"), "_ must not match empty");
  assert.ok(!likeMatch("ab.jsx", "_.jsx"), "_ must not match two characters");
});

test("a literal dot is a DOT, not 'any character' — the too-wide failure", () => {
  /* The inline version escaped most metacharacters. If '.' ever slips, 'App.jsx'
     silently also matches 'AppXjsx', and a file gets handed to an agent who does
     not own it - with the guard still green, which is the dangerous kind of wrong. */
  assert.ok(likeMatch("app/web/src/App.jsx", "app/web/src/App.jsx"));
  assert.ok(!likeMatch("app/web/src/AppXjsx", "app/web/src/App.jsx"));
});

test("regexp metacharacters in a path are treated literally", () => {
  /* Real filenames contain these. An unescaped '+' or '(' turns the pattern into a
     different expression entirely, or throws. */
  for (const name of ["a+b.md", "a(b).md", "a[b].md", "a{b}.md", "a$b.md", "a^b.md", "a|b.md"]) {
    assert.ok(likeMatch(name, name), `${name} must match itself`);
  }
  assert.ok(!likeMatch("ab.md", "a+b.md"), "'+' must not mean 'one or more'");
  assert.ok(!likeMatch("aab.md", "a*b.md"), "'*' must not mean 'zero or more'");
});

test("the pattern is ANCHORED at both ends", () => {
  /* Unanchored, 'App.jsx' would match 'src/App.jsx.bak' and every backup file
     would be claimed by whoever owns the original. */
  assert.ok(!likeMatch("src/App.jsx", "App.jsx"), "must not match a suffix");
  assert.ok(!likeMatch("App.jsx.bak", "App.jsx"), "must not match a prefix");
});

test("the real lane patterns behave as the registry intends", () => {
  /* Taken verbatim from agent_lane. If these ever stop holding, the lane guard is
     assigning files to the wrong agent, which is worse than not running at all. */
  assert.ok(likeMatch("brain/AGENT_ROSTER.md", "brain/%"));
  assert.ok(likeMatch("tools/checks/lane-discipline.mjs", "tools/checks/%"));
  assert.ok(likeMatch("app/supabase/functions/apex-sync/index.ts", "app/supabase/functions/apex-sync/%"));
  assert.ok(likeMatch("app/web/src/budz.jsx", "app/web/src/budz.jsx"));
  /* D owns budz.jsx; B owns App.jsx. They must NEVER match each other's pattern. */
  assert.ok(!likeMatch("app/web/src/App.jsx", "app/web/src/budz.jsx"));
  assert.ok(!likeMatch("app/web/src/budz.jsx", "app/web/src/App.jsx"));
  /* Metrc functions are A's; the Apex function is G's. A '%' that reached too far
     would hand every edge function to one agent. */
  assert.ok(!likeMatch("app/supabase/functions/apex-sync/index.ts", "app/supabase/functions/metrc-%"));
});

test("likeToRegExp rejects a non-string rather than coercing it", () => {
  /* Coercion here would turn undefined into the string 'undefined' and match a file
     literally named that. Fail loudly instead. */
  assert.throws(() => likeToRegExp(undefined), TypeError);
  assert.throws(() => likeToRegExp(null), TypeError);
});
