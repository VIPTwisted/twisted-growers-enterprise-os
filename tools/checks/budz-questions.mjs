#!/usr/bin/env node
/* budz-questions.mjs — every pre-built question must reach a real answer.
 *
 * THE DEFECT THIS CLOSES.
 *
 * The owner clicked "What was backordered today?" and got a confident,
 * well-written answer that was worthless: the question matches NO branch in
 * budzAnswer, so it fell through to the generic path and the model was left to
 * improvise from whatever context happened to be attached.
 *
 * There are 51 pre-built questions on the Budz page, presented as if the
 * platform knows how to answer each one. A question with no branch is a promise
 * the platform cannot keep, and the failure is invisible: the answer still looks
 * like an answer.
 *
 * So this asserts the invariant the page implies:
 *
 *     EVERY pre-built question either reaches a named branch of budzAnswer,
 *     or is listed here as knowingly unanswerable, with the reason.
 *
 * It reads the questions and the branches out of budz.jsx and simulates the same
 * `has()` substring match the running code uses, in the same order, so it tests
 * the real routing rather than a description of it. No database and no network —
 * it must run in CI.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const src = readFileSync(resolve(root, "app/web/src/budz.jsx"), "utf8");

/* Questions that genuinely cannot be answered from the data that exists. Listed
   here with a reason so the gap is visible and arguable, rather than silently
   improvised at the person asking. Remove an entry the day the data lands. */
const KNOWN_UNANSWERABLE = {
  /* "What was backordered today?" was here. Between writing this check and running
     it, a branch for it was added to budzAnswer — and the check FAILED on the
     stale exemption rather than passing quietly. That is the behaviour that
     matters: an exemption which outlives its reason hides a gap that was closed,
     and would have let a real orphan hide behind it later. */
};

const dq = String.raw`"((?:[^"\\]|\\.)*)"`;

/* ---- the 51 questions ---------------------------------------------------- */
const dStart = src.indexOf("const BUDZ_DEPTS");
const dEnd = src.indexOf("const BUDZ_CHIPS");
if (dStart < 0 || dEnd < 0) {
  console.error("budz-questions: FAIL — cannot find BUDZ_DEPTS in budz.jsx.");
  process.exit(1);
}
const deptBlock = src.slice(dStart, dEnd);
const questions = [];
for (const m of deptBlock.matchAll(/dept:\s*"([^"]+)"\s*,\s*qs:\s*\[([\s\S]*?)\]/g)) {
  for (const q of m[2].matchAll(new RegExp(dq, "g"))) {
    questions.push({ dept: m[1], q: q[1] });
  }
}

/* ---- the branches of budzAnswer, in source order ------------------------- */
const fStart = src.indexOf("export async function budzAnswer");
const fEnd = src.indexOf("\nexport ", fStart + 10);
if (fStart < 0) {
  console.error("budz-questions: FAIL — cannot find budzAnswer in budz.jsx.");
  process.exit(1);
}
const body = src.slice(fStart, fEnd < 0 ? src.length : fEnd);

const branches = [];
for (const m of body.matchAll(/if \(has\(([^)]*)\)\)/g)) {
  const keywords = [...m[1].matchAll(new RegExp(dq, "g"))].map((k) => k[1].toLowerCase());
  const tail = body.slice(m.index, m.index + 900);
  const views = [...tail.matchAll(/sel\("([a-zA-Z0-9_]+)"/g)].map((v) => v[1]);
  if (keywords.length) branches.push({ keywords, views: [...new Set(views)] });
}

if (!questions.length || !branches.length) {
  console.error(`budz-questions: FAIL — parsed ${questions.length} questions and ${branches.length} branches.`);
  console.error("      budz.jsx has been restructured and this check can no longer see the routing.");
  process.exit(1);
}

/* ---- route each question exactly as the running code does ---------------- */
const orphans = [];
const routed = [];
for (const { dept, q } of questions) {
  const t = q.toLowerCase();
  const hit = branches.find((b) => b.keywords.some((k) => t.includes(k)));
  if (hit) routed.push({ dept, q, views: hit.views, on: hit.keywords.find((k) => t.includes(k)) });
  else orphans.push({ dept, q });
}

/* `node budz-questions.mjs --map` prints where every question lands.
   Routing SOMEWHERE is not the same as routing RIGHT: has() is first-match-wins
   in source order, so a loose keyword added at the top silently steals questions
   that used to reach a correct branch further down, and the count stays 53. The
   map is how that theft is seen. */
if (process.argv.includes("--map")) {
  let lastDept = null;
  for (const r of routed) {
    if (r.dept !== lastDept) { console.log(`\n  ${r.dept}`); lastDept = r.dept; }
    console.log(`    "${r.q}"`);
    console.log(`        matched on "${r.on}"  →  ${r.views.length ? r.views.join(", ") : "(no sel() in the first 900 chars)"}`);
  }
  console.log("");
}

const unexplained = orphans.filter((o) => !KNOWN_UNANSWERABLE[o.q]);
const explained = orphans.filter((o) => KNOWN_UNANSWERABLE[o.q]);

console.log(`budz-questions: ${questions.length} pre-built questions, ${branches.length} branches in budzAnswer`);
console.log(`budz-questions: ${routed.length} reach a branch`);
for (const e of explained) {
  console.log(`budz-questions: known gap — "${e.q}"`);
  console.log(`                ${KNOWN_UNANSWERABLE[e.q].slice(0, 100)}…`);
}

/* A question listed as unanswerable that now routes somewhere is also a finding:
   the entry is stale and hides the fact the gap was closed. */
const staleExemptions = Object.keys(KNOWN_UNANSWERABLE).filter(
  (q) => routed.some((r) => r.q === q),
);
if (staleExemptions.length) {
  console.error(`\nbudz-questions: FAIL — ${staleExemptions.length} question(s) listed as unanswerable now DO route:\n`);
  for (const q of staleExemptions) console.error(`  ✗ "${q}" — remove it from KNOWN_UNANSWERABLE.`);
  process.exit(1);
}

if (unexplained.length) {
  console.error(`\nbudz-questions: FAIL — ${unexplained.length} pre-built question(s) reach NO branch:\n`);
  for (const o of unexplained) {
    console.error(`  ✗ [${o.dept}] "${o.q}"`);
  }
  console.error(`\nThe page offers these as buttons, so the platform is promising an answer it has no`);
  console.error(`route to produce. They fall through to the generic path and get improvised.`);
  console.error(`\nEither add a branch to budzAnswer, or — if the data genuinely does not exist —`);
  console.error(`add the question to KNOWN_UNANSWERABLE in this file WITH THE REASON, so the gap`);
  console.error(`is visible instead of being answered anyway.\n`);
  process.exit(1);
}

console.log(`budz-questions: PASS — every pre-built question routes to a branch or is a declared gap.`);
