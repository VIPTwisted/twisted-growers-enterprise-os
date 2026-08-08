#!/usr/bin/env node
/* silent-failures.mjs — a failure that was recorded and never raised is still silent.
 *
 * ENFORCES Rule A3 in the one place A3 does not reach.
 *
 * WHY THIS EXISTS. Owner, 8 August 2026: the guards were "not catching Dump failed
 * silently or silent shit then bringing to agents attention to fix." He was right, and
 * the proof is in our own schema dump:
 *
 *     -- NOT CAPTURED: permission denied for schema cron
 *     -- The dumping role cannot read the cron schema...
 *     -- Absence recorded rather than left silent (rule A3).
 *
 * That comment is honest. It obeys A3 to the letter. And NOTHING READS IT. The dump has
 * been shipping incomplete — no cron schedules captured — since it was written, and the
 * file says so in plain English to an audience of nobody. Rule A3 makes a tool explain its
 * own gaps; it does not make anyone LOOK. This closes that.
 *
 * THE CLASS, stated generally, because it keeps recurring here:
 *   - a schema dump that could not read a schema and said so in a comment
 *   - documents with a fetch_error, sitting unretried
 *   - a check written and never wired (closed by all-checks-wired.mjs)
 *   - a column that can never populate (my own bug, 8 Aug, in v_pull_yield)
 *   - CI red for a day because nobody was watching the badge
 * None of these ERROR. Every one reads as a clean result.
 *
 * IT IS A RATCHET, NOT A CLIFF. Known failures are acknowledged in the baseline beside
 * this file, each with a reason. A NEW one fails the build. Removing one is free. That way
 * the existing 16 do not block work while a new silent failure cannot slip in unnoticed.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const BASELINE = join(here, "silent-failures.baseline.json");
const SELF = "tools/checks/silent-failures.mjs";

/* Only GENERATED artefacts. Source code says "failed" constantly and legitimately - it is
   handling errors, which is the opposite of this problem. These are outputs that are meant
   to be complete, where a recorded gap means the output is not what it claims to be. */
const SCAN = [
  { dir: "supabase/migrations", what: "the schema dump — an incomplete dump silently understates the database" },
  { dir: "docs/handoff",        what: "the handoff pack — the document a new agent trusts on day one" },
  { dir: "reports",             what: "generated reports" },
];

/* Each pattern is a machine or a person recording that something did not work. Deliberately
   NOT generic words like "error" or "failed" on their own: those appear in every error
   handler ever written, and a check that fires on prose gets switched off (8 Aug, twice). */
const MARKERS = [
  [/NOT CAPTURED/i,                          "an artefact recorded that part of it could not be captured"],
  [/permission denied for/i,                 "a permission failure was recorded in output"],
  [/could not be (read|captured|fetched|retrieved)/i, "content could not be obtained"],
  [/\bfailed to (parse|import|fetch|load)\b/i, "a processing step failed"],
  [/\b\d+ failed to parse\b/i,               "a count of parse failures"],
];

/* ---------------------------------------------------------------- collect --- */
function walk(dir, out = []) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  const stack = [abs];
  while (stack.length) {
    const d = stack.pop();
    let entries; try { entries = readdirSync(d); } catch { continue; }
    for (const e of entries) {
      const p = join(d, e);
      let s; try { s = statSync(p); } catch { continue; }
      if (s.isDirectory()) stack.push(p);
      /* Transcripts and session logs are RECORDS OF A CONVERSATION, not artefacts claiming
         to be complete. They discuss failures at length, correctly, and flagging that is
         the prose trap that bit twice on 8 Aug. A transcript that mentions a failure is
         doing its job; a schema dump that mentions one is admitting it is incomplete. */
      else if (/TRANSCRIPT|_LOG\.|CHANGELOG/i.test(e)) continue;
      else if (/\.(sql|md|json|csv|txt)$/i.test(e)) out.push(p);
    }
  }
  return out;
}

const found = [];
for (const target of SCAN) {
  for (const file of walk(target.dir)) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (rel === SELF) continue;
    let text; try { text = readFileSync(file, "utf8"); } catch { continue; }
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      /* Column definitions and CASE branches are the MACHINERY for reporting a failure,
         not a failure. `"fetch_error" text` is a column; `Could not be retrieved: ' || x`
         is the message template. Neither is an incident. */
      if (/^\s*"?\w+"?\s+(text|jsonb|integer|numeric|boolean|timestamp)/i.test(line)) return;
      if (/\|\||WHEN .* THEN|COALESCE\(|case when/i.test(line)) return;
      for (const [re, why] of MARKERS) {
        if (re.test(line)) {
          found.push({ file: rel, line: i + 1, why, text: line.trim().slice(0, 150), area: target.what });
          break;
        }
      }
    });
  }
}

/* --------------------------------------------------------------- baseline --- */
/* Migration dumps are TIMESTAMPED, so every regeneration produces a new filename and the
   same unfixed failure would look brand new. That would make the baseline useless within a
   day - and worse, it would train people to re-bless without reading, which is how a
   ratchet becomes a rubber stamp. The timestamp is collapsed so the key follows the
   FAILURE, not the file that happens to carry it. Proven the same day: a second dump was
   generated at 19:25 still carrying "NOT CAPTURED: permission denied for schema cron". */
const stableName = (p) =>
  p.replace(/(supabase\/migrations\/)\d{14}_/, "$1<timestamp>_");
const key = (f) => `${stableName(f.file)}:${f.text}`;
let baseline = { acknowledged: {} };
if (existsSync(BASELINE)) {
  try { baseline = JSON.parse(readFileSync(BASELINE, "utf8")); } catch { /* rebuilt below */ }
}

if (process.argv.includes("--bless")) {
  const ack = {};
  for (const f of found) ack[key(f)] = { reason: "Pre-existing on 8 Aug 2026. Not yet acted on.", area: f.area };
  writeFileSync(BASELINE, JSON.stringify({ acknowledged: ack }, null, 2) + "\n");
  console.log(`silent-failures: baseline written with ${found.length} acknowledged failure(s).`);
  process.exit(0);
}

const fresh = found.filter((f) => !baseline.acknowledged[key(f)]);
const known = found.length - fresh.length;

console.log(`silent-failures: scanned generated artefacts for recorded-but-unraised failures.`);
console.log(`silent-failures: ${found.length} found, ${known} already acknowledged in the baseline.\n`);

if (fresh.length) {
  console.error(`silent-failures: FAIL — ${fresh.length} NEW silent failure(s):\n`);
  for (const f of fresh) {
    console.error(`  ✗ ${f.file}:${f.line}`);
    console.error(`      ${f.why}`);
    console.error(`      ${f.text}`);
    console.error(`      This is in ${f.area}.`);
    console.error(`      It recorded its own failure and told nobody. Either fix the underlying`);
    console.error(`      problem, or acknowledge it in silent-failures.baseline.json with a reason.\n`);
  }
  console.error("A failure that is recorded and never raised is still a silent failure.");
  console.error("Rule A3 makes a tool explain its gaps. It does not make anyone look.\n");
  process.exit(1);
}

console.log(`silent-failures: PASS — no new silent failure. ${known} known and acknowledged.`);
