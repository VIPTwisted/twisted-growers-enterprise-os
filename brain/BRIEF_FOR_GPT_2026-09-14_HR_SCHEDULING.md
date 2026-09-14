# Brief for GPT — HR scheduling, 14 Sep 2026 (Claude, Agent I)

The owner has asked GPT to "add back the scheduling for HR". This is what already exists, the rulings it sits under, and the rules of the road that keep three agents from breaking one another's builds. Paste-able.

## 1. What exists — build on it, do not build beside it

**Store of record:** `hr.shifts` (schedule_id, node_id, person_id, role_id, zone, shift_date, start_time, end_time, status, shift_type, is_open_shift, break_start/end, posted_by …). 0 rows today. `hr.schedules` versions and `hr.shifts` revisions snapshot by trigger (`trg_schedule_publish_snapshot`, `trg_shifts_revision_snapshot`).

**Rules are rows:** `public.scheduling_policy` (one row: facility_tz, signoff_roles, draft_cadence, horizons, min_rest_hours, max_consecutive_days, in_training_needs_partner, floater_rule, primary_department_first, avoid_overtime, swap/claim sign-off, callout_cover_order, weekend_zones, block_post_on_conflict, default_shift_template_id) with `scheduling_policy_history`. Owner rulings 12 Sep: rooms come from the facility blueprint; a floater is trained or in training in 2+ departments; sign-off is CEO/CFO/HR; every rule is a row here — never a constant in code.

**The drafter (TG, 12–14 Sep):** `hr.tg_draft_week(p_week_start, p_department_id, p_generate)` → `hr.tg_draft_conflicts` → `hr.tg_draft_fix_line` → `hr.tg_post_draft` / `hr.tg_discard_draft`; `hr.tg_coverage_heat`, `hr.tg_draft_history`, `hr.tg_scheduling_policy`, `hr.tg_departments`, `hr.tg_zones`. The drafter places people ONLY through `public.f_schedule_candidates(p_zone_id, p_work_date, p_shift_template_id, p_draft_id, p_exclude_line)` — the one place eligibility (skills, credentials, rest, overtime, training partner) is decided. A discarded draft is history, not the schedule.

**The clone's own scheduling layer (VIP, kept in full per the owner's ruling):** `hr.get_week_schedule`, `hr.vsb_get_schedule`, `hr.schedule_assign`, `hr.schedule_center_unassign`, `hr.ai_draft_week` / `ai_draft_multiweek` / `ai_generate_schedule` / `publish_ai_schedule`, `snapshot_schedule`, `get_schedule_versions` / `get_schedule_diff`, swaps (`get_swap_board`, `review_swap`), open shifts (`post_open_shift`, `volunteer_open_shift`, `review_shift_claim`), coverage (`create_coverage_ask`, `respond_coverage_ask`, `get_coverage_gaps`, `get_coverage_targets`, `set_coverage_target`), zones (`upsert_zone`, `tg_zones`, `get_location_zones`, `set_zone_assignment`), breaks (`compute_shift_breaks`, `add_shift_break`, `get_entity_break_policy`), callouts (`mark_shift_callout`, `set_callout_coverage`), templates (`upsert_shift_template`).

**Screens in app/hr (served at /hr inside the OS build, shared sign-in):** `Schedule.jsx`, `ScheduleBuilder.jsx`, `AiScheduler.jsx` (rewritten 14 Sep on the tg_draft_* set), `ShiftMarketplace.jsx`, `ZoneSettings.jsx`, `TrainingPanel.jsx`, `Meetings.jsx`, `MyWeek` on the OS side (`my_week`, `my_schedule`, `schedule_builder` view keys). All seeds were removed 14 Sep — every screen reads rows; an empty read is empty, never invented.

**What reads the schedule from outside HR:** the OS harvest calendar (`public.f_harvest_calendar`, BP-12b-7) reads `hr.shifts` for the crew posted on a pull date under the Cultivation node. If the shift store or its status vocabulary changes, that read follows — tell Claude.

## 2. Rulings that bound the work (owner, in the Bible `brain/BLUEPRINT_2026_BEAT_THEM_ALL.md`)

- **Menus stay. Navigation is frozen** (§2b, §7). No "global navigation replacement", no new rail entries beyond the ones the Bible names. The HR platform is a door on the rail (`/hr/`); its own left menu inside /hr is the HR platform's.
- **TG is one facility with departments** — Lakeville Facility → Cultivation, Trimming, Flower/Infused Pre-Rolls, Cheap Pre-Rolls, Extraction, Packaging, Shipping/Support, Quality & Testing (`hr.org_nodes`). There are no stores and no warehouses. People are assigned to DEPARTMENT nodes; scope is the location plus its descendants (`hr.tg_reach_nodes`). A reader that scopes on the location node alone reaches 11 of 27 people.
- **Zero VIP data.** Retail features stay (the clone is kept in full) but no clone rows, names, locations or colours anywhere. Never grant to `anon`. Never read `VITE_SUPABASE_*` in app/hr. Netlify builds /hr, not a CLI deploy.
- **The CEO dashboard (`budz.jsx`) and the other frozen surfaces** change only with `OWNER-APPROVED:` in the commit. HR tiles reach the CEO/Control Tower through `hr.command_center_tiles()` (one derivation, 14 Sep) — add a figure there, not on the dashboard.
- **All 21 pay rates are provisional placeholders**; any labour-cost figure says so (`hr.tg_hourly_rate`, `wage_provisional`).
- **No hardwired recipients, no hardwired numbers** — rows the owner edits (the Setup form now edits any registered table in place, with a reason).

## 3. Rules of the road (so nobody's build goes red)

1. **Migrations:** apply → `node tools/sync-migrations.mjs` (SUPABASE_DB_URL from the gitignored .mcp.json) → commit the mirrored file → re-pin `expectedMigrationTreeDigest` in `tools/checks/money-grain.mjs` → push, in ONE motion. The migration-drift gate in CI and inside the Netlify build compares the repo tree to the LIVE database: an applied migration not yet on main turns every open PR and the next main build red. **Never apply while another agent's PR is waiting on CI** — check `gh pr list` first. Today 96 other-lane migrations are already unmirrored (finding filed).
2. **Gates:** `npm run check` (49) runs in CI and in the Netlify build. Known Windows-only quirks: ext-zip CRLF, an untracked local vault-pull file.
3. **Certified = on main + Netlify production published + a live check.** Report migration / edge / PR / production as separate layers.
4. **Drive the page before shipping it** with a real session and read the effect back in SQL.
5. **Tracker:** section 19 of `deployment_check` is the board; rows flip only by measurement (`f_deployment_check_record`). HR rows are `hrp.*` and `bp.d2.hr_live` (PASS), `bp.d4.hr_pages` (PENDING — "HR module pages in the OS wired to /hr").
6. **Rule J7:** a room is never shown without its department (`room_qualified`). Rule H2: forensic tables are append-only.

## 4. Recommendation

Wire scheduling into the HR platform's existing screens and functions (Schedule / ScheduleBuilder / AiScheduler / ShiftMarketplace on `hr.shifts`, drafting through `tg_draft_week` → `f_schedule_candidates` → `tg_post_draft`, policy from `scheduling_policy`), reached from the OS through the existing doors (`hr_platform:/schedule`, the rail's HR entry, `my_week`). No new navigation, no store/warehouse surfaces, no second schedule store. If a piece is missing, add a function or a row — and say which.
