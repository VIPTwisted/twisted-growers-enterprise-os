# Moisture basis and editable company goal — 19 August 2026

## Executive verdict

Metrc does not directly measure evaporated water in the Harvests-Inactive report. Its Moisture Loss field is the mass-balance residual `wet - recorded waste - packaged`. The residual is operationally useful, but it can contain evaporation, unrecorded loss, or weighing error.

The former classifier treated every zero residual as fresh frozen and every non-zero residual as dried. Live Metrc evidence disproves that rule: six freezer/FF harvests carry a small non-zero residual. The corrected population is:

- 265 dried harvests: 33,051.11 lb wet and 24,760.11 lb residual, or 74.91% weighted;
- 83 fresh-frozen wet-basis harvests;
- 2 unknown-basis rows with negative residuals, deliberately not guessed;
- source report as of 4 August 2026, imported 7 August 2026.

The editable company goal is therefore 74.9%. The existing 70–77% management target band remains in place. Outside the band means investigate; it does not diagnose theft, over-drying, or cultivation failure by itself.

## Files and behavior

### `supabase/migrations/20260819195000_moisture_basis_is_explicit_and_goal_is_editable.sql`

**Before:** Fresh frozen was inferred from zero residual, packaged wet pounds could be labelled dry yield, residual was called evaporated water, and several unit/yield thresholds were SQL literals.

**Change:** Adds one explicit basis resolver, updates the evidenced goal to 74.9%, reads unit/yield/tolerance rules through `f_rule()`, appends weight basis, classification evidence, residual, dry-equivalent, source date, and measurement status to the harvest view, and quarantines the legacy `evaporated_lb` total as null. The moisture accounting, summary, and operational register views now disclose residual semantics and refuse unknown basis.

**Behavior now:** A freezer harvest with a 23.1% residual remains wet-basis fresh frozen and is excluded from the dried-harvest goal. Its packaged weight is never printed as dry yield; dry-equivalent is calculated with the owner-selected 4.5:1 rule. A negative unexplained residual remains unknown and receives no drying diagnosis.

### `business_rule_surface` and `v_moisture_business_rules`

**Before:** A page-specific rule list would have required hardcoded JSX keys and a deployment to add another rule.

**Change:** Rule membership is Supabase data, ordered by rows in `business_rule_surface`.

**Behavior now:** Adding or removing a moisture rule from this section is a governed data change. The frontend reads the registered surface.

### `app/web/src/business-rule-editor.jsx`

**Before:** The Business Rules page claimed planner and department-head users could save, while Supabase RLS permits only owner and executive. An update that returned no row could be called successful.

**Change:** One shared editor uses the RLS-aligned roles and requires the updated database row before reporting success. Read and write failures stay visible.

**Behavior now:** A rejected or empty update says “Not saved.” A successful update displays the returned value and is captured by the existing conversion-factor history trigger.

### `app/web/src/cult-moisture-register.jsx`

**Before:** No date control, rule editing required leaving the section, and UI copy stated that a derived residual was water.

**Change:** Adds the governed QuickBooks-style date range, keeps current unresolved actions visible, filters completed activity to the selected period, embeds the data-owned rule surface, and shows basis plus classification evidence on each forensic row.

**Behavior now:** The page opens on the company/user date default. Owners and executives can change the goal, band, conversion ratio, or balance tolerance in context. Every estimate is refused for wet or unknown basis, and every tile drills to the exact records it counted.

### `app/web/src/App.jsx`

**Before:** Business Rules contained a second editor implementation with permissions that disagreed with RLS.

**Change:** The route mounts the shared receipt-aware editor.

**Behavior now:** The standalone page and moisture section have the same save truth contract.

### `tools/checks/moisture-truth-integrity.mjs`, `package.json`, `.github/workflows/ci.yml`

**Before:** Nothing permanently guarded the wet/dry classifier, residual disclosure, returned save row, in-section editor, or governed date control.

**Change:** Adds and wires a deployment-blocking moisture truth guard in both GitHub Actions and Netlify’s gate chain.

**Behavior now:** A return to zero-means-fresh-frozen, a published legacy evaporation total, a hardwired JSX rule list, or an update that does not require a returned row fails the build.

## Independent strain verification completed with this release

Metrc currently holds 209 strain rows representing 107 distinct names. The company strain master also holds 107 names. Case-insensitive comparison found zero Metrc names missing from the master and zero master names absent from Metrc. The strain sync timestamp is 6 August 2026, so freshness remains an open operational issue; absence must never be claimed from a failed or stale read.

## Protected surfaces

The top menu and `app/web/src/tgworkspace.jsx` / TG Workspace (ClickUp clone) were not changed.
