#!/usr/bin/env node
/* source-intact.mjs — a tracked source file must never ship empty or gutted.
 *
 * WHY THIS EXISTS
 *
 * On 8 August 2026 app/web/src/budz.jsx went to ZERO BYTES. 2,908 lines gone.
 *
 * The cause was a Python edit script piped through a shell heredoc. The heredoc
 * collapsed a doubled backslash, so Python received a lone surrogate instead of
 * the literal text \uD83D. Python then did what every language does:
 *
 *     io.open(path, "w")        <- TRUNCATES THE FILE IMMEDIATELY
 *     ...build the new text...
 *     .write(text)              <- raises UnicodeEncodeError
 *
 * The file was emptied before the content that would replace it was known to be
 * writable. The error message was about an encoding. The damage was a deleted
 * file, and nothing said so.
 *
 * THE PART THAT MATTERS MORE THAN THE CAUSE
 *
 * NOT ONE OF THE ELEVEN GATES WOULD HAVE CAUGHT IT.
 *
 *   - parse-check passes: an empty file is a valid, empty JavaScript program.
 *   - eslint passes: nothing to complain about.
 *   - the build passes: Vite happily bundles an empty module.
 *   - theme-lock, routing, boundaries: all look for the presence of bad things,
 *     and an empty file contains no bad things at all.
 *
 * rules-in-sync would have caught THIS file, by luck, because budz.jsx happens
 * to be one of three runtimes it watches for training text. Empty App.jsx or
 * styles.css instead and the whole suite reads green over a deleted screen.
 *
 * That is the real defect. Every existing gate asks "is there something wrong in
 * this file". None asks "is this file still there". Absence passes every test
 * built to detect presence - which is the same error as reading a null as an
 * absence, written up in the briefing, and it caught me again from the other
 * direction.
 *
 * WHAT THIS ASSERTS
 *
 *   1. No tracked source file is empty or whitespace-only. There is no
 *      legitimate empty .jsx/.ts/.mjs/.css/.sql in this repository.
 *   2. No tracked source file has lost most of itself since HEAD. A file that
 *      was 2,900 lines and is now 300 is a half-finished truncation, and the
 *      whole point is to catch it before it is committed rather than after.
 *
 * It compares against git HEAD rather than a checked-in list of sizes, because a
 * list of expected sizes is a copy that has to be maintained, and maintained
 * copies are what this codebase keeps getting wrong.
 *
 * A deliberate large deletion is legitimate and rare. It is declared by name in
 * ALLOWED_SHRINK below, with a reason, so it is visible and arguable - the same
 * shape as the exemption list in all-checks-wired.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/* Source, not assets. A .png or a .lock has different rules and is not what
   gets edited by a script at two in the morning. */
const SOURCE = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".css", ".sql", ".py", ".md"]);

/* Files allowed to lose most of themselves in one commit. Name and reason
   required. An empty file is NEVER allowed, whatever is listed here. */
const ALLOWED_SHRINK = {
  // "path/to/file.ts": "why this was gutted deliberately, and when",
};

/* Below this, percentage talk is noise - a 12-line file dropping to 3 is not a
   truncation, it is an edit. */
const SMALL_FILE_LINES = 40;
/* Losing more than this share of a real file in one commit is the shape of a
   truncation, not the shape of an edit. */
const SHRINK_LIMIT = 0.70;

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};

if (!git(["rev-parse", "--git-dir"])) {
  console.log("source-intact: SKIP — not a git working tree, so there is nothing to compare against.");
  process.exit(0);
}

const tracked = (git(["ls-files"]) ?? "")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .filter((p) => SOURCE.has(extname(p)));

if (!tracked.length) {
  console.error("source-intact: FAIL — git lists no tracked source files. That is itself wrong.");
  process.exit(1);
}

const lines = (s) => (s.length ? s.split("\n").length : 0);
let emptied = 0;
let gutted = 0;
let checked = 0;

for (const rel of tracked) {
  const abs = resolve(root, rel);
  /* Deleted-but-not-yet-staged is a normal state mid-work and is not this
     gate's business. An emptied file, however, still exists. */
  if (!existsSync(abs)) continue;
  checked++;

  const size = statSync(abs).size;
  if (size === 0) {
    console.error(`source-intact: FAIL — ${rel} is ZERO BYTES.`);
    console.error(`   A tracked source file cannot legitimately be empty. Recover it with:`);
    console.error(`       git checkout -- ${rel}`);
    emptied++;
    continue;
  }

  const now = readFileSync(abs, "utf8");
  if (!now.trim()) {
    console.error(`source-intact: FAIL — ${rel} contains only whitespace.`);
    console.error(`       git checkout -- ${rel}`);
    emptied++;
    continue;
  }

  /* Compare against the committed version. A file with no HEAD version is new,
     and a new file has nothing to have lost. */
  const head = git(["show", `HEAD:${rel}`]);
  if (head == null) continue;

  const was = lines(head);
  const is = lines(now);
  if (was < SMALL_FILE_LINES) continue;
  if (is >= was * (1 - SHRINK_LIMIT)) continue;

  if (ALLOWED_SHRINK[rel]) {
    console.log(`source-intact: allowed — ${rel} ${was} → ${is} lines. ${ALLOWED_SHRINK[rel]}`);
    continue;
  }
  const lost = Math.round((1 - is / was) * 100);
  console.error(`source-intact: FAIL — ${rel} lost ${lost}% of itself: ${was} → ${is} lines.`);
  console.error(`   That is the shape of a truncated write, not of an edit.`);
  console.error(`   If it really was deliberate, add it to ALLOWED_SHRINK in this file with a reason.`);
  gutted++;
}

if (emptied || gutted) {
  console.error(`\nsource-intact: ${emptied} emptied, ${gutted} gutted, out of ${checked} tracked source files.`);
  console.error(`Every other gate in this suite looks for something WRONG inside a file.`);
  console.error(`An empty file contains nothing wrong, so it passes all of them. This is the`);
  console.error(`one that asks whether the file is still there.`);
  process.exit(1);
}

console.log(`source-intact: PASS — ${checked} tracked source files, none empty, none gutted.`);
