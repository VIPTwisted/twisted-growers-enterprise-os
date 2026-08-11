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
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * SECOND SECTION, ADDED 11 AUG 2026 BY AGENT W. THE READ SITES.
 *
 * The charter and brain/AGENT_BRIEFING.md have said since 8 Aug that "129 read sites
 * swallow errors as `?? []`". Agent B measured 263 on 11 Aug and the number was reported
 * as having doubled under a gate called silent-failures.
 *
 * IT HAD NOT DOUBLED, AND THE GATE WAS NOT STALE. THIS CHECK HAD NEVER COUNTED THEM.
 *
 * Everything above scans GENERATED ARTEFACTS — supabase/migrations, docs/handoff, reports
 * — for the words a machine writes when it could not finish. It has never opened a single
 * front-end file. The 129 in the documents came from a one-off manual count on 8 Aug and
 * nothing has ever re-derived it. A figure quoted in three governing documents, with no
 * check behind it, drifting for three days: that is the same class this file exists for,
 * one level up. The gate was not failing. It was pointed somewhere else, and its NAME
 * made everybody think otherwise.
 *
 * The 263 and the 129 are also not the same measurement. Counted 11 Aug 2026:
 *
 *     263  occurrences of `?? []`      (`grep -o`, several lines carry two)
 *     233  LINES containing `?? []`    (`grep -c`)
 *     129  the 8 Aug manual count, never re-derived, now retired
 *
 * Neither of those is the number that costs anything. `(rows ?? []).map(...)` on an array
 * that is already in hand is harmless and there are dozens of them. The dangerous shape is
 * a SUPABASE RESPONSE destructured without binding `error`:
 *
 *     117  supabase reads that bind `data` and NOT `error`   ← the one that hurts
 *     142  supabase reads that bind `data` at all
 *      25  that bind `error` too, and are therefore correct
 *
 * ForensicAuditLedger, App.jsx:9097, is the exemplar and it is three lines:
 *
 *     supabase.from("v_forensic_audit_panel").select("*").order("ord")
 *       .then(({ data }) => setRows(data ?? []));
 *     if (!rows || !rows.length) return null;
 *
 * A permission denial, a dropped view and a statement timeout all produce data === null,
 * which becomes [], which returns null, which removes the entire section from the Command
 * Center with no message and no trace in the DOM. The page then looks deliberately
 * designed without a ledger. `error` is never bound, so nothing anywhere can know.
 *
 * BrainFiles, App.jsx:4996, is the correct shape in the same file: it binds `error`, keeps
 * loading, error and genuinely-empty as three separate states, and its `?? []` sits on the
 * ELSE branch of an explicit error check — where it can only ever mean "the query
 * succeeded and returned nothing".
 *
 * Both numbers are ratcheted. They may fall and may never rise.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const BASELINE = join(here, "silent-failures.baseline.json");
const SELF = "tools/checks/silent-failures.mjs";
const SRC = join(ROOT, "app", "web", "src");

/* Only GENERATED artefacts. Source code says "failed" constantly and legitimately - it is
   handling errors, which is the opposite of this problem. These are outputs that are meant
   to be complete, where a recorded gap means the output is not what it claims to be. */
const SCAN = [
  { dir: "supabase/migrations", what: "the schema dump — an incomplete dump silently understates the database",
    /* NARROWED 11 Aug 2026 by Agent W, after this check refused a correct migration.
     *
     * This entry says "the schema dump", and when it was written that is all the folder
     * held. It now holds HAND-WRITTEN migrations too, each carrying the explanatory
     * paragraph the charter requires. One of them —
     * 20260811161014_watchdog_migration_history_visible.sql — exists precisely to FIX
     * `permission denied for schema supabase_migrations`, and quotes that error in its
     * own comment to say what it is fixing. The check read the sentence describing the
     * cure as a report of the disease.
     *
     * That is the prose trap this file's own header warns about, twice, in capitals: a
     * check that fires on prose gets switched off, and it happened twice on 8 Aug. The
     * guard was wrong here and I was right, so the guard is narrowed — by exactly the
     * width of the phantom and no more.
     *
     * The scope that was always MEANT is the generated dump, which dump-schema.mjs
     * writes as <timestamp>_baseline_live_schema.sql and which is the subject of the
     * only migrations entry in the baseline. It is still scanned in full, so
     * "NOT CAPTURED: permission denied for schema cron" is still caught.
     *
     * A hand-written migration that genuinely fails silently is not lost either: it
     * would fail as a migration, and migration-drift.mjs now compares the folder against
     * what production actually ran. */
    only: /_baseline_live_schema\.sql$/ },
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

/* ═══════════════════════════════════ THE READ SITES ═════════════════════════════
 * See the second section of the header. Detectors take text and return findings, so
 * the fixtures below can exercise every branch without a front end being present.
 */

/** Every occurrence of `?? []`, the figure the governing documents quote. */
export function swallowOccurrences(text) {
  return [...text.matchAll(/\?\?\s*\[\s*\]/g)].length;
}

/**
 * A supabase response destructured WITHOUT binding `error`.
 *
 * Two shapes, because the front end uses both:
 *     const { data } = await supabase...        (and let / var)
 *     .then(({ data }) => ...)
 *
 * Anchored to supabase on purpose. `const { data } = props` is not a database read and
 * flagging it would be a wrong label — the check has to stay quiet on ordinary
 * destructuring or nobody will keep it switched on.
 */
export function unguardedReads(text) {
  const DESTR =
    /(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*await\s+([\s\S]{0,80}?)[;\n]|\.then\(\s*(?:async\s*)?\(?\s*\{([^{}]*)\}\s*\)?\s*=>/g;
  const out = [];
  for (const m of text.matchAll(DESTR)) {
    const binds = m[1] ?? m[3] ?? "";
    if (!/\bdata\b/.test(binds)) continue;
    /* The call and the destructure are usually on the same line but not always — a
       chained .select().eq().order() runs to several. A window either side catches the
       chain without reaching into an unrelated neighbouring function. */
    const near = text.slice(Math.max(0, m.index - 260), m.index + 300);
    if (!/supabase|\.rpc\(|\.from\(/.test(near)) continue;
    const guarded = /\berror\b/.test(binds);
    out.push({ line: text.slice(0, m.index).split("\n").length, guarded,
               binds: binds.replace(/\s+/g, " ").trim().slice(0, 46) });
  }
  return out;
}

/** Is this path in scope for the generated-artefact scan? Extracted so it can be tested. */
export function inArtefactScope(rel) {
  const t = SCAN.find((s) => rel.startsWith(`${s.dir}/`));
  if (!t) return false;
  return !t.only || t.only.test(rel);
}

function readSiteSelfTest() {
  const cases = [];
  const add = (why, fn) => cases.push({ why, fn });

  /* ── the 11 Aug narrowing, both halves ──────────────────────────────────── */
  add("POSITIVE scope — the generated dump is still fully scanned, so the 'NOT CAPTURED: "
    + "permission denied for schema cron' entry the baseline acknowledges is still found", () =>
    inArtefactScope("supabase/migrations/20260811160031_baseline_live_schema.sql") === true);

  add("NEGATIVE scope — a HAND-WRITTEN migration is not a generated artefact. This one "
    + "exists to FIX 'permission denied for schema supabase_migrations' and quotes the "
    + "error to say so; reading the cure as the disease is the prose trap that switched "
    + "two guards off on 8 Aug", () =>
    inArtefactScope("supabase/migrations/20260811161014_watchdog_migration_history_visible.sql")
      === false);

  add("NEGATIVE scope — the narrowing applies to migrations ONLY. The handoff pack and "
    + "generated reports are unchanged, or this would have loosened more than the "
    + "phantom required", () =>
    inArtefactScope("docs/handoff/DATA_INTEGRITY_2026-08-06.md") === true
    && inArtefactScope("reports/anything.md") === true);

  add("POSITIVE — ForensicAuditLedger, App.jsx:9101 verbatim. The exemplar: `error` is "
    + "never bound, so a dropped view and an empty table are the same value", () => {
    const r = unguardedReads('supabase.from("v_forensic_audit_panel").select("*").order("ord")\n'
      + "  .then(({ data }) => setRows(data ?? []));");
    return r.length === 1 && r[0].guarded === false;
  });

  add("NEGATIVE — BrainFiles, App.jsx:5012 verbatim. Binds `error`, so its `?? []` can "
    + "only mean the query succeeded and returned nothing", () => {
    const r = unguardedReads('const { data, error } = await supabase.from("document_search")\n'
      + '  .select("doc_type").limit(200);');
    return r.length === 1 && r[0].guarded === true;
  });

  add("NEGATIVE — destructuring props is not a database read. This is the false positive "
    + "that would fire on hundreds of ordinary React lines", () =>
    unguardedReads("const { data } = props;").length === 0);

  add("NEGATIVE — a fetch to something that is not supabase is not this rule's business", () =>
    unguardedReads('const { data } = await fetch(u).then((r) => r.json());').length === 0);

  add("POSITIVE — the await form as well as the .then form. Missing one of the two would "
    + "have understated the count by roughly half", () => {
    const r = unguardedReads('const { data } = await supabase.rpc("f_thing", { p: 1 });');
    return r.length === 1 && r[0].guarded === false;
  });

  add("NEGATIVE — a response that binds ONLY error is not an unguarded read", () =>
    unguardedReads('const { error } = await supabase.from("t").insert(row);').length === 0);

  add("POSITIVE — `?? []` is counted per OCCURRENCE, which is why 263 and 233 are both "
    + "true of the same file: two on one line is two", () =>
    swallowOccurrences("const a = (x ?? []).concat(y ?? []);") === 2);

  add("NEGATIVE — `?? {}` and `?? 0` are different defaults and are not this count", () =>
    swallowOccurrences("const a = x ?? {}; const b = y ?? 0;") === 0);

  const bad = [];
  for (const c of cases) {
    let ok;
    try { ok = c.fn(); } catch (e) { bad.push({ why: c.why, got: `threw: ${e.message}` }); continue; }
    if (!ok) bad.push({ why: c.why, got: "wrong verdict" });
  }
  if (bad.length) {
    console.error("silent-failures: FAIL — the read-site detector is broken:\n");
    for (const b of bad) console.error(`  x ${b.why}\n      ${b.got}`);
    console.error("\nNothing was reported. Every count below would be unreliable.\n");
    process.exit(1);
  }
  const neg = cases.filter((c) => c.why.startsWith("NEGATIVE")).length;
  console.log(`silent-failures: read-site detector self-test PASSED (${cases.length} cases, `
            + `${neg} of them negative).`);
}

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
    if (target.only && !target.only.test(rel)) continue;
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

/* ── measure the read sites before --bless, so blessing records both sections ── */
readSiteSelfTest();

function jsxFiles() {
  const out = [];
  if (!existsSync(SRC)) return out;
  const stack = [SRC];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) stack.push(p);
      else if (/\.(jsx|js)$/.test(e)) out.push(p);
    }
  }
  return out.sort();
}

const uiFiles = jsxFiles();
let swallows = 0;
const unguarded = [];
let guardedReads = 0;
for (const abs of uiFiles) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  const text = readFileSync(abs, "utf8");
  swallows += swallowOccurrences(text);
  for (const r of unguardedReads(text)) {
    if (r.guarded) guardedReads++;
    else unguarded.push({ rel, ...r });
  }
}
const readSites = { swallowOccurrences: swallows, unguardedSupabaseReads: unguarded.length };

if (process.argv.includes("--bless")) {
  const ack = {};
  for (const f of found) ack[key(f)] = { reason: "Pre-existing on 8 Aug 2026. Not yet acted on.", area: f.area };
  writeFileSync(BASELINE, JSON.stringify({
    ...baseline, acknowledged: ack, read_sites: { ...(baseline.read_sites ?? {}), limits: readSites },
  }, null, 2) + "\n");
  console.log(`silent-failures: baseline written with ${found.length} acknowledged failure(s) `
            + `and read-site limits ${JSON.stringify(readSites)}.`);
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

console.log(`silent-failures: ok      — no new silent failure in generated artefacts. `
          + `${known} known and acknowledged.`);

/* ═══════════════════════════════════ the read-site ratchet ═════════════════════ */
if (uiFiles.length === 0) {
  console.error("\nsilent-failures: FAIL — no front-end source found under app/web/src.");
  console.error("      The read-site section would count zero and read as a perfect score");
  console.error("      forever. A guard that silently scans nothing is the thing this file");
  console.error("      exists to catch.\n");
  process.exit(1);
}

const rsLimits = baseline.read_sites?.limits ?? { swallowOccurrences: 0, unguardedSupabaseReads: 0 };
let rsFailed = false;

console.log(`\nsilent-failures: ${uiFiles.length} front-end file(s) scanned. `
          + `${readSites.unguardedSupabaseReads} of `
          + `${readSites.unguardedSupabaseReads + guardedReads} supabase reads bind no error.`);

for (const [k, label, why] of [
  ["unguardedSupabaseReads",
   "supabase reads that bind `data` and not `error`",
   ["This is the shape that costs. A permission denial, a dropped view and a statement",
    "timeout all arrive as data === null, become [], and render as an empty section with",
    "no message — ForensicAuditLedger at App.jsx:9097 disappears from the Command Center",
    "entirely. Copy BrainFiles at App.jsx:4996: bind `error`, and keep loading, error and",
    "genuinely-empty as three separate states the user can tell apart."]],
  ["swallowOccurrences",
   "occurrences of `?? []` in the front end",
   ["The headline figure the governing documents quote. Most are harmless — `(rows ?? [])`",
    "on an array already in hand — which is why the unguarded-reads count above is the one",
    "to work on first. This one exists so the documents can never drift from the source",
    "again, which is exactly how 129 survived for three days while the truth was 263."]],
]) {
  const now = readSites[k], limit = rsLimits[k] ?? 0;
  if (now > limit) {
    rsFailed = true;
    console.error(`\nsilent-failures: FAIL — ${now} ${label} (limit ${limit}).`);
    if (k === "unguardedSupabaseReads") {
      for (const u of unguarded.slice(0, 15)) console.error(`    x ${u.rel}:${u.line}  { ${u.binds} }`);
      if (unguarded.length > 15) console.error(`    ... and ${unguarded.length - 15} more.`);
    }
    console.error("");
    for (const l of why) console.error(`    ${l}`);
  } else if (now < limit) {
    console.log(`silent-failures: TIGHTEN  — ${k} is ${now}, recorded limit ${limit}.`);
    console.log("    Lower it: node tools/checks/silent-failures.mjs --bless");
  } else {
    console.log(`silent-failures: ok      — ${now} ${label}, at the recorded limit.`);
  }
}

if (rsFailed) {
  console.error("\nsilent-failures: FAIL\n");
  process.exit(1);
}
console.log("\nsilent-failures: PASS — artefacts clean, read sites at or below their limits.");
