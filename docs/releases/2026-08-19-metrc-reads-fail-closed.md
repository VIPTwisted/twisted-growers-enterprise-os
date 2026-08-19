# Metrc Reads Fail Closed — 19 August 2026

## Outcome

Four Metrc-facing surfaces no longer turn a database failure or empty OS mirror
result into a claim about the legal Metrc source. The scan-schedule page no
longer publishes activity, reduction, reconcile, record-count, overnight, or
manual-scan figures that its governed view does not supply.

## Files and behavior

### `app/web/src/App.jsx`

**Problem before:** location history, the seed-to-sale summary, and the lineage
drawer could treat a failed or empty mirror read as proof that Metrc held no
record. Scan settings converted a failed read to an empty schedule and still
rendered fixed and derived figures.

**Change:** each read now has separate loading, failure, successful-empty, and
successful-data states. Failures show the actual database error and a retry.
Successful empty results explicitly remain unverified mirror gaps. Scan KPIs,
run times, rows, and totals are computed only from `v_metrc_scan_settings`.

**Behavior now:** if `tg_trace` fails, the drawer says the RPC could not be read
and makes no lineage diagnosis. If scan settings fail, no KPI is rendered. If
six schedule rows load, the page shows six configured groups and sums only the
enabled `scans_per_day` and `calls_per_day` values returned by those rows.

### `tools/checks/metrc-read-integrity.mjs`

**Problem before:** no build rule prevented these false compliance conclusions
or the unsupported scan figures from returning.

**Change:** a self-tested static guard now requires explicit read-error states,
requires the non-diagnostic empty-result language, and rejects the known legacy
claims and fixed scan figures.

**Behavior now:** reintroducing `error ? []`, “No chain recorded in Metrc,” or
the removed scan totals fails both GitHub Actions and the Netlify deploy build.

### `package.json` and `.github/workflows/ci.yml`

**Problem before:** the Metrc read contract was not part of either deploy gate.

**Change:** the new check is wired into the common check chain and GitHub Actions.

**Behavior now:** a guard that is absent from either runner is rejected by the
existing guard-wiring check.

## Scope protection

This release does not modify the top menu, `tgworkspace.jsx`, the ClickUp clone,
Supabase schema, schedules, or Metrc source data. It changes only how four
existing reads disclose success, failure, and evidence limits.

## Still open

- A successful empty OS mirror result requires a source-level verification
  workflow before it can become a compliance finding.
- Durable crash receipt IDs and preference-save failures are the next separate
  release; they are not bundled into this one.
- The page shows configured schedule truth. It does not prove that a scheduled
  job ran; execution telemetry requires its own data source and surface.
