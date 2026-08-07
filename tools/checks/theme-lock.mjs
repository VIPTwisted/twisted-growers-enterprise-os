#!/usr/bin/env node
/* CHECK: the theme has not been altered.
 *
 * The owner locked the theme on 5 August 2026 and restated it as a hard rule on 7 August:
 * neon green is the brand, zero purple, no grey icons, no pastels, bright reds not dark.
 * CLAUDE.md rules 9 and I1.
 *
 * The Claude Code PreToolUse hook (tools/hooks/guard-protected-files.mjs) blocks an agent
 * from writing these files interactively. This check is the second layer: it catches a change
 * that arrived any other way — a human editor, a script, a merge, a different tool.
 *
 * Compares the working tree against a git ref (default: origin/main, falling back to main).
 * Fails if styles.css or rules.css differs, unless TG_THEME_UNLOCK=owner-approved.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const THEME = ["app/web/src/styles.css", "app/web/src/rules.css"];

const git = (...args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });

if (process.env.TG_THEME_UNLOCK === "owner-approved") {
  console.log("theme-lock: SKIPPED — TG_THEME_UNLOCK is set. The owner must have approved this.");
  process.exit(0);
}

/* Pick a base to compare against. In CI, GITHUB_BASE_REF is the PR target.
 *
 * Compare against the MERGE BASE, not the branch tip. Comparing against origin/main directly
 * reports every theme change that has ever landed since the fork point — including the 7 Aug
 * commit that first put the already-live styles.css and rules.css under version control. That
 * produced a false failure. The merge base isolates only what THIS branch changed. */
let ref = process.env.TG_THEME_BASE || "";
if (!ref && process.env.GITHUB_BASE_REF) ref = "origin/" + process.env.GITHUB_BASE_REF;
if (!ref) {
  for (const cand of ["main", "origin/main"]) {
    if (git("rev-parse", "--verify", "--quiet", cand).status === 0) { ref = cand; break; }
  }
}
if (!ref) {
  console.log("theme-lock: no git base to compare against — skipping rather than guessing.");
  process.exit(0);
}

const mb = git("merge-base", "HEAD", ref);
const base = mb.status === 0 && mb.stdout.trim() ? mb.stdout.trim() : ref;

const r = git("diff", "--name-only", base, "--", ...THEME);
if (r.status !== 0) {
  console.log("theme-lock: could not diff against " + base + " — skipping rather than failing wrongly.");
  process.exit(0);
}

const changed = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
if (!changed.length) {
  console.log("theme-lock: PASS — theme files unchanged against " + base + ".");
  process.exit(0);
}

console.error("theme-lock: FAIL — the theme was modified.\n");
for (const f of changed) console.error("  changed: " + f);
console.error("\nTHE THEME IS LOCKED. Neon green is the brand — CLAUDE.md rules 9 and I1,");
console.error("restated by the owner as a hard rule on 7 August 2026.");
console.error("\nNew components must consume EXISTING tokens rather than introduce colours.");
console.error("If a visual change is genuinely required, get explicit owner approval and set");
console.error("TG_THEME_UNLOCK=owner-approved for that run. Do not edit around this check.");
console.error("\nTo see exactly what changed:");
console.error("  git diff " + base + " -- " + changed.join(" "));
process.exit(1);
