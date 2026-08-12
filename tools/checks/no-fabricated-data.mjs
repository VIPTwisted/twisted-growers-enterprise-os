#!/usr/bin/env node
/* no-fabricated-data.mjs — a chart drawn from invented numbers is a lie with a trend line.
 *
 * ENFORCES Rule A1 — "never invent a number" — and the dashboard standard's own words:
 * "Trend sparkline on every tile, from real daily snapshots. Where there is no history
 * yet it says so — NEVER a fabricated line." Also serves A2 (provenance) and A3
 * (absence explained, never blank).
 *
 * WHY THIS IS THE MOST DANGEROUS THING TO GET WRONG HERE
 * Every other failure in this project announced itself: a blank screen, an error, a
 * number that was obviously off. Fabricated data does the opposite — it looks better
 * than the truth. A demo sparkline reads as a healthy trend. A seeded array reads as
 * history. It already happened once: HANDOFF.md §5 records "a fabricated 130 g/plant
 * figure was presented as fact." Nobody questions a chart that looks right.
 *
 * IT IS CLEAN TODAY. Math.random() appears zero times in the front end and <Spark>
 * reads series={tr?.series} from real data. This guard exists to keep it that way,
 * because the moment somebody needs a screenshot for a meeting is the moment a
 * plausible array gets typed in.
 *
 * CALIBRATED AGAINST REAL FALSE POSITIVES. `const TGSS_HOURS = [7,8,...,18]` is an
 * hours-of-day axis, not data, and an earlier draft of this would have failed on it.
 * So a bare numeric array is never a finding; only one handed to something that DRAWS.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const UI_FILES = ["app/web/src/App.jsx", "app/web/src/budz.jsx",
  "app/web/src/commandcenter.jsx", "app/web/src/dashkit.jsx",
  "app/web/src/dash-cultivation.jsx", "app/web/src/dash-inventory.jsx"];

/* Props that feed something that renders a value or a shape to the user. A literal
   array or number here is a claim about the business with no source behind it. */
const CHART_PROPS = "series|data|points|values|trend|sparkline|chartData|history";

const RULES = [
  {
    id: "random-values",
    /* A business figure is measured or it does not exist (A1). Randomness in a
       reporting UI can only be manufacturing one. */
    re: /Math\s*\.\s*random\s*\(/g,
    what: "Math.random() in the user interface",
    why: "A displayed figure must be measured or supplied. Randomness here can only be inventing one, and an invented number is indistinguishable from a real one on screen.",
    fix: "Read the value from the database. If there is no value yet, say so — rule A3, absence is explained, never blank.",
  },
  {
    id: "literal-chart-data",
    re: new RegExp(`\\b(?:${CHART_PROPS})\\s*=\\s*\\{\\s*\\[\\s*-?\\d[\\d.,\\s-]*\\]`, "g"),
    what: "a hardcoded numeric array passed to something that draws",
    why: "The dashboard standard is explicit: sparklines come from real daily snapshots, and where there is no history the tile says so — NEVER a fabricated line. A drawn trend is read as evidence.",
    fix: "Feed it from real snapshots. With no history, render the honest empty state instead of a shape.",
  },
  {
    id: "literal-chart-prop-object",
    re: new RegExp(`\\b(?:${CHART_PROPS})\\s*:\\s*\\[\\s*-?\\d[\\d.,\\s-]*\\]`, "g"),
    what: "a hardcoded numeric array assigned to a chart property",
    why: "Same as above in object form — this is how seeded 'demo' history reaches a dashboard and is then read as fact.",
    fix: "Feed it from real snapshots, or render the honest empty state.",
  },
  {
    id: "placeholder-marker",
    re: /\b(?:lorem\s+ipsum|mockData|sampleData|fakeData|dummyData|FAKE_|DEMO_DATA)\b/gi,
    what: "a placeholder or mock data marker",
    why: "Mock data that reaches production is indistinguishable from real data to the person reading the screen.",
    fix: "Remove it, or gate it behind a development-only path that cannot ship.",
  },
];

function selfTest() {
  const cases = [
    ["const TGSS_HOURS = [7, 8, 9, 10, 11, 12];", false, "an hours axis is not data — the real false positive this was calibrated against"],
    ["<Spark series={tr?.series} />", false, "reading real data"],
    ["<Spark series={[1,2,3,4,5]} />", true, "a fabricated sparkline"],
    ["const tile = { label: 'x', trend: [4,5,6,7] };", true, "seeded history on a tile"],
    ["const jitter = Math.random();", true, "randomness in the interface"],
    ["placeholder=\"Search packages\"", false, "an input placeholder attribute is not mock data"],
    ["const rows = data.map(r => r.value);", false, "ordinary code"],
  ];
  const bad = [];
  for (const [src, want, why] of cases) {
    const got = RULES.some((r) => { r.re.lastIndex = 0; return r.re.test(src); });
    if (got !== want) bad.push({ src, want, got, why });
  }
  if (bad.length) {
    console.error("no-fabricated-data: FAIL — the detectors are broken:\n");
    for (const b of bad) console.error(`  ✗ ${b.want ? "should flag" : "must NOT flag"}: ${b.src}\n      ${b.why}`);
    console.error("\nNothing is reported, because every verdict below would be unreliable.\n");
    process.exit(1);
  }
  console.log(`no-fabricated-data: detector self-test PASSED (${cases.length} cases, including the TGSS_HOURS false positive).`);
}

selfTest();

const findings = [];
for (const rel of UI_FILES) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    console.error(`no-fabricated-data: FAIL — ${rel} is missing. A guard that scans nothing proves nothing.`);
    process.exit(1);
  }
  const text = readFileSync(abs, "utf8");
  const at = (i) => text.slice(0, i).split("\n").length;
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      findings.push({ rel, line: at(m.index), rule, snippet: m[0].replace(/\s+/g, " ").slice(0, 70) });
    }
  }
}

if (findings.length) {
  console.error(`\nno-fabricated-data: FAIL — ${findings.length} invented value(s) reaching the screen:\n`);
  for (const f of findings) {
    console.error(`  ✗ ${f.rel}:${f.line}  ${f.rule.what}`);
    console.error(`      ${f.snippet}`);
    console.error(`      ${f.rule.why}`);
    console.error(`      Instead: ${f.rule.fix}\n`);
  }
  console.error("Fabricated data is the only failure here that looks BETTER than the truth.");
  console.error("Everything else announces itself; this gets believed.\n");
  process.exit(1);
}

console.log(`\nno-fabricated-data: PASS — ${RULES.length} patterns checked across ${UI_FILES.length} files, nothing invented.`);
