# OS Help desk — pictured guides for every user

Owner rule: the operating system ships with a help desk. Not a markdown dump. Numbered steps + a picture of the page. If the live screen does not match the picture, the user stops and reports it.

Phase 1 does not write to Metrc or Apex. Help never tells anyone to click a write in this OS.

## Where it lives

- Nav: **Command → Help** (existing category — do not add a 13th top-level).
- `view_key`: `os_help`.
- Default range: none (undated). Do not put a period chip on Help.
- Page kind: custom. Not a report runner.

## Visibility — the only working gate

`permission_catalog`, `app_roles`, and `role_permissions` are **0 rows**. Do not write to them. Do not invent a third permission system. `App.jsx` still has literal role arrays; those are not the Help gate.

The only table that gates a page is **`nav_role_visibility`**.

1. Insert `os_help` in `nav_registry` under Command.
2. Copy the **widest** Command sibling (Control Tower / `tower` or Command dashboard / `dept_dash_command` — measure which has more `visible=true` roles) and INSERT one `nav_role_visibility` row per that role list, all `visible=true`.
3. Help itself is not role-hidden. Individual finance/compliance **pages** still refuse their own data; Help only describes the click path.
4. If a signed-in user still cannot open Help, that is an `App.jsx` array miss — file it. Do not paper over it with a new catalog.

## What a guide is

| Field | Rule |
|---|---|
| slug | stable, used in the URL |
| desks | Everyone / Floor / Cultivation / Manufacturing / Inventory / Finance / HR / Compliance |
| minutes | integer |
| steps | 2–5 |
| picture | annotated screen of the **live OS page**, or an honest mock labelled as mock until the screenshot is replaced |
| ban | if the step would write Metrc/Apex, the step says “do this in Metrc/Apex” |

## Guides that must ship (omit none)

1. Sign in and what you can see
2. Date range, like the books
3. What you do in Metrc vs here vs Apex
4. How to mess this up — do not
5. My week, clock, and hours
6. Harvest: weigh, waste, package, close (clicks in Metrc)
7. Packages, labs, and retail IDs (clicks in Metrc)
8. Work a Metrc exception queue
9. What is actually on the floor (live packages, not PIT)
10. Find any invoice, any year
11. Room turn — grade cycles, not takedown days
12. Units per hour and empty cart

Source copy: Grok preview Help desk (same 12 slugs). Do not rewrite the meaning except as specified for guide 11 below.

## Guide 11 must survive #107

Do **not** ship a guide whose only instruction is “do not grade.” That goes stale the day #107 applies.

Write it as two states on the same page:

**While the red banner is present (now):**
QUARANTINED — groups by harvest date, not pull. Do not grade staff from this. A 1–2 day takedown is one pull. Quote only: 52 pulls · 48 judged · 43 LATE vs 56 · 1 PASS · 0 EARLY · 4 EXCEPTION.

**After #107 APPLY (banner gone or rewritten):**
Grade on **cycle_days vs 56**, not on takedown days. Consecutive calendar days in the same room = one pull. Gap < 20 days = EXCEPTION, not FAIL. Same pinned counts. Do not terminate from a 1–2 day takedown.

The picture must show whichever banner is live. If the screenshot and the banner disagree, the page is cached — stop.

## Do not

- Mount Help as a 13th top-level category.
- Write `permission_catalog` / `app_roles` / `role_permissions`.
- Put COO board / PR status in the user Help.
- Screenshot a cached 20-August build.
- Tell a user to APPLY, MERGE, or paste to Claude.

## Ticket A (after APPLY 108)

One page. `os_help` in `nav_registry`. Visibility = copy widest Command sibling into `nav_role_visibility` (see above). Render the 12 guides. Desk filter. Guide 11 two-state. No SQL. No Metrc write. Stop.
