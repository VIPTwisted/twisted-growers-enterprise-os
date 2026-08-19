#!/usr/bin/env node
/* A database read failure or empty mirror result must never become a Metrc diagnosis. */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from >= 0 && to > from ? source.slice(from, to) : "";
};

export function inspectMetrcReads(source) {
  const findings = [];
  const requireText = (haystack, needle, message) => {
    if (!haystack.includes(needle)) findings.push(message);
  };
  const forbid = (haystack, pattern, message) => {
    if (pattern.test(haystack)) findings.push(message);
  };

  const failure = between(source, "function ReadFailure", "function LocationHistory");
  const location = between(source, "function LocationHistory", "function SeedToSaleSummary");
  const seed = between(source, "function SeedToSaleSummary", "function TraceDrawer");
  const trace = between(source, "function TraceDrawer", "function ForensicPanel");
  const scan = between(source, "function MetrcScanSchedule", "/* ---------- Settings → Metrc Report Imports");

  requireText(failure, 'role="alert"', "shared read failure is not announced as an alert");
  requireText(failure, "No empty result or compliance conclusion has been substituted", "read failure does not refuse a substituted conclusion");
  requireText(location, "const { data, error } = await q", "location history does not retain its database error");
  requireText(location, "if (error)", "location history does not stop on read failure");
  requireText(location, "This is not proof Metrc has no record", "empty location mirror result is presented as a Metrc diagnosis");
  requireText(seed, "readErrors", "seed-to-sale summary does not inspect every parallel read error");
  requireText(seed, "if (readErrors.length)", "seed-to-sale summary does not stop when any source read fails");
  requireText(seed, "This is not proof Metrc lacks", "empty seed-to-sale mirror result is presented as a Metrc diagnosis");
  requireText(trace, 'what="The Metrc lineage RPC"', "lineage RPC failure has no explicit blocked state");
  requireText(trace, "if (error) { setRead", "lineage RPC does not preserve its error");
  requireText(trace, "This is not proof Metrc lacks the chain", "empty lineage mirror result is presented as a Metrc diagnosis");
  requireText(scan, 'what="The Metrc scan settings"', "scan-settings failure has no explicit blocked state");
  requireText(scan, "if (error) { setRead", "scan-settings read failure is converted into data");
  requireText(scan, "scheduledCalls", "scan-settings KPIs are not derived from returned rows");
  requireText(scan, "v_metrc_scan_settings", "scan-settings page does not disclose its governed source");

  forbid(source, /No chain recorded in Metrc|No seed-to-sale chain is recorded|nothing in Metrc is currently held/i,
    "legacy empty-result-as-Metrc-fact language remains");
  forbid(trace, /error\s*\?\s*\[\]/, "lineage RPC still converts an error to an empty array");
  forbid(scan, /error\s*\?\s*\[\]/, "scan-settings still converts an error to an empty array");
  forbid(scan, /5,141|4,032|1,099|21,132|Nightly reconcile|<td>Lookups<\/td>|daytime\s*=|total\s*=\s*daytime/i,
    "scan-settings still publishes a figure not supplied by its view");

  return findings;
}

const good = `
function ReadFailure(){ return <div role="alert">No empty result or compliance conclusion has been substituted</div> }
function LocationHistory(){ const { data, error } = await q; if (error) return; return <>This is not proof Metrc has no record</> }
function SeedToSaleSummary(){ const readErrors=[]; if (readErrors.length) return; return <>This is not proof Metrc lacks a chain</> }
function TraceDrawer(){ if (error) { setRead(error) } return <ReadFailure what="The Metrc lineage RPC"/>; /* This is not proof Metrc lacks the chain */ }
function ForensicPanel(){}
function MetrcScanSchedule(){ if (error) { setRead(error) } const scheduledCalls=1; return <><ReadFailure what="The Metrc scan settings"/>v_metrc_scan_settings</> }
/* ---------- Settings → Metrc Report Imports */`;
const bad = good.replace("if (error) { setRead(error) } const scheduledCalls=1", "setRead(error ? [] : data); const scheduledCalls=5141");
if (inspectMetrcReads(good).length || !inspectMetrcReads(bad).length) {
  throw new Error("metrc-read-integrity detector self-test failed");
}

const app = readFileSync(join(root, "app/web/src/App.jsx"), "utf8");
const findings = inspectMetrcReads(app);
if (findings.length) {
  console.error("metrc-read-integrity: FAIL");
  findings.forEach((finding) => console.error(`  - ${finding}`));
  process.exit(1);
}
console.log("metrc-read-integrity: PASS — failed reads are blocked, empty mirror results are not Metrc diagnoses, and scan KPIs are view-backed.");
