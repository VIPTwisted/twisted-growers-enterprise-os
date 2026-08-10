#!/usr/bin/env node
/* CHECK: every edge function is scope-analysed. An identifier that is never defined must
 * not reach production.
 *
 * WHY THIS EXISTS — caught on the day it was written, by the defect it was written for.
 *
 * On 10 Aug 2026 a 429 retry path was added to apex-sync referencing MAX_RATE_RETRIES, and
 * the constant was never declared. Nothing in the repository could see it:
 *
 *   · esbuild parses the file and exits 0 — it is a bundler, and an unresolved identifier is
 *     assumed to be a global. `parse-check.mjs` uses esbuild and covers FOUR front-end files.
 *   · ESLint has `no-undef: "error"`, which is precisely this rule, and is scoped to
 *     `app/web/src/**` — so all 25 edge functions were unlinted.
 *   · There is no tsconfig anywhere in this repository and no type checking at all.
 *
 * The reference sat inside `if (r.status === 429)`. It would have thrown ReferenceError only
 * when Apex rate-limited us — during a burst, on the one path whose whole job is to keep the
 * sync alive under pressure. A latent crash in the error handler is worse than no error
 * handler, because the error handler is what runs when things are already going wrong.
 *
 * Edge functions are the highest-consequence code in this repository: metrc-sync, budz-chat,
 * apex-sync and integration-settings all run unattended, with service-role credentials, and
 * three of them once ran with no source committed anywhere.
 *
 * HOW, WITH NO NEW DEPENDENCIES. esbuild (already under app/web) strips TypeScript to plain
 * JavaScript; ESLint (already a root devDependency) does the scope analysis that esbuild
 * deliberately does not. Deliberately narrow — the typo class only, the same rules the
 * front-end config calls "tied to real defects in this repo". A linter that reports style
 * opinions on somebody else's edge function gets switched off, and then it catches nothing.
 *
 *   node tools/checks/edge-function-lint.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ESLint } from "eslint";
import globals from "globals";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/* ESBUILD'S NODE API, NOT ITS BINARY. This ran `node .../esbuild/bin/esbuild`,
   which is a JS shim on Windows and the NATIVE ELF EXECUTABLE on Linux — so in
   GitHub Actions every one of the 26 functions reported "does not parse" with
   `ELF^B^A^A / SyntaxError`, and the whole suite has been red on every push while
   green locally. Same defect as parse-check, same fix. */
const requireFromWeb = createRequire(join(ROOT, "app", "web", "package.json"));

/* Both trees hold edge functions. supabase/functions/ was missed by an earlier check that
   assumed there was only one, which is how metrc-sales-detail went unexamined. */
const ROOTS = [
  join(ROOT, "app", "supabase", "functions"),
  join(ROOT, "supabase", "functions"),
];

let esbuild;
try {
  esbuild = requireFromWeb("esbuild");
} catch {
  console.error("edge-function-lint: FAIL — esbuild is not installed under app/web.");
  console.error("  Run `npm install` inside app/web first. Without it, 25 edge functions");
  console.error("  holding service-role credentials get no scope analysis at all.\n");
  process.exit(1);
}

function findFunctions() {
  const out = [];
  for (const base of ROOTS) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const entry = join(base, name, "index.ts");
      if (existsSync(entry) && statSync(entry).isFile()) out.push(entry);
    }
  }
  return out.sort();
}

const files = findFunctions();
if (files.length === 0) {
  console.error("edge-function-lint: FAIL — no edge functions found under either functions/ tree.");
  console.error("  Either they moved, or this check is looking in the wrong place and is");
  console.error("  reporting PASS over nothing. A gate with an empty subject proves nothing.\n");
  process.exit(1);
}

/* Deno's runtime globals plus the Web APIs edge functions actually use. `Deno` itself is not
   in the `globals` package's browser set, and neither is EdgeRuntime. */
const DENO_GLOBALS = {
  ...globals.browser,
  ...globals.es2021,
  Deno: "readonly",
  EdgeRuntime: "readonly",
  caches: "readonly",
  crypto: "readonly",
};

const eslint = new ESLint({
  overrideConfigFile: true,          // ignore the front-end config entirely
  overrideConfig: {
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: DENO_GLOBALS },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      /* THE ONE THIS EXISTS FOR. */
      "no-undef": "error",
      /* The rest of the typo class, matching eslint.config.mjs — each maps to a defect
         this project has actually suffered, not to a style preference. */
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-func-assign": "error",
      "no-unreachable": "error",
      "no-cond-assign": "error",
      "no-dupe-else-if": "error",
      "no-self-assign": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      /* An empty catch is how an error disappears, and these functions run unattended with
         nobody watching stderr. Warning only: several deliberately swallow diagnostics with
         an explanatory comment, and a gate that is red on arrival gets switched off. */
      "no-empty": ["warn", { allowEmptyCatch: false }],
    },
  },
});

let failed = 0;
let warned = 0;

for (const abs of files) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");

  /* Strip the types, keep the line numbers. --sourcemap would be better but the mapping cost
     is not worth it: these files are small and the identifier name is in the message. */
  /* loader "ts" is explicit here because transformSync has no filename to infer from.
     The old CLI form had to OMIT --loader for the opposite reason — that flag is
     stdin-only on the command line — and that asymmetry is exactly the kind of thing
     that makes a check fail for the wrong reason. The API has no such trap. */
  let stripped;
  try {
    stripped = esbuild.transformSync(readFileSync(abs, "utf8"), {
      loader: "ts",
      format: "esm",
      target: "esnext",
      sourcefile: rel,
      logLevel: "silent",
    }).code;
  } catch (e) {
    console.error(`edge-function-lint: FAIL — ${rel} does not parse.`);
    const errs = (e && e.errors) || [];
    console.error(
      (errs.length
        ? errs.map((x) => `  ${rel}:${x.location?.line ?? "?"}  ${x.text}`).join("\n")
        : String(e?.message ?? e)) + "\n",
    );
    failed++;
    continue;
  }

  /* Imports survive type-stripping and ESLint cannot resolve a jsr:/npm: specifier, but it
     does not need to: the imported bindings are declared by the import statement itself, so
     scope analysis is complete without resolution. */
  const [res] = await eslint.lintText(stripped, { filePath: abs.replace(/\.ts$/, ".mjs") });
  const errors = (res?.messages ?? []).filter((m) => m.severity === 2);
  const warnings = (res?.messages ?? []).filter((m) => m.severity === 1);

  if (errors.length) {
    console.error(`edge-function-lint: FAIL — ${rel}`);
    for (const m of errors) console.error(`    ${m.ruleId ?? "parse"}: ${m.message}`);
    failed++;
  } else {
    console.log(`edge-function-lint: ok      — ${rel}`
      + (warnings.length ? `  (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : ""));
    warned += warnings.length;
  }
}

if (failed) {
  console.error(`\nedge-function-lint: FAIL — ${failed} of ${files.length} edge function(s) have`);
  console.error("scope or syntax errors. These run unattended with service-role credentials;");
  console.error("an undefined identifier is a ReferenceError waiting for the branch that uses it,");
  console.error("and that branch is usually the error handler.\n");
  process.exit(1);
}

console.log(`edge-function-lint: PASS — all ${files.length} edge functions scope-analysed`
  + (warned ? `, ${warned} warning(s) not blocking` : "") + ".");
