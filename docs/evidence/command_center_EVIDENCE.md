# Command Center delivery — evidence

Agent: B (Front End) · 11 Aug 2026 · Page package: the consolidated Agent I work order
of 11 Aug 2026 (four work items + six relayed owner orders). One bundle, owner-approved
through Agent I. Answers `docs/workflows/FORENSIC_DELIVERY_AUDIT_CHECKLIST.md` line by line.

## Scope

- One owner-approved bundle: Command Center design pass + Goals move + flow-strip stage 6.
  No schema changes (data rows only, listed below). No dependency changes. No deploy.
- Files changed, staged BY NAME — nothing swept: `app/web/src/App.jsx`,
  `app/web/src/patches.css`, `package.json` (one gate registration),
  `tools/checks/validate-command-center.mjs`, this file. Other agents' uncommitted work
  (`app/supabase/functions/apex-sync/index.ts`, a migration, brain files, docs/workflows)
  left untouched and uncommitted.
- Database rows written (data, not schema): `nav_registry` +1 (`goals_targets`, Command
  Center → Overview, item_order 5); `nav_role_visibility` and `page_permissions` upserts
  for `dept_dash_command` — visible/can_view TRUE for owner, executive, admin, cfo; FALSE
  for the other 20 roles. Widening is a row edit.

## Design fidelity

- Theme gate: `theme-lock: PASS — palette unchanged (100 token declarations); colour
  literals 331, baseline 331, none added.` Every new style uses existing tokens
  (`--neon`, `--red`, `--amber`, `--line`, `--panel-2`) or `color-mix` on them.
- Side menu and top menu code untouched. The one menu change is a `nav_registry` ROW
  (structure addition, explicitly permitted by the owner's freeze wording).
- Frozen surfaces: money stacked bar — untouched (see locks below). Stock by Stream —
  content untouched; its Section header gained the collapse control, which is the owner's
  own later amendment (chrome only). Seed-to-Sale page (`inventory_locator`) — untouched;
  the strip was NOT mounted there because its layout is frozen (skipped, per work item 1d).
  HR — untouched and verified: no HR file references `DateRangeSelect`, `StatusChip`,
  `useSectionStore`, or any new CSS class (grep evidence in the delivery report).
  Workspace, Planner, Budz, TG Brain, Settings→General: untouched.
- Section patterns: six distinct forms (rings, breach banner, yield bars, reports shelf,
  diagnostic footer, compact strip), sharing only primitives (Section, StatusChip,
  AssignTask, DrillRow, DocumentChips, RpDocumentButton, DateRangeSelect). No template
  stamping.
- Density: professional-dense; nothing under 12px in the additions (smallest new text
  12px; SVG ring captions are graphics, not body text).

## Honesty of state

- No fabricated data: enforced by `validate-command-center.mjs` (fabricated-series
  detector, self-test 5 cases both halves) and the existing `no-fabricated-data` gate —
  both PASS.
- Empty states explain why and what fills them: in-transit drill, room drill, yield bars,
  goals summary, reports shelf — each states the condition and the populating event.
  The breach banner absent = honest (no served breach today).
- StatusChip vocabulary on unwired/no-data surfaces (goals "no data to judge" chip with
  the basis pointer). Post-harvest rooms excluded from the board with the reason stated
  ON the page (J7, see defects).
- Diagnostic footer separates TILES COMPUTED (served `computed_at`) from live-view sync
  age — data age, not query time.
- Plain English beside professional labels throughout the new sections (I3).

## Drill and evidence (C1 / C2 / C3a)

- Flow strip: every stage drills IN PLACE, including new stage 6 "In transit" (before
  this delivery it fell through to the laboratory list — wrong records). Enforced by the
  new validator.
- Drill rows from `v_stock_proof` (Agent I correction honoured). Measured 147 ms per
  50-tag page against 30.7 s for `v_flow_in_transit` (defect filed).
- Reconciliation defects found and FILED, not papered over: 434 proof rows behind a
  429-package tile (duplicate tags across our two licences, mirror trap 13 — disclosed on
  the panel); `v_stock_proof` 34 vs `v_onhand_by_room_stage` 35 tags in Pre Trim Storage
  Room (population mismatch, Agent I's lane).
- Certificate AND manifest openable from every in-transit row (DocumentChips per row,
  signed link minted at click, never stored) with stated reasons where absent, using the
  four C3a reason forms. Plants drill states why a standing plant has no certificate.
- Rooms: ring cards render flower rooms only, labelled with department; post-harvest
  rooms withheld until `v_room_board` carries department (requirement filed) — a room is
  never shown without its department. Sublocation stated as unknown on drill rows.
- C6a: no new surface frames third-party failed material as loss; origin column renders
  neutrally on drill rows.

## Security

- No key, token or credential added (secret-scan PASS, 8 shapes).
- No new auth path: gate rows in existing `nav_role_visibility` + `page_permissions`;
  the front-end door sign reads those rows and fails closed with a stated reason.
- View-as: rendering-level only (visibility rows swap; session, queries, row-level
  security unchanged); persistent red banner with one-click exit and the honest RLS
  limit stated in the banner; every activation/exit inserted into `audit_events` BEFORE
  the lens activates — if the log write fails, the preview does not start.

## Validation

- Own validator: `tools/checks/validate-command-center.mjs`, registered as
  `check:command-center` in the package.json chain (after `check:tile-drills`), self-test
  5 cases both halves. PASS.
- Gates run, by name and number: theme-lock PASS (331/331 literals, 100 tokens) ·
  parse-check PASS · validate-command-center PASS · tile-drills PASS (8/8) ·
  no-fabricated-data PASS (4 patterns, 2 files) · silent-failures PASS (117/117 unbound
  reads at limit; 263/263 nullish-array occurrences at limit — my 16 additions reduced to
  one documented helper, and two pre-existing unbound reads in GoalsEditor now bind
  error) · ui-language PASS (12 abbreviations, none user-facing) · routing PASS ·
  error-boundaries PASS · trend-sentiment PASS · dead-controls PASS (0/351 inert) ·
  accessibility PASS (125/125 baseline, nothing new unlabelled) · no-hardcoded-numbers
  PASS · secret-scan PASS. `untracked-source` red on OTHER agents' uncommitted files —
  not mine to commit.
- Build: `vite build` clean (94 modules). Production bundle boots: sign-in page renders,
  zero console errors (vite preview, 11 Aug 2026).
- Screenshots of signed-in surfaces: NOT TAKEN — no credentials in this session.
  Deploy stays gated on a signed-in review (F2). Committed, not deployed.

## Addendum — narrative commentary, three lanes (owner-approved addition, same day)

- One shared render (`NarrativeBlock`): platform prose muted-italic behind a solid tone
  spine; a signed human note carries a DASHED spine, transparent ground, and its
  author-dated byline — opinion and computed fact cannot be confused. Platform lanes
  drill (a paragraph is a claim, C1); the block is a button wired to its served drill key.
- Period lane: `tg_period_narrative(p_from, p_to)` wired to the SAME range state as the
  tiles — every date-bar change refetches. NEVER called without a real range: measured
  that null bounds degenerate to a one-day window (`v_days = greatest(null+1, 1) = 1`),
  so the "All dates" screen would carry prose about a window nobody picked. With no
  range, an honest hint renders instead. Byline states the exact window.
- Standing lane: `v_section_narrative` (4 rows live), byline "Platform · computed live".
- CEO notes: `dashboard_commentary` — insert-only (corrections are new rows), retire
  sets `retired_at`/`retired_by`, nothing deletes, anonymous refused in code. Editing
  gated to owner/executive in the interface; pinned notes sort first.
- Mounted as its own collapsible Section ("In plain words…") on every department
  dashboard, registered in the collapse store; all reads error-surfacing.
- Validator extended: NarrativeBlock must drill; DashNarratives must keep its range
  guard and all three lane reads; AddCeoNote must keep its anonymous-refusal. Both
  fixture halves still self-test.
- Gates re-run after the addition: command-center PASS · parse PASS · theme-lock PASS ·
  silent-failures PASS (limits held) · ui-language PASS · accessibility PASS (two new
  inputs labelled after the gate caught them) · tile-drills PASS · no-fabricated-data
  PASS. Build clean.
- **Defects filed with Agent I — ALL THREE CLOSED BY AGENT I, same night, and the lane
  verified end to end (12 Aug 2026 00:29 UTC):**
  1. Row-level security policies now live and read back from `pg_policy`: `dc_read`
     (select, `true` for authenticated) · `dc_insert` (insert, `f_caller_is_admin() AND
     length(btrim(author)) > 0` — the database itself refuses an unsigned note) ·
     `dc_retire` (update, `f_caller_is_admin()`). Editing rights follow the existing
     admin helper; widening to non-admin executives is a role-model decision for the
     owner. The interface gate (owner/executive see the editor) is presentation; the
     database is the enforcement.
  2. `drill` column added, nullable. Wired: a note with a drill key renders as a
     clickable block; null renders as plain prose. The note editor gained an optional
     "page it opens" field — a wrong key lands on the honest unknown-page screen.
  3. Placement contract decided: `page` = dashboard key, `section_key` = lane
     vocabulary inside the per-dashboard "In plain words" band as shipped; hand-written
     notes default `section_key='narrative'`. The shipped shape IS the contract.
  **End-to-end exercise, on the record as `dashboard_commentary` id 1:** insert of a
  labelled verification note succeeded · read-back succeeded · an attempted edit of
  `body` was REFUSED by trigger `trg_dc_retire_only` ("A published note is never
  edited… Retire it and publish a new note. A signed opinion stays exactly as it was
  signed.") · retire succeeded (`retired_at`/`retired_by` set) · body verified
  untampered after the refusal · the retired row stays on the record, because nothing
  here deletes. Honest limit: this exercise ran on the service path, which bypasses
  row-level security but not triggers — so the immutability proof is real, while the
  authenticated policy path (admin can write, non-admin cannot) still gets its live
  confirmation in the signed-in review that already gates the deploy (F2).

## Deploy incident — 791855d red on Netlify (owner screenshot, 8:01 PM), root causes named

Two real failures in one commit, and my first report to Agent I named the wrong one
first — corrected here on the record (A7):

1. **The gate that killed the deploy: `report-contract`, rule J7** — rooms rendered
   without their department went 15 → 21 (ratchet limit 15). Six of the 21 were my new
   RoomRings/YieldBars code rendering bare `.room` accessors; "— Cultivation" sitting
   beside the accessor does not qualify it, and the detector is right — qualification
   must be IN the rendered value. Fixed by composing `roomQualified` once per row
   (flower rooms: name + department label pending the served field; yield rows:
   name + licence, which that view serves — licence + name IS room identity). Count
   back at the 15 limit.
2. **`all-checks-wired`** — my validator was registered in package.json but absent
   from `.github/workflows/ci.yml`, and the gate requires both. Real, but SECOND in
   the chain: Netlify never reached it. Wired in ci.yml with the incident recorded in
   the step comment. NOT the database hypothesis — the validator is static.
3. **Found because the chain died early: `eslint-ratchet`** (after `wired`, so it had
   never run on this code anywhere) — four new `react/no-unescaped-entities` warnings,
   raw apostrophes in my JSX. Escaped; ratchet back at its 13-warning baseline.

Process lesson, adopted: my local runs were gate SUBSETS, and both misses (`wired`
verdict cut off by a `tail -2`; `report-contract` simply not in my subset) are exactly
what a subset cannot see. The full `npm run gates` chain — the same command Netlify
runs — is now the only pre-push verification this delivery uses. No dependency was
ever added; package-lock untouched; the npm-ci hypothesis is clear.

## Deploy resolution — GREEN on the Netlify deploy list

- `4dec42b` (the J7 fix) deployed **ready** at 00:47:52Z, and the follow-on commits
  after it built green as well — confirmed from the deploy list via the Netlify API,
  which the owner's rule names as the arbiter. The prior failures (`791855d`,
  `3a607b0`, and two earlier non-Agent-B commits at 18:41/19:32) all carry the same
  generic "exit code 2"; the named causes and fixes are in the incident section above.
- **Verified conditions, not assumed:** the Netlify build environment carries **no
  `PGURL`**, so the database-tier gates (schema-baseline, docs-vs-database,
  page-architecture, report-contract's registry half) DEGRADE there by design — the
  live-vs-baseline schema drift measured locally (+14 tables, +16 views, +5 policies;
  the data layer's objects) does NOT gate deploys and is Agent I's regeneration to run.
- **Build stamp closed:** `deploy-current.mjs` had failed on every deploy ever made —
  its stamp ("injected by vite.config.js") was never implemented, so even a green
  deploy could not name its serving commit. `vite.config.js` now injects
  `tg-build-commit` (Netlify `COMMIT_REF`, git fallback, honest "unknown") and
  `tg-build-at`; verified in the local dist before push.
- **Security finding, filed for Agent I (not touched):** the Netlify site environment
  holds `SUPABASE_SERVICE_ROLE_KEY` and `VITE_SUPABASE_URL` for project
  `gfzilvcgeaqbasmqxgic` — NOT this platform's project — plus
  `SECRETS_SCAN_DISABLED=true`. A service-role credential for some other project sits
  readable in build env by anyone with CLI access. The app is unaffected
  (`lib/supabase.js` deliberately ignores `VITE_*`), but the credential should be
  removed and rotated by whoever owns that project, and the scan re-enabled.

## Layout doctrine pass — owner orders of 12 Aug 2026, all seven points plus two follow-ons

The owner's verdict on the first deploy was "not good… look at the dead space… needs much
better planning", then a seven-point doctrine, then two supersessions (FULL DDC density;
the one-global-view band). Delivered in one focused commit:

1. **One date mechanism** — chips only; Custom opens an inline token-styled popover
   holding the full preset list and both calendar inputs; the active chip carries the
   selection (a custom range shows its exact dates ON the chip); the duplicate preset
   caption removed. One shared control, so every mount in the OS changed identically.
2. **Green budget** — zero green CTAs spent on the Command header: Collapse/Expand all,
   Recompute, Print, Tasks, Alerts, CFO Dashboard, Open Goals and Targets, Done, and the
   note control are all quiet outline buttons in the one right-aligned toolbar row. The
   illegible green-on-green CFO button is quiet outline now. "Add a signed note" is a
   small "+ note" ghost on the narrative band header.
3. **View-as select token-styled** (`.viewsel`) — no raw white browser control.
4. **Chrome ≤ ~120px** — slim header: title, role/scope/view chips and the live-line in
   one row; paddings tightened; first data band (Global management) sits directly below.
5. **Packed grid** — ring cards at 132px minimum (6–8 across on wide screens); goals and
   yield share a 12-column row; section headers slim with status chips IN the header
   line; goals body is one line plus a quiet door.
6. **Footnotes are chips** — the post-harvest prose became a StatusChip with the full
   explanation in its popover; the strain list on ring cards became a count with the
   served list in the popover (density without omission). **Post-harvest cards
   MOUNTED** — unblocked by v_stock_by_department (department + licence per room):
   compact cards, department-qualified per J7, ours/third-party split on the face,
   failed and no-certificate chips, in-place drill to the shared evidence table
   (`StockProofTable`, extracted so the in-transit and room drills render identical
   per-item rows).
7. **tg_period_narrative v2 re-measured: 100.4 ms** for the full call — the
   statement-timeout state clears itself; no code change needed.
8. **FULL DDC density supersession** — spacing set at the tight end via patches.css,
   scoped to dashboard classes (`.dsec*`, new grids) so HR and frozen-surface internals
   are untouched; 12px floor held; accessibility gate green. The validator now asserts
   the slim-header pattern and section-chrome density statically, so re-widening fails
   the build.
9. **One global management view** — `v_global_management` mounted as THE first band:
   tone-spined entity card per department drilling to its dashboard; "Sales & Cash"
   renders its served gap_note VERBATIM; the unrouted finding-classes render as the red
   "NOBODY OWNS THESE" group with summed open findings — deliberately the loudest thing
   on the board.

**Filed for Agent I from this pass:** `is_the_unrouted_pile` is false on all 26 rows
including the finding-classes — an inert flag; the band splits by the app's own
dashboard registry until the curated mapping lands. The finding-class vocabulary
mapping remains his next data item. Environmental gate states at commit time, none
mine and none deploy-blocking (they degrade without a database in CI): schema-baseline
(+14 tables live over dump), migration-drift (38 production migrations without files —
another agent has dumped ~200 migration files into the tree UNCOMMITTED, and secret-scan
flags credentials inside three of those uncommitted files: an edge-function admin key
twice, a signed storage URL once — their author must not commit them as-is),
edge-function-drift (apex-sync), docs-vs-database, page-architecture archetype ratchet
(149 > 129), report-contract I4 (325 side-menu reports vs baseline 93 — nav_registry
state). Screenshots against the DDC reference images: still credential-gated; the
signed-in review remains the deploy gate for looks, and the owner sees the live site
directly.

## Deferred (named, per Agent I's "land vs defer")

Global command bar (nav-only stub) · governance control-plane page · faceted filter grid
· db_policy rule banners · site-wide StatusChip retrofit · Cultivation dashboard patterns
2–5 · date-bar mount audit beyond the shared control's existing mounts · dry-time
discipline section (needs a %-in-window-by-month view — requirement filed, not computed
in the front end).
