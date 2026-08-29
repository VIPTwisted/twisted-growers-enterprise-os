# PLANT MIRROR IS PHASE-BLIND

**Raised:** 29 August 2026 · **Lane:** Claude C · **Status:** OPEN, unmerged, nothing applied
**Object:** `v_plant_mirror_balance` (live on main and in production)

This ticket describes a defect in a view that is currently serving a **false
operational emergency**. Nothing here has been fixed. No migration was written,
the view was not rewritten, and no plant count was altered anywhere.

---

## 1. The view is flowering-only, on both sides

`v_plant_mirror_balance` compares Metrc's plants-by-room report against our own
plant mirror, per Flower Room. Both sides filter to flowering:

- report side: `metrc_rpt_point_in_time … where status_current = 'Flowering'`
- mirror side: `metrc_plants … where source_state = 'flowering'`

Vegetative plants are excluded from both. That is correct for a flowering-room
census and wrong for a room that has just been cut, because a harvested room does
not become empty — it becomes **vegetative**.

The view also compares two different instants and does not reconcile them:

| side | what it is | when |
|---|---|---|
| report | Metrc Inventory Point in Time export | as-of **2026-08-06** |
| mirror | live `metrc_plants` API mirror | **today** |

It does expose `report_as_of` and `report_age_days`, and `dash-plants.jsx` prints
them. So the staleness is disclosed. What is *not* disclosed is that a harvest
inside that window makes the two sides incomparable by construction.

## 2. FR4: a false emergency after a normal harvest and replant

Measured on production, 29 August 2026:

| | report (as-of 2026-08-06) | mirror (synced 2026-08-29) |
|---|---:|---:|
| Flower Room #4 — Flowering | 1,050 | **0** |
| Flower Room #4 — Vegetative | 0 | **1,050** |

Same room, same count, different phase. What actually happened:

- **10–11 Aug** the room was harvested. Four F4 batches in `metrc_harvests`:
  Shake Shack 210, Spec Ops 305, Super Boof 182, Apple Fritter 210.
- The 1,050 FR4 plants now in the mirror were **planted 4–17 Aug**,
  `VegetativeDate` 17 Aug, across 5 strains, synced today.

The room was cut and replanted. Nothing is unsynced and no plant is missing.

Because the view is flowering-only it reads FR4 as 0 and emits:

> `THE MIRROR HOLDS NONE OF THIS ROOM. Metrc reports 1050 plants standing here.
> Do NOT read this room as empty - read it as unsynced. This exact state was
> escalated as an operational emergency on 13 Aug 2026 and the room was full.`

That verdict was right in August when the room genuinely was unsynced. It is
wrong now, and it will fire on **every** room after **every** harvest, once per
56-day cycle per room, for as long as the report side is older than the cut.

A control that cries wolf on a healthy room every cycle is worse than no control:
the next real unsynced room will be read as "that's just the replant again".

## 3. Required fix — two acceptable shapes, owner picks

Either is sufficient. Not both.

**(a) Compare by room AND phase.** Carry `status_current` / `source_state`
through both sides and reconcile per (room, phase). FR4 then shows
Flowering 1,050→0 and Vegetative 0→1,050, and the net is visibly zero. This is
the fuller answer and it also surfaces the Mother Room case in section 5.

**(b) Declare as-of vs live and refuse across a harvest boundary.** Keep the
flowering-only comparison, but detect a harvest for that room between
`report_as_of` and today, and return NOT COMPARABLE with the harvest named,
instead of a gap. Cheaper, and consistent with the house rule that a figure which
cannot be measured is refused rather than reported as a number.

Whichever is chosen, the existing as-of columns (`report_as_of`,
`report_age_days`, `staleness_note`) must be kept — they are correct and
`dash-plants.jsx` already prints them.

**Do not** make this go away by widening the mirror side to include vegetative
without also splitting by phase. That would net FR4 to zero by coincidence and
would hide a genuine flowering shortfall behind a vegetative surplus.

## 4. OPEN — 143 plants, flowering reported vs harvested

Not closed, and explicitly not closed as zero.

| | plants |
|---|---:|
| FR4 flowering on the 8/6 report | 1,050 |
| FR4 plants on the 10–11 Aug harvest batches | **907** |
| unexplained | **143** |

The report is four days older than the cut, so timing plausibly accounts for some
of it — plants can be destroyed or moved between the export and the takedown. But
that is a hypothesis, not a measurement, and nothing has been checked against the
destroy feed (which is separately unusable: `metrc_rpt_plants_destroyed` carries
`destroyed_on` 100% NULL across 3,773 rows, newest `phase_date` 2026-05-18).

**This stays open.** It is not part of the phase fix and must not be silently
absorbed by it.

## 5. Related named exception — Mother Room, −3

The only unexplained room difference in the estate once FR4 is understood:

```
room         Mother Room
phase        Vegetative
report       33   (as-of 2026-08-06)
mirror       30
gap          -3
status       NAMED - unexplained, do not invent 3 plants
```

Three vegetative plants the report holds that the mirror does not. Not explained
by a harvest. Recorded here so it is not lost when FR4 stops being noisy —
today the FR4 false alarm is loud enough to bury it.

Flower Rooms #1, #2 and #3 reconcile exactly: 1,140 / 1,050 / 1,140, gap 0.

## 6. Scope

- Read-only investigation. No migration, no apply, no plant count written.
- `v_plant_mirror_balance` deliberately left as it is; the owner ruled the
  harvest lane closed and this is a separate ticket.
- Ingest untouched.
- Incidental, for whoever picks this up: `metrc_rpt_point_in_time.licence` is now
  `licence_number` on main. Existing views follow the rename automatically, but
  new SQL against that table needs the new column name.
