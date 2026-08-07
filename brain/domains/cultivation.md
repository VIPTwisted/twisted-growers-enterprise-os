# Cultivation — where each fact lives

*Orientation page. The numbers themselves live in CLAUDE.md (locked) and
HANDOFF.md (measured state); this page tells you where to look and what is
settled versus open.*

## Settled — locked in [CLAUDE.md](../../CLAUDE.md), never re-derive
- Rooms: 4 tables per room, 287.5 plants per table, **1,150 operating plants
  per room**. (190 and 210 are wrong — see [LESSONS.md](../LESSONS.md).)
- Cycle: **56 days**, all four flower rooms, every pull.
- Pull cadence: **14 days** (13/14/15 with the Sunday/Monday stagger); **26
  pulls in 2026**.
- Harvest to availability: **28 days** (median of 141 scheduled pulls).
- Yield: target **70.6 g per plant** per cycle — per PLANT, never per square
  foot; the calendar column saying "sqft" is mislabelled.
- Genetics: **100% our own** — 754 clone batches, every one traced to our own
  mother plants; bought-in material enters Metrc as packages, never plants.
- Square footage: **not measured anywhere**. `grow_rooms.sqft` is null by
  design until someone uses a tape measure.

## Where the evidence is
- Authoritative calendar:
  `docs/source-of-truth/TG_2026_Harvest_Calendar_STRICT_8_WEEK_CYCLE.xlsm`,
  Pull Summary tab — the source of every locked fact above.
- Owner-set config rows: `grow_rooms`, `harvest_plan_2026`.
- Measured performance: actual yield across closed harvests is tracked in
  HANDOFF.md §3 — re-measure before quoting; it moves.

## Live exceptions (state as of the HANDOFF date — re-measure)
- Pulls drifted off the 2026 calendar (room rotation off by one position).
- Harvests open past the 28-day limit.
Both carry per-item drill-downs in the platform; counts are in HANDOFF.md §3.

## Open questions
- Room square footage: unmeasured. Populate `grow_rooms.sqft` only from a
  physical measurement, then per-sqft metrics become possible for the first time.
