/* Numeric is not additive by type or by a report author's assertion. A sum
   needs an independently governed canonical measure, a verified source, an
   exact row/value key match, explicit eligibility/null semantics, and the
   complete loaded population. */

const NEVER_SUM = /(percent|pct|_id$|^id$|year|month|day|days|_no$|number|rate|ratio|avg|average|median|per_|_per|thc|cbd|terpen|density|capacity)/i;

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const names = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const sameNames = (left, right) => {
  const a = names(left), b = names(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

export function selectReportContract(registry, factView, viewKey) {
  const matches = (registry ?? []).filter((row) => row.fact_view === factView);
  const exact = matches.filter((row) => row.report_key === viewKey);
  if (exact.length === 1) return { contract: exact[0], ambiguous: false, matches: matches.length };
  if (exact.length > 1) return { contract: null, ambiguous: true, matches: exact.length };
  if (matches.length === 1) return { contract: matches[0], ambiguous: false, matches: 1 };
  return { contract: null, ambiguous: matches.length > 1, matches: matches.length };
}

export function reportMeasurePolicy(contract, column, kind) {
  if (kind !== "number") return { numeric: false, declared: false, summable: false, reason: null };
  if (!contract) return { numeric: true, declared: false, summable: false, reason: "No unique report contract governs this page. Numeric fields are display-only." };

  const declared = Array.isArray(contract.measures) && contract.measures.includes(column);
  if (!declared) return { numeric: true, declared: false, summable: false, reason: "This numeric field is not a registered measure and is display-only." };

  const rowGrain = text(contract.row_grain);
  const grainKeys = names(contract.grain_keys);
  const measure = object(contract.measure_contracts)?.[column];
  const valueGrain = text(measure?.value_grain);
  const valueKeys = names(measure?.value_grain_keys);
  const aggregation = text(measure?.aggregation).toLowerCase();

  if (!rowGrain || !grainKeys.length || !object(measure) || !text(measure?.measure_key)) {
    return { numeric: true, declared: true, summable: false, reason: "The measure has no independently governed row/value-grain contract. Its total is refused." };
  }
  if (measure.source_verified !== true
      || text(measure.canonical_relation) !== text(contract.fact_view)
      || text(measure.canonical_column) !== column) {
    return { numeric: true, declared: true, summable: false, reason: measure.source_verification_reason || "The canonical measure source is not verified for this report." };
  }
  if (!sameNames(valueKeys, grainKeys) || valueGrain !== rowGrain) {
    return { numeric: true, declared: true, summable: false, reason: "The independently governed value-grain keys do not equal this report's row-grain keys." };
  }
  if (contract.grain_verified !== true) {
    return { numeric: true, declared: true, summable: false, reason: contract.grain_verification_reason || "The live row/value-grain verification did not pass. Its total is refused." };
  }
  if (aggregation !== "sum") {
    return { numeric: true, declared: true, summable: false, reason: aggregation ? `The approved aggregation is ${aggregation}, not sum.` : "The measure has no approved aggregation. Its total is refused." };
  }
  if (text(measure.null_policy) !== "forbid_for_eligible") {
    return { numeric: true, declared: true, summable: false, reason: "The measure has no supported eligibility/completeness rule. Its total is refused." };
  }
  if (NEVER_SUM.test(column)) {
    return { numeric: true, declared: true, summable: false, reason: "The column name denotes a rate, identifier, date, or other non-additive value." };
  }
  return { numeric: true, declared: true, summable: true, reason: null, measure };
}

export function classifyReportMeasures(shown, columns, contract) {
  const byName = new Map((columns ?? []).map((column) => [column.name, column]));
  const policies = (shown ?? []).map((name) => ({ name, ...reportMeasurePolicy(contract, name, byName.get(name)?.kind) })).filter((row) => row.numeric);
  return {
    summable: policies.filter((row) => row.summable),
    refused: policies.filter((row) => row.declared && !row.summable),
    displayOnly: policies.filter((row) => !row.declared),
  };
}

const canonicalKeyValue = (value) => typeof value === "string" ? value.trim() : value;

export function loadedGrainVerdict(rows, contract) {
  const keys = names(contract?.grain_keys);
  if (contract?.grain_verified !== true || !keys.length) return { verified: false, reason: contract?.grain_verification_reason || "Live row grain is not verified." };
  const seen = new Set();
  for (const row of rows ?? []) {
    const values = keys.map((key) => canonicalKeyValue(row?.[key]));
    if (values.some((value) => value == null || value === "")) return { verified: false, reason: `Loaded rows contain a blank ${keys.join(" / ")} grain key.` };
    const encoded = JSON.stringify(values);
    if (seen.has(encoded)) return { verified: false, reason: `Loaded rows repeat the canonical ${keys.join(" / ")} grain key.` };
    seen.add(encoded);
  }
  if (!seen.size) return { verified: false, reason: "No loaded rows exist to verify." };
  return { verified: true, reason: null };
}

export function loadedMeasureVerdict(rows, contract, column) {
  const policy = reportMeasurePolicy(contract, column, "number");
  if (!policy.summable) return { verified: false, reason: policy.reason, eligible: 0, valued: 0, invalid: 0 };
  const measure = policy.measure;
  const eligibilityColumn = text(measure.eligibility_column);
  const eligibilityEquals = measure.eligibility_equals;
  let eligible = 0, valued = 0, invalid = 0, total = 0;
  for (const row of rows ?? []) {
    const applies = eligibilityColumn ? row?.[eligibilityColumn] === eligibilityEquals : true;
    if (!applies) continue;
    eligible += 1;
    if (typeof row?.[column] === "number" && Number.isFinite(row[column])) { valued += 1; total += row[column]; }
    else invalid += 1;
  }
  return invalid
    ? { verified: false, reason: `${invalid} eligible row${invalid === 1 ? " has" : "s have"} no numeric ${column} value.`, eligible, valued, invalid, total: null }
    : { verified: true, reason: null, eligible, valued, invalid, total };
}

export function certifiedPopulationVerdict({
  rows, total, truncated, contractDigest, rowsContractDigest,
  snapshotVerified, snapshotId, snapshotReason,
}) {
  if (snapshotVerified !== true || !text(snapshotId)) {
    return { verified: false, reason: snapshotReason || "No execution-backed database snapshot receipt covers these rows. Browser totals are refused." };
  }
  if (truncated) return { verified: false, reason: "The result hit the row ceiling and is incomplete." };
  if (!Number.isInteger(total)) return { verified: false, reason: "The matching-row count is unavailable." };
  if ((rows ?? []).length !== total) return { verified: false, reason: `Only ${(rows ?? []).length.toLocaleString()} of ${total.toLocaleString()} matching rows are loaded.` };
  if (!text(contractDigest) || contractDigest !== rowsContractDigest) return { verified: false, reason: "The contract was not re-verified after these rows were read." };
  return { verified: true, reason: null };
}
