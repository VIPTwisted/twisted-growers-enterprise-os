#!/usr/bin/env node
/* report-contract.mjs — the pages are governed. The REPORTS are governed by nothing.
 *
 * THE HOLE, measured 11 Aug 2026.
 *
 * Pages have five gates: page-architecture, tile-drills, theme-lock, ui-language and
 * no-fabricated-data. Reports had none. Six rules about reports exist in prose, are
 * repeated in every charter, and are enforced by nobody:
 *
 *   L6   "a report that cannot be pulled by date range is not finished"
 *   §7   "Filters are DATA, never JSX. A hard-coded filter list means every new
 *         filter is a code change... so it never happens."
 *   C3a  every item row carries its certificate and its manifest, openable from the
 *        row, and where absent states WHICH reason -- never a blank, never a dash
 *   C1   a tile or total without a drill-down is not finished
 *   I4   reports live in the Reports dropdown, not as side-menu items
 *   J7   a room is never shown without its department: display room_qualified
 *
 * WHAT A "REPORT" IS HERE, decided on evidence rather than preference.
 *
 * The obvious answer -- nav_registry rows with surface='reports' -- is wrong, and
 * measurably so. App.jsx:346 builds the Reports dropdown from
 *
 *     shown.filter((r) => (r.surface ?? "side") === "reports" || r.report_group)
 *
 * so surface='reports' (53 rows) is only part of it; 329 rows reach the dropdown
 * through report_group instead. Meanwhile nav_registry.page_kind carries an explicit
 * 'report' value on 615 enabled rows, and ReportScreen at App.jsx:1963 is documented in
 * its own comment as "Every one of the 518 report pages is this."
 *
 * So: a report is a nav_registry row with page_kind='report'. That is the database's own
 * declaration of what the thing is, it is what the renderer acts on, and it does not
 * change when somebody moves a menu. Confirmed against the schema: nav_registry.page_kind
 * defaults to 'report' and the surface column is a separate CHECK-constrained enum of
 * seven menus.
 *
 * TWO HALVES, DELIBERATELY.
 *
 *   REPO half   -- §7, C3a and J7 are facts about the source. They run everywhere,
 *                  including the Netlify build, and never degrade.
 *   DATABASE half -- L6 and I4 are facts about nav_registry. No connection, no verdict:
 *                  PASS (DEGRADED), on the pattern netlify.toml already documents for
 *                  schema-baseline, docs-vs-database and page-architecture.
 *
 * A gate that is DEGRADED everywhere is not a gate, so the repo half was chosen to be
 * the half that can always run. Netlify gets real enforcement on three of the six rules
 * rather than a green tick on none of them.
 *
 * IT IS A RATCHET, AND IT IS RED-SHAPED ON ARRIVAL.
 *
 * Every one of these counts is above zero today. Failing on all of them would turn the
 * build red for every agent on debt none of them created, and a switched-off gate is
 * worse than none. The repo counts are recorded beside this file; the database counts
 * are recorded in ratchet_baseline, where tg_ratchet_guard already refuses to let a
 * baseline rise. Both may fall and may never rise.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK, so the omissions are arguable rather than hidden:
 *
 *   - C1 tile drills. tile-drills.mjs already owns that rule and passes. Two gates on
 *     one rule means two places to disagree.
 *   - "516 of 629 pages have no document key" from v_page_drilldown_coverage. C3a is a
 *     rule about ITEM rows, and most of those 516 are settings and registry pages where
 *     a certificate is meaningless. Gating it would raise 400-odd wrong labels, and
 *     there are already 179 critical alerts queued unread. It needs a definition of
 *     "item row" in the registry before it can be enforced without crying wolf.
 *
 *   node tools/checks/report-contract.mjs
 *   node tools/checks/report-contract.mjs --selftest   (fixtures only, no database)
 *   node tools/checks/report-contract.mjs --bless      (rewrite the repo-side ratchet)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const SRC = join(ROOT, "app", "web", "src");
const BASELINE_FILE = join(here, "report-contract.baseline.json");

/* The four reasons, quoted from CLAUDE.md lines 351-354. Not paraphrased: the whole
   point of C3a is that the user is told WHICH of the four applies, and "no manifest —
   packaged here and never transferred, or not yet synced" (App.jsx:1744, the nearest
   thing that exists) collapses two of them into an ambiguity. Matched on a distinctive
   fragment rather than the whole sentence so a {date} placeholder or a trailing full
   stop does not defeat it -- the gate must not reward a near-miss, and must not punish
   correct text for its punctuation. */
const C3A_REASONS = [
  { key: "never_submitted", needle: /never submitted for testing/i,
    canonical: '"Never submitted for testing" — no certificate exists to link.' },
  { key: "out_for_testing", needle: /out for testing since/i,
    canonical: '"Out for testing since {date}" — result not returned yet.' },
  { key: "not_yet_fetched", needle: /certificate not yet fetched from metrc/i,
    canonical: '"Certificate not yet fetched from Metrc" — it exists; our copy is missing.' },
  /* The comma is load-bearing and is not pedantry. "packaged here, never transferred"
     is the contract; "packaged here AND never transferred, OR not yet synced" is what
     App.jsx:1744 actually says, and that sentence merges two of the four reasons so the
     reader learns nothing. A looser needle passed the paraphrase, which would have let
     the gate certify the exact defect it exists to find. */
  { key: "no_manifest", needle: /no manifest[^.]{0,12}packaged here,\s*never transferred/i,
    canonical: '"No manifest — packaged here, never transferred."' },
];

/* The one accessor CLAUDE.md names, plus the one the front end actually calls today. */
const DOC_ACCESSOR = /f_(?:item|package)_documents/;

/* ════════════════════════════════════════════════════ pure detectors ═══════════
 * Every detector takes source text and returns findings. Nothing here touches the
 * filesystem or the database, so the fixtures can exercise all of it.
 */

/**
 * COMMENTS ARE NOT CODE — and this gate learned it the same way the SQL guard did.
 *
 * The first run reported "1 of 4 C3a reasons present" and passed the document-accessor
 * rule with zero violations. The reason it found was App.jsx:9243:
 *
 *     rendered "Never submitted for testing +4.1" as a green rising line —
 *
 * which is a COMMENT describing a 2026 sparkline bug. Nothing in this front end can
 * render that sentence to a user. The gate had certified the exact defect it was written
 * to find, on the strength of a paragraph explaining a different defect entirely.
 *
 * That is the third time this class has bitten this repository: guard-sql.mjs paired a
 * `drop view` on line 12 with the word cascade in a comment on line 3, and ci.yml held
 * the Gates workflow red for a day on three comments that merely DESCRIBED the anon rule.
 * Every migration and every check here carries a paragraph explaining itself, because the
 * charter demands it — so a detector that reads those paragraphs as code punishes exactly
 * the behaviour the charter asks for.
 *
 * Strings are preserved, because a string IS renderable text and is the thing being
 * looked for. The scanner tracks quotes so that a `//` inside "https://..." is not read
 * as the start of a comment.
 */
export function stripComments(text) {
  let out = "";
  let i = 0;
  let quote = null;          // ' " ` or null
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (quote) {
      if (c === "\\") { out += c + (n ?? ""); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && n === "*") {
      const end = text.indexOf("*/", i + 2);
      const skipped = text.slice(i, end === -1 ? text.length : end + 2);
      /* Newlines are kept so every line number after a block comment stays true. A gate
         that reports the wrong line is a gate somebody stops opening. */
      out += skipped.replace(/[^\n]/g, " ");
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (c === "/" && n === "/") {
      const end = text.indexOf("\n", i);
      out += " ".repeat((end === -1 ? text.length : end) - i);
      i = end === -1 ? text.length : end;
      continue;
    }
    out += c; i++;
  }
  return out;
}

/** §7 — a list of column or filter names frozen into the source. */
export function hardcodedColumnLists(text) {
  const ARRAY_OF_STRINGS =
    /\[\s*((?:"[^"]*"|'[^']*')\s*(?:,\s*(?:"[^"]*"|'[^']*')\s*)*),?\s*\]/g;
  const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
  const IDENT = /^[a-z][a-z0-9_]*$/;
  const out = [];
  for (const m of text.matchAll(ARRAY_OF_STRINGS)) {
    const items = [...m[1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((x) => x[1] ?? x[2]);
    /* Four is the floor. Below it a literal is a small enum in the UI's own logic
       ("asc"/"desc"), not a filter LIST somebody has to redeploy to extend. */
    if (items.length < 4) continue;
    const idents = items.filter((s) => IDENT.test(s)).length;
    const snakes = items.filter((s) => SNAKE.test(s)).length;
    /* Both conditions matter. All-identifiers alone catches enums of UI states;
       requiring two snake_case members is what makes it a list of DATABASE COLUMNS,
       which is the thing §7 is about. */
    if (idents / items.length < 0.8 || snakes < 2) continue;
    out.push({ line: text.slice(0, m.index).split("\n").length, n: items.length,
               head: items.slice(0, 4).join(", ") });
  }
  return out;
}

/** J7 — a room SHOWN to a user without its department. */
export function bareRoomRenders(text) {
  const out = [];
  const BARE = /\.room\b(?![_a-zA-Z0-9])/;
  /* A COMPARISON is not a render. `room === r.room` decides which button is highlighted;
     nobody reads it. Flagging it would be a wrong label on correct code, and the whole
     reason this gate can be trusted is that it does not do that. */
  const COMPARISON = /[=!]==?|<=|>=/;

  /* TWO PATTERNS, ONE FINDING PER SITE.
     A template interpolation `${r.room}` contains a brace expression `{r.room}`, so both
     patterns fire on the same characters. The first measurement read 30 where the truth
     is 15 — every site counted twice — and a gate that doubles its own numbers is a gate
     whose numbers get argued with instead of fixed. Spans claimed by the first pass are
     therefore excluded from the second, rather than deduplicated after the fact: two
     genuinely different sites on one line stay two findings. */
  const claimed = [];
  const push = (index, snippet) => {
    out.push({ line: text.slice(0, index).split("\n").length,
               snippet: snippet.replace(/\s+/g, " ").slice(0, 90) });
  };

  for (const m of text.matchAll(/\$\{[^{}]*\}/g)) {
    claimed.push([m.index, m.index + m[0].length]);
    if (!BARE.test(m[0]) || COMPARISON.test(m[0])) continue;
    push(m.index, m[0]);
  }
  const inside = (i) => claimed.some(([a, b]) => i >= a && i < b);

  for (const m of text.matchAll(/\{\s*[a-zA-Z_$][\w$.?\s|'"-]*\.room\b(?![_a-zA-Z0-9])[^{}]*\}/g)) {
    if (COMPARISON.test(m[0]) || inside(m.index)) continue;
    /* A React `key` is not shown to anybody. App.jsx:3755 reads
       `<button key={r.room + r.growth_phase}>` and the same element renders
       `<span className="hrname">{r.room}</span>` two lines below — the SPAN is the J7
       violation and the key is not. Counting both makes one defect look like two and
       sends whoever fixes it hunting for a second site that does not exist. */
    if (/\bkey\s*=\s*$/.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
    push(m.index, m[0]);
  }
  return out;
}

/** C3a — which of the four canonical reasons the source can produce at all. */
export function c3aReasonsPresent(text) {
  return C3A_REASONS.filter((r) => r.needle.test(text)).map((r) => r.key);
}

/**
 * C3a — a document accessor called in a file that can state none of the four reasons.
 * File-grained on purpose: reason strings and the fetch commonly sit in sibling
 * functions, and a line-grained rule would flag correct code for its layout.
 */
export function documentSitesWithoutAReason(text) {
  if (!DOC_ACCESSOR.test(text)) return 0;
  return c3aReasonsPresent(text).length === 0 ? 1 : 0;
}

/* ══════════════════════════════════════════════════════════ fixtures ═══════════
 * BOTH HALVES for every rule. The negative half is the one that earns the gate its
 * life: all six defects in the 9 Aug register were a check firing on something
 * legitimate, and a check that cries wolf gets ignored, and then it is not a check.
 */
function selfTest() {
  const cases = [];
  const add = (why, fn) => cases.push({ why, fn });

  /* ── §7 ─────────────────────────────────────────────────────────────────── */
  add("POSITIVE §7 — DIM_COLS, the real one at App.jsx:2589: a filter list in JSX", () =>
    hardcodedColumnLists(
      'const DIM_COLS = ["stock_status", "origin", "stream", "category", "status", "lab_state"];',
    ).length === 1);

  add("NEGATIVE §7 — a two-value UI enum is not a filter list", () =>
    hardcodedColumnLists('const DIRS = ["asc", "desc"];').length === 0);

  add("NEGATIVE §7 — four plain English labels are not column names", () =>
    hardcodedColumnLists('const L = ["Today", "Yesterday", "This week", "All dates"];').length === 0);

  add("NEGATIVE §7 — four single-word UI states, no snake_case: the engine's own vocabulary, "
    + "not a list of database columns", () =>
    hardcodedColumnLists('const OPS = ["eq", "neq", "gt", "lt"];').length === 0);

  add("POSITIVE §7 — operator keys DO carry snake_case and ARE flagged; recorded rather "
    + "than tuned away, and exempted in the baseline with a reason", () =>
    hardcodedColumnLists('["is_null", "not_null", "is_true", "is_false"]').length === 1);

  /* ── J7 ─────────────────────────────────────────────────────────────────── */
  add("POSITIVE J7 — a room shown in a label with no department", () =>
    bareRoomRenders("const s = `${r.strain} · ${r.room}`;").length === 1);

  add("NEGATIVE J7 — room_qualified is the correct form and must never be flagged", () =>
    bareRoomRenders("const s = `${r.strain} · ${r.room_qualified}`;").length === 0);

  add("NEGATIVE J7 — a COMPARISON is not a render. This is the false positive that would "
    + "have flagged App.jsx:3755, which is correct code deciding a button state", () =>
    bareRoomRenders('const cls = `${room === r.room ? "on" : ""}`;').length === 0);

  add("NEGATIVE J7 — room_type, room_id and room_cycle_flag are different columns and "
    + "carry no department claim", () =>
    bareRoomRenders("const s = `${r.room_type} ${r.room_id} ${r.room_cycle_flag}`;").length === 0);

  add("NEGATIVE J7 — the same site found by both patterns is ONE finding, not two. "
    + "Double counting inflated the first measurement from 15 to 30", () =>
    bareRoomRenders("const s = `${r.room}`;").length === 1);

  /* ── C3a ────────────────────────────────────────────────────────────────── */
  add("POSITIVE C3a — a document fetch that can state none of the four reasons: "
    + "App.jsx:1050 DocumentChips renders a bare dash", () =>
    documentSitesWithoutAReason(
      'const r = await supabase.rpc("f_package_documents", { p_tag: t });\n'
      + 'if (!d) return <span className="note">—</span>;') === 1);

  add("NEGATIVE C3a — the same fetch WITH a canonical reason must stay quiet", () =>
    documentSitesWithoutAReason(
      'const r = await supabase.rpc("f_package_documents", { p_tag: t });\n'
      + 'if (!d.coa.length) return <span>Never submitted for testing</span>;') === 0);

  add("NEGATIVE C3a — a file that fetches no documents is not judged on document text", () =>
    documentSitesWithoutAReason('const r = await supabase.from("employees").select("*");') === 0);

  add("POSITIVE C3a — the paraphrase at App.jsx:1744 is NOT the contract string. It reads "
    + '"packaged here and never transferred, or not yet synced", which is two of the four '
    + "reasons at once, so the user is told nothing", () =>
    c3aReasonsPresent("No manifest — packaged here and never transferred, or not yet synced.")
      .includes("no_manifest") === false);

  add("NEGATIVE C3a — the contract string itself must be recognised", () =>
    c3aReasonsPresent("No manifest — packaged here, never transferred.")
      .includes("no_manifest") === true);

  add("NEGATIVE C3a — the {date} placeholder must not defeat the match", () =>
    c3aReasonsPresent("Out for testing since 3 Aug 2026").includes("out_for_testing") === true);

  /* ── comments are not code ─────────────────────────────────────────────── */
  add("POSITIVE strip — a canonical reason inside a // comment must NOT count as present. "
    + "This is the real App.jsx:9243, a note about a 2026 sparkline bug, and it made the "
    + "first run of this gate certify the defect it exists to find", () =>
    c3aReasonsPresent(stripComments(
      '  /* rendered "Never submitted for testing +4.1" as a green rising line */\n'
      + 'const x = 1;')).length === 0);

  add("POSITIVE strip — a block comment naming a column list must not be read as one", () =>
    hardcodedColumnLists(stripComments(
      '/* the old list was ["stock_status","origin","lab_state","coa_status"] */')).length === 0);

  add("NEGATIVE strip — a // inside a string is not a comment. Stripping through a URL "
    + "would silently delete real renderable text after it", () =>
    stripComments('const u = "https://example.com/x"; const s = `${r.room}`;')
      .includes("${r.room}") === true);

  add("NEGATIVE strip — line numbers after a block comment stay true, or every finding "
    + "points at the wrong line and nobody opens the file again", () =>
    stripComments("/* a\nb\nc */\n`${r.room}`").split("\n").length === 4);

  add("NEGATIVE strip — a canonical reason in a real string still counts", () =>
    c3aReasonsPresent(stripComments(
      'return <span>Certificate not yet fetched from Metrc</span>;')).length === 1);

  /* ── key= is not a render ──────────────────────────────────────────────── */
  add("NEGATIVE J7 — a React key is not shown to anybody. App.jsx:3755 keys a button on "
    + "r.room and renders the violation two lines below; counting both makes one defect "
    + "look like two", () =>
    bareRoomRenders("<button key={r.room + r.growth_phase} className=\"x\">").length === 0);

  add("POSITIVE J7 — the SPAN two lines below the key IS the violation", () =>
    bareRoomRenders('<span className="hrname">{r.room}</span>').length === 1);

  const bad = [];
  for (const c of cases) {
    let ok;
    try { ok = c.fn(); } catch (e) { bad.push({ why: c.why, got: `threw: ${e.message}` }); continue; }
    if (!ok) bad.push({ why: c.why, got: "wrong verdict" });
  }
  if (bad.length) {
    console.error("report-contract: FAIL — the detectors are broken:\n");
    for (const b of bad) console.error(`  x ${b.why}\n      ${b.got}`);
    console.error("\nNothing was reported. Every count below would be unreliable.\n");
    process.exit(1);
  }
  const neg = cases.filter((c) => c.why.startsWith("NEGATIVE")).length;
  console.log(`report-contract: detector self-test PASSED (${cases.length} cases, ${neg} of them `
            + "negative — the half that stops a wrong label).");
}

selfTest();
if (process.argv.includes("--selftest")) process.exit(0);

/* ═══════════════════════════════════════════════════════ the repo half ═══════ */
function sources() {
  const out = [];
  const stack = [SRC];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) stack.push(p);
      else if (/\.jsx$/.test(e)) out.push(p);
    }
  }
  return out.sort();
}

if (!existsSync(SRC)) {
  console.error("report-contract: FAIL — app/web/src is missing. A gate that scans nothing");
  console.error("      proves nothing, and would read as a pass forever.\n");
  process.exit(1);
}

const files = sources();
if (files.length === 0) {
  console.error("report-contract: FAIL — no .jsx files found under app/web/src.");
  console.error("      That is implausible and means the scan has stopped matching.\n");
  process.exit(1);
}

const filterLists = [];
const roomRenders = [];
let docSitesWithoutReason = 0;
const reasonsAnywhere = new Set();

for (const abs of files) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  /* Comments stripped before ANY detector runs. See stripComments: reading a paragraph
     that explains a bug as though it were the bug produced a vacuous pass on the first
     run of this gate. */
  const text = stripComments(readFileSync(abs, "utf8"));
  for (const h of hardcodedColumnLists(text)) filterLists.push({ rel, ...h });
  for (const h of bareRoomRenders(text)) roomRenders.push({ rel, ...h });
  docSitesWithoutReason += documentSitesWithoutAReason(text);
  for (const k of c3aReasonsPresent(text)) reasonsAnywhere.add(k);
}
const reasonsMissing = C3A_REASONS.filter((r) => !reasonsAnywhere.has(r.key));

const measuredRepo = {
  hardcodedFilterLists: filterLists.length,
  bareRoomRenders: roomRenders.length,
  documentSitesWithNoReason: docSitesWithoutReason,
  c3aReasonsMissing: reasonsMissing.length,
};

/* ═══════════════════════════════════════════════════ the database half ═══════ */
async function fromDatabase() {
  let conn = process.env.PGURL || null;
  if (!conn && existsSync(join(ROOT, ".mcp.json"))) {
    try {
      const url = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"))
        ?.mcpServers?.["twisted-growers"]?.args?.[0];
      if (url) conn = url.replace(/sslmode=[a-z-]+/, "uselibpqcompat=true&sslmode=require");
    } catch { /* fall through to degraded */ }
  }
  if (!conn) return { rows: null, why: "no connection string (no PGURL, no .mcp.json)" };

  let pg;
  try { pg = (await import("pg")).default; }
  catch { return { rows: null, why: "the pg driver is not installed here" }; }

  const client = new pg.Client({
    connectionString: conn, ssl: { rejectUnauthorized: false }, statement_timeout: 30000,
  });
  try {
    await client.connect();
    /* Two round trips rather than one join: the measurements and the limits are
       separate facts and mixing them in one query makes a stale baseline look like a
       measurement. */
    const { rows: [m] } = await client.query(`
      select
        (select count(*) from v_report_standard
          where standard like 'DEFECT%')::int                                as date_defect,
        (select count(*) from v_report_standard
          where standard like 'FAILS - nobody%')::int                        as nobody_can_open,
        (select count(*) from nav_registry
          where enabled and page_kind = 'report'
            and surface = 'side' and report_group is null)::int              as outside_reports_menu,
        (select count(*) from nav_registry
          where enabled and page_kind = 'report')::int                       as reports_total`);
    const { rows: limits } = await client.query(
      "select metric_key, baseline from ratchet_baseline where metric_key like 'report_%'");
    return { rows: m, limits: Object.fromEntries(limits.map((l) => [l.metric_key, l.baseline])),
             why: null };
  } catch (e) {
    return { rows: null, why: e.message.trim() };
  } finally {
    await client.end().catch(() => {});
  }
}

/* ═══════════════════════════════════════════════════════════ the ratchet ═════ */
let repoLimits = { hardcodedFilterLists: 0, bareRoomRenders: 0,
                   documentSitesWithNoReason: 0, c3aReasonsMissing: 0 };
if (existsSync(BASELINE_FILE)) {
  try { repoLimits = { ...repoLimits, ...JSON.parse(readFileSync(BASELINE_FILE, "utf8")).limits }; }
  catch { /* the strict defaults stand, so a corrupt file cannot loosen anything */ }
}

if (process.argv.includes("--bless")) {
  writeFileSync(BASELINE_FILE, JSON.stringify({
    _what_this_is:
      "Report-contract debt in the SOURCE, recorded 11 Aug 2026. Each number may fall and "
      + "may never rise. The database-side limits are NOT here: they live in "
      + "ratchet_baseline, because that is where the figure is measured and one figure "
      + "gets one home.",
    limits: measuredRepo,
    measured_on: new Date().toISOString().slice(0, 10),
    inventory: {
      hardcodedFilterLists: filterLists.map((f) => `${f.rel}:${f.line}  (${f.n}) ${f.head}`),
      bareRoomRenders: roomRenders.map((r) => `${r.rel}:${r.line}  ${r.snippet}`),
      c3aReasonsMissing: reasonsMissing.map((r) => r.canonical),
    },
  }, null, 2) + "\n");
  console.log("report-contract: repo baseline written.");
  process.exit(0);
}

let failed = false;
const fail = (msg, lines = []) => {
  failed = true;
  console.error(`\nreport-contract: FAIL — ${msg}`);
  for (const l of lines) console.error(`    ${l}`);
};
const ratchet = (key, now, limit, rule, whenOver, sample = []) => {
  if (now > limit) {
    fail(`${rule}: ${now} (limit ${limit}).`, [...sample, "", ...whenOver]);
  } else if (now < limit) {
    console.log(`report-contract: TIGHTEN  — ${key} is ${now}, recorded limit ${limit}.`);
    console.log("    Lower it: node tools/checks/report-contract.mjs --bless");
    console.log("    A limit left above the truth is headroom for the next regression.");
  } else {
    console.log(`report-contract: ok      — ${rule}: ${now}, at the recorded limit. Debt, not a regression.`);
  }
};

console.log(`report-contract: scanned ${files.length} source file(s) under app/web/src.\n`);

ratchet("hardcodedFilterLists", measuredRepo.hardcodedFilterLists, repoLimits.hardcodedFilterLists,
  "§7 filter and column lists frozen into JSX",
  ["§7 of the seed-to-sale mandate: 'Filters are DATA, never JSX. A hard-coded filter",
   "list means every new filter is a code change... so it never happens.'",
   "Move the list into a registry row and read it. FG_TABS at App.jsx:7098 is the clearest",
   "case: nine tabs, each with its column set frozen, so adding one column needs a deploy."],
  filterLists.slice(0, 20).map((f) => `x ${f.rel}:${f.line}  (${f.n} names) ${f.head}...`));

ratchet("bareRoomRenders", measuredRepo.bareRoomRenders, repoLimits.bareRoomRenders,
  "J7 rooms shown without their department",
  ["Rule J7: a room is never shown without its department. Display room_qualified,",
   "never bare room. Two rooms in two departments can share a name, and the reader has",
   "no way to tell which one they are looking at.",
   "room_qualified currently appears in NO render in this front end — only inside two",
   "assistant prompt strings that instruct the model to use it."],
  roomRenders.slice(0, 20).map((r) => `x ${r.rel}:${r.line}  ${r.snippet}`));

ratchet("documentSitesWithNoReason", measuredRepo.documentSitesWithNoReason,
  repoLimits.documentSitesWithNoReason,
  "C3a document fetches that can state no reason for an absent document",
  ["Rule C3a: where the certificate or the manifest is absent the row states WHICH",
   "reason — never a blank, never a dash. App.jsx:1059 renders a bare dash and",
   "App.jsx:1061 renders 'none held', neither of which is one of the four.",
   "f_package_documents already returns everything needed to choose the right one."]);

if (measuredRepo.c3aReasonsMissing > repoLimits.c3aReasonsMissing) {
  fail(`C3a: ${measuredRepo.c3aReasonsMissing} of the four canonical reasons cannot be `
     + `produced by this front end at all (limit ${repoLimits.c3aReasonsMissing}).`,
    [...reasonsMissing.map((r) => `x ${r.canonical}`), "",
     "These are quoted from CLAUDE.md lines 351-354. A near-miss does not count:",
     'App.jsx:1744 says "packaged here and never transferred, or not yet synced",',
     "which merges two of the four and therefore tells the reader nothing."]);
} else if (measuredRepo.c3aReasonsMissing < repoLimits.c3aReasonsMissing) {
  console.log(`report-contract: TIGHTEN  — c3aReasonsMissing is ${measuredRepo.c3aReasonsMissing}, `
            + `recorded limit ${repoLimits.c3aReasonsMissing}. Lower it with --bless.`);
} else {
  console.log(`report-contract: ok      — C3a: ${measuredRepo.c3aReasonsMissing} of 4 canonical `
            + "reasons absent, at the recorded limit.");
  for (const r of reasonsMissing) console.log(`      missing: ${r.canonical}`);
}

const db = await fromDatabase();
if (!db.rows) {
  console.log("\nreport-contract: PASS (DEGRADED) — no database connection here.");
  console.log(`    ${db.why}`);
  console.log("    L6 (date range) and I4 (reports live in the Reports dropdown) were NOT");
  console.log("    checked: both are facts about nav_registry, not about the source. The");
  console.log("    three source rules above DID run and are enforced in this build.");
  console.log("    Meaningful where a connection exists: `npm run check` locally, and the");
  console.log("    nightly run registered as gate.report_contract in checker_registry.");
} else {
  const m = db.rows;
  const L = db.limits ?? {};
  console.log(`\nreport-contract: ${m.reports_total} enabled page(s) declare page_kind='report'.`);

  const dbRatchet = (key, now, rule, whenOver) => {
    const limit = L[key];
    if (limit === undefined) {
      fail(`${rule}: ${now} measured, and ratchet_baseline holds no row for '${key}'.`,
        ["A measurement with no recorded limit cannot ratchet, and defaulting it to zero",
         "would turn the build red on arrival while defaulting it to the measurement would",
         "bless whatever is there today. Insert the row with a written reason."]);
      return;
    }
    if (now > limit) fail(`${rule}: ${now} (ratchet_baseline '${key}' = ${limit}).`, whenOver);
    else if (now < limit) {
      console.log(`report-contract: TIGHTEN  — ${key} is ${now}, baseline ${limit}.`);
      console.log(`    update ratchet_baseline set baseline = ${now} where metric_key = '${key}';`);
    } else console.log(`report-contract: ok      — ${rule}: ${now}, at the baseline. Debt, not a regression.`);
  };

  dbRatchet("report_date_range_defect", m.date_defect,
    "L6 reports whose source carries a date and whose view drops it",
    ["Rule L6: a report that cannot be pulled by date range is not finished.",
     "v_report_standard names each one. The owner's ruling is explicit: where a date is",
     "genuinely meaningless OMIT the control (date_policy = 'not_applicable'); where the",
     "source HAS a date the view dropped, that is a defect — fix the view. Never omit the",
     "control to hide a missing date."]);

  dbRatchet("report_nobody_can_open", m.nobody_can_open,
    "reports no role can open",
    ["A report nobody can open is not a report. These have no role in page_permissions,",
     "so they render for nobody while still counting as delivered work."]);

  dbRatchet("report_outside_reports_menu", m.outside_reports_menu,
    "I4 reports living as side-menu items",
    ["Rule I4: reports live in the Reports dropdown, not as side-menu items.",
     "App.jsx:346 puts a row in the dropdown when surface='reports' OR report_group is",
     "set. These have neither, and page_kind='report', so they are reports sitting in the",
     "left rail. Set report_group, or move the surface."]);
}

if (failed) {
  console.error("\nreport-contract: FAIL\n");
  process.exit(1);
}
console.log(`\nreport-contract: PASS${db.rows ? " (VERIFIED against nav_registry)" : " (DEGRADED)"}.`);
