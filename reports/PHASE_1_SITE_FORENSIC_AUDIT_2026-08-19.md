# GPT-CEO FORENSIC MODE — PHASE 1 SITE FORENSIC AUDIT

**Production target:** `https://twisted-growers-enterprise-os.netlify.app/`

**Netlify site ID supplied by owner:** `b565a8cc-c82b-41b9-b9ec-4dae875af078`

**Observed production revision:** `c551155f77962423fbc3a68c853720b275c6d61f`

**Observed build time:** `2026-08-19T14:48:52.496Z`

**Audit date:** 2026-08-19, America/New_York

**Audit mode:** Read-only production site forensics, static production-asset analysis, independent Worker/Reviewer/Guard verification

**Decision:** **DEPLOYMENT SIGN-OFF VETOED**

---

## 1. Executive verdict

The public authentication boundary is visually stable, HTTPS/HSTS is present, all 39 discovered JavaScript assets load and parse, no public runtime console failure was reproduced, a tested direct route did not bypass authentication, and no service-role or private provider secret was found in deployed client assets.

Those positive controls do not make this site safe for executive sign-off.

Production sign-off is vetoed because the site publicly advertises a first-account owner bootstrap, exposes self-service account creation without a visible invitation boundary, does not provide password recovery or visible enterprise authentication controls, contradicts itself about password length, lacks critical browser security headers, turns missing pages/assets/security endpoints into false HTTP 200 successes, makes evidence-free absolute integrity claims, loads a monolithic application payload at the authentication boundary, and repeatedly converts operational query or mutation failures into empty, zero, successful, or witnessed states.

The most severe authenticated risks were found in the deployed runtime itself: default-permit behavior for hardcoded route keys unless explicitly denied, direct mapping/import/sync/finance mutations without reliable confirmation or error enforcement, 97 database/RPC read paths that consume data without checking the returned error, a METRC page that substitutes hardcoded figures when its source query fails, and a payroll approval flow capable of displaying “Approved and witnessed” even when creation of the witness record fails.

The authenticated UI could not be interactively rendered because no approved audit session or production-equivalent test account was available. No production account was created. Consequently, authenticated visual, role, keyboard, mobile, data-state, and direct-action coverage is **authorization-blocked and unverified**, not passed. This Phase 1 report is complete for the evidence safely observable from the deployed site; the entire site is not eligible to be called fully verified until the required role matrix is exercised in a controlled environment.

## 2. Audit constitution and evidence rules

- No production account, data record, role, configuration, or Supabase object was created or changed.
- One negative login and one negative signup validation submission used a reserved nonexistent audit address. The deliberately short password was rejected; no account was created.
- A finding is `VERIFIED` only when reproduced or confirmed independently.
- `CONDITIONAL` means the exposed behavior is verified but its worst impact requires a server-side condition not tested against production.
- `INCONCLUSIVE` means a production-safe read-only test could not prove or disprove the control.
- `REJECTED` means the tested hypothesis did not reproduce and is not counted as a defect.
- Missing authenticated access is never converted into an assumption of correctness.
- Phase 1 examines the deployed site and its delivered runtime. Repository root-cause confirmation belongs to Phase 2; database/RLS/policy truth belongs to Phase 3.

## 3. Agent mesh and independence

| Role | Assignment | Responsibility | Result |
|---|---|---|---|
| GPT-CEO / Watcher | Root | Evidence consolidation, drift correlation, runtime asset analysis, final governance decision | Veto |
| Site Worker | Site Worker | Public route, responsive, auth, response, and control inventory | Not production-hardened |
| Site Reviewer | Independent Site Reviewer | Accessibility, UX, performance, caching, and auth contract review | Not ready |
| Site Guard | Independent Site Guard | Reproduction, rejection of unsupported claims, veto and deployment-gate decision | Not approved |

Every finding below has a Worker, Reviewer, Watcher, and Guard assignment. Guard status is recorded per finding.

## 4. Coverage inventory

### 4.1 Directly tested public surfaces

- `/`, `/#tower`, `/#ceo`, `/#finance`, and `/dashboard`
- Multiple deliberately invalid application paths
- Missing source map, invalid hashed asset, `/robots.txt`, `/favicon.ico`
- `/.well-known/security.txt` and `/.well-known/change-password`
- `/health`, `/healthz`, `/api`, `/api/health`
- Missing Netlify function and missing Netlify edge-function paths
- Sign-in mode, create-account mode, invalid sign-in, invalid short-password signup
- Viewports 320×568, 360/390×640/844, 768×1024, and 1280×720
- Response headers, cache behavior, compression, initial HTML, JS/CSS assets, JavaScript parsing, runtime strings, route selection, database/RPC call patterns, and deployed telemetry hooks

### 4.2 Authorization-blocked surfaces

The following are not certified because no authorized session was available:

- Every authenticated page, dashboard, report, register, finance, compliance, manufacturing, administration, and agent surface
- Full navigation/route registry rendering and role-specific visibility
- Unassigned, Worker, Reviewer, Watcher, Guard, Director, Finance, Compliance, Executive, and Owner user experiences
- Authenticated mobile/tablet behavior and accessibility
- Direct API/RPC/RLS authorization and IDOR resistance
- Session refresh, expiry, revocation, logout, concurrent session, MFA, SSO, invitation, and recovery completion
- Destructive confirmation, rollback, dual approval, and server-side veto enforcement
- Truth of balances, reconciliations, lineage, mappings, freshness, reports, and GIEMLM metrics

This is a release blocker, not permission to infer a pass.

## 5. Full finding ledger

### SITE-F-001 — Public first-account owner bootstrap

- **Severity:** Critical when an environment has no valid owner; otherwise Major latent risk
- **Status:** CONDITIONAL; public mechanism verified, takeover deliberately not attempted
- **Evidence:** Create-account mode tells any visitor: “The first account ever created becomes the owner.”
- **Root cause:** Privileged tenant bootstrap is exposed as an ordinary Internet signup invariant.
- **Impact:** A new, restored, cloned, partially reset, or misdetected environment can become subject to an owner race and full OS takeover.
- **Required fix:** Remove public first-user ownership. Provision the initial owner out-of-band with a signed, single-use, expiring secret tied to a preapproved identity. Make closure permanent and transactionally enforced server-side. Fail closed if the owner invariant is broken.
- **Verification gate:** Concurrent bootstrap attempts in an isolated environment must prove exactly one authorized transaction and prove bootstrap cannot reactivate through ordinary state changes.
- **Agents:** Identity Worker / Security Reviewer / Bootstrap Drift Watcher / Governance Guard
- **Guard status:** INCONCLUSIVE at backend; deployment veto applies until proved.

### SITE-F-002 — Open, uninvited production self-registration

- **Severity:** Critical if a new identity can read any enterprise data; otherwise Major
- **Status:** VERIFIED public exposure; post-registration permissions INCONCLUSIVE
- **Evidence:** The public page exposes `First time? Create account` with only email/password. No invitation, organization code, allowlist, administrator approval, SSO, or bot challenge is visible. Copy says later accounts start read-only.
- **Root cause:** Enrollment and authorization are treated as separable enough to permit unsolicited production identities.
- **Impact:** Auth-user exhaustion, spam, probing, approval burden, dormant identities, and potentially unauthorized enterprise disclosure. Read-only is not safe when the visitor is unauthorized.
- **Required fix:** Invitation-only enrollment, verified email, server-side domain/identity allowlist, rate limiting, abuse controls, expiring invitations, owner approval, lifecycle/deprovisioning, and deny-all access for unassigned identities.
- **Verification gate:** An unknown address must fail to register; an invited-but-unassigned synthetic identity must receive zero page, table, RPC, report, storage, and export access.
- **Agents:** Auth Worker / Identity Reviewer / Signup-Abuse Watcher / Access-Control Guard
- **Guard status:** VERIFIED exposure; authorization impact pending Phase 3.

### SITE-F-003 — Authenticated role/action matrix is unverified

- **Severity:** Critical release-control gap
- **Status:** INCONCLUSIVE
- **Evidence:** `/dashboard` showed only the sign-in boundary. No approved authenticated test persona existed.
- **Root cause:** The deployment lacks a ready, isolated, least-privilege forensic test matrix.
- **Impact:** Route, write, sync, delete, override, finance, compliance, guard, and export controls cannot be certified. Hidden UI is not proof of denied server access.
- **Required fix:** Maintain production-equivalent synthetic personas for unassigned, Worker, Reviewer, Watcher, Guard, Director, Finance, Compliance, Executive, and Owner roles. Test both UI and direct server boundaries.
- **Verification gate:** Every action must have explicit allowed/denied test cases; high-risk actions require consequence preview, object counts, reason, idempotency, immutable audit evidence, and Reviewer/Guard approval.
- **Agents:** Access-Control Worker / Security Reviewer / Authorization Watcher / Constitution Guard
- **Guard status:** INCONCLUSIVE and release-blocking.

### SITE-F-004 — Route authorization is deny-list oriented for hardcoded runtime routes

- **Severity:** Critical architecture risk
- **Status:** VERIFIED in deployed runtime; server-side data protection INCONCLUSIVE
- **Evidence:** The runtime selects a hardcoded page whenever the route is not explicitly present in the denied-route set. A hidden menu entry is therefore distinct from route protection. The production asset contains 83 unique hardcoded page keys plus database-driven route behavior.
- **Root cause:** Navigation visibility, client route existence, and authorization are composed from multiple authorities; hardcoded routes default to rendering unless explicitly denied.
- **Impact:** A newly added or omitted route permission can be directly reachable by hash even when absent from navigation. Any component that fetches insufficiently protected data raises the impact to disclosure or unauthorized action.
- **Required fix:** Replace client default-permit routing with a single allowlisted capability resolver. Unknown or ungranted capability must fail closed before component load. Server/RPC/RLS authorization remains mandatory.
- **Verification gate:** Generate the route/capability matrix and test every hardcoded and registry-driven route for every role by direct navigation, not menu visibility.
- **Agents:** Routing Worker / Architecture Reviewer / Route-Drift Watcher / Access-Control Guard
- **Guard status:** Runtime pattern VERIFIED; exploitability pending authenticated and Phase 3 tests.

### SITE-F-005 — Multiple route authorities can drift

- **Severity:** Major
- **Status:** VERIFIED architecture condition
- **Evidence:** The deployed app combines a large hardcoded route object with `nav_registry`, `nav_role_visibility`, and generic database-driven pages.
- **Root cause:** Route existence, display metadata, role visibility, and component binding do not originate from one compiled contract.
- **Impact:** Missing registry entries, stale menu items, direct-route-only pages, wrong component bindings, and inconsistent role behavior can ship silently.
- **Required fix:** Establish a typed route manifest as the canonical source; derive navigation, lazy imports, capability checks, breadcrumbs, deep links, tests, and deployment inventory from it. Validate database extensions against the manifest.
- **Verification gate:** CI must fail on duplicate keys, unowned routes, missing lazy targets, missing capabilities, invalid registry references, and routes without tests.
- **Agents:** Navigation Worker / Architecture Reviewer / Registry-Drift Watcher / Route Guard
- **Guard status:** VERIFIED from delivered runtime.

### SITE-F-006 — Mapping approval is a one-click, silent-error control

- **Severity:** Critical
- **Status:** VERIFIED in deployed runtime; interactive role protection INCONCLUSIVE
- **Evidence:** `tg_agentmapper_approve` is invoked from `Approve mapping` without confirmation or a required reason; `p_note` is null and the response path consumes data without enforcing the returned error.
- **Root cause:** A governed mapping decision is implemented as an ordinary optimistic client mutation.
- **Impact:** Mapping truth can change without intent confirmation, rationale, durable success proof, or reliable failure visibility. Downstream balances and reports can be corrupted by a false approval state.
- **Required fix:** Require diff preview, affected-record counts, reason, mapping version, idempotency key, Reviewer approval, Guard veto, signed run ID, and post-change reconciliation. Never display approval until durable acknowledgment is returned.
- **Verification gate:** Denied-role tests, forced RPC failure, duplicate submission, stale version, rollback, and downstream balance/reconciliation tests.
- **Agents:** Mapping Worker / Data Reviewer / Mapping-Drift Watcher / Mapping Guard
- **Guard status:** Code-path evidence VERIFIED; backend enforcement unverified.

### SITE-F-007 — Import undo is a one-click, silent-error destructive control

- **Severity:** Critical
- **Status:** VERIFIED in deployed runtime; interactive role protection INCONCLUSIVE
- **Evidence:** `tg_import_undo` is invoked from `Undo this import` without a confirmation, reason, or non-null note; the client does not enforce the returned error.
- **Root cause:** Destructive reversal lacks a formal command and acknowledgment contract.
- **Impact:** Records can be removed or reversed accidentally, with no user-visible proof of failure, reviewer decision, or complete rollback evidence.
- **Required fix:** Preview affected objects and dependencies, require typed confirmation and reason, enforce idempotency, create an immutable reversal plan, obtain Reviewer/Guard approval when impact crosses a threshold, and verify post-undo reconciliation.
- **Verification gate:** Forced partial failure, duplicate undo, dependency conflict, rollback-of-rollback, and audit-log completeness tests.
- **Agents:** Import Worker / Reconciliation Reviewer / Import Watcher / Destructive-Action Guard
- **Guard status:** Runtime defect VERIFIED; server-side constraints unverified.

### SITE-F-008 — Payroll approval can falsely claim a durable witness

- **Severity:** Critical
- **Status:** VERIFIED in deployed runtime
- **Evidence:** Pay-run update errors are handled, but failure of the subsequent `approval_witness` insert is ignored. The UI can then state `Approved and witnessed`. The witness is labeled `method: "password"` even though the UI asks the user only to type initials, not reauthenticate with a password.
- **Root cause:** The approval and witness are separate non-atomic operations, and the client treats the secondary audit write as optional while making a definitive compliance claim.
- **Impact:** False audit evidence, nonrepudiation failure, finance-control failure, and a pay run that appears witnessed when no witness exists.
- **Required fix:** Move approval plus witness into one atomic server transaction; require step-up authentication; record actor, method, challenge time, immutable event ID, reason, version, and artifact hash. Fail the entire operation if the witness cannot be persisted.
- **Verification gate:** Forced witness failure must leave the pay run unapproved. Verify replay resistance, dual approval, immutable audit chain, and reauthentication.
- **Agents:** Finance Worker / Finance-Control Reviewer / Payroll Watcher / Finance Guard
- **Guard status:** VERIFIED from production runtime; deployment blocking.

### SITE-F-009 — Mark-as-paid is insufficiently governed

- **Severity:** Critical
- **Status:** VERIFIED in deployed runtime
- **Evidence:** `Mark as paid` is exposed as a one-click state transition without a confirmation, witness, payment reference, dual approval, or visible reconciliation gate.
- **Root cause:** A material accounting state transition is modeled as a UI toggle rather than a governed finance command.
- **Impact:** A pay run can be represented as paid without proof of settlement, authorized dual control, or ledger reconciliation.
- **Required fix:** Require payment rail/reference, amount/date/account confirmation, separation of duties, second approver, step-up authentication, immutable event, ledger posting ID, and bank/GL reconciliation status.
- **Verification gate:** Role separation, duplicate reference, mismatched amount, stale version, failure rollback, and reconciliation tests.
- **Agents:** Finance Worker / Controller Reviewer / Settlement Watcher / Finance Guard
- **Guard status:** Runtime workflow VERIFIED; backend enforcement unverified.

### SITE-F-010 — Sync controls lack sufficient preview, idempotency, and Guard gating

- **Severity:** Critical for force-all; Major for ordinary sync
- **Status:** VERIFIED in deployed runtime; function authorization INCONCLUSIVE
- **Evidence:** Sync Center can invoke configured Edge Functions sequentially using the user session. `Sync all` and individual sync controls lack dry-run, before/after preview, expected record count, idempotency key, signed run ID, reconciliation evidence, and Guard approval. `Run Metrc sync now` and `Sync Apex only` appear available to all authenticated users in client UI. `Force all` permits owner, executive, planner, and department head and warns it changes configuration without requiring confirmation.
- **Root cause:** Operational synchronization is exposed as a direct client command without a policy-aware orchestration contract.
- **Impact:** Duplicate runs, conflicting writes, stale overwrites, configuration drift, partial success, and irreconcilable downstream data.
- **Required fix:** Server-side capability checks, dry-run impact plan, source cursor/version, idempotency key, signed run ID, reason, scope, expected counts, timeout/cancel behavior, Reviewer/Guard approvals for force/configuration changes, and automatic post-run reconciliation.
- **Verification gate:** Direct-call denied-role tests, concurrent runs, retries, partial provider failure, stale cursor, rollback, and reconciliation invariants.
- **Agents:** Sync Worker / Integration Reviewer / Sync Watcher / Sync Guard
- **Guard status:** Client workflow VERIFIED; backend authorization unverified.

### SITE-F-011 — Systemic database/RPC read errors are converted into data states

- **Severity:** Critical systemic defect
- **Status:** VERIFIED by static analysis of deployed production assets
- **Evidence:** Across the deployed JavaScript, 118 data-consumption paths request or destructure `data` without enforcing `error`; 97 of those are database/RPC paths. This includes finance, HR, control tower, inventory, reports, navigation, sync status, and saved views.
- **Root cause:** No mandatory query-result contract distinguishes success-empty, success-zero, unavailable, forbidden, stale, and failed.
- **Impact:** Outages and authorization errors silently become empty tables, zero KPIs, missing employees, no records, or apparently healthy dashboards. This defeats reconciliation, telemetry, and executive trust.
- **Required fix:** Introduce one typed result boundary with explicit states: loading, success, legitimate-empty, stale, partial, forbidden, unavailable, and failed. Ban data-only destructuring through lint/CI. Require source/freshness/error metadata for material KPIs.
- **Verification gate:** Fault-injection tests for every data surface; CI count of unhandled Supabase errors must be zero.
- **Agents:** Data-Access Worker / Reliability Reviewer / Silent-Failure Watcher / Data-Integrity Guard
- **Guard status:** VERIFIED.

### SITE-F-012 — Lineage trace failure is rendered as missing lineage

- **Severity:** Critical data-integrity defect
- **Status:** VERIFIED in deployed runtime
- **Evidence:** Failure of the `tg_trace` RPC is mapped to an empty array, after which the interface can say `No chain recorded in Metrc` and diagnose missing lineage.
- **Root cause:** Transport/query failure and authoritative negative evidence share the same empty representation.
- **Impact:** The system can accuse source data of missing lineage when the trace service itself failed, causing incorrect remediation and false compliance findings.
- **Required fix:** Treat RPC failure as `lineage unavailable`, never `lineage absent`. Display error ID, source, time, retry status, and prohibit compliance conclusions until the source succeeds.
- **Verification gate:** Forced timeout, permission denial, malformed response, zero legitimate result, and stale-result tests must produce distinct UI states.
- **Agents:** Lineage Worker / Compliance Reviewer / Lineage Watcher / Compliance Guard
- **Guard status:** VERIFIED.

### SITE-F-013 — METRC scan page manufactures reassuring metrics on source failure

- **Severity:** Critical
- **Status:** VERIFIED in deployed runtime
- **Evidence:** Failure reading `v_metrc_scan_settings` is converted to `[]`. The page still shows hardcoded values including `before 5,141`, `nightly reconcile 1,099`, a 4,032 denominator, calculated after-state, and a near-100% reduction. It also states that Sales is off permanently.
- **Root cause:** Static narrative/demo constants are blended with live operational status and failure is hidden.
- **Impact:** Executives can receive precise but ungrounded improvement metrics during an outage. This directly contradicts `Every number computed live — never typed`.
- **Required fix:** Remove hardcoded operational metrics or label them unambiguously as historical baselines with source/date. On query failure, suppress calculations and show unavailable. Every percentage must carry numerator, denominator, source, as-of time, and reconciliation state.
- **Verification gate:** Query-failure test must display no live metric or percentage; claim-to-source contract must be machine tested.
- **Agents:** METRC Worker / Compliance Reviewer / Metric-Truth Watcher / Constitution Guard
- **Guard status:** VERIFIED and deployment-blocking.

### SITE-F-014 — Other high-impact false-empty and false-zero paths

- **Severity:** Major to Critical, depending on surface
- **Status:** VERIFIED as a systemic runtime pattern
- **Evidence:** Employee selection can turn read failure into no active employees; Control Tower can reduce failed/empty data to a zero count; money-position, CFO spend, inventory locator/aging, action, report registry, and navigation reads include paths that ignore errors.
- **Root cause:** Repeated local optimistic state setters rather than a governed data-state component.
- **Impact:** Staffing, financial, inventory, control-tower, and navigation decisions can be based on a false zero or false absence.
- **Required fix:** Adopt the result contract from SITE-F-011 and mandatory degraded-state banners. Do not aggregate, compare, or certify a metric when any required source is failed or stale.
- **Verification gate:** Per-page source-failure fixtures and a release rule that legitimate zero requires a successful query plus scope/freshness evidence.
- **Agents:** Domain Data Worker / Cross-Domain Reviewer / KPI Watcher / Balance Guard
- **Guard status:** VERIFIED pattern; each page requires authenticated replay.

### SITE-F-015 — Seventeen directly awaited mutations do not enforce returned errors

- **Severity:** Critical systemic write-integrity defect
- **Status:** VERIFIED by deployed-asset analysis
- **Evidence:** Of 27 directly awaited client database mutations located, 17 do not check the returned error. Affected workflows include mapping/import, dashboard configuration, team membership, task updates, profile/avatar metadata, assistant upload lineage, availability, swap decisions, brain configuration, sheet-source metadata, and payroll witness.
- **Root cause:** Mutation success is inferred from promise completion or optimistic UI state rather than a validated server acknowledgment.
- **Impact:** False success, client/server divergence, missing audit records, lost lineage, ghost configuration, and unreported authorization failures.
- **Required fix:** One command API that requires checked result, event ID, version, actor, and durable audit acknowledgment. Disable success UI until acknowledgment. Roll back optimistic state on failure.
- **Verification gate:** CI must ban unchecked mutations; fault injection must prove no false success and no orphan side effects.
- **Agents:** Command-Layer Worker / Reliability Reviewer / Mutation Watcher / Data-Integrity Guard
- **Guard status:** VERIFIED.

### SITE-F-016 — Sheet import can claim success without source/log persistence

- **Severity:** Critical lineage and sync defect
- **Status:** VERIFIED in deployed runtime
- **Evidence:** After chunk insertion, updates to `sheet_sources` and insertion of `sheet_push_log` ignore errors while the interface can claim success.
- **Root cause:** Data write, source cursor update, and lineage log are not one governed transaction.
- **Impact:** Imported rows can exist without accurate last-pushed metadata or audit log; retries can duplicate or skip data; operators receive a false successful result.
- **Required fix:** Execute import, source checkpoint, counts/hash, and log in a transactional server command. Include idempotency key, file hash, row counts, rejects, reconciliation, and immutable run ID.
- **Verification gate:** Fail each step independently and prove atomic rollback or a clearly recoverable partial state.
- **Agents:** Import Worker / Sync Reviewer / Import-Lineage Watcher / Reconciliation Guard
- **Guard status:** VERIFIED.

### SITE-F-017 — Dashboard, membership, task, profile, availability, and brain writes can silently diverge

- **Severity:** Major
- **Status:** VERIFIED in deployed runtime
- **Evidence:** Data-only or unchecked mutation patterns occur in dashboard widget add/delete/preset inserts, dashboard deletion, team membership toggles, task updates, profile avatar upserts, assistant upload lineage metadata, availability changes, swap decisions, and brain role/memory configuration.
- **Root cause:** Each feature implements local optimistic persistence without the common command contract.
- **Impact:** UI says saved/deleted while server state differs; uploads can lose lineage; role/memory configuration can appear applied when it is not; retries can create duplication.
- **Required fix:** Apply SITE-F-015 command architecture; add per-domain compensating rollback and durable event display.
- **Verification gate:** Force server failure for every mutation and require visible error, restored UI state, and no false audit entry.
- **Agents:** Domain UI Worker / Application Reviewer / State-Divergence Watcher / Mutation Guard
- **Guard status:** VERIFIED pattern; interactive outcomes await role accounts.

### SITE-F-018 — Error telemetry makes an unverified recording claim

- **Severity:** Major governance defect
- **Status:** VERIFIED in deployed runtime
- **Evidence:** ErrorBoundary invokes `tg_log_client_error` and discards both fulfillment and rejection. The UI nevertheless says `It has been recorded automatically` and `Recorded as a finding`.
- **Root cause:** Fire-and-forget telemetry is represented as acknowledged durable evidence.
- **Impact:** Operators believe a finding exists when logging may have failed. Incidents can disappear without trace.
- **Required fix:** Display `recorded` only after a validated event ID. On failure, say recording failed, preserve a redacted local diagnostic, retry safely, and offer a support path.
- **Verification gate:** Block logger endpoint, return authorization error, return malformed response, and verify truthful distinct states.
- **Agents:** Telemetry Worker / Reliability Reviewer / Error-Log Watcher / Evidence Guard
- **Guard status:** VERIFIED.

### SITE-F-019 — Raw runtime error strings can be displayed

- **Severity:** Major information-disclosure risk
- **Status:** VERIFIED in deployed runtime
- **Evidence:** ErrorBoundary renders `String(this.state.err)` to the page.
- **Root cause:** Internal exception representation is used as user-facing incident content.
- **Impact:** Provider messages, identifiers, SQL/schema details, paths, or internal implementation can be disclosed to authenticated users and screenshots.
- **Required fix:** Show a redacted public incident code; retain the full exception only in access-controlled telemetry with structured redaction.
- **Verification gate:** Inject representative provider, SQL, auth, PII, and stack errors and assert zero sensitive tokens in DOM.
- **Agents:** Runtime Worker / Security Reviewer / Disclosure Watcher / Privacy Guard
- **Guard status:** VERIFIED.

### SITE-F-020 — No complete global client telemetry boundary

- **Severity:** Major
- **Status:** VERIFIED from deployed assets
- **Evidence:** No GIEMLM runtime marker, web-vitals integration, Sentry client, general OpenTelemetry app tracing, `unhandledrejection` collector, or global `window` error collector was found. The only custom path located is the ErrorBoundary RPC.
- **Root cause:** Telemetry is component-local and error-only rather than an OS-wide observable contract.
- **Impact:** Async failures, resource/chunk failures, performance regressions, navigation defects, stale data, and rejected commands can remain invisible.
- **Required fix:** Add a privacy-safe telemetry envelope covering release, route, role class, operation, duration, result state, source freshness, reconciliation state, correlation ID, and redacted exception. Capture global errors, rejected promises, resource failures, and web vitals.
- **Verification gate:** Synthetic telemetry canary per release; monitoring must prove event delivery and alerting without claiming success prematurely.
- **Agents:** Telemetry Worker / Observability Reviewer / Signal-Coverage Watcher / Telemetry Guard
- **Guard status:** VERIFIED absence in delivered runtime.

### SITE-F-021 — GIEMLM instrumentation is not demonstrated

- **Severity:** Major program gap
- **Status:** VERIFIED absence from delivered runtime; backend existence INCONCLUSIVE
- **Evidence:** Deployed assets contain no `GIEMLM` or `giemlm` marker and expose no visible public instrumentation contract.
- **Root cause:** GIEMLM appears to be a concept rather than an enforceable site telemetry schema.
- **Impact:** The requested executive signals—governance, integrity, exceptions, mapping, lineage, and monitored learning—cannot be independently tied to site behavior.
- **Required fix:** Define GIEMLM dimensions, event schema, thresholds, ownership, evidence retention, and UI status. Instrument route, query, mutation, sync, reconciliation, mapping, Guard veto, override, and deployment events.
- **Verification gate:** A traceable synthetic journey must generate expected GIEMLM events end-to-end with completeness checks.
- **Agents:** GIEMLM Worker / Governance Reviewer / Instrumentation Watcher / GIEMLM Guard
- **Guard status:** Site evidence VERIFIED absent; Phase 2/3 must search other layers.

### SITE-F-022 — Absolute truth claims lack an evidence contract

- **Severity:** Major governance and compliance defect
- **Status:** VERIFIED
- **Evidence:** Public claims include `One system runs the whole company`, `Every number computed live — never typed`, `Real records only — no sample data, ever`, `Fully configurable — zero code to operate`, and `Metrc-verified, nothing hidden, nothing hardwired.` Deployed assets contain hundreds of absolute assurance phrases involving always, never, every, fully, permanent, 100%, verified, complete, balanced, and live.
- **Root cause:** Marketing/status language is not bound to machine-verifiable scope, source, freshness, reconciliation, exception, or confidence.
- **Impact:** Operators can treat partial, delayed, inferred, hardcoded, manually overridden, or unavailable data as certified truth. The METRC hardcoded-metric defect proves an internal contradiction.
- **Required fix:** Establish a prohibited-claims policy. Every material `live`, `verified`, `balanced`, or `complete` label must carry source, scope, as-of time, freshness, reconciliation, exception count, and evidence link. Automatically withdraw the claim when a dependency fails.
- **Verification gate:** CI content scan plus runtime claim-to-proof assertions.
- **Agents:** Evidence Worker / Compliance Reviewer / Claim-Drift Watcher / Constitution Guard
- **Guard status:** VERIFIED and release-blocking.

### SITE-F-023 — Missing browser security-header baseline

- **Severity:** Major
- **Status:** VERIFIED independently
- **Evidence:** HSTS is present. `Content-Security-Policy`, CSP `frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and cross-origin isolation policy are absent from the inspected production response.
- **Root cause:** No enforced Netlify response-header security contract.
- **Impact:** Clickjacking exposure, weaker XSS containment, MIME-sniffing risk, uncontrolled referrer behavior, and unnecessarily broad browser capabilities.
- **Required fix:** Deploy CSP initially in report-only mode, then enforce it with `frame-ancestors 'none'`, `object-src 'none'`, constrained `base-uri`, `form-action`, `script-src`, `connect-src`, and `style-src`; add `nosniff`, deliberate referrer policy, and least-privilege permissions policy.
- **Verification gate:** Header tests on HTML, authenticated routes, error paths, assets, and functions; cross-origin framing test.
- **Agents:** Deployment Worker / Security Reviewer / Header-Drift Watcher / Browser-Security Guard
- **Guard status:** VERIFIED.

### SITE-F-024 — SPA fallback produces false-success responses

- **Severity:** Major
- **Status:** VERIFIED independently
- **Evidence:** Invalid routes, missing assets/source maps, `/robots.txt`, `/favicon.ico`, standardized well-known paths, health/API paths, and a missing Netlify function return HTTP 200 `text/html` with the SPA shell. A missing edge-function path correctly returns 404, proving deliberate behavior is possible.
- **Root cause:** An overbroad catch-all rewrite precedes file, API, function, health, and well-known failure handling.
- **Impact:** Uptime probes, crawlers, security scanners, asset checks, and deployment gates report false health. Missing resources fail later as MIME/content errors.
- **Required fix:** Restrict fallback to valid app document routes. Return deliberate 404/410/401/403 responses for unknown files, assets, APIs, functions, well-known paths, and invalid routes. Health checks must validate content and schema, not status alone.
- **Verification gate:** Route contract asserts status, content type, body marker, and schema for valid and invalid paths.
- **Agents:** Hosting Worker / Platform Reviewer / Route-Status Watcher / Deployment Guard
- **Guard status:** VERIFIED and release-blocking.

### SITE-F-025 — `robots.txt` and `security.txt` are not implemented

- **Severity:** Moderate
- **Status:** VERIFIED
- **Evidence:** Both paths return the application HTML with status 200. The HTML does include a `noindex` meta tag.
- **Root cause:** Standardized static endpoints are swallowed by SPA fallback.
- **Impact:** Search exclusion is weaker than server-level policy, and researchers have no standardized security reporting route.
- **Required fix:** Serve a real `robots.txt`, add `X-Robots-Tag: noindex, nofollow, noarchive`, and publish an RFC 9116 `security.txt` with correct content type, contact, policy, canonical URL, and expiry.
- **Verification gate:** Content-type and schema tests plus expiry monitoring.
- **Agents:** Hosting Worker / Compliance Reviewer / Standard-Endpoint Watcher / Security Guard
- **Guard status:** VERIFIED.

### SITE-F-026 — Login loads a monolithic initial payload

- **Severity:** Major
- **Status:** VERIFIED independently
- **Evidence:** Main JS is 1,139,632 raw bytes and about 315–337 KB compressed; main CSS is 242,640 raw bytes and about 38–40 KB compressed. The authentication shell loads the enterprise entry bundle before login. Recursive crawl found 39 JS assets totaling 1,818,416 raw bytes and 8 CSS assets totaling 290,642 raw bytes; all tested assets loaded and parsed.
- **Root cause:** The authentication shell is not isolated from authenticated application composition; CSS is also highly global, including 142 `!important` declarations.
- **Impact:** Excess parse/memory/network cost, larger failure and attack surface, slower constrained-device startup, and difficult style governance.
- **Required fix:** Separate the public auth entry, route-split every domain, lazy-load charts/reports/registers/finance, extract critical auth CSS, remove dead/global CSS, replace specificity escalation with design-system tokens and layers.
- **Verification gate:** Per-route size budgets, cold mobile Lighthouse/WebPageTest, chunk-failure test, CSS specificity budget, and dependency graph monitoring.
- **Agents:** Performance Worker / Frontend Reviewer / Bundle Watcher / Performance Guard
- **Guard status:** VERIFIED; all chunks healthy is a positive control, not a size waiver.

### SITE-F-027 — Fingerprinted assets are not immutably cached

- **Severity:** Major
- **Status:** VERIFIED independently
- **Evidence:** Content-hashed production JavaScript and CSS return `Cache-Control: public,max-age=0,must-revalidate`.
- **Root cause:** HTML revalidation policy has been applied to immutable build assets.
- **Impact:** Unnecessary repeat revalidation and bandwidth, greater Netlify availability dependency, and slower repeat use.
- **Required fix:** `/assets/*` should use `public,max-age=31536000,immutable`; HTML should remain revalidated. Purge only when content identity changes.
- **Verification gate:** Automated header assertions for current and newly built hashed assets.
- **Agents:** Deployment Worker / Performance Reviewer / Cache Watcher / Release Guard
- **Guard status:** VERIFIED.

### SITE-F-028 — JavaScript/bootstrap failure has no static recovery state

- **Severity:** Major
- **Status:** VERIFIED
- **Evidence:** Delivered HTML contains only the root div plus script/style; no `noscript`, static status/support path, or recovery action exists.
- **Root cause:** Availability depends entirely on successful client bootstrap.
- **Impact:** Blocked, corrupt, missing, or early-failing JavaScript produces a blank page without explanation.
- **Required fix:** Branded `noscript` fallback, bootstrap timeout, chunk-load recovery, safe reload, release ID, service-status/support link, and clear offline/unavailable state.
- **Verification gate:** Block JavaScript, fail main chunk, fail dynamic chunk, simulate offline and stale release.
- **Agents:** Resilience Worker / Runtime Reviewer / Blank-Screen Watcher / Availability Guard
- **Guard status:** VERIFIED.

### SITE-F-029 — Authentication recovery and privileged-auth controls are incomplete or invisible

- **Severity:** Major
- **Status:** Password recovery absence VERIFIED; MFA/SSO/backend controls INCONCLUSIVE
- **Evidence:** Sign-in exposes only email/password, sign-in, and create account. There is no forgot-password, reset/recovery, MFA, SSO, passkey, recovery-code, device/session, or security-help path.
- **Root cause:** Authentication is presented as a basic password form despite finance, compliance, personnel, deployment, and operational privileges.
- **Impact:** Lockout, manual insecure recovery, phishing exposure, weak privileged access, and unverified session governance.
- **Required fix:** Rate-limited non-enumerating recovery, verified redirect allowlist, token expiry, session revocation, privileged MFA, passkeys/security keys, SSO where appropriate, device/session management, and step-up authentication for sensitive actions.
- **Verification gate:** Full auth suite covering enumeration, throttling, recovery, token reuse, session expiry/revocation, concurrent sessions, MFA enrollment/recovery, and privileged enforcement.
- **Agents:** Identity Worker / Security Reviewer / Privileged-Auth Watcher / Identity Guard
- **Guard status:** Recovery gap VERIFIED; unseen backend features remain INCONCLUSIVE.

### SITE-F-030 — Password policy and signup form semantics are contradictory

- **Severity:** Major
- **Status:** VERIFIED independently
- **Evidence:** Client DOM declares minimum 8; backend error says minimum 6; a seven-character attempt advanced to email validation. Signup uses `autocomplete="current-password"`. No policy guidance is shown. No confirmation/visibility/Caps Lock feedback exists, and inputs lack semantic `name` attributes.
- **Root cause:** Client and backend do not share one password-policy contract; login semantics were reused for signup.
- **Impact:** Weaker-than-declared passwords may pass, users get conflicting instructions, and password managers misclassify fields.
- **Required fix:** Server-authoritative policy shared with the client; prefer 12+ characters plus breached-password screening; `new-password` autocomplete; stable names; visible requirements; confirmation and accessible reveal control.
- **Verification gate:** Boundary tests at 5, 6, 7, 8, 11, and 12 characters on client and backend plus password-manager semantics.
- **Agents:** Auth Worker / Contract Reviewer / Password-Policy Watcher / Security Guard
- **Guard status:** VERIFIED.

### SITE-F-031 — Authentication errors are inaccessible and destructive to user context

- **Severity:** Major
- **Status:** VERIFIED independently
- **Evidence:** Error div has no `role=alert`, `aria-live`, ID, `aria-invalid`, or `aria-describedby`. Focus falls to `BODY`; email/password values are cleared after failed login/signup.
- **Root cause:** Async form state rerenders without an accessibility and recovery contract.
- **Impact:** Screen-reader users may not hear errors; keyboard users lose position; everyone must retype email, increasing frustration and lockout behavior.
- **Required fix:** Named error summary/live region, field associations, preserve email, clear password only when necessary, focus first invalid field/summary, and never rely on color.
- **Verification gate:** Screen-reader and keyboard replay for empty, invalid, network, rate-limit, locked, and server failures.
- **Agents:** Accessibility Worker / Accessibility Reviewer / Auth-Error Watcher / WCAG Guard
- **Guard status:** VERIFIED.

### SITE-F-032 — Public form semantics and focus treatment are deficient

- **Severity:** Major overall
- **Status:** VERIFIED independently
- **Evidence:** Visible labels are not associated with inputs; clicking them does not focus controls. No `main` or other landmarks, no H1, desktop starts H2→H3, mobile leaves only H3, and the form has no accessible name. Focus rings are very weak on the dark surface.
- **Root cause:** Visual styling was implemented independently from semantic document and keyboard contracts.
- **Impact:** Landmark/heading navigation and form usability are impaired; keyboard/low-vision users can lose focus.
- **Required fix:** Stable IDs/`htmlFor`, one persistent H1, `main` landmark, named form region, correct heading levels, and 2–3 px `:focus-visible` indicators with at least 3:1 adjacent contrast.
- **Verification gate:** axe plus manual NVDA/VoiceOver and keyboard-only test at every breakpoint.
- **Agents:** UI Worker / Accessibility Reviewer / Semantic-DOM Watcher / WCAG Guard
- **Guard status:** VERIFIED.

### SITE-F-033 — Mobile auth removes identity and undersizes controls

- **Severity:** Moderate
- **Status:** VERIFIED independently
- **Evidence:** At 320–768 px the logo, product/company name, description, and trust statements disappear. Inputs are about 37 px high at 13.5 px; primary action about 36 px and secondary about 39 px. No horizontal overflow was found.
- **Root cause:** Responsive layout hides the entire brand panel rather than retaining compact destination identity; desktop sizing is carried into touch layouts.
- **Impact:** Phishing ambiguity, suboptimal touch accuracy, and likely iOS zoom for sub-16 px input text.
- **Required fix:** Preserve compact logo/product/environment identity; use 16 px input text, minimum 44×44 controls, consistent full-width mobile actions, and deliberate spacing.
- **Verification gate:** Visual, keyboard, screen-reader, and touch tests at 320, 360, 390, 768, and landscape widths.
- **Agents:** Responsive Worker / Mobile Reviewer / Breakpoint Watcher / Identity-and-UX Guard
- **Guard status:** VERIFIED.

### SITE-F-034 — Public auth lacks privacy, terms, support, acceptable-use, and security contact

- **Severity:** Moderate
- **Status:** VERIFIED
- **Evidence:** The site solicits email/password without rendering any anchors for privacy, terms, authorized use, retention, support, or incident reporting.
- **Root cause:** Authentication content lacks compliance and recovery ownership.
- **Impact:** Notice and trust gaps, no standardized escalation route, and no safe help path.
- **Required fix:** Add approved privacy, terms/acceptable-use, support, and security-reporting links; implement `security.txt`; state the approval model without exposing sensitive mechanics.
- **Verification gate:** DOM/content policy contract and link monitoring.
- **Agents:** Content Worker / Compliance Reviewer / Legal-Copy Watcher / Compliance Guard
- **Guard status:** VERIFIED.

### SITE-F-035 — Deep-link authentication provides no destination context

- **Severity:** Moderate
- **Status:** VERIFIED for representative routes
- **Evidence:** `/#finance` preserves the hash but shows generic sign-in with no indication that Finance was requested or will resume. Invalid paths normalize into the generic shell.
- **Root cause:** Authentication gate and route-intent presentation are disconnected.
- **Impact:** Users cannot distinguish a recognized deep link from a lost or suspicious redirect.
- **Required fix:** Display allowlisted destination context such as `Sign in to continue to Finance`, preserve route safely, and reject external/open redirect targets.
- **Verification gate:** Every route deep link, invalid route, removed route, and post-login restoration test.
- **Agents:** Routing Worker / Navigation Reviewer / Deep-Link Watcher / Redirect Guard
- **Guard status:** VERIFIED pre-auth; post-login restoration unverified.

### SITE-F-036 — Third-party font and local-service origins expand the network surface

- **Severity:** Moderate
- **Status:** VERIFIED from production delivery/runtime
- **Evidence:** Auth loads Google Fonts. Delivered code also references local service origins including `127.0.0.1:8765`, `localhost:11434`, and `localhost:9999`.
- **Root cause:** Remote font delivery and local bridge integrations are not presented within an explicit origin policy.
- **Impact:** Third-party privacy/availability dependency, more complex CSP, possible browser requests to services on a user’s machine, and a wider origin attack surface.
- **Required fix:** Self-host pinned fonts; define an explicit connect-origin registry; require user intent and authenticated bridge handshake for local services; prevent arbitrary page-triggered localhost access.
- **Verification gate:** Browser network allowlist and negative origin tests; no unexpected third-party or localhost request on login.
- **Agents:** Platform Worker / Security Reviewer / Origin Watcher / Network Guard
- **Guard status:** External font VERIFIED; actual local requests require authenticated replay.

### SITE-F-037 — Direct browser-to-database surface is broad and tightly schema-coupled

- **Severity:** Major architecture risk
- **Status:** VERIFIED from deployed assets
- **Evidence:** Production JavaScript exposes 231 literal table/view/object names, 38 RPC names, and three storage bucket names. The expected public Supabase anon key is present; no service-role key was found.
- **Root cause:** Many domains couple components directly to schema objects rather than stable domain APIs/commands.
- **Impact:** Schema drift has broad UI blast radius, authorization relies heavily on flawless RLS/RPC policies, and client releases encode extensive internal topology.
- **Required fix:** Put material commands and governed reads behind versioned domain contracts; generate typed clients from approved schema; maintain compatibility/deprecation tests; use RLS as mandatory defense, not the only architecture.
- **Verification gate:** Phase 2 import/use graph and Phase 3 RLS/RPC matrix for every exposed object.
- **Agents:** API Worker / Architecture Reviewer / Schema-Coupling Watcher / Data-Access Guard
- **Guard status:** Client coupling VERIFIED; security of each object pending Phase 3.

### SITE-F-038 — Full build revision is publicly disclosed

- **Severity:** Minor
- **Status:** VERIFIED
- **Evidence:** Public HTML exposes the complete private-source commit and exact build time; server identifies Netlify.
- **Root cause:** Deployment trace metadata is embedded in unauthenticated HTML.
- **Impact:** Precise release correlation and infrastructure reconnaissance; also useful operational traceability.
- **Required fix:** Prefer a short opaque release ID publicly; retain full commit/time in authenticated diagnostics. Document an explicit exception if disclosure is intentional.
- **Verification gate:** Public artifact scan aligned to disclosure policy.
- **Agents:** Release Worker / Security Reviewer / Metadata Watcher / Disclosure Guard
- **Guard status:** VERIFIED; not alone release-blocking.

### SITE-F-039 — Logo delivery is oversized and lacks intrinsic dimensions

- **Severity:** Minor
- **Status:** VERIFIED
- **Evidence:** Approximately 65 KB, 400×400 PNG rendered at 150×150 without intrinsic width/height; default loading/decoding behavior.
- **Root cause:** Source asset is used directly instead of a sized, layout-stable variant.
- **Impact:** Avoidable bytes and possible layout instability.
- **Required fix:** Add intrinsic dimensions and an appropriately sized WebP/AVIF or optimized PNG with deliberate decoding/loading.
- **Verification gate:** Asset budget and layout-shift test.
- **Agents:** Asset Worker / UI Reviewer / Asset-Budget Watcher / Performance Guard
- **Guard status:** VERIFIED.

### SITE-F-040 — PWA/offline score and resilience are not enterprise-ready

- **Severity:** Moderate enhancement gap
- **Status:** VERIFIED by deployment audit score and static shell behavior
- **Evidence:** Netlify’s available Lighthouse result reports PWA 30. No robust offline/bootstrap fallback was observed.
- **Root cause:** The application is deployed as a client SPA without a defined degraded-connectivity contract.
- **Impact:** Field/mobile users can receive blank or ambiguous states during connectivity loss; stale data may be confused with current data if caching is later added without governance.
- **Required fix:** Define whether the OS is intentionally online-only. If online-only, provide explicit offline detection and block material decisions. If offline capability is required, cache only safe shell/data, display staleness, queue writes with idempotency, and require resynchronization/reconciliation before certification.
- **Verification gate:** Offline, flaky-network, stale-cache, queued-command, and reconnect reconciliation tests.
- **Agents:** Resilience Worker / Architecture Reviewer / Connectivity Watcher / Availability Guard
- **Guard status:** VERIFIED gap; implementation choice requires governance.

## 6. Rejected hypotheses and positive controls

The following were tested and must not be misstated as defects:

- **Unauthenticated direct-route bypass:** Rejected for tested `/dashboard`; it rendered the sign-in boundary and no application data.
- **TRACE exposure:** Rejected at `/`; TRACE returned 405.
- **Immediate public runtime failure:** Rejected on tested paths; zero console warnings/errors were captured.
- **Missing dynamic chunks:** Rejected in the recursive crawl; all 39 discovered JavaScript assets returned 200 and parsed successfully.
- **Client service secret leak:** Rejected for tested production assets; expected public anon JWT was present, while no Supabase service-role/OpenAI/Anthropic private credential pattern was found.

Positive controls:

- HTTPS and one-year HSTS with subdomains/preload
- `lang="en"`, stable title, meaningful logo alt
- Native required fields and correct email input type
- Generic invalid-login message, reducing UI-level account enumeration
- No horizontal overflow at tested mobile/tablet widths
- Deep links remain behind authentication
- HTML export escaping was found for key special characters in the inspected print/export helper
- View-as banner states that data permissions do not change

These controls reduce specific risks but do not override the veto.

## 7. Root-cause analysis

The findings cluster into seven root causes:

1. **Optimistic truth:** Promise completion, empty arrays, zero counts, and UI state are treated as success without durable acknowledgment.
2. **Fragmented authority:** Hardcoded routes, registries, visibility rows, component code, direct schema names, and RPCs form overlapping sources of truth.
3. **Client-governed material actions:** Mapping, undo, sync, configuration, and finance transitions are initiated from components without one command, approval, and evidence contract.
4. **Failure-state collapse:** unavailable, forbidden, failed, stale, empty, and zero share the same representation.
5. **Evidence-free language:** absolute claims are published independently from telemetry, lineage, reconciliation, and freshness.
6. **Deployment contract gaps:** security headers, static standard endpoints, fallback routing, immutable cache policy, size budgets, and recovery states are not enforced as gates.
7. **Missing test identities:** there is no safe, ready role matrix that permits continuous authenticated forensic verification without mutating production.

## 8. Required architectural refactors

### 8.1 Unified capability and route manifest

One typed manifest must define route key, component, lazy chunk, capability, domain, source dependencies, mutation capabilities, breadcrumb, deep-link behavior, test personas, and owner. Navigation and permissions are derived outputs. Unknown capability fails closed.

### 8.2 Typed data-state contract

Every query returns a discriminated state: loading, success, legitimate-empty, stale, partial, forbidden, unavailable, or failed. Material values additionally require source, scope, as-of time, freshness SLA, lineage state, reconciliation state, and exception count.

### 8.3 Governed command bus

All material writes use server-side commands with actor, capability, target/version, reason, idempotency key, expected effect, event ID, audit acknowledgment, and result. High-risk commands require Reviewer/Guard decisions. UI never announces success before durable acknowledgment.

### 8.4 Evidence-bearing UI primitives

Create shared KPI, balance, reconciliation, sync, mapping, and status components that cannot render `verified`, `balanced`, `complete`, or `live` without proof metadata. Degraded sources automatically remove certification.

### 8.5 Auth-shell separation

Build a minimal public bundle with branded identity, accessible recovery, enterprise auth, legal/security links, and robust static failure behavior. Load domain code only after authenticated capability resolution.

## 9. Domain-specific required improvements

### Balance Engine site surface

- Never show balanced when any required source is failed, stale, partial, or unscoped.
- Display each side, units, tolerance, variance, source timestamps, reconciliation run ID, exceptions, and certifying Guard.
- Require drilldown to the exact contributing records and lineage.
- Provide explicit `unknown/unavailable`, not zero substitution.

### Reconciliation Engine site surface

- Show run ID, source versions/cursors, started/completed times, record counts, matched/unmatched/ignored counts, tolerance rules, exceptions, reviewer, Guard decision, and rerun lineage.
- A rerun must not overwrite prior evidence.
- Failed reconciliation blocks `balanced`, `verified`, report finalization, and material sync completion claims.

### Mapping Engine site surface

- Version every mapping and show old/new diff, affected records, downstream reports/balances, confidence, creator, reviewer, Guard, reason, and rollback target.
- Eliminate one-click approval and null notes.
- Prohibit mapping activation until sandbox replay and reconciliation pass.

### Sync Engine site surface

- Add dry-run, scope, source cursor, expected changes, conflicts, idempotency, progress, cancel/retry semantics, result counts, exception drilldown, reconciliation, and signed run ID.
- Force/config-changing sync requires step-up auth, explicit reason, Reviewer, and Guard.

### Schema-facing site behavior

- Components consume versioned contracts rather than hundreds of raw table/view names.
- Display schema/contract version and incompatible-state diagnostics.
- Deployment must prove client compatibility before schema changes become active.

### Reporting

- Every report displays source, filters, scope, as-of time, freshness, lineage, reconciliation, report version, author/approver, and export hash.
- Failed or partial sources must watermark the report and prevent `final` status.
- Exports require the same permission and evidence contract as on-screen data.

### Dashboards

- Distinguish zero, empty, stale, forbidden, partial, and failed.
- Dashboard customization writes require acknowledged persistence and rollback.
- Each widget declares source dependencies and cannot display a certification stronger than its weakest source.

### Registers

- Add immutable event history, effective dates, actor, reason, source, correction links, and reconciliation status.
- Deletes become governed reversals/tombstones, not silent destructive mutations.

### Finance

- Enforce separation of duties, step-up authentication, dual approval, transactional witness, settlement reference, ledger linkage, close-state rules, immutable evidence, and reconciliation.
- Pay-run approval/witness and mark-paid remain release blockers.

### Telemetry

- Capture global errors, rejected promises, resource failures, query/mutation outcomes, route denials, stale/partial data, sync runs, mapping changes, reconciliation, overrides, vetoes, and web vitals.
- Every event needs correlation ID, release, route, non-PII role class, duration, result, and durable acknowledgment.

### GIEMLM

- Define the acronym operationally and publish its canonical dimensions and event schema.
- Instrument Governance, Integrity, Exceptions, Mapping, Lineage, and Learning/Monitoring—or the owner-approved dimensions—at command and evidence boundaries.
- Add completeness SLAs, missing-signal alerts, drift thresholds, evidence retention, and Guard review.

## 10. Governance changes

1. A hidden button or navigation item never constitutes authorization.
2. No material UI claim may exceed the certainty of its weakest source.
3. No data error may be converted to an empty or zero state.
4. No mutation may display success without a validated event ID.
5. No finance, mapping, undo, force-sync, configuration, balance certification, or deployment command may bypass required Reviewer/Guard gates.
6. Public enrollment and privileged bootstrap are separate, explicit, fail-closed processes.
7. Every production release carries route, role, header, cache, status-code, bundle, accessibility, telemetry, and evidence-contract tests.
8. Production forensic accounts are synthetic, least privilege, monitored, non-business, and isolated from material writes.

## 11. Recommended overrides

No standing override is recommended for first-owner bootstrap, public signup, finance witness/mark-paid, mapping approval, import undo, default-permit routes, or silent error handling.

An emergency override for another control may exist only when:

- it has a unique ID, exact scope, business reason, requester, Reviewer, and Guard;
- it is time-limited with automatic expiry;
- it has compensating monitoring, rollback, and reconciliation;
- it cannot expand capabilities beyond the requester’s existing authorization;
- all actions during the window are immutably logged; and
- the post-event review is mandatory.

The Guard may veto an override. Silence, a missing error, or an unavailable Guard never counts as approval.

## 12. Deployment gates

Release-blocking gates, in order:

1. Prove owner-bootstrap safety and permanent closure.
2. Disable or constrain uninvited signup; prove unassigned means zero access.
3. Execute the authenticated route/action/RPC/RLS matrix for every role.
4. Repair pay-run witness, mark-paid, mapping approval, import undo, and force-sync governance.
5. Reduce unchecked query errors and unchecked mutations to zero.
6. Eliminate false-empty/false-zero and hardcoded live metrics.
7. Add enforceable CSP/anti-framing/nosniff/referrer/permissions headers.
8. Eliminate soft-200 files, APIs, health, functions, and standardized endpoints.
9. Add privileged MFA, recovery, session, throttling, and step-up authentication tests.
10. Replace absolute claims with evidence-bearing components and CI enforcement.
11. Split/auth-optimize bundles and add immutable caching/performance budgets.
12. Add global telemetry, GIEMLM coverage, delivery acknowledgment, and synthetic canaries.
13. Complete authenticated accessibility, mobile, loading/error/empty/stale, report/export, and destructive-action testing.

## 13. Monitoring additions

- Bootstrap invariant monitor: exactly one valid owner and bootstrap permanently closed
- Signup rate, unknown-domain attempts, invite failures, unassigned-account access denials
- Route manifest/registry drift and direct-route denial probes
- Unhandled query errors, false-zero detection, stale-source and reconciliation blockers
- Mutation acknowledgment failures and optimistic rollback failures
- Mapping/import/sync/payroll command volume, approval, veto, retry, duplicate, rollback, and exception rate
- Header/CSP/report-only violations, framing test, origin drift, standardized endpoint schema
- Asset size/cache/status/MIME/chunk-load and blank-screen canary
- Accessibility regression, focus, live-region, mobile target, and heading/landmark checks
- Absolute-claim content scan and claim-to-proof runtime validation
- Telemetry delivery loss, missing GIEMLM dimensions, missing event IDs, and logger failure

## 14. Risk and impact assessment

| Risk | Likelihood | Impact | Current disposition |
|---|---|---|---|
| Owner bootstrap takeover after reset/misconfiguration | Unknown | Catastrophic | Must prove impossible |
| Uninvited identity/data access | Plausible | Critical | Signup exposure verified; access unverified |
| False executive/compliance data due silent errors | High | Critical | Systemic runtime evidence verified |
| False finance witness/paid state | Plausible | Critical | Workflow defect verified |
| Unsafe mapping/import/sync transition | Plausible | Critical | Client workflow defects verified |
| Client route authorization drift | Plausible | Critical | Default-permit pattern verified |
| Clickjacking/XSS blast-radius hardening gap | Plausible | Major | Headers absent |
| Monitoring/deployment false success | High | Major | Soft-200 behavior verified |
| Accessibility/auth lockout | High | Major | Public defects verified |
| Performance/cache regression | High | Moderate/Major | Bundle/cache defects verified |
| Unsupported integrity claims | High | Major | Published and contradicted |

## 15. Priority and timeline

### P0 — Immediate, 0–24 hours

- Maintain deployment veto for privileged/regulated operation.
- Confirm bootstrap is permanently closed using server-side evidence.
- Disable public signup unless invitation enforcement is proven.
- Disable or server-block unsafe payroll witness/mark-paid, mapping approval, import undo, and force-sync paths until governed.
- Stop METRC hardcoded metrics from appearing as live on query failure.

### P0/P1 — 1–3 days

- Enforce checked results for critical queries/mutations.
- Add explicit failed/unavailable states for lineage, balance, finance, inventory, HR, and Control Tower.
- Fix security headers and false-success rewrites.
- Implement authenticated role/action test identities in staging.

### P1 — 1 week

- Complete auth recovery/MFA/session/step-up controls.
- Repair public accessibility and mobile identity/touch targets.
- Make witness/approval/undo/sync commands atomic, reasoned, idempotent, and evidenced.
- Remove evidence-free absolute claims or bind them to proof.

### P1/P2 — 2 weeks

- Introduce unified capability/route manifest, typed data states, and governed command bus.
- Split auth bundle, set immutable caching, add size budgets and recovery fallback.
- Add global telemetry and acknowledged incident IDs.

### P2 — 3–6 weeks

- Migrate dashboards/reports/registers/finance to evidence-bearing primitives.
- Complete GIEMLM instrumentation, reconciliation/balance gating, schema contract versioning, and continuous drift monitors.
- Execute full authenticated visual/accessibility/responsive and direct server authorization certification.

Durations are sequencing estimates, not permission to defer P0 risk.

## 16. Final signed decision

**Final verdict:** The deployed site is **NOT APPROVED** for GPT-CEO production sign-off.

The public shell is operational, but the system cannot presently demonstrate safe enrollment, safe privileged bootstrap, complete authenticated authorization, truthful failure states, governed material actions, defensible finance evidence, evidence-backed integrity claims, or complete telemetry. The site must remain under Guard veto until every release-blocking gate is independently passed.

Phase 1 is therefore closed as a **completed forensic examination with a failed release decision and explicit authorization-limited coverage**, not as a claim that inaccessible authenticated behavior was tested.

**Signed:** GPT-CEO — Executive OS Brain

**Countersigned:** Site Worker — evidence collection complete

**Countersigned:** Independent Site Reviewer — not ready

**Countersigned:** Independent Site Guard — deployment sign-off vetoed

**Date:** 2026-08-19, America/New_York
