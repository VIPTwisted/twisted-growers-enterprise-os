import test from "node:test";
import assert from "node:assert/strict";
import {
  certifiedPopulationVerdict, classifyReportMeasures, loadedGrainVerdict,
  loadedMeasureVerdict, reportMeasurePolicy, selectReportContract,
} from "../../app/web/src/lib/report-measure-contract.js";

const apex = {
  report_key: "sales.apex_invoice_truth", fact_view: "v_apex_invoice_truth",
  measures: ["recognized_total_usd"], row_grain: "one row per Apex order",
  grain_keys: ["apex_order_id"], grain_verified: true,
  grain_verification_reason: "VERIFIED — row/value grain and eligible values are complete",
  contract_digest: "contract-a",
  measure_contracts: {
    recognized_total_usd: {
      measure_key: "apex.recognized_sales", canonical_relation: "v_apex_invoice_truth",
      canonical_column: "recognized_total_usd", value_grain: "one row per Apex order",
      value_grain_keys: ["apex_order_id"], aggregation: "sum",
      eligibility_column: "cancelled", eligibility_equals: false,
      null_policy: "forbid_for_eligible", source_verified: true,
    },
  },
};

test("only a unique contract is selected", () => {
  assert.equal(selectReportContract([apex], apex.fact_view, "anything").contract, apex);
  assert.equal(selectReportContract([apex, { ...apex, report_key: "other" }], apex.fact_view, "anything").ambiguous, true);
  assert.equal(selectReportContract([apex, { ...apex, report_key: "other" }], apex.fact_view, apex.report_key).contract, apex);
});

test("a proven canonical order-grain sales measure is summable", () => {
  assert.equal(reportMeasurePolicy(apex, "recognized_total_usd", "number").summable, true);
});

test("an unregistered numeric field is display-only", () => {
  const policy = reportMeasurePolicy(apex, "invoice_total_usd", "number");
  assert.equal(policy.summable, false);
  assert.equal(policy.declared, false);
});

test("a report cannot self-attest repeated invoice money as tag-grain value", () => {
  const fraudulent = { ...apex, fact_view: "v_tag_lines", row_grain: "one row per tag", grain_keys: ["tag"], measures: ["invoice_total_usd"] };
  fraudulent.measure_contracts = { invoice_total_usd: apex.measure_contracts.recognized_total_usd };
  const rows = [{ tag: "TAG-A", invoice_total_usd: 100 }, { tag: "TAG-B", invoice_total_usd: 100 }];
  assert.equal(reportMeasurePolicy(fraudulent, "invoice_total_usd", "number").summable, false);
  assert.equal(loadedGrainVerdict(rows, { ...fraudulent, grain_verified: true }).verified, true);
});

test("missing, mismatched, or unverified canonical sources refuse totals", () => {
  assert.equal(reportMeasurePolicy({ ...apex, row_grain: null, grain_keys: [], measure_contracts: {} }, "recognized_total_usd", "number").summable, false);
  const mismatch = { ...apex, measure_contracts: { recognized_total_usd: { ...apex.measure_contracts.recognized_total_usd, value_grain_keys: ["tag"] } } };
  assert.equal(reportMeasurePolicy(mismatch, "recognized_total_usd", "number").summable, false);
  const drifted = { ...apex, measure_contracts: { recognized_total_usd: { ...apex.measure_contracts.recognized_total_usd, source_verified: false } } };
  assert.equal(reportMeasurePolicy(drifted, "recognized_total_usd", "number").summable, false);
});

test("a declared contract fails closed when live verification fails", () => {
  const stale = { ...apex, grain_verified: false, grain_verification_reason: "REFUSED — grain keys are not unique" };
  assert.match(reportMeasurePolicy(stale, "recognized_total_usd", "number").reason, /not unique/);
});

test("a rate stays non-additive even if a bad contract calls it sum", () => {
  const bad = { ...apex, measures: ["failure_rate"], measure_contracts: { failure_rate: { ...apex.measure_contracts.recognized_total_usd, canonical_column: "failure_rate" } } };
  assert.equal(reportMeasurePolicy(bad, "failure_rate", "number").summable, false);
});

test("classification separates totals, refused measures, and display-only numerics", () => {
  const contract = { ...apex, measures: ["recognized_total_usd", "days_held"], measure_contracts: { ...apex.measure_contracts, days_held: { ...apex.measure_contracts.recognized_total_usd, canonical_column: "days_held", aggregation: "display_only" } } };
  const result = classifyReportMeasures(
    ["recognized_total_usd", "days_held", "line_count", "buyer"],
    [{ name: "recognized_total_usd", kind: "number" }, { name: "days_held", kind: "number" }, { name: "line_count", kind: "number" }, { name: "buyer", kind: "text" }], contract);
  assert.deepEqual(result.summable.map((row) => row.name), ["recognized_total_usd"]);
  assert.deepEqual(result.refused.map((row) => row.name), ["days_held"]);
  assert.deepEqual(result.displayOnly.map((row) => row.name), ["line_count"]);
});

test("loaded keys reject blank, trimmed duplicates, and zero rows", () => {
  assert.equal(loadedGrainVerdict([{ apex_order_id: "A" }, { apex_order_id: "B" }], apex).verified, true);
  assert.equal(loadedGrainVerdict([{ apex_order_id: " A " }, { apex_order_id: "A" }], apex).verified, false);
  assert.equal(loadedGrainVerdict([{ apex_order_id: "   " }], apex).verified, false);
  assert.equal(loadedGrainVerdict([], apex).verified, false);
});

test("eligible null money is incomplete while cancelled null money is explicitly excluded", () => {
  const verdict = loadedMeasureVerdict([
    { apex_order_id: "A", cancelled: false, recognized_total_usd: 100 },
    { apex_order_id: "B", cancelled: true, recognized_total_usd: null },
    { apex_order_id: "C", cancelled: false, recognized_total_usd: null },
  ], apex, "recognized_total_usd");
  assert.deepEqual([verdict.eligible, verdict.valued, verdict.invalid, verdict.verified, verdict.total], [2, 1, 1, false, null]);
});

test("an ineligible numeric value never enters the certified sum", () => {
  const verdict = loadedMeasureVerdict([
    { apex_order_id: "A", cancelled: false, recognized_total_usd: 100 },
    { apex_order_id: "B", cancelled: true, recognized_total_usd: 999 },
  ], apex, "recognized_total_usd");
  assert.deepEqual([verdict.verified, verdict.eligible, verdict.valued, verdict.total], [true, 1, 1, 100]);
});

test("only one snapshot-receipted complete population may total", () => {
  const receipt = { snapshotVerified: true, snapshotId: "snapshot-a" };
  assert.equal(certifiedPopulationVerdict({ rows: [{}, {}], total: 2, truncated: false, contractDigest: "a", rowsContractDigest: "a", ...receipt }).verified, true);
  assert.equal(certifiedPopulationVerdict({ rows: [{}, {}], total: 2, truncated: false, contractDigest: "a", rowsContractDigest: "a" }).verified, false);
  assert.equal(certifiedPopulationVerdict({ rows: [{}], total: 2, truncated: false, contractDigest: "a", rowsContractDigest: "a", ...receipt }).verified, false);
  assert.equal(certifiedPopulationVerdict({ rows: [{}, {}], total: 2, truncated: true, contractDigest: "a", rowsContractDigest: "a", ...receipt }).verified, false);
  assert.equal(certifiedPopulationVerdict({ rows: [{}, {}], total: 2, truncated: false, contractDigest: "a", rowsContractDigest: "b", ...receipt }).verified, false);
});
