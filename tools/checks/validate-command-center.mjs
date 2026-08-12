#!/usr/bin/env node
/* validate-command-center.mjs — the Command Center delivery's own validator.
 *
 * Adopted 11 Aug 2026 (Agent I process order: one page, one validator, both
 * fixture halves — the DDC discipline). Enforces, statically, the three claims
 * this delivery makes:
 *
 *   1. EVERY FLOW STAGE DRILLS. The seed-to-sale strip's drill switch must
 *      handle every named stage the platform renders specially — including
 *      "In transit" (stage 6, owner ruling 11 Aug 2026). Before this delivery
 *      the new stage fell through to the laboratory list: the WRONG records
 *      under an in-transit heading, which is worse than no drill at all.
 *
 *   2. DRILL ROWS COME FROM THE EVIDENCE VIEW. The in-transit drill reads
 *      v_stock_proof (Agent I correction, 11 Aug 2026), never v_flow_in_transit,
 *      whose manifest join was measured at 30.7 s for 50 rows with 0 of 429
 *      manifests matched. A component quietly switched back to the broken view
 *      must fail the build.
 *
 *   3. NO FABRICATED DATA, AND UNWIRED SURFACES SAY SO. The new sections must
 *      not carry literal numeric series (a hardcoded sparkline/bar array reads
 *      as live data), and the goals summary must state its no-data case through
 *      the StatusChip vocabulary rather than a silent blank.
 *
 * Self-test runs first, with both halves: snippets that MUST fire and real
 * shapes that MUST stay quiet. If the detector is broken, nothing below it can
 * be trusted and the gate exits red (K1 question 4: a check that cannot fail
 * proves nothing).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const APP = join(ROOT, "app/web/src/App.jsx");

/* ---------- detectors ---------- */

/* A literal numeric series long enough to read as chart data. Three numbers or
 * fewer is a coordinate or a version; four or more is a data series. */
const FAKE_SERIES = /\[\s*(?:\d+(?:\.\d+)?\s*,\s*){3,}\d+(?:\.\d+)?\s*\]/;

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

/* ---------- self-test: both halves ---------- */
function selfTest() {
  const cases = [
    // MUST FIRE (the violation half)
    [FAKE_SERIES.test("const series = [4, 8, 15, 16, 23, 42];"), true,
      "a hardcoded six-point series is fabricated chart data"],
    [FAKE_SERIES.test("<Spark series={[1.2, 3.4, 5.6, 7.8]} />"), true,
      "a literal series handed straight to a sparkline"],
    // MUST STAY QUIET (the legitimate half)
    [FAKE_SERIES.test('viewBox="0 0 64 64"'), false,
      "an SVG viewBox is coordinates, not data"],
    [FAKE_SERIES.test("const pair = [x, y];"), false,
      "variables are live values, not fabrications"],
    [FAKE_SERIES.test("padding: [4, 8]"), false,
      "a two-number tuple is layout, not a series"],
  ];
  const bad = cases.filter(([got, want]) => got !== want);
  if (bad.length) {
    console.error("validate-command-center: FAIL — the fabricated-series detector is broken:");
    for (const [, want, why] of bad) console.error(`  ✗ ${want ? "should fire" : "must stay quiet"}: ${why}`);
    console.error("Nothing below would be reliable. Exiting red.");
    process.exit(1);
  }
  console.log(`validate-command-center: detector self-test PASSED (${cases.length} cases, both halves).`);
}
selfTest();

/* ---------- the checks ---------- */
if (!existsSync(APP)) {
  console.error("validate-command-center: FAIL — App.jsx is missing. A gate that scans nothing proves nothing.");
  process.exit(1);
}
const src = readFileSync(APP, "utf8");
const errors = [];

/* 1 — every specially-named flow stage has its drill branch. */
const strip = componentBody(src, "FlowStrip") ?? "";
for (const stage of ['"Open harvests"', '"In transit"', '"Awaiting test"', '"Sellable"', '"Blocked - failed"']) {
  if (!strip.includes(stage)) {
    errors.push(`FlowStrip no longer handles the ${stage} stage — its drill would fall through to the wrong records (C1).`);
  }
}
if (!strip.includes("InTransitDrill")) {
  errors.push('FlowStrip does not mount InTransitDrill for the "In transit" stage (owner ruling 11 Aug 2026).');
}

/* 2 — the in-transit drill reads the evidence view, never the broken one. */
const drill = componentBody(src, "InTransitDrill") ?? "";
if (!drill) {
  errors.push("InTransitDrill is missing entirely — stage 6 has no drill and must not ship (C1).");
} else {
  if (!drill.includes('from("v_stock_proof")')) {
    errors.push("InTransitDrill no longer reads v_stock_proof — drill rows must come from the evidence view (Agent I correction, 11 Aug 2026).");
  }
  if (drill.includes('from("v_flow_in_transit")')) {
    errors.push("InTransitDrill reads v_flow_in_transit — measured 30.7 s per 50 rows with 0/429 manifests matched. Filed defect; do not wire it back.");
  }
}

/* 3 — no fabricated series in the delivery's components; honesty chips present. */
for (const name of ["RoomRings", "RoomDrill", "YieldBars", "GoalsSummary", "InTransitDrill", "DiagFooter", "Spark"]) {
  const body = componentBody(src, name);
  if (body && FAKE_SERIES.test(body)) {
    errors.push(`${name} contains a literal numeric series — fabricated data reads as live and must not ship (A1).`);
  }
}
const goals = componentBody(src, "GoalsSummary") ?? "";
if (!/StatusChip/.test(goals) || !/no data/i.test(goals)) {
  errors.push("GoalsSummary lost its StatusChip no-data honesty — an unwired figure must say so on its face.");
}
const rings = componentBody(src, "RoomRings") ?? "";
if (rings && !/never shown without its department|room_qualified/i.test(rings)) {
  errors.push("RoomRings lost its room-qualification honesty note (J7: a room is never shown without its department).");
}

/* 4 — narrative lanes (owner addition, 11 Aug 2026): paragraphs are claims and
 *     drill; the period lane never fires without a real range (null bounds
 *     degenerate to a one-day window and the prose would misstate the screen);
 *     a CEO note without a signed author is refused, never defaulted. */
const nb = componentBody(src, "NarrativeBlock") ?? "";
if (!nb) {
  errors.push("NarrativeBlock is missing — narrative paragraphs have no shared render and no drill (C1).");
} else if (!nb.includes("go(drill)")) {
  errors.push("NarrativeBlock no longer drills — a paragraph is a claim like any tile (C1).");
}
const dn = componentBody(src, "DashNarratives") ?? "";
if (!dn) {
  errors.push("DashNarratives is missing — the three narrative lanes are not mounted.");
} else {
  if (!/if \(!ranged\)/.test(dn)) {
    errors.push("DashNarratives lost its range guard — tg_period_narrative must never be called with null bounds.");
  }
  for (const lane of ['rpc("tg_period_narrative"', 'from("v_section_narrative")', 'from("dashboard_commentary")']) {
    if (!dn.includes(lane)) errors.push(`DashNarratives no longer reads ${lane} — a lane went dark silently.`);
  }
}
const note = componentBody(src, "AddCeoNote") ?? "";
if (note && !/Anonymous commentary is not allowed/.test(note)) {
  errors.push("AddCeoNote lost its anonymous-refusal — every note must carry a signed author.");
}

/* ---------- verdict ---------- */
if (errors.length) {
  console.error(`\nvalidate-command-center: FAIL — ${errors.length} finding(s):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error("");
  process.exit(1);
}
console.log("validate-command-center: PASS — every flow stage drills, drill rows come from the evidence view, no fabricated series, honesty chips in place.");
