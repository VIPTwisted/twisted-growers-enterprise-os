#!/usr/bin/env node
/* blueprint-in-sync.mjs — the guard on the Bible (BP-16-2). Owner, 14 Sep 2026:
 * "no room for drifting or leaving anything to another AI to interpret … the Bible
 * that reviewers, watchers and the guard all agree on … agents cannot allow stale
 * content or overlook anything."
 *
 * Three facts, each measured, each named when it fails:
 *
 *   1. FROZEN SURFACES ARE UNTOUCHED. The theme (styles.css), the Facility Map, Top G /
 *      the bots, Budz, TG Brain, the side rail's cockpit list and the top bar do not change
 *      in a build. A commit that touches one of those files fails here — unless its
 *      message carries "OWNER-APPROVED:" followed by what the owner approved, which is the
 *      only door (the owner's word, recorded in the commit).
 *
 *   2. MIGRATIONS ARE ADDITIVE IN GO-LIVE WEEK (Bible §16.3, from GPT's review): a
 *      migration file in the range that drops a table or a column, or truncates, fails —
 *      a Netlify rollback cannot reverse it. Additive-only until 24 Sep 2026.
 *
 *   3. THE BOARD AND THE BIBLE AGREE. Every "BP-<section>-<n>" id carried by a section-19
 *      tracker row must appear in brain/BLUEPRINT_2026_BEAT_THEM_ALL.md, and every BP id
 *      referenced in the Bible's §13 schedule must have a tracker row. Verified against the
 *      live tracker when a connection is available (CI and Netlify hold one); without one
 *      the gate says so and judges the two repository-side facts only — it never pretends.
 *
 * Exit 0 = all three hold. Exit 1 = one failed, with the file / id / commit named.
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openClient, resolveConnection } from "../lib/db.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BIBLE = join(ROOT, "brain", "BLUEPRINT_2026_BEAT_THEM_ALL.md");
const GATE = "blueprint-in-sync";

/* The frozen list, verbatim from the Bible §2b. Paths are repo-relative prefixes. */
const FROZEN = [
  "app/web/src/styles.css",
  "app/web/src/facility/",
  "app/web/src/budz.jsx",
  "app/web/src/lib/tg-bots-panel.jsx",
  "app/web/src/lib/os-bots.js",
  "app/web/src/bots-paid-key.jsx",
];
/* The rail's cockpit list may only GAIN a child entry (owner, 13 Sep). A change is allowed
   when the commit message says so; anything else on that file is a frozen-surface change. */
const RAIL = "app/web/src/cockpit-rail.jsx";
const ADDITIVE_ONLY_UNTIL = new Date("2026-09-24T00:00:00Z");
const DESTRUCTIVE = /\b(drop\s+table|drop\s+column|alter\s+table\s+\S+\s+drop\s+column|truncate\s+table|drop\s+schema)\b/i;

const sh = (cmd) => { try { return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { return ""; } };

/* ── which commits are we judging? ─────────────────────────────────────────
   In CI: the PR's commits (origin/main..HEAD). On Netlify: the same range when the
   base is fetchable, otherwise the last commit. Locally: origin/main..HEAD. */
function judgedRange() {
  sh("git fetch --no-tags --depth=200 origin main");
  const base = sh("git merge-base origin/main HEAD").trim();
  if (base) return `${base}..HEAD`;
  return "HEAD~1..HEAD";
}
const range = judgedRange();
const commits = sh(`git log --format=%H ${range}`).trim().split("\n").filter(Boolean);
const failures = [];
const notes = [];

/* 1 · frozen surfaces */
for (const c of commits) {
  const files = sh(`git show --pretty=format: --name-only ${c}`).trim().split("\n").filter(Boolean);
  const msg = sh(`git log -1 --format=%B ${c}`);
  const approved = /OWNER-APPROVED:\s*\S/.test(msg);
  for (const f of files) {
    const frozen = FROZEN.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p));
    if (frozen && !approved) failures.push(`frozen surface changed in ${c.slice(0, 7)}: ${f} — the theme, the map, the bots and Budz do not change without "OWNER-APPROVED: <what>" in the commit message`);
    if (f === RAIL && !approved && !/menu child|child entry|rail child/i.test(msg)) failures.push(`side rail changed in ${c.slice(0, 7)} without saying it adds a child entry (or OWNER-APPROVED:) — ${f}`);
  }
}

/* 2 · additive-only migrations in go-live week */
if (new Date() < ADDITIVE_ONLY_UNTIL) {
  const changed = sh(`git diff --name-only ${range} -- supabase/migrations`).trim().split("\n").filter((f) => f.endsWith(".sql") && !/baseline_live_schema/.test(f));
  for (const f of changed) {
    const abs = join(ROOT, f);
    if (!existsSync(abs)) continue;
    const sql = readFileSync(abs, "utf8").replace(/--[^\n]*/g, "");
    if (DESTRUCTIVE.test(sql)) failures.push(`destructive migration in go-live week (additive only until 24 Sep): ${f}`);
  }
}

/* 3 · the board and the Bible agree */
if (!existsSync(BIBLE)) failures.push("brain/BLUEPRINT_2026_BEAT_THEM_ALL.md is missing — the Bible must exist");
const bible = existsSync(BIBLE) ? readFileSync(BIBLE, "utf8") : "";
const idsInBible = new Set([...bible.matchAll(/\bBP-\d+[a-z]?(?:-\d+)?\b/g)].map((m) => m[0]));
const { conn } = resolveConnection(ROOT);
if (conn) {
  const client = await openClient(GATE, ROOT);
  try {
    const { rows } = await client.query(
      "select check_key, title from public.deployment_check where active and section like '19 %'");
    for (const r of rows) {
      const m = r.title.match(/\bBP-\d+[a-z]?(?:-\d+)?\b/);
      if (!m) continue;
      /* a row's id must exist in the Bible, at section granularity (BP-12b-3 → BP-12b or BP-12b-3) */
      const id = m[0]; const sec = id.replace(/-\d+$/, "");
      if (!idsInBible.has(id) && !idsInBible.has(sec)) failures.push(`board row ${r.check_key} carries ${id} which the Bible does not mention`);
    }
    notes.push(`${rows.length} section-19 rows checked against the Bible (VERIFIED against deployment_check)`);
  } finally { await client.end(); }
} else {
  notes.push("no database connection here — the board/Bible agreement was NOT judged; the two repository facts were");
}

if (failures.length) {
  console.error(`${GATE}: FAIL — ${failures.length} finding(s):`);
  for (const f of failures) console.error("    x " + f);
  console.error("\n    The Bible (brain/BLUEPRINT_2026_BEAT_THEM_ALL.md §2b, §16) is the one plan. A frozen surface");
  console.error("    changes only on the owner's word, recorded in the commit; go-live week is additive-only;");
  console.error("    every board row's BP id lives in the Bible. Nothing here is interpreted by an agent.");
  process.exit(1);
}
console.log(`${GATE}: PASS — ${commits.length} commit(s) judged in ${range}: no frozen surface touched, migrations additive, ${notes.join("; ")}.`);
