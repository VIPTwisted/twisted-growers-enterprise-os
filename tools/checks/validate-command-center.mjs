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
/* The dashboard TREE, not one page: the Command Center's primitives now live
   in dashkit and are shared by every department dashboard, so a contract
   proven only against commandcenter.jsx proves nothing about the pages that
   actually render it. dashkit.css is scanned for the same reason its own
   header claims it is — a claim no gate reads is worse than no claim. */
const DK = join(ROOT, "app/web/src/dashkit.jsx");
const DKCSS = join(ROOT, "app/web/src/dashkit.css");
const PAGES = ["dash-cultivation.jsx", "dash-inventory.jsx"].map((f) => join(ROOT, "app/web/src", f));

/* ---------- detectors ---------- */

/* A literal numeric series long enough to read as chart data. Three numbers or
 * fewer is a coordinate or a version; four or more is a data series. */
const FAKE_SERIES = /\[\s*(?:\d+(?:\.\d+)?\s*,\s*){3,}\d+(?:\.\d+)?\s*\]/;

/* The exact shape of the Gush Mintz defect: colour decided by substring-matching
 * verdict prose. Any regex alternation of those judgement words is the defect. */
const PROSE_TONE = /\/[^/\n]*(?:concern|under|low|short)\|[^/\n]*\//i;

/* J7, TESTED AT THE SOURCE — rewritten 12 Aug 2026.
 *
 * The old check was `/roomQualified/.test(cc)`: it proved an IDENTIFIER
 * appeared somewhere in the file. Renaming the variable fired it; hardcoding
 * every department in the platform did not. It could not fail in the way that
 * mattered, and rule C0b is explicit that a check which cannot fail proves
 * nothing. It was green the whole time three sites in commandcenter.jsx and
 * one in dash-cultivation.jsx composed the department as the literal
 * "Cultivation" — guessing precisely the thing J7 exists to stop being guessed.
 *
 * What matters is where the department VALUE comes from. A qualified room name
 * is built from a served column or from the shared dkRoomQualified helper; a
 * department spelled out in the source is the defect, whatever the variable
 * around it happens to be called. */
const DEPT_WORDS = "Cultivation|Manufacturing|Inventory|Quality|Metrc|Workspace|Settings|Finance";
/* A SEPARATOR, NOT A HYPHEN INSIDE A WORD — narrowed 29 August 2026.
 *
 * This fired five times on English prose in dash-cultivation.jsx: "the
 * schedule-versus-Metrc comparison" and "the schedule-to-Metrc match", in a
 * comment, a DkErr `what` and a DkTag `title`. None of them composes anything;
 * "Metrc" there is the second half of a compound word a person wrote in a
 * sentence. The gate had teeth in the wrong mouth, and the cost was real: every
 * production build from 28 Aug 18:45 UTC failed here, the site sat 79 commits
 * behind, and the reason read as a room-qualification defect that did not exist.
 *
 * The discriminator is exact. A room qualified with a department is a NAME
 * followed by a SEPARATOR followed by the department — `r.room + " — Cultivation"`
 * — and the separator is an em or en dash, or an ASCII hyphen standing on its
 * own. An ASCII hyphen glued to the word before it is not a separator at all; it
 * is how English writes a compound. So the em and en dashes still fire wherever
 * they appear, and a bare `-` fires unless a letter or digit is welded to it.
 *
 * WHAT THIS GIVES UP, STATED RATHER THAN HIDDEN. `"Room 7-Cultivation"`, with no
 * space, is no longer caught. Nothing in this codebase writes that form —
 * dkRoomQualified emits " — " — and the two self-test fixtures that must fire
 * both use the em dash. Both halves of the self-test below are extended so the
 * narrowing is itself tested, not asserted. */
const HARDCODED_DEPT = new RegExp("(?:[—–]|(?<![A-Za-z0-9])-)\\s*(?:" + DEPT_WORDS + ")\\b(?![\\w\"'`]*\\s*[:=])");

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
    // J7 at the source — MUST FIRE
    [HARDCODED_DEPT.test('const roomQualified = r.room + " — Cultivation";'), true,
      "a room joined to a department spelled out in the source is the J7 defect"],
    [HARDCODED_DEPT.test('<div>Every plant standing in {openRoom} — Cultivation</div>'), true,
      "a department written into rendered text is the same defect wearing markup"],
    [HARDCODED_DEPT.test('const q = g.room + " — Manufacturing";'), true,
      "the defect is not specific to one department name"],
    // J7 at the source — MUST STAY QUIET
    [HARDCODED_DEPT.test('const roomQualified = g.room + " — " + g.department;'), false,
      "composing from the SERVED department column is the correct shape"],
    [HARDCODED_DEPT.test("const roomQualified = dkRoomQualified(r);"), false,
      "the shared helper reads the served column and must stay quiet"],
    [HARDCODED_DEPT.test('supabase.from("v_stock_by_department").select("*").eq("department", DEPT.toUpperCase())'), false,
      "filtering a query BY a department is not rendering a room without one"],
    /* The five findings that held production for sixteen hours. A hyphen welded
       to the word in front of it is a compound word, not a separator, and the
       thing on its left is a verb rather than a room. */
    [HARDCODED_DEPT.test('<DkErr what="The schedule-versus-Metrc comparison" err={d.sched.err} />'), false,
      "a compound word in English prose is not a room qualified with a department"],
    [HARDCODED_DEPT.test('title="a pull whose schedule-to-Metrc match was made on date alone"'), false,
      "the same compound in a title attribute is still prose"],
    [HARDCODED_DEPT.test("  /* This lived beside the schedule-versus-Metrc derivation"), false,
      "and still prose inside a comment that does not begin with a star"],
    /* The narrowing has a floor: a lone hyphen IS a separator, and must stay
       caught, or the fix would have traded one blind spot for another. */
    [HARDCODED_DEPT.test('const roomQualified = r.room + " - Cultivation";'), true,
      "a spaced ASCII hyphen is a separator and the defect survives the narrowing"],
    // A stylesheet's own prose is not a stylesheet rule — the comment stripper
    // is what makes this true, and it earned its place by four false findings.
    [/:root/.test("/* No :root rule lives here. */".replace(/\/\*[\s\S]*?\*\//g, " ")), false,
      "a comment saying the file declares no :root must not be read as declaring one"],
    [/:root/.test(":root { --x: 1px; }".replace(/\/\*[\s\S]*?\*\//g, " ")), true,
      "an actual :root rule must still be caught once comments are stripped"],
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
for (const [p, name] of [[APP, "App.jsx"], [CC, "commandcenter.jsx"], [CCCSS, "commandcenter.css"],
  [DK, "dashkit.jsx"], [DKCSS, "dashkit.css"], ...PAGES.map((p2) => [p2, p2.split(/[\/]/).pop()])]) {
  if (!existsSync(p)) {
    console.error(`validate-command-center: FAIL — ${name} is missing. A gate that scans nothing proves nothing.`);
    process.exit(1);
  }
}
const app = readFileSync(APP, "utf8");
const cc = readFileSync(CC, "utf8");
const css = readFileSync(CCCSS, "utf8");
const dk = readFileSync(DK, "utf8");
const dkcss = readFileSync(DKCSS, "utf8");
const pages = PAGES.map((p) => [p.split(/[\/]/).pop(), readFileSync(p, "utf8")]);
/* The whole rendering tree: the contracts below hold across it, not against
   one file that happens to still contain the string. */
const tree = [["commandcenter.jsx", cc], ["dashkit.jsx", dk], ...pages];
const treeSrc = tree.map(([, t]) => t).join("\n");
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
if (PROSE_TONE.test(treeSrc)) {
  errors.push("commandcenter.jsx decides a tone by substring-matching verdict prose — the exact defect that painted a +127 g over-median harvest red. Tone must come from the served numbers.");
}
const yieldBody = componentBody(cc, "CcYield") ?? componentBody(treeSrc, "CvYield") ?? "";
if (!yieldBody) {
  errors.push("CcYield is missing — the yield section lost its component.");
} else if (!/strain_median_dry_g\s*!=\s*null\s*&&\s*Number\(r\.dry_g_per_plant\)\s*<\s*Number\(r\.strain_median_dry_g\)/.test(yieldBody)) {
  errors.push("CcYield no longer derives its tone from the served median comparison (dry_g_per_plant < strain_median_dry_g).");
}

/* 4 — no fabricated series in the new tree. */
for (const name of ["DkSpark", "DkKpiStrip", "CcFlow", "CcYield", "CvYield", "DkRoomBoard",
  "DkWorkQueue", "CcGlobal", "CvDryTime", "InvRooms", "CvStockRooms"]) {
  const body = componentBody(treeSrc, name);
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
/* Both scoped stylesheets, held to the same three claims their headers make.
   dashkit.css asserted "LOCKED, AND HELD BY THE PAGE VALIDATOR" while no
   validator read it — an artefact claiming a guard that does not exist is
   worse than no claim, so the guard now exists. */
for (const [cssName, cssRaw] of [["commandcenter.css", css], ["dashkit.css", dkcss]]) {
  /* SCAN THE RULES, NOT THE PROSE. First run of this check reported four
     findings against dashkit.css and all four were its own header comment
     saying it does NOT declare :root and does NOT style .entcard, .moneybar
     or .topnav. A file documenting a prohibition was accused of breaking it.
     Same defect the dead-controls gate hit and fixed: a scanner that reads
     comments as markup measures the wrong thing (K1, and K4 — the fault
     belongs to the check). Comments are stripped before anything is judged. */
  const cssSrc = cssRaw.replace(/\/\*[\s\S]*?\*\//g, " ");
  if (/:root/.test(cssSrc)) {
    errors.push(`${cssName} declares :root — every token must live on .ccpage so nothing cascades into the owner's hands-off chrome (side menu, top menu, kept KPI surfaces).`);
  }
  for (const frozen of [".entcard", ".enthead", ".entbig", ".entrows", ".moneyinner", ".moneybar", ".moneykeys",
    ".topnav", ".nav ", ".repmenu", ".railwidget"]) {
    if (cssSrc.includes(frozen)) {
      errors.push(`${cssName} styles "${frozen}" — the hands-off list is exempt from all resizing; HIS sizing wins.`);
    }
  }
  /* A colour literal in a scoped dashboard stylesheet is how the locked theme
     leaks. Every colour must be a var() the theme already defines. */
  const lits = (cssSrc.match(/#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/g) ?? []);
  if (lits.length) {
    errors.push(`${cssName} contains ${lits.length} colour literal(s) (${[...new Set(lits)].slice(0, 4).join(", ")}) — the theme is locked and every colour must come from a var() token.`);
  }
}

/* 6 — the bottom status bar stays deleted. */
if (/diagfoot/i.test(treeSrc)) errors.push("The new tree renders a bottom status bar — the owner deleted it ('why is all this shit at bottom, remove').");

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
if (!treeSrc.includes('from("v_finding_causes")')) errors.push("The work queue no longer reads v_finding_causes — 46 prose cards must stay collapsed into cause rows (order 8).");
if (!treeSrc.includes('rpc("tg_assign_from_tile"')) errors.push("The work queue no longer assigns through tg_assign_from_tile — the numbered-order path is the contract.");
if (!treeSrc.includes('from("v_findings")')) errors.push("The work queue no longer expands to v_findings instances — the prose lives one level down, in place.");
if (!treeSrc.includes('from("finding_lane_owner")')) {
  errors.push("Nothing resolves finding_lane_owner — findings are grouped by LANE, not department, so a queue filtered on the department name returns nothing while the chip beside it counts hundreds. The routing table is the join.");
}
/* The instance list must PAGE, never stop at a cap. A silent top-N breaches C1
   and F3 together; 1,066 findings sat behind a bare .limit(50) before this. */
const inst = componentBody(dk, "DkQueueInstances") ?? "";
if (!inst) errors.push("DkQueueInstances is missing — the queue lost the level that shows the individual findings.");
else if (/\.limit\(\s*\d+\s*\)/.test(inst) || !/\.range\(/.test(inst)) {
  errors.push("DkQueueInstances caps its findings with .limit() instead of paging with .range() — every finding behind a cause must be reachable (C1), and a truncation must say so (F3).");
}
/* A PostgREST filter on a column that was never selected always passes. */
for (const [name, src] of tree) {
  const bodies = [componentBody(src, "DkQueueInstances"), componentBody(src, "CcQueueInstances")].filter(Boolean);
  for (const b of bodies) {
    if (/is_duplicate/.test(b) && !/select\([^)]*is_duplicate/s.test(b)) {
      errors.push(`${name}: a findings read filters on is_duplicate without selecting it — PostgREST omits the column, the value is undefined and every row passes the filter. Select it or drop the filter.`);
    }
  }
}

/* 8b — EVERY DRILL HAS A WAY BACK. Owner, 12 Aug 2026: "when we drilldown
   there has to be fast easy way to get back to main screen." The exit, the
   breadcrumb, Escape, browser-back and scroll restoration live in ONE
   primitive, DkDrill, because three separate implementations is how three
   pages end up behaving differently. So a hand-rolled drill container is the
   defect this catches: the only file allowed to open a `cc-drill` div is the
   primitive itself. */
for (const [name, src] of tree) {
  if (name === "dashkit.jsx") continue;                 // the primitive's own markup
  for (const [i, line] of src.split(/\r?\n/).entries()) {
    if (/className="cc-drill"/.test(line)) {
      errors.push(`${name}:${i + 1} builds a drill container by hand — mount <DkDrill label onClose> instead, so this drill inherits the labelled way back, the breadcrumb, Escape, browser-back and scroll restoration rather than reimplementing three of the five.`);
    }
  }
}
if (!/function DkDrill\(/.test(dk)) {
  errors.push("dashkit lost DkDrill — the one primitive that gives every drill its way back.");
}
for (const must of ["popstate", "scrollTo", "Escape"]) {
  if (!dk.includes(must)) {
    errors.push(`DkDrill no longer handles ${must} — the way back is five behaviours and shipping four of them is what the owner already rejected once.`);
  }
}

/* 9 — J7, tested at the SOURCE rather than by the presence of an identifier. */
for (const [name, src] of tree) {
  for (const [i, line] of src.split(/\r?\n/).entries()) {
    if (/^\s*(?:\*|\/\/)/.test(line)) continue;          // prose, not code
    if (HARDCODED_DEPT.test(line)) {
      errors.push(`${name}:${i + 1} composes a room name with a department written into the source — J7 exists because eleven room names occur in BOTH departments, and a guessed department is exactly the failure it forbids. Read the served column, or use dkRoomQualified().`);
    }
  }
}
if (!/function dkRoomQualified\(/.test(dk)) {
  errors.push("dashkit lost dkRoomQualified — the one place a qualified room name is composed from the served department.");
}
if (!treeSrc.includes('from("v_room_board_complete")')) {
  errors.push("No room board reads v_room_board_complete — mv_room_board serves no department column, which is why the departments were hardcoded in the first place (J7).");
}

/* ---------- verdict ---------- */
if (errors.length) {
  console.error(`\nvalidate-command-center: FAIL — ${errors.length} finding(s):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error("");
  process.exit(1);
}
console.log("validate-command-center: PASS — clean-slate tree mounted, old path retired, every stage drills from the evidence view, yield tone is numeric, frozen surfaces mounted verbatim, stylesheet scoped, status bar stays deleted, narrative lanes honest, work queue on contract.");
