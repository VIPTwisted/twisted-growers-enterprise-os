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
  let defaultReads = 0;
  let catalogReads = 0;

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
    const defaults = [...code.matchAll(/\.rpc\(\s*["']f_date_default["']/g)];
    defaultReads += defaults.length;
    if (defaults.length && !name.endsWith("lib/date-range.js")) {
      findings.push(`${name}: resolves a date default outside the one guarded hook`);
    }
    const catalogs = [...code.matchAll(/\.rpc\(\s*["']f_date_presets["']/g)];
    catalogReads += catalogs.length;
    if (catalogs.length && !name.endsWith("lib/date-range.js")) {
      findings.push(`${name}: reads the preset catalog outside the one guarded loader`);
    }
    if (/\b(?:DATE_PRESETS|DATE_CHIPS)\b|\bpresetRange\s*\(/.test(code)) {
      findings.push(`${name}: carries a browser-owned date catalog or calendar calculator`);
    }
    if (/\.lte\(\s*dateCol\s*,/.test(code)) {
      findings.push(`${name}: To date stops at midnight instead of using the exclusive next-day boundary`);
    }
  }

  if (directDepartmentReads !== 1) {
    findings.push(`expected exactly one guarded f_department_dashboard call, found ${directDepartmentReads}`);
  }
  if (defaultReads !== 1) findings.push(`expected exactly one guarded f_date_default call, found ${defaultReads}`);
  if (catalogReads !== 1) findings.push(`expected exactly one guarded f_date_presets call, found ${catalogReads}`);

  const app = files.find((file) => file.name.endsWith("App.jsx"));
  if (!app) findings.push("App.jsx was not scanned");
  else {
    const dateInputs = app.source.split(/\r?\n/)
      .filter((line) => /aria-label=["'](?:From|To) date["']/.test(line));
    if (dateInputs.length !== 2) {
      findings.push(`expected the shared From and To inputs, found ${dateInputs.length}`);
    }
    for (const line of dateInputs) if (!/editDate\(["'](?:from|to)["']/.test(line)) {
      findings.push("a manual date edit bypasses the shared preset/save state");
    }
    if (!/dateSelectionLabel\(selected, customActive, from, to\)/.test(app.source)) {
      findings.push("the shared date control can label a governed preset as Custom");
    }
    if (!/f_schedule_cost_range/.test(app.source)) {
      const schedule = files.find((file) => file.name.endsWith("dash-schedule.jsx"));
      if (!schedule || !/f_schedule_cost_range/.test(schedule.source)) {
        findings.push("Schedule Adherence has no exact-range KPI query");
      }
    }
  }
  return findings;
}

function selfTest() {
  const good = [
    { name: "lib/dashboard-range.js", source: 'client.rpc("f_department_dashboard", {})' },
    { name: "lib/date-range.js", source: 'client.rpc("f_date_default", {}); client.rpc("f_date_presets")' },
    { name: "dash-schedule.jsx", source: 'client.rpc("f_schedule_cost_range", {})' },
    { name: "App.jsx", source: [
      '<input aria-label="From date" onChange={() => editDate("from")} />',
      '<input aria-label="To date" onChange={() => editDate("to")} />',
      'dateSelectionLabel(selected, customActive, from, to)',
    ].join("\n") },
  ];
  const badFallback = [
    { name: "dashboard.jsx", source: 'client.rpc("f_department_dashboard").then(() => client.from("mv_department_dashboard"))' },
    good[1], good[2], good[3],
  ];
  const badCustom = [good[0], good[1], good[2], {
    name: "App.jsx",
    source: '<input aria-label="From date" onChange={setFrom} />\n<input aria-label="To date" onChange={setTo} />',
  }];
  const badLabel = [good[0], good[1], good[2], {
    name: "App.jsx",
    source: [
      '<input aria-label="From date" onChange={() => editDate("from")} />',
      '<input aria-label="To date" onChange={() => editDate("to")} />',
    ].join("\n"),
  }];

  const failures = [];
  if (inspectDateIntegrity(good).length) failures.push("rejected the valid contract");
  if (!inspectDateIntegrity(badFallback).some((item) => item.includes("all-time"))) failures.push("missed the forbidden fallback");
  if (!inspectDateIntegrity(badCustom).some((item) => item.includes("preset/save state"))) failures.push("missed unsaved custom dates");
  if (!inspectDateIntegrity(badLabel).some((item) => item.includes("governed preset as Custom"))) failures.push("missed a mislabeled governed preset");
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
