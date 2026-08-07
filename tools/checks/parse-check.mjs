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
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB = join(ROOT, "app", "web");
/* Invoke esbuild's JS entry point with node rather than the .bin shim.
 *
 * The shim is esbuild.cmd on Windows, which node cannot spawn directly; using shell:true to
 * work around that then breaks on the space in "Claude_Twisted Growers" because the shell
 * splits the unquoted command path. Going straight to the JS avoids both problems and is
 * identical on every platform. */
const bin = join(WEB, "node_modules", "esbuild", "bin", "esbuild");

if (!existsSync(bin)) {
  console.error("parse-check: esbuild not found at " + bin);
  console.error("  Run `npm install` inside app/web first.");
  process.exit(1);
}

const FILES = ["src/App.jsx", "src/budz.jsx", "src/main.jsx", "src/lib/supabase.js"];
let failed = 0;

for (const rel of FILES) {
  if (!existsSync(join(WEB, rel))) continue;

  /* spawnSync gives us stderr whether or not the exit code is zero. esbuild exits 0 on
     warnings, which is precisely the case this check exists to catch. */
  const r = spawnSync(process.execPath, [bin, "--loader:.jsx=jsx", "--log-level=warning", rel], {
    cwd: WEB,
    encoding: "utf8",
  });

  if (r.error) {
    console.error("parse-check: could not run esbuild — " + r.error.message);
    process.exit(1);
  }

  const noise = [r.stderr || "", r.status !== 0 ? "esbuild exited " + r.status : ""]
    .join("\n")
    .trim();

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
