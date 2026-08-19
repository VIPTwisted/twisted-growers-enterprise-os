#!/usr/bin/env node
/* date-range-integrity.mjs — Rule L8: the chosen dates and the figures must agree.
 *
 * Two production defects created this gate:
 * 1. a failed date-aware dashboard RPC silently fell back to an all-time matview;
 * 2. manual From/To edits did not notify the save layer that the preset was Custom.
 *
 * Both failures make a plausible screen lie about the period it represents. There
 * is no baseline: either the displayed range is the query range or the release fails.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(ROOT, "app/web/src");

function filesBelow(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesBelow(path) : /\.(jsx?|tsx?)$/.test(entry.name) ? [path] : [];
  });
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (text) => text.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, (text, prefix) => prefix + " ".repeat(text.length - prefix.length));
}

export function inspectDateIntegrity(files) {
  const findings = [];
  let directDepartmentReads = 0;

  for (const { name, source } of files) {
    const code = stripComments(source);
    const reads = [...code.matchAll(/\.rpc\(\s*["']f_department_dashboard["']/g)];
    directDepartmentReads += reads.length;
    if (reads.length && !name.endsWith("lib/dashboard-range.js")) {
      findings.push(`${name}: calls f_department_dashboard outside the one guarded query helper`);
    }
    if (/f_department_dashboard[\s\S]{0,700}mv_department_dashboard/.test(code)) {
      findings.push(`${name}: can substitute all-time dashboard rows after a date-aware read`);
    }
  }

  if (directDepartmentReads !== 1) {
    findings.push(`expected exactly one guarded f_department_dashboard call, found ${directDepartmentReads}`);
  }

  const app = files.find((file) => file.name.endsWith("App.jsx"));
  if (!app) findings.push("App.jsx was not scanned");
  else {
    const dateInputs = app.source.split(/\r?\n/)
      .filter((line) => /aria-label=["'](?:From|To) date["']/.test(line));
    if (dateInputs.length !== 2) {
      findings.push(`expected the shared From and To inputs, found ${dateInputs.length}`);
    }
    for (const line of dateInputs) {
      if (!/onPreset\?\.\(["']custom["']\)/.test(line)) {
        findings.push("a manual date edit does not notify the save layer that the preset is custom");
      }
    }
  }
  return findings;
}

function selfTest() {
  const good = [
    { name: "lib/dashboard-range.js", source: 'client.rpc("f_department_dashboard", {})' },
    { name: "App.jsx", source: [
      '<input aria-label="From date" onChange={() => onPreset?.("custom")} />',
      '<input aria-label="To date" onChange={() => onPreset?.("custom")} />',
    ].join("\n") },
  ];
  const badFallback = [
    { name: "dashboard.jsx", source: 'client.rpc("f_department_dashboard").then(() => client.from("mv_department_dashboard"))' },
    good[1],
  ];
  const badCustom = [good[0], {
    name: "App.jsx",
    source: '<input aria-label="From date" onChange={setFrom} />\n<input aria-label="To date" onChange={setTo} />',
  }];

  const failures = [];
  if (inspectDateIntegrity(good).length) failures.push("rejected the valid contract");
  if (!inspectDateIntegrity(badFallback).some((item) => item.includes("all-time"))) failures.push("missed the forbidden fallback");
  if (!inspectDateIntegrity(badCustom).some((item) => item.includes("preset is custom"))) failures.push("missed unsaved custom dates");
  if (failures.length) throw new Error(`date-range-integrity self-test failed: ${failures.join("; ")}`);
  console.log("date-range-integrity: detector self-test passed (positive and negative fixtures).\n");
}

selfTest();
if (!existsSync(SRC)) throw new Error(`date-range-integrity: source directory missing: ${SRC}`);

const files = filesBelow(SRC).map((path) => ({
  name: path.slice(ROOT.length + 1).replaceAll("\\", "/"),
  source: readFileSync(path, "utf8"),
}));
const findings = inspectDateIntegrity(files);

if (findings.length) {
  console.error("date-range-integrity: FAIL\n");
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log(`date-range-integrity: PASS — ${files.length} source files scanned; custom ranges persist and date failures stay visible.`);
