#!/usr/bin/env node
/* dead-controls.mjs — a button that does nothing is worse than no button.
 *
 * ENFORCES Rule I2 — "every category has a real dashboard, never a list of links" — and
 * Rule A3, "if something is not recorded, tell the user why", in its interface form: a
 * control that looks live and is not lies about what the product can do.
 *
 * WHY IT MATTERS TO THIS OWNER SPECIFICALLY
 * He is not an engineer. A button he presses that does nothing does not read as "not
 * built yet" — it reads as "broken", or worse, as "it worked and I cannot see the
 * result". That is the same failure as a silent navigation fallthrough (rule A3, already
 * guarded by routing.mjs) and the same failure as a dashboard that swallows its error
 * with `?? []`. The platform has now been caught doing the silent-failure thing three
 * separate ways; this closes a fourth.
 *
 * A RATCHET. 16 controls carry no handler today out of 297. That number may fall and may
 * never rise — ci.yml's own principle: a gate red on arrival is a gate switched off.
 *
 * DELIBERATELY NARROW. It flags only a <button> with NO handler of any kind and no
 * submit role. A button wired through a spread prop or a parent form is not a finding,
 * because a guard that argues with correct code gets switched off and takes its rule
 * with it — which has already happened three times in this repository today.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const BASELINE = join(here, "dead-controls.baseline.json");
const UI_FILES = ["app/web/src/App.jsx", "app/web/src/budz.jsx", "app/web/src/commandcenter.jsx"];

/* Anything that makes a button do something, or hands its behaviour to a parent. */
const LIVE = /onClick|onMouseDown|onPointerDown|onSubmit|type\s*=\s*["']submit["']|\{\s*\.\.\./;

/* A DISABLED button is not a dead control — it is rule A3 done correctly.
 * The first run of this guard flagged 14 of them and would have baselined the lot as
 * debt. Every one was `<button className="uitem dim" disabled title="...">` explaining
 * what the feature is and when it arrives. That is exactly what A3 asks for: absence
 * explained, never blank. The rule here is about a control that LOOKS LIVE and does
 * nothing; a greyed-out button announces itself. Sixth false positive caught today, and
 * the only one that would have quietly recorded correct work as technical debt. */
const DISABLED = /\bdisabled\b/;
/* A handler that exists and does nothing is worse than none: it looks deliberate. */
const HOLLOW = /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*(\{\s*\}|undefined|null|void 0)\s*\}/;
const LOG_ONLY = /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*console\.(log|warn|debug)\([^)]*\)\s*\}/;

/* Extract a full <button ...> opening tag.
 *
 * A naive /<button\b[^>]*>/ TRUNCATES AT THE FIRST ">", and `onClick={() => {}}`
 * contains one inside the arrow. The self-test below caught exactly that: hollow and
 * log-only handlers were invisible because the tag was cut at "=>". So this scans
 * forward, tracking brace depth, and only accepts a ">" that is outside any {...}.
 * Found by the guard's own fixtures before it ever judged real code. */
/* Blank out comments, preserving length and newlines so reported line numbers stay true.
 *
 * Without this the scanner reads prose as markup. App.jsx:4932 is a comment reading
 * "It is a real <button> with aria-expanded rather than a clickable div", and the guard
 * dutifully reported it as the one dead control in the codebase. That is the SEVENTH
 * false positive found today and every single one was the same mistake: a guard matching
 * English that describes code instead of the code itself. It is now the default
 * assumption when writing one here. */
function stripComments(src) {
  const out = src.split("");
  let i = 0;
  while (i < out.length) {
    if (src[i] === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? out.length : end + 2;
      for (let k = i; k < stop; k++) if (out[k] !== "\n") out[k] = " ";
      i = stop;
    } else if (src[i] === "/" && src[i + 1] === "/") {
      let k = i;
      while (k < out.length && out[k] !== "\n") { out[k] = " "; k++; }
      i = k;
    } else i++;
  }
  return out.join("");
}

function buttonTags(text) {
  const out = [];
  for (const open of text.matchAll(/<button\b/g)) {
    let depth = 0, i = open.index + open[0].length;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    if (i < text.length) out.push({ tag: text.slice(open.index, i + 1), index: open.index });
  }
  return out;
}

function selfTest() {
  const cases = [
    ['<button onClick={save}>Save</button>', false, "a wired button"],
    ['<button type="submit">Go</button>', false, "submit is handled by its form"],
    ['<button {...props}>X</button>', false, "behaviour handed in by spread — must not be flagged"],
    ['<button className="x">Dead</button>', true, "no handler of any kind"],
    ['<button onClick={() => {}}>Nothing</button>', true, "a hollow handler looks deliberate and is worse"],
    ['<button onClick={() => console.log("todo")}>Soon</button>', true, "logs instead of acting"],
    ['<button className="uitem dim" disabled title="Arrives with Meetings">X</button>', false,
     "a disabled button with an explanation IS rule A3 — the real false positive, 14 of them"],
  ];
  const bad = [];
  for (const [src, want, why] of cases) {
    const tag = buttonTags(src)[0]?.tag ?? "";
    const got = !DISABLED.test(tag) && (!LIVE.test(tag) || HOLLOW.test(tag) || LOG_ONLY.test(tag));
    if (got !== want) bad.push({ src, want, got, why });
  }
  if (bad.length) {
    console.error("dead-controls: FAIL — the detector is broken:\n");
    for (const b of bad) console.error(`  ✗ ${b.want ? "should flag" : "must NOT flag"}: ${b.src}\n      ${b.why}`);
    process.exit(1);
  }
  console.log(`dead-controls: detector self-test PASSED (${cases.length} cases).`);
}

selfTest();

const findings = [];
let total = 0;
for (const rel of UI_FILES) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const text = stripComments(readFileSync(abs, "utf8"));
  for (const m of buttonTags(text)) {
    total++;
    const tag = m.tag;
    if (DISABLED.test(tag)) continue;          // announces itself; not a dead control
    const dead = !LIVE.test(tag);
    const hollow = HOLLOW.test(tag) || LOG_ONLY.test(tag);
    if (dead || hollow) {
      findings.push({
        rel, line: text.slice(0, m.index).split("\n").length,
        kind: hollow ? "handler that does nothing" : "no handler at all",
        snippet: tag.replace(/\s+/g, " ").slice(0, 80),
      });
    }
  }
}

if (total === 0) {
  console.error("dead-controls: FAIL — found no <button> elements at all. The detector has stopped");
  console.error("      matching, and a guard that matches nothing reads as a pass forever.");
  process.exit(1);
}

console.log(`dead-controls: ${total} button(s) scanned, ${findings.length} inert.\n`);
for (const f of findings.slice(0, 20)) {
  console.log(`  · ${f.rel}:${f.line}  ${f.kind}`);
  console.log(`      ${f.snippet}`);
}
if (findings.length > 20) console.log(`  … and ${findings.length - 20} more.`);

let base = null;
try { base = JSON.parse(readFileSync(BASELINE, "utf8")); } catch { base = null; }
if (!base) {
  writeFileSync(BASELINE, JSON.stringify({
    _comment: [
      "High-water mark for inert controls. May FALL, may never RISE. Recorded 8 Aug 2026.",
      "A button with no handler reads to a non-technical owner as broken, not as unbuilt.",
      "To reduce it: wire the control, or remove it until it does something.",
    ],
    max_allowed: findings.length, of_total: total, recorded: "2026-08-08",
  }, null, 2) + "\n");
  console.log(`\ndead-controls: baseline created at ${findings.length}. Commit it.`);
  process.exit(0);
}

if (findings.length > base.max_allowed) {
  console.error(`\ndead-controls: FAIL — ${findings.length} inert control(s), baseline allows ${base.max_allowed}.`);
  console.error(`      ${findings.length - base.max_allowed} new button(s) that look live and do nothing.`);
  console.error("      Wire it, or remove it until it works. The owner is not an engineer: a button");
  console.error("      that does nothing reads as broken, or as 'it worked and I cannot see it'.\n");
  process.exit(1);
}
if (findings.length < base.max_allowed) {
  writeFileSync(BASELINE, JSON.stringify({ ...base, max_allowed: findings.length, of_total: total }, null, 2) + "\n");
  console.log(`\ndead-controls: baseline LOWERED ${base.max_allowed} -> ${findings.length}. Commit it.`);
}
console.log(`\ndead-controls: PASS — ${findings.length} inert of ${total}, within the baseline of ${base.max_allowed}.`);
