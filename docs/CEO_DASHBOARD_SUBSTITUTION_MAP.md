# CEO Dashboard — frozen figures, and how to replace them

**For Agent B. Written 7 August 2026 by the watchdog.**

> ## ⚠️ THIS DOCUMENT WAS WRONG AND HAS BEEN REWRITTEN
>
> The first version claimed the frozen figures were understated by up to 698% and that the
> dashboard "sends you to the wrong room". **Most of that was my error, not the dashboard's.**
>
> The owner challenged it — pointing out that these rooms also hold bought-in third-party
> material, trim, and material staged for pre-rolls — and he was right to. What I did was
> compare the dashboard's **open-harvest** figures against a **lifetime cumulative across every
> harvest the room has ever held**. Two different populations. That is the same error I had
> criticised in another agent's revenue finding two hours earlier.
>
> **Corrected below. Several of the frozen figures turn out to be exact.**

---

## What the frozen figures actually are, measured correctly

Apples to apples: open harvests only, which is the population the dashboard prose describes.

| Room | Dashboard says | Actual, open only | Verdict |
|---|---|---|---|
| **Dry Room #2** | 882 lb · 4 open · 975 plants | **882 lb · 4 open · 975 plants** | ✅ **exact** |
| **Pre Trim Storage** | 786 lb · 6 open | **757 lb · 6 open** | ✅ right, minor drift |
| **Cure Vault** | 2,082 lb · 4 open | **816 lb · 4 open** | ⚠️ **over**stated |
| **Fulfillment Vault** | 7,962 lb · 16 open | **2,060 lb · 16 open** | ⚠️ **over**stated |

**Every open-harvest count is exactly right.** Dry Room #2 is exact to the pound and the plant.

So the honest position on the frozen figures is narrower than I first said: **they were correct
when written, some remain correct, and two of the four weights have since drifted — downward,
not upward.** They still must go, because a figure that is right by luck today is wrong by
default tomorrow. But this is housekeeping, not an operational emergency, and I should not have
called it one.

---

## 🔴 The three findings that DO survive

**1. A real defect in `v_dry_room_performance` itself.** Its `dried_too_long` column filters on
`dry_days_to_first_package > 16`. Your owner-set `conversion_factors.dry_window_max_days` is
**14**. So the view carries the same threshold error as the CEO dashboard, and any tile reading
it inherits it. Using the correct 14: Fulfillment Vault is **96** over, not 82; Pre Trim is
**84**, not 81. Fix the view via `f_rule()`.

**2. "57 over the window" for Fulfillment Vault is understated.** Actual is **96** at the
owner-set 14 days, or 82 at the view's incorrect 16. That one is genuinely wrong in the
dashboard, in the direction that matters.

**3. "29 of 143 harvests dried inside the window" cannot be reproduced at all.** 360 harvests
have a measurable dry time, not 143, and 17 fall inside 10–14. **Delete it** rather than try to
match it. A number nobody can derive is not a number.

---

## 🟡 One finding I am NOT confident about, and why

Pre Trim Storage shows **65.4 days average dry time** against the dashboard's stated **19.7**.
On its face that is a large gap, and it made me claim the dashboard hides the worst room.

**I am withdrawing that claim** for two reasons:

- I cannot establish that 19.7 and 65.4 measure the same population. 65.4 is the average across
  all 94 harvests that room has ever held. If 19.7 was computed over a subset, the comparison is
  meaningless — the same trap as above.
- **"Average dry time" may not mean what the metric assumes.** `dry_days_to_first_package` is
  the gap between harvest start and first package. If a room is used for **storage** rather than
  drying — holding trim, bought-in material, or material waiting for pre-roll production — then
  a long gap reflects how the room is *used*, not how badly it dries. The dashboard prose
  already suspects exactly this about Fulfillment Vault: *"It is being used as long-term
  storage, not a dry room."*

**This needs the grow team, not another query.** What is Pre Trim Storage actually for? Until
someone answers that, treating 65.4 days as a performance failure would be inventing a business
practice — rule A5.

---

## What is genuinely absent from all of these numbers

`v_dry_room_performance` is built entirely on `v_harvest_forensic`, which is **own-harvest data
only**. Per the locked facts, bought-in material enters Metrc as *packages on a manifest*, never
as plants or harvests.

**So third-party material is in none of these figures.** Nor is anything staged for pre-roll
production that did not come from one of your own harvests. If those rooms physically hold that
material — and the owner says they do — then **neither the dashboard's number nor mine reflects
what is actually in the room.**

That is a genuine gap and it is bigger than the frozen numbers. A room-level view that reconciles
to physical contents would need to union harvest material with third-party packages by location.
`v_third_party_stock` exists; joining it by location has not been done.

---

## The substitution itself

Still worth doing, still mechanical. `v_dry_room_performance` has the columns — but **filter to
open harvests** where the prose describes open harvests, or you will reproduce my mistake in code:

```sql
-- per room, OPEN harvests only — matches what the dashboard prose describes
select drying_room,
       count(*) filter (where harvest_state like 'STILL OPEN%')                  as open_harvests,
       round(sum(still_in_room_lb) filter (where harvest_state like 'STILL OPEN%')) as open_sitting_lb,
       round(sum(plants)          filter (where harvest_state like 'STILL OPEN%')) as open_plants
from v_harvest_forensic group by drying_room;

-- dry-time bands against the OWNER-SET window, not 7-16 and not >16
select count(*) filter (where dry_days_to_first_package > 14)              as too_long,   -- 248
       count(*) filter (where dry_days_to_first_package < 10)              as too_fast,
       count(*) filter (where dry_days_to_first_package between 10 and 14) as in_window,  -- 17
       count(*)                                                            as measurable  -- 360
from v_harvest_forensic where dry_days_to_first_package is not null;
```

**Keep the prose.** The plain-English "why this matters and what to do" is the best thing on that
page. Move the sentences to data and interpolate live figures. The words stay; the frozen digits
go.

---

## The lesson worth keeping

I found this by writing a confident report and having the owner say "what do you mean, off by?"
Both of my population errors — this one and the revenue one I caught in another agent — were
comparisons between differently-scoped sets, presented as drift.

**Before calling any difference a discrepancy: normalise the units, confirm both sides cover the
same population, and confirm the metric means what you assume it means.** That is now enforced
structurally in `v_cross_source_reconciliation`, which reports a value disagreement separately
from a coverage gap. It was not enforced in my own head.
