#!/usr/bin/env node
/* validate-command-center.mjs — the Command Center's own validator.
 *
 * REWRITTEN 12 Aug 2026 for the clean-slate tree (owner pivot: the page was
 * rebuilt from an empty file in app/web/src/commandcenter.jsx, mounted at
 * dept_dash_command, with the old Command-only rendering retired from
 * DeptDashboard). One page, one validator, both fixture halves.
 *
 * WHAT IT HOLDS TRUE, each earned by a real defect or an owner order:
 *
 *   1. THE NEW TREE IS MOUNTED AND THE OLD ONE IS RETIRED. dept_dash_command
 *      must route to <CommandCenter and the retired Command-only components
 *      (GlobalManagement, RoomRings, YieldBars, ReportsCard, GoalsSection,
 *      DiagFooter) must not linger in App.jsx — dual renderings are forbidden.
 *
 *   2. EVERY FLOW STAGE DRILLS, and the in-transit drill reads v_stock_proof,
 *      never v_flow_in_transit (measured 30.7 s / 50 rows, 0 of 429 manifests
 *      matched — filed defect).
 *
 *   3. THE GUSH MINTZ DEFECT CANNOT RETURN. The old yield bars coloured
 *      themselves by regex over the drying-verdict PROSE, so "water BELOW
 *      band — may be UNDERstated" painted a +127 g over-median harvest red.
 *      The yield tone must derive from the served numeric comparison, and the
 *      prose-matching regex must not reappear anywhere in the new tree.
 *
 *   4. NO FABRICATED SERIES — a literal numeric array reads as live data.
 *
 *   5. FROZEN SURFACES ARE MOUNTED, NEVER REBUILT. The new tree must render
 *      <StockByStreamCards and <MoneyBar imported from App.jsx and must not
 *      define its own entcard/money markup. The scoped stylesheet must not
 *      declare :root tokens or restyle the frozen classes (owner hands-off
 *      order: side menu, top menu, kept KPI surfaces — HIS sizing wins).
 *
 *   6. THE BOTTOM STATUS BAR STAYS DELETED (owner ruling) — no diagfoot in
 *      the new tree, no DiagFooter anywhere.
 *
 *   7. NARRATIVE HONESTY: the period lane never fires without a real range,
 *      all three lanes are read, and an unsigned note is refused.
 *
 *   8. THE WORK QUEUE reads v_finding_causes, expands to v_findings in place,
 *      and assigns through tg_assign_from_tile.
 *
 *   9. J7: roomQualified is composed in the new tree — a room never renders
 *      without its department.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const APP = join(ROOT, "app/web/src/App.jsx");
const CC = join(ROOT, "app/web/src/commandcenter.jsx");
const CCCSS = join(ROOT, "app/web/src/commandcenter.css");

/* ---------- detectors ---------- */

/* A literal numeric series long enough to read as chart data. Three numbers or
 * fewer is a coordinate or a version; four or more is a data series. */
const FAKE_SERIES = /\[\s*(?:\d+(?:\.\d+)?\s*,\s*){3,}\d+(?:\.\d+)?\s*\]/;

/* The exact shape of the Gush Mintz defect: colour decided by substring-matching
 * verdict prose. Any regex alternation of those judgement words is the defect. */
const PROSE_TONE = /\/[^/\n]*(?:concern|under|low|short)\|[^/\n]*\//i;

/* ---------- self-test: both halves ---------- */
function selfTest() {
  const cases = [
    // MUST FIRE
    [FAKE_SERIES.test("const series = [4, 8, 15, 16, 23, 42];"), true,
      "a hardcoded six-point series is fabricated chart data"],
    [PROSE_TONE.test('const toneOf = (v) => /concern|under|low|short/i.test(v || "") ? "bad" : "good";'), true,
      "tone decided by substring-matching verdict prose — the Gush Mintz defect"],
    // MUST STAY QUIET
    [FAKE_SERIES.test('viewBox="0 0 64 64"'), false,
      "an SVG viewBox is coordinates, not data"],
    [FAKE_SERIES.test("const pair = [x, y];"), false,
      "variables are live values, not fabrications"],
    [PROSE_TONE.test("const under = r.strain_median_dry_g != null && Number(r.dry_g_per_plant) < Number(r.strain_median_dry_g);"), false,
      "the served numeric comparison is the correct tone source and must stay quiet"],
    [PROSE_TONE.test('title="oldest days under review"'), false,
      "prose containing the word under, with no regex alternation, is not the defect"],
  ];
  const bad = cases.filter(([got, want]) => got !== want);
  if (bad.length) {
    console.error("validate-command-center: FAIL — a detector is broken:");
    for (const [, want, why] of bad) console.error(`  ✗ ${want ? "should fire" : "must stay quiet"}: ${why}`);
    console.error("Nothing below would be reliable. Exiting red.");
    process.exit(1);
  }
  console.log(`validate-command-center: detector self-test PASSED (${cases.length} cases, both halves).`);
}
selfTest();

/* ---------- the checks ---------- */
for (const [p, name] of [[APP, "App.jsx"], [CC, "commandcenter.jsx"], [CCCSS, "commandcenter.css"]]) {
  if (!existsSync(p)) {
    console.error(`validate-command-center: FAIL — ${name} is missing. A gate that scans nothing proves nothing.`);
    process.exit(1);
  }
}
const app = readFileSync(APP, "utf8");
const cc = readFileSync(CC, "utf8");
const css = readFileSync(CCCSS, "utf8");
const errors = [];

/* Extract a top-level `function Name(...) {...}` body by brace counting. */
function componentBody(src, name) {
  const sig = src.indexOf(`function ${name}(`);
  if (sig < 0) return null;
  const open = src.indexOf("{", src.indexOf(")", sig));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(sig, i + 1);
  }
  return null;
}

/* 1 — mounted, and the old rendering retired. */
if (!/dept_dash_command:\s*<CommandCenter/.test(app)) {
  errors.push("dept_dash_command does not route to <CommandCenter — the clean-slate tree is not mounted.");
}
for (const dead of ["function GlobalManagement(", "function RoomRings(", "function YieldBars(",
  "function ReportsCard(", "function GoalsSection(", "function DiagFooter("]) {
  if (app.includes(dead)) {
    errors.push(`App.jsx still defines ${dead}…) — the old Command rendering must be retired, not left as a dual path.`);
  }
}

/* 2 — every specially-named flow stage drills, from the evidence view. */
const flow = componentBody(cc, "CcFlow") ?? "";
for (const stage of ['"Open harvests"', '"In transit"', '"Awaiting test"', '"Sellable"', '"Blocked - failed"']) {
  if (!flow.includes(stage)) {
    errors.push(`CcFlow no longer handles the ${stage} stage — its drill would fall through to the wrong records (C1).`);
  }
}
for (const mount of ["OpenHarvestDetail", "InTransitDrill", "BatchList"]) {
  if (!flow.includes(mount)) errors.push(`CcFlow does not mount ${mount} — a stage lost its drill (C1).`);
}
const transit = componentBody(app, "InTransitDrill") ?? "";
if (!transit.includes('from("v_stock_proof")')) {
  errors.push("InTransitDrill no longer reads v_stock_proof — drill rows come from the evidence view (Agent I correction).");
}
if (transit.includes('from("v_flow_in_transit")')) {
  errors.push("InTransitDrill reads v_flow_in_transit — measured 30.7 s per 50 rows. Filed defect; do not wire it back.");
}

/* 3 — the Gush Mintz defect cannot return. */
if (PROSE_TONE.test(cc)) {
  errors.push("commandcenter.jsx decides a tone by substring-matching verdict prose — the exact defect that painted a +127 g over-median harvest red. Tone must come from the served numbers.");
}
const yieldBody = componentBody(cc, "CcYield") ?? "";
if (!yieldBody) {
  errors.push("CcYield is missing — the yield section lost its component.");
} else if (!/strain_median_dry_g\s*!=\s*null\s*&&\s*Number\(r\.dry_g_per_plant\)\s*<\s*Number\(r\.strain_median_dry_g\)/.test(yieldBody)) {
  errors.push("CcYield no longer derives its tone from the served median comparison (dry_g_per_plant < strain_median_dry_g).");
}

/* 4 — no fabricated series in the new tree. */
for (const name of ["CcSpark", "CcKpiStrip", "CcFlow", "CcYield", "CcRooms", "CcQueue", "CcGlobal"]) {
  const body = componentBody(cc, name);
  if (body && FAKE_SERIES.test(body)) {
    errors.push(`${name} contains a literal numeric series — fabricated data reads as live and must not ship (A1).`);
  }
}

/* 5 — frozen surfaces mounted, never rebuilt; stylesheet stays scoped. */
if (!/<StockByStreamCards\b/.test(cc)) errors.push("The new tree no longer mounts <StockByStreamCards — the owner's kept KPI surface must render verbatim.");
if (!/<MoneyBar\b/.test(cc)) errors.push("The new tree no longer mounts <MoneyBar — the owner's kept money bar must render verbatim.");
if (!/function StockByStreamCards\(/.test(app)) errors.push("App.jsx lost StockByStreamCards — the frozen cards have no single source.");
for (const cls of ["entcard", "enthead", "entbig", "moneyinner", "moneybar", "moneykeys"]) {
  if (cc.includes(cls)) errors.push(`commandcenter.jsx contains "${cls}" — the frozen surfaces are mounted from App.jsx, never rebuilt or restyled in the new tree.`);
}
if (/:root/.test(css)) {
  errors.push("commandcenter.css declares :root — every token must live on .ccpage so nothing cascades into the owner's hands-off chrome (side menu, top menu, kept KPI surfaces).");
}
for (const frozen of [".entcard", ".enthead", ".entbig", ".entrows", ".moneyinner", ".moneybar", ".moneykeys",
  ".topnav", ".nav ", ".repmenu", ".railwidget"]) {
  if (css.includes(frozen)) {
    errors.push(`commandcenter.css styles "${frozen}" — the hands-off list is exempt from all resizing; HIS sizing wins.`);
  }
}

/* 6 — the bottom status bar stays deleted. */
if (/diagfoot/i.test(cc)) errors.push("The new tree renders a bottom status bar — the owner deleted it ('why is all this shit at bottom, remove').");

/* 7 — narrative honesty. */
const words = componentBody(cc, "CcWords") ?? "";
if (!words) {
  errors.push("CcWords is missing — the three narrative lanes are not mounted.");
} else {
  if (!/if \(!ranged\)/.test(words)) errors.push("CcWords lost its range guard — tg_period_narrative must never be called with null bounds (a one-day story would misstate the screen).");
  for (const lane of ['rpc("tg_period_narrative"', 'from("v_section_narrative")', 'from("dashboard_commentary")']) {
    if (!words.includes(lane)) errors.push(`CcWords no longer reads ${lane} — a lane went dark silently.`);
  }
}
const note = componentBody(cc, "CcAddNote") ?? "";
if (!note || !/Anonymous commentary is not allowed/.test(note)) {
  errors.push("CcAddNote lost its anonymous-refusal — every note must carry a signed author.");
}

/* 8 — the work queue contract. */
if (!cc.includes('from("v_finding_causes")')) errors.push("The work queue no longer reads v_finding_causes — 46 prose cards must stay collapsed into cause rows (order 8).");
if (!cc.includes('rpc("tg_assign_from_tile"')) errors.push("The work queue no longer assigns through tg_assign_from_tile — the numbered-order path is the contract.");
if (!cc.includes('from("v_findings")')) errors.push("The work queue no longer expands to v_findings instances — the prose lives one level down, in place.");

/* 9 — J7. */
if (!/roomQualified/.test(cc)) errors.push("commandcenter.jsx lost its composed roomQualified value (J7: a room is never rendered without its department).");

/* ---------- verdict ---------- */
if (errors.length) {
  console.error(`\nvalidate-command-center: FAIL — ${errors.length} finding(s):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error("");
  process.exit(1);
}
console.log("validate-command-center: PASS — clean-slate tree mounted, old path retired, every stage drills from the evidence view, yield tone is numeric, frozen surfaces mounted verbatim, stylesheet scoped, status bar stays deleted, narrative lanes honest, work queue on contract.");
