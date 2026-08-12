#!/usr/bin/env node
/* tile-drills.mjs — a number the user cannot open is a claim, not evidence.
 *
 * ENFORCES Rule C1 — "every tile, total and headline is a CLAIM and must open to the
 * individual items behind it. No summarising, no sampling, no top-N. A tile without a
 * drill-down is not finished and must not ship." Serves C2 (totals reconcile to items).
 *
 * This is the owner's most repeated rule. It is stated three times in CLAUDE.md — in the
 * dashboard standard, in its own "EVERY TILE MUST PROVE ITSELF" section, and again as C1
 * — and until now nothing checked it even once.
 *
 * WHAT IT CHECKS, precisely
 * Alert and finding entries rendered to the user carry a shape: a severity `level` and
 * human `text`. Each must also carry `drill`, naming where the user goes to see the rows
 * behind it. Anything with level+text and no drill is a number with no way in.
 *
 * CALIBRATED, because a naive version fails on real code. This file has 13 `.push({...})`
 * sites; only the alert-shaped ones are tiles. The others report file-upload results
 * (`{ ok: false, file, error }`) and must not be flagged. It also accepts the ES6
 * shorthand `{ type, label, drill, color, row }`, which an earlier draft missed because
 * it looked only for `drill:` with a colon — that alone would have produced a false
 * positive on correct code, which is how a guard gets switched off.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const UI_FILES = ["app/web/src/App.jsx", "app/web/src/budz.jsx", "app/web/src/commandcenter.jsx"];

/* An object literal handed to a list the user will read. */
const PUSH = /\.push\(\s*\{([\s\S]{0,500}?)\}\s*\)/g;

/* Tile-shaped: it has a severity and a sentence. That is what the user sees as a row. */
const isTile = (body) => /\blevel\s*:/.test(body) && /\btext\s*:/.test(body);

/* Accept `drill: "x"` and the shorthand `drill,` / `drill }` alike. */
const hasDrill = (body) => /\bdrill\s*:/.test(body) || /(^|[,{\s])drill\s*(,|\}|$)/.test(body);

function selfTest() {
  const cases = [
    ['list.push({ level: "watch", text: "3 harvests due", drill: "harvest_schedule" })', false, "a proper tile with a drill"],
    ['list.push({ level: "elevated", text: "5 exceptions today" })', true, "a tile the user cannot open — the violation"],
    ['out.push({ ok: false, file: f.name, error: "No rows found in the file." })', false, "an upload result, not a tile — the real false positive"],
    ['tiles.push({ type, label, drill, color, row })', false, "ES6 shorthand drill — the second real false positive"],
    ['acc.push({ id: r.id, value: r.v })', false, "ordinary data, not a rendered claim"],
  ];
  const bad = [];
  for (const [src, want, why] of cases) {
    PUSH.lastIndex = 0;
    const m = [...src.matchAll(PUSH)][0];
    const got = m ? isTile(m[1]) && !hasDrill(m[1]) : false;
    if (got !== want) bad.push({ src, want, got, why });
  }
  if (bad.length) {
    console.error("tile-drills: FAIL — the tile detector is broken:\n");
    for (const b of bad) console.error(`  ✗ ${b.want ? "should flag" : "must NOT flag"}: ${b.src}\n      ${b.why}`);
    console.error("\nNothing reported — every verdict below would be unreliable.\n");
    process.exit(1);
  }
  console.log(`tile-drills: detector self-test PASSED (${cases.length} cases, including both real false positives).`);
}

selfTest();

const findings = [];
let tiles = 0;
for (const rel of UI_FILES) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    console.error(`tile-drills: FAIL — ${rel} is missing. A guard that scans nothing proves nothing.`);
    process.exit(1);
  }
  const text = readFileSync(abs, "utf8");
  PUSH.lastIndex = 0;
  for (const m of text.matchAll(PUSH)) {
    const body = m[1];
    if (!isTile(body)) continue;
    tiles++;
    if (!hasDrill(body)) {
      findings.push({ rel, line: text.slice(0, m.index).split("\n").length,
                      snippet: m[0].replace(/\s+/g, " ").slice(0, 100) });
    }
  }
}

if (tiles === 0) {
  console.error("tile-drills: FAIL — found no tile-shaped entries at all.");
  console.error("      That is implausible for this front end and means the detector has stopped");
  console.error("      matching. A guard that silently matches nothing reads as a pass forever.");
  process.exit(1);
}

if (findings.length) {
  console.error(`\ntile-drills: FAIL — ${findings.length} of ${tiles} tile(s) have no drill-down:\n`);
  for (const f of findings) {
    console.error(`  ✗ ${f.rel}:${f.line}`);
    console.error(`      ${f.snippet}`);
    console.error(`      Rule C1: a tile is a CLAIM. It must open to the individual items behind it —`);
    console.error(`      no summarising, no sampling, no top-N. Add drill: "<view_key>".\n`);
  }
  console.error("This is the owner's most repeated rule: 'a tile without a drill-down is not");
  console.error("finished and must not ship.'\n");
  process.exit(1);
}

console.log(`\ntile-drills: PASS — all ${tiles} tile(s) open to the records behind them.`);
