#!/usr/bin/env node
/* ui-language.mjs — the owner is not an engineer, and the screen must not assume he is.
 *
 * ENFORCES Rule F4 — "no abbreviations. 'Unit of measure', not 'UOM'." — and serves
 * Rule I3, "plain English beside the professional language. Vinny is not an engineer."
 *
 * WHY A GUARD AND NOT A STYLE NOTE
 * Every other rule in section F was earned by something breaking visibly: blank screens,
 * clipped text, horizontal scrollbars. F4 breaks nothing — it just quietly makes the
 * product unusable by the person it was built for, one label at a time, and nobody files
 * a bug for a label. Rules that fail silently are exactly the ones that need machinery.
 *
 * IT IS CURRENTLY CLEAN. This is a regression guard, not a cleanup: the front end today
 * uses no banned abbreviation in a user-facing string. That is worth keeping.
 *
 * PRECISION, because three guards fired on prose today. It reads only QUOTED STRINGS —
 * not identifiers, not imports, not comments — so `const uom = row.uom` is untouched
 * while the label "UOM" is caught. Standard terms the owner's own rulebook uses, such as
 * COA and Metrc, are allowlisted with a reason rather than silently permitted.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");

/* Files the user actually reads text from. */
const UI_FILES = ["app/web/src/App.jsx", "app/web/src/budz.jsx",
  "app/web/src/commandcenter.jsx", "app/web/src/dashkit.jsx",
  "app/web/src/dash-cultivation.jsx", "app/web/src/dash-inventory.jsx"];

/* Banned abbreviation -> what it must say instead. From rule F4's own example outward. */
const BANNED = {
  UOM: "Unit of measure",
  QTY: "Quantity",
  MFG: "Manufacturing",
  PKG: "Package",
  INV: "Inventory",
  WIP: "Work in progress",
  AMT: "Amount",
  QOH: "Quantity on hand",
  YTD: "Year to date",
  DOM: "Days on hand",
  RCVD: "Received",
  ADJ: "Adjustment",
};

/* Allowed because the owner's own rulebook uses them as the proper name of the thing.
   Listed with a reason so an exemption is arguable rather than invisible. */
const ALLOWED = {
  COA: "CLAUDE.md rule C3a uses 'certificate' in prose and COA as the document's name. It is the industry term on the document itself.",
  THC: "The analyte's name.",
  TAC: "The analyte's name, used throughout the owner's rules.",
  CBD: "The analyte's name.",
  API: "Names an interface, not a business quantity.",
  PDF: "A file format.",
  CSV: "A file format.",
  URL: "A web address.",
};

function selfTest() {
  const strings = ['"Filter by UOM"', '"Unit of measure"', '"COA on file"', 'const uom = row.uom'];
  const expect = [true, false, false, false];
  const got = strings.map((s) => quotedStrings(s).some((q) => hits(q).length > 0));
  const bad = got.map((g, i) => (g === expect[i] ? null : i)).filter((i) => i !== null);
  if (bad.length) {
    console.error("ui-language: FAIL — the detector is broken:");
    bad.forEach((i) => console.error(`  ✗ ${strings[i]} -> got ${got[i]}, wanted ${expect[i]}`));
    process.exit(1);
  }
  console.log(`ui-language: detector self-test PASSED (${strings.length} cases).`);
}

/* Quoted strings only. Deliberately ignores template-literal expressions and comments:
   an identifier is not a label, and flagging code would make this guard a nuisance,
   which is how a guard gets switched off. */
function quotedStrings(line) {
  const out = [];
  for (const m of line.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\$]*)`/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

function hits(str) {
  const found = [];
  for (const abbr of Object.keys(BANNED)) {
    if (ALLOWED[abbr]) continue;
    /* Whole word, and only when it reads as a label: surrounded by non-letters. */
    if (new RegExp(`(^|[^A-Za-z])${abbr}([^A-Za-z]|$)`).test(str)) found.push(abbr);
  }
  return found;
}

selfTest();
for (const [a, why] of Object.entries(ALLOWED)) console.log(`ui-language: allowed — ${a}: ${why.split(".")[0]}.`);

const findings = [];
for (const rel of UI_FILES) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    console.error(`ui-language: FAIL — ${rel} does not exist. A guard that scans nothing proves nothing.`);
    process.exit(1);
  }
  readFileSync(abs, "utf8").split("\n").forEach((line, i) => {
    for (const q of quotedStrings(line)) {
      for (const abbr of hits(q)) {
        findings.push({ rel, line: i + 1, abbr, text: q.slice(0, 70) });
      }
    }
  });
}

if (findings.length) {
  console.error(`\nui-language: FAIL — ${findings.length} abbreviation(s) in user-facing text:\n`);
  for (const f of findings) {
    console.error(`  ✗ ${f.rel}:${f.line}  "${f.text}"`);
    console.error(`      "${f.abbr}" must read "${BANNED[f.abbr]}" (rule F4).`);
  }
  console.error("\nThe owner is not an engineer. A label he has to decode is a label that fails him,");
  console.error("and nobody ever files a bug for a label — which is why this is a build gate.\n");
  process.exit(1);
}

console.log(`\nui-language: PASS — ${Object.keys(BANNED).length} abbreviations checked across ${UI_FILES.length} files, none in user-facing text.`);
