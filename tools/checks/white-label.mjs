#!/usr/bin/env node
/* white-label.mjs — the product carries no customer as text.
 *
 * OWNER RULING, 15 Sep 2026: "rules, staff shit is part of onboarding — treat as white label build,
 * do not hardwire." Everything about the company the platform serves — its name, its rules, its
 * roles, its people, its dates — is a row the company enters during onboarding. The HR platform
 * was measured on 15 Sep with 123 occurrences of the company's name written into its screens
 * (handbook and letter templates, headers, greetings, the board pack, the login) and a config
 * store in localStorage whose defaults carried the name; the tenant id was a literal uuid.
 *
 * WHAT IT ENFORCES: no source file under app/hr/src or app/web/src spells the customer's name.
 * The name comes from the rows (hr.tg_company(), hr.tg_settings_get() → companyName() in
 * app/hr/src/lib/config.js; nav_registry / company_licenses on the OS side). The only place this
 * file allows the literal is comments — a comment can say why a thing was built, code cannot
 * say who for.
 *
 * The OS bundle (app/web) is checked with a ratchet: its count is pinned at the value measured
 * when this gate was written, and may only go down. The HR platform is at zero and stays there.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATE = "white-label";
const NAMES = [/Twisted Growers/];
/* The OS carries the name in its own identity (title, login, brand locker, licences page). Ratchet: never more. */
const OS_BASELINE = 26; // measured 15 Sep 2026 (title, login, brand locker, licences page, HR door texts); goes down, never up

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) { if (!/node_modules|dist|\.git/.test(e)) walk(p, out); }
    else if (/\.(jsx?|tsx?)$/.test(e)) out.push(p);
  }
  return out;
}
/* Strip comments so a comment may name the customer (why it was built) while code may not (who for). */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}
function count(dir) {
  const hits = [];
  for (const f of walk(dir)) {
    const lines = code(readFileSync(f, "utf8")).split("\n");
    lines.forEach((l, i) => { for (const re of NAMES) if (re.test(l)) hits.push(`${relative(ROOT, f)}:${i + 1}: ${l.trim().slice(0, 140)}`); });
  }
  return hits;
}

const hr = count(join(ROOT, "app", "hr", "src"));
const os = count(join(ROOT, "app", "web", "src"));
const failures = [];
if (hr.length) failures.push(`the HR platform names the customer in code (${hr.length}):\n    ${hr.slice(0, 12).join("\n    ")}${hr.length > 12 ? `\n    … and ${hr.length - 12} more` : ""}`);
if (os.length > OS_BASELINE) failures.push(`the OS names the customer in ${os.length} places; the ratchet allows ${OS_BASELINE}`);

if (failures.length) {
  console.error(`${GATE}: FAIL — ${failures.length} finding(s):`);
  for (const f of failures) console.error(`    x ${f}`);
  console.error("\n    White-label (owner, 15 Sep 2026): the company's name, rules, roles, people and dates are rows the");
  console.error("    company enters during onboarding — read companyName() / hr.tg_company(), never write the name.");
  process.exit(1);
}
console.log(`${GATE}: PASS — HR platform 0 customer names in code; OS ${os.length} (ratchet ${OS_BASELINE}).`);
