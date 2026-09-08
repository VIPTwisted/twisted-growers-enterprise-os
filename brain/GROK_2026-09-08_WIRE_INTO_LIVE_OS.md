# How today's work lands in the live OS

Do **not** replace `app/web` with the Grok preview. The preview is a sketch. The OS is `App.jsx` + dedicated pages + `nav_registry` + Postgres views.

## Already in live OS (patch these, do not clone)

| Work from this chat | Live file / object | What to do |
|---|---|---|
| Two-size rooms | `grow_rooms`, `cult_cycle_policy`, `conversion_factors` | Applied 8 Sep. File migrations (this PR). |
| A/B/C + trim + waste + water | `app/web/src/cult-grading.jsx` · `harvest_grades` (0 rows) · view_key `grading` | Add DRAFT insert. Vincent approves. Do not invent grades. |
| Canopy vs cap | `app/web/src/dash-plants.jsx` · `commandcenter.jsx` · `mv_room_board` | Read `cult_cycle_policy.target_plants` (1140/1050). Never hardcode 1150. |
| Harvest forensic tiles | `v_harvest_forensic` · `v_harvest_still_in_room` · `cult-harvests.jsx` | Add as-of + moisture identity. Period bus. |
| Vincent gate | `v_allocation_queue` already exists | Same pattern for harvest_grades.status = DRAFT until `approved_by = Vincent`. |
| FF yield bleed | Manufacturing dash `dept_dash_mfg` | New **view** first (consumed FF vs first concentrate). Then a panel. No hardcoded 3.0%. |
| Bots / Top G | `os-staff.jsx` · `lib/topg-connect.js` · `budz.jsx` | Already the Grok Bots clone. Add harvest/bleed routines. Do not spawn a second staff page. |

## Wire rule (every new thing)

1. Number lives in a **view** (or owner-set `conversion_factors` / `kpi_targets`). The page never computes the business figure.
2. `nav_registry` row with `view_key` — **do not omit top menu items**. New pages are extra, not replacements.
3. Dedicated `*.jsx` only if the generic grid cannot drill. Import in `App.jsx` on that `view_key`.
4. Tile → exact rows (C1). Period bus. Theme locked.
5. No Metrc write. Apex write is Phase 2.
6. CERTIFIED only on dual MATCH.

## Ticket order

1. This PR — file applied two-size SQL. Do not merge other open PRs into it.
2. `cult-grading.jsx` — DRAFT close form → `harvest_grades`.
3. Command + plants — canopy vs own cap.
4. `v_ff_first_run_yield` + manufacturing panel.
5. Staff routines for dry ladder + bleed fire.
