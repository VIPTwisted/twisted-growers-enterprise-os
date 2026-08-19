#!/usr/bin/env node
/* CHECK: nothing the application depends on may exist only on one laptop.
 *
 * WHY THIS EXISTS. It bit twice on 8 August 2026, and it is the same failure the owner blew up
 * about the day before — "production code not in version control."
 *
 *   1. patches.css — 269 lines, imported by main.jsx, never `git add`ed. HEAD was
 *      self-consistent so nothing was broken YET, but the moment anyone committed main.jsx
 *      alone, Vite could not resolve the import and every deploy would die. A landmine.
 *   2. roster.jsx, hrdash.jsx, kiosk.jsx — 746 lines of hand-built Human Resources pages,
 *      all three untracked. Good work, existing nowhere but one disk.
 *
 * Neither was caught by anything. source-intact.mjs counts TRACKED files and so is blind by
 * construction to a file that was never added. That is the gap.
 *
 * THE INVARIANT, in two directions:
 *
 *   RULE 1 · A tracked file may not import something git does not hold.
 *            This is the build-breaks-on-clone case, and it is a hard failure. Either the
 *            import resolves to a tracked file, or the repository cannot build from a clean
 *            clone — which is the only build that matters, because that is what Netlify does.
 *
 *   RULE 2 · Untracked source is reported and ratcheted, not banned.
 *            Work in progress is legitimate; an agent should be able to write a file before
 *            committing it. But 746 uncommitted lines must not quietly become 7,460, so the
 *            count is baselined and may only fall. This is the honest record of how much of
 *            the platform exists in exactly one place.
 *
 *   node tools/checks/untracked-source.mjs
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Where application source lives. Deliberately not the whole repo: generated output, docs and
   the brain are not things the app imports.
   tools/checks and tools/hooks were added 8 Aug 2026 after this guard's own first run exposed
   the gap: budz-questions.mjs — a working guard catching confident-but-groundless assistant
   answers — was itself untracked. A GUARD that exists on one laptop is exactly as dangerous as
   app code that does, and this guard could not see it because it only scanned app source. */
const SCAN = ["app/web/src", "bridge", "app/supabase/functions", "tools/checks", "tools/hooks"];
/* "worktrees" — an agent worktree is a SECOND CHECKOUT of this same repo under
   .claude/worktrees/. Scanning it re-reports findings the real checkout already
   answers for, and it fails the build LOCALLY while Netlify (a fresh clone with
   no worktrees) passes — a gate whose verdict depends on whether an agent is
   running is a gate nobody can trust. Added 19 Aug 2026. */
const SKIP = /(^|[\\/])(node_modules|dist|build|\.git|\.netlify|coverage|worktrees)([\\/]|$)/;
const SOURCE = /\.(jsx?|tsx?|mjs|cjs|css)$/;

/* BASELINE — untracked source files. Lower it as work lands; NEVER raise it.
   8 Aug 2026: started at 3 (roster.jsx, hrdash.jsx, kiosk.jsx — 749 lines on one disk while
   App.jsx already imported two of them). All three committed the same day, so this is now 0
   and any new untracked source file fails immediately. That is the intended end state: zero. */
const BASELINE_UNTRACKED = 0;

const git = (...a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/* One git call, not one per file. */
const ls = git("ls-files");
if (ls.status !== 0) {
  console.log("untracked-source: not a git repository here — skipping rather than guessing.");
  process.exit(0);
}
const tracked = new Set(
  ls.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
);

const rel = (abs) => relative(ROOT, abs).split("\\").join("/");

function walk(dir, out = []) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs)) {
    const p = join(abs, e);
    if (SKIP.test(rel(p))) continue;
    if (statSync(p).isDirectory()) walk(rel(p), out);
    else if (SOURCE.test(e)) out.push(rel(p));
  }
  return out;
}

const files = SCAN.flatMap((d) => walk(d));

/* Relative imports only. A bare specifier is a package, not our source. */
const IMPORT = /(?:^|\n)\s*(?:import\s[^'"]*from\s*|import\s*|export\s[^'"]*from\s*)['"](\.[^'"]+)['"]/g;
const REQUIRE = /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

/* Mirror the bundler's resolution: exact path, then extensions, then directory index. */
const TRY = ["", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".css",
             "/index.js", "/index.jsx", "/index.ts", "/index.tsx"];

function resolveImport(fromFile, spec) {
  const baseAbs = resolve(join(ROOT, dirname(fromFile)), spec);
  for (const ext of TRY) {
    const cand = baseAbs + ext;
    if (existsSync(cand) && statSync(cand).isFile()) return rel(cand);
  }
  return null;                                   // does not exist on disk at all
}

let failed = false;
const brokenOnClone = [];     // tracked file imports something git does not hold
const missingOnDisk = [];     // tracked file imports something that is not there at all
const untracked = [];

for (const f of files) {
  if (!tracked.has(f)) { untracked.push(f); continue; }

  const text = readFileSync(join(ROOT, f), "utf8");
  const specs = new Set();
  for (const re of [IMPORT, REQUIRE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) specs.add(m[1]);
  }

  for (const spec of specs) {
    const target = resolveImport(f, spec);
    if (target === null) { missingOnDisk.push(`${f} imports "${spec}" — nothing at that path`); continue; }
    if (!tracked.has(target)) brokenOnClone.push(`${f} imports ${target} — NOT IN GIT`);
  }
}

/* ── RULE 1 · hard failure ──────────────────────────────────────────────────── */
if (missingOnDisk.length) {
  failed = true;
  console.error(`untracked-source: FAIL — ${missingOnDisk.length} import(s) resolve to nothing:`);
  missingOnDisk.forEach((x) => console.error(`    ${x}`));
}
if (brokenOnClone.length) {
  failed = true;
  console.error(`untracked-source: FAIL — ${brokenOnClone.length} tracked file(s) import untracked source:`);
  brokenOnClone.forEach((x) => console.error(`    ${x}`));
  console.error("");
  console.error("A clean clone CANNOT BUILD. Netlify clones the repository, so this is the only");
  console.error("build that matters. Commit the imported file and its importer TOGETHER —");
  console.error("either one alone is the trap.");
}
if (!missingOnDisk.length && !brokenOnClone.length) {
  console.log(`untracked-source: ok      — every import in ${files.filter((f) => tracked.has(f)).length} tracked source file(s) resolves to a tracked file.`);
}

/* ── RULE 2 · ratchet, not a ban ────────────────────────────────────────────── */
if (untracked.length) {
  let lines = 0;
  const detail = untracked.map((f) => {
    const n = readFileSync(join(ROOT, f), "utf8").split(/\r?\n/).length;
    lines += n;
    return `${f}  (${n} lines)`;
  });
  const verdict = untracked.length > BASELINE_UNTRACKED ? "FAIL" : "ok     ";
  const log = untracked.length > BASELINE_UNTRACKED ? console.error : console.log;
  if (untracked.length > BASELINE_UNTRACKED) failed = true;

  log(`untracked-source: ${verdict} — ${untracked.length} untracked source file(s), ${lines} lines (baseline ${BASELINE_UNTRACKED}):`);
  detail.forEach((d) => log(`    ${d}`));
  if (untracked.length > BASELINE_UNTRACKED) {
    console.error("");
    console.error("These exist on exactly one disk. If it dies, they are gone, and nothing else");
    console.error("can review, gate or deploy them. Commit them, or lower the baseline once they");
    console.error("are committed. Do NOT raise the baseline to make this pass.");
  }
} else if (BASELINE_UNTRACKED > 0) {
  console.log(`untracked-source: ok      — no untracked source. Lower BASELINE_UNTRACKED from ${BASELINE_UNTRACKED} to 0.`);
}

if (failed) {
  console.error("untracked-source: FAIL");
  process.exit(1);
}
console.log("untracked-source: PASS — nothing the application depends on lives on one laptop only.");
