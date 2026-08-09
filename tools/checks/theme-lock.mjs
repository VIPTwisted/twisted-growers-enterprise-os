#!/usr/bin/env node
/* CHECK: the THEME is locked — colour and mode. Layout is not.
 *
 * WHAT THE OWNER ACTUALLY RULED (8 Aug 2026, narrowing rules 9 and I1):
 *   "the only rule was not changing dark or light mode colour theme, and all menus on the
 *    top, side or under — users can add to it but not change"
 *
 * WHAT THIS CHECK USED TO DO, AND WHY IT WAS WRONG. It locked all 1,814 lines of styles.css
 * and all 545 of rules.css, entirely. But those files are not just colour — they hold the page
 * layout for the whole platform (.filterbar, .card, .topnav, .nav, .assign, .pwgate). So the
 * check forbade a new page from putting its layout CSS where every other page's layout lives,
 * and pushed agents into patches.css instead.
 *
 * That is a large part of why every page looks the same: the lock made the shared stylesheet
 * the only legitimate place to style anything, and then froze it.
 *
 * Worse, it guarded the wrong thing. Measured 8 Aug 2026:
 *     colour literals in the LOCKED files    377
 *     colour literals in patches.css (OPEN)   12   <-- unguarded, and already leaked
 * rgba(255,66,69,…) appears repeatedly in patches.css when var(--red) exists. Layout was
 * over-protected and colour was under-protected — exactly backwards.
 *
 * WHAT IT DOES NOW — two rules, both stricter about colour than the old file lock:
 *
 *   RULE 1 · THE PALETTE IS FROZEN. The custom-property declarations inside the :root and
 *            :root[data-theme="dark"|"light"] blocks may not change. That is the brand and
 *            both modes. Neon green stays neon green.
 *
 *   RULE 2 · NO NEW COLOUR LITERAL, IN ANY CSS FILE ANYWHERE under app/web/src — including
 *            patches.css and every future module stylesheet. Ratcheted against the merge base,
 *            so the 389 that already exist do not block work while the count can only fall.
 *
 *   AND LAYOUT IS FREE. Sizing, spacing, grid, flex, radius, shadow geometry, per-mode layout
 *   overrides — all fine, in styles.css or in a module stylesheet, provided every colour comes
 *   from an existing token. That is the professional rule: consume tokens, never hardcode.
 *
 * TG_THEME_UNLOCK=owner-approved still skips everything, for a genuine palette change.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "app", "web", "src");
const TOKEN_FILES = ["app/web/src/styles.css", "app/web/src/rules.css"];

const git = (...a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

if (process.env.TG_THEME_UNLOCK === "owner-approved") {
  console.log("theme-lock: SKIPPED — TG_THEME_UNLOCK is set. The owner must have approved this.");
  process.exit(0);
}

/* Compare against the MERGE BASE, not the branch tip, so only what THIS branch changed is
   reported. Comparing against origin/main directly once flagged every theme change that had
   ever landed, including the commit that first put the already-live files under control. */
let ref = process.env.TG_THEME_BASE || "";
if (!ref && process.env.GITHUB_BASE_REF) ref = "origin/" + process.env.GITHUB_BASE_REF;
if (!ref) for (const c of ["main", "origin/main"]) {
  if (git("rev-parse", "--verify", "--quiet", c).status === 0) { ref = c; break; }
}
if (!ref) {
  console.log("theme-lock: no git base to compare against — skipping rather than guessing.");
  process.exit(0);
}
const mb = git("merge-base", "HEAD", ref);
const base = mb.status === 0 && mb.stdout.trim() ? mb.stdout.trim() : ref;

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\([^)]*\)/g;

/* Every custom-property declaration inside a :root / [data-theme] block. This is the palette:
   the brand, and both modes. Returned as a sorted "name: value" list so reordering the file
   is not reported as a change but altering a value always is. */
function palette(css) {
  const out = [];
  const block = /(:root[^{]*)\{([^}]*)\}/g;
  let m;
  while ((m = block.exec(css)) !== null) {
    const selector = m[1].replace(/\s+/g, " ").trim();
    if (!/^:root/.test(selector)) continue;
    for (const decl of m[2].split(";")) {
      const d = decl.trim();
      if (!d.startsWith("--")) continue;              // only custom properties
      const i = d.indexOf(":");
      if (i < 0) continue;
      out.push(`${selector} | ${d.slice(0, i).trim()}: ${d.slice(i + 1).replace(/\s+/g, " ").trim()}`);
    }
  }
  return out.sort();
}

function atBase(path) {
  const r = git("show", `${base}:${path}`);
  return r.status === 0 ? r.stdout : null;
}

function everyCss(dir) {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) found.push(...everyCss(p));
    else if (e.endsWith(".css")) found.push(p);
  }
  return found;
}

let failed = false;

/* ── RULE 1 · the palette is frozen ─────────────────────────────────────────── */
let checkedTokens = 0;
for (const rel of TOKEN_FILES) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const nowPal = palette(readFileSync(abs, "utf8"));
  const wasSrc = atBase(rel);
  if (wasSrc === null) { console.log(`theme-lock: ${rel} is new since ${base} — palette not comparable.`); continue; }
  const wasPal = palette(wasSrc);
  checkedTokens += nowPal.length;

  const added = nowPal.filter((x) => !wasPal.includes(x));
  const removed = wasPal.filter((x) => !nowPal.includes(x));
  if (added.length || removed.length) {
    failed = true;
    console.error(`theme-lock: FAIL — the palette changed in ${rel}.`);
    removed.forEach((x) => console.error(`    removed: ${x}`));
    added.forEach((x) => console.error(`    added:   ${x}`));
  }
}
if (!failed) console.log(`theme-lock: ok — palette unchanged (${checkedTokens} token declarations across :root, dark and light).`);

/* ── RULE 2 · no NEW colour literal, in any stylesheet ──────────────────────── */
const files = everyCss(SRC).map((f) => relative(ROOT, f).split("\\").join("/"));
let now = 0, was = 0;
const grew = [];
const untracked = [];
for (const rel of files) {
  const n = (readFileSync(join(ROOT, rel), "utf8").match(COLOUR) || []).length;
  const src = atBase(rel);

  /* A stylesheet with no version in git has no baseline, so every literal in it would read as
     "new" — a misleading diagnosis that hides the real problem. On 8 Aug 2026 patches.css was
     269 lines, imported by main.jsx, and existed only on one laptop. Report THAT instead. */
  const isTracked = git("ls-files", "--error-unmatch", rel).status === 0;
  if (!isTracked) { untracked.push({ rel, n }); continue; }

  const w = src === null ? 0 : (src.match(COLOUR) || []).length;
  now += n; was += w;
  if (n > w) grew.push(`${rel}: ${w} → ${n}  (+${n - w})`);
}

if (untracked.length) {
  failed = true;
  console.error(`theme-lock: FAIL — ${untracked.length} stylesheet(s) are NOT IN GIT:`);
  untracked.forEach((u) => console.error(`    ${u.rel}  (${u.n} colour literal(s), no baseline possible)`));
  console.error("");
  console.error("A stylesheet the app imports but git does not hold is a build waiting to break:");
  console.error("commit the importing file without the stylesheet and Vite cannot resolve it.");
  console.error("It is also unguarded — no baseline means no ratchet, so colour can leak freely.");
  console.error("Commit the stylesheet AND its importer together, then this check can protect it.");
}

if (now > was) {
  failed = true;
  console.error(`theme-lock: FAIL — ${now - was} new colour literal(s) across ${grew.length} file(s).`);
  grew.forEach((g) => console.error(`    ${g}`));
  console.error("");
  console.error("Every colour must come from an existing token: var(--red), var(--canvas), …");
  console.error("A hardcoded rgba() beside an existing token is how the brand drifts — patches.css");
  console.error("already carries 12 of them where var(--red) was right there.");
} else {
  console.log(`theme-lock: ok — colour literals ${now} across ${files.length} stylesheet(s), baseline ${was}. None added.`);
}

if (failed) {
  console.error("");
  console.error("THE THEME IS LOCKED: the palette and both modes. CLAUDE.md rules 9 and I1,");
  console.error("narrowed by the owner on 8 Aug 2026 to colour and mode only.");
  console.error("");
  console.error("LAYOUT IS NOT LOCKED. Sizing, spacing, grid, radius, shadow geometry and");
  console.error("per-mode layout overrides are all yours — in styles.css or a module stylesheet —");
  console.error("provided every colour comes from a token that already exists.");
  console.error("");
  console.error("For a genuine palette change: get explicit owner approval and set");
  console.error("TG_THEME_UNLOCK=owner-approved for that run. Do not edit around this check.");
  console.error(`\nTo see what changed:  git diff ${base} -- app/web/src`);
  process.exit(1);
}
console.log("theme-lock: PASS — colour and mode are locked; layout is free.");
