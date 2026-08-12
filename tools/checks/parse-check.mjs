#!/usr/bin/env node
/* CHECK: every front-end source file parses with ZERO warnings.
 *
 * The cheapest gate in the repo, and it catches a real class of shipped defect.
 * App.jsx:3568 held a stray `)}` inside JSX. It was not a syntax error — the build succeeded
 * and it deployed — but React rendered the characters `)}` as visible text under every metric
 * group on the Executive Control Tower. esbuild warned about it the whole time:
 *
 *     ▲ [WARNING] The character "}" is not valid inside a JSX element
 *
 * Nothing was reading the warnings, so the bar here is ZERO warnings, not "no errors".
 *
 * Uses the esbuild binary already installed under app/web. Output goes nowhere, so this
 * cannot touch dist/ — which is also the deploy directory.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB = join(ROOT, "app", "web");

/* USE ESBUILD'S NODE API. DO NOT SPAWN ITS BINARY.
 *
 * This check ran `node node_modules/esbuild/bin/esbuild`. That path is a JavaScript
 * shim on Windows, so it worked on the machine it was written on. On Linux the same
 * path is the NATIVE ELF EXECUTABLE, which node cannot parse:
 *
 *     node_modules/esbuild/bin/esbuild:1
 *     ELF^B^A^A
 *     SyntaxError: Invalid or unexpected token
 *
 * So parse-check FAILED ON EVERY PUSH in GitHub Actions while passing locally —
 * three consecutive red runs, 24 seconds each, unnoticed, because the Action was
 * advisory and nothing was blocked by it.
 *
 * A gate that only passes on its author's operating system is worse than no gate: it
 * reports green where the work happens and red where the work is checked, so people
 * learn to ignore the red. That is the same failure as a gate red on arrival, arriving
 * from the opposite direction.
 *
 * The Node API has no shim, no spawn and no platform difference, and it returns
 * warnings as structured data rather than stderr text that has to be sniffed. */
const requireFromWeb = createRequire(join(WEB, "package.json"));
let esbuild;
try {
  esbuild = requireFromWeb("esbuild");
} catch {
  console.error("parse-check: esbuild is not installed under app/web.");
  console.error("  Run `npm install` inside app/web first.");
  process.exit(1);
}

const FILES = ["src/App.jsx", "src/budz.jsx", "src/commandcenter.jsx", "src/dashkit.jsx",
  "src/dash-cultivation.jsx", "src/dash-inventory.jsx", "src/main.jsx", "src/lib/supabase.js"];
let failed = 0;

for (const rel of FILES) {
  if (!existsSync(join(WEB, rel))) continue;

  /* transformSync surfaces WARNINGS as data. esbuild exits zero on a warning, which is
     precisely the case this check exists to catch — a stray `)}` in JSX is a warning,
     and one of those rendered as visible text on the Executive Control Tower. */
  const at = (l) => `${rel}:${l?.line ?? "?"}:${l?.column ?? "?"}`;
  let noise = "";
  try {
    const out = esbuild.transformSync(readFileSync(join(WEB, rel), "utf8"), {
      loader: rel.endsWith(".jsx") ? "jsx" : "js",
      sourcefile: rel,
      logLevel: "silent",
    });
    noise = (out.warnings ?? [])
      .map((w) => `  ${at(w.location)}  ${w.text}`)
      .join("\n")
      .trim();
  } catch (e) {
    noise = (e.errors ?? []).length
      ? e.errors.map((x) => `  ${at(x.location)}  ${x.text}`).join("\n")
      : String(e?.message ?? e);
  }

  if (noise) {
    console.error("parse-check: FAIL — " + rel);
    console.error(noise);
    failed++;
  } else {
    console.log("parse-check: ok — " + rel);
  }
}

if (failed) {
  console.error("\nparse-check: " + failed + " file(s) produced warnings or errors. The bar is zero.");
  console.error("A JSX warning is not cosmetic here — a stray token renders as visible text.");
  process.exit(1);
}
console.log("parse-check: PASS — all files parse with no warnings.");
process.exit(0);
