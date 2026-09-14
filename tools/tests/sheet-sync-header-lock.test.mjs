// sheet-sync HEADER LOCK — runs the function's own parseCsv / mapField / findHeader / row rule
// against fixtures whose HEADER lines are the live workbook's on 12 Sep 2026 (the day Solventless was
// found missing) and whose rows are synthetic - no real tags, batches, strains or names are committed.
// Solventless keeps the defect's shape: header at row 1, products from row 2, hint still 2. Run: node tools/tests/sheet-sync-header-lock.test.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const FIX = join(HERE, "fixtures", "sheet-sync-2026-09-12");
const REPO_WEB_PKG = join(ROOT, "app", "web", "package.json");
const REPO_FN = join(ROOT, "app", "supabase", "functions", "sheet-sync", "index.ts");
const PURE_OUT = join(mkdtempSync(join(tmpdir(), "sheet-sync-")), "pure.mjs");
const require = createRequire(REPO_WEB_PKG);
const esbuild = require("esbuild");

const src = readFileSync(REPO_FN, "utf8");
// Keep everything above Deno.serve (pure functions + constants), drop the Deno/JSR imports and the service client.
const pure = src.split("Deno.serve(")[0]
  .replace(/^import .*$/gm, "")
  .replace(/^const service = .*$/m, "")
  .replace(/^async function callerIsExecutive[\s\S]*?^}\n/m, "")
  .replace(/^async function fetchTab[\s\S]*?^}\n/m, "");
const js = esbuild.transformSync(pure + "\nexport { parseCsv, mapField, findHeader, TABS, IDENTITY };", { loader: "ts", format: "esm" }).code;
const out = PURE_OUT;
writeFileSync(out, js);
const mod = await import(pathToFileURL(out).href);

const keys = { "Solventless":"solventless","Hydrocarbon":"hydrocarbon","Infused PreRolls":"infused_preroll","1.0g Raw PreRolls":"raw_preroll_1g","0.5g Raw PreRolls":"raw_preroll_05g","1.0g Economy Raw ":"economy_raw_1g","Economy Infused":"economy_infused","0.5g Economy Raw":"economy_raw_05g","Vaporizers":"vaporizer" };
const EXPECT = { "Solventless":3, "Hydrocarbon":2, "Infused PreRolls":0, "1.0g Raw PreRolls":1, "0.5g Raw PreRolls":1, "1.0g Economy Raw":2, "Economy Infused":1, "0.5g Economy Raw":0, "Vaporizers":2 };
let total = 0, failures = 0;
for (const [tab, , hint] of mod.TABS) {
  const grid = mod.parseCsv(readFileSync(`${FIX}/${keys[tab]}.csv`, "utf8"));
  const found = mod.findHeader(grid, hint);
  if (!found) { console.log(`${tab.padEnd(20)} NO HEADER FOUND (hint ${hint})  <-- would REFUSE`); failures++; continue; }
  let n = 0;
  for (let r = found.row; r < grid.length; r++) {
    const rec = {};
    for (const [i, f] of Object.entries(found.cols)) { const v = (grid[r][Number(i)] ?? "").trim(); if (v) rec[f] = v; }
    if (mod.IDENTITY.some(k => rec[k])) n++;
  }
  total += n;
  const want = EXPECT[tab.trim()]; const ok = found.row === 1 && n === want;
  if (!ok) failures++;
  console.log(`${tab.padEnd(20)} header row ${found.row} (hint ${hint})  cols ${String(Object.keys(found.cols).length).padStart(2)}  kept ${n} (want ${want}) ${ok ? "✓" : "✗"}`);
}
console.log("TOTAL kept", total);
const bogus = [["Ready To Ship","1A40A030000E5B2000009018","x","CJxSB-LRO-051926","Alien Cherry Mint","1.0 g","0"],["Ready To Ship","1A40A030000E5B2000009019","y","SBxDT-LRO-041926","Boof Taxi","1.0 g","0"]];
const neg = mod.findHeader(bogus, 2);
console.log("headerless grid ->", neg === null ? "null (refused) ✓" : "FOUND A HEADER IN DATA ✗");
if (neg !== null) failures++;
process.exit(failures ? 1 : 0);
