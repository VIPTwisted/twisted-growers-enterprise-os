# OS Help desk — pictured guides for every user

Owner rule: the operating system ships with a help desk. Not a markdown dump. Numbered steps + a picture of the page. If the live screen does not match the picture, the user stops and reports it.

Phase 1 does not write to Metrc or Apex. Help never tells anyone to click a write in this OS.

## Where it lives

- Nav: **Command → Help** (existing category — do not add a 13th top-level).
- `view_key`: `os_help`.
- Visible to **every signed-in role**. Role-hide is not allowed on Help itself. Individual finance/compliance guides still refuse data on those pages; Help only describes the click path.
- Default range: none (undated). Do not put a period chip on Help.
- Page kind: custom. Not a report runner.

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
11. Room turn — do not grade staff yet
12. Units per hour and empty cart

Source copy and pictured steps: Grok preview Help desk (same 12 slugs). Do not rewrite the meaning.

## Do not

- Mount Help as a 13th top-level category.
- Role-hide Help.
- Put COO board / PR status in the user Help.
- Screenshot a cached 20-August build.
- Tell a user to APPLY, MERGE, or paste to Claude.

## Ticket A (after APPLY 108)

One page. `os_help` in nav_registry + nav_role_visibility for all app roles = visible. Render the 12 guides. Filter chips by desk. Each guide is steps + picture. No SQL. No Metrc write. Stop.
