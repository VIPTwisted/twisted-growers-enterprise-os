# Ideas — what the AI brains should think about first

*Agent D, 7 August 2026. Every idea below is derived from locked facts or
measured data, with the arithmetic shown. **Figures marked DERIVED are
Agent D's calculation from locked inputs, not measurements** — they must be
confirmed against the live system before anyone quotes them (rules A1, A2,
A6, and the 62.5%-moisture lesson, where a plausible derived figure was
wrong and caught only because someone checked).*

---

## The master idea: **your 4 rooms give you 1,456 growing-days a year, and the calendar spends every one of them**

> **Plain English first (rule I3).** There are **4 grow rooms**. A "room-day"
> means one room, for one day — a unit of time, like a builder's man-hour.
> 4 rooms × 364 days = 1,456 room-days of growing time available per year.
> This is about *time in the room*, which is the real thing being sold.

Everything else follows from one framing nobody has written down.

**The locked facts:** 4 flower rooms · 56-day cycle, every room, every pull ·
14-day pull cadence · 26 pulls in 2026 · 1,150 operating plants per room ·
82.3 g per plant actual across 87 closed harvests · $1,100/lb bulk ·
$591.39 actual cost per saleable pound.

**The arithmetic (DERIVED — confirm before quoting):**

```
1,150 plants × 82.3 g            =  94,645 g  =  208.7 lb per room-pull
208.7 lb × 26 pulls              =   5,426 lb of flower per year
5,426 lb × $1,100                =  $5.97M    gross flower value per year
26 pulls × 56 days               =   1,456 room-days per year
                                  (= 4 rooms × 364 days — fully committed)
$5.97M ÷ 1,456 room-days         ≈  $4,100 per room-day
```

**Three consequences, and they change how the business should be run:**

1. **Capacity is 100% committed.** 26 pulls × 56 days exactly fills 4 rooms
   for a year. There is no slack. So there are only **three ways to grow**:
   more grams per plant, more dollars per pound, or a shorter cycle. Every
   other initiative is noise by comparison.
2. **A room-day is worth roughly $4,100.** That single number reprices every
   operational argument. A day of drying delay, a day waiting on a lab, a day
   a room sits between pulls — all of it can now be stated in dollars instead
   of opinions.
3. **The scarcest resource in this company is room-time, and nothing
   currently measures it.** There is no room-day utilisation metric anywhere
   in the platform. **This should be the master KPI of the business.**

### The calendar has no slack in it — and that may be the whole drift

*Found 7 Aug 2026 when the owner pushed back on the framing. DERIVED — confirm
against actual replant dates before acting.*

```
Available   4 rooms × 365 days           = 1,460 room-days
Committed   26 pulls × 56-day cycle      = 1,456 room-days
Slack                                    =     4 room-days PER YEAR
                                           (1 day per room, per year)
```

**The 2026 calendar assumes a room is replanted the same day it is
harvested.** There is no time in it for cleaning, sanitising, maintenance or
a late pull — one day per room per year, total.

If turning a room around actually takes **T** days, each room loses
6.5 × T days a year (6.5 cycles per room):

| Turnaround | Days behind, per room, per year |
|---|---|
| 2 days | 13 |
| 3 days | 19.5 |
| **4 days** | **26** |

**`watch:schedule` reports the rooms 25 days behind.** A turnaround of just
under 4 days explains the entire drift with nothing else going wrong. If that
holds, the rooms are not being run badly — **the plan was never physically
achievable**, and no amount of pushing the team can fix a calendar with no
turnaround time in it.

**How to settle it (read-only, one query):** for each room, measure the actual
gap between a harvest date and the next planting date. If the median gap is
3–4 days, the calendar needs rebuilding at 59–60 days per cycle — which means
roughly 24–25 pulls a year, not 26, and every forecast built on 26 is
overstated by about 5%.

**Immediate question worth answering:** `watch:schedule` reports the rooms
"25 days behind" and 13 of 26 pulls off calendar. Does that mean **room-days
were lost** (rooms empty or over-cycle) or **the schedule shifted** (same
room-days, different dates)? If lost, at roughly $4,100 a day the exposure is
six figures. **Nobody has measured which it is.** That is a one-query answer
and it may be the most valuable query in the business.

---

## Idea 1 · The Strain Scorecard — what to plant, decided by money

**`strain_scorecard` exists in the database and holds 0 rows.** Its own
comment describes "the judged half: notes, score, whether it sells, and
whether to favour, keep for variety, trial or retire." Somebody knew this
mattered and never filled it in.

You run **209 strains** on **100% your own genetics** (754 clone batches, every
one traced to your own mothers — no licensing, no supplier, complete freedom
to choose). And you have per-plant yield across 87+ closed harvests, potency
from 101,608 lab results, and sell-through from 2,690 manifests.

**Nobody has ever ranked a strain by dollars per room-day.** That is the
decision that sets everything downstream — and with capacity fully committed,
**every room-day given to a below-median strain is a real, permanent loss.**

What the AI computes per strain: grams per plant · days of room time actually
used · potency · price realised · sell-through speed · fail rate →
**dollars per room-day**, ranked, with the evidence behind each. Then: favour,
keep for variety, trial, or retire.

Why it is safe to build: read-only analysis over data you already hold, and
its output is a recommendation to a human, not an action.

## Idea 2 · The Cash Conversion Clock

Cost is $591.39/lb; price is $1,100/lb. The margin is real — but the **time**
from cut → dry → test → package → sold is where cash sits still.

Measured today: **358 packages never submitted for testing** (oldest 836
days) · **54 out at the laboratory with no result** (longest 170 days) ·
**22 harvests past the 28-day limit** (oldest 191 days) · laboratory
turnaround averaging about a day but reaching **27 and 43 days** in the tail.

The AI's job: treat the whole operation as one clock and continuously find
where days are being lost — then convert each delay into dollars of working
capital trapped. **Every day removed from the cycle is cash released without
selling anything extra.**

## Idea 3 · Demand-Backwards Planning

Verified pattern: **cultivation sells almost nothing directly** — in July,
1 customer sale against 116 internal moves — while manufacturing holds
**12,675 of 13,246 priced packages.** So the real chain is: customer demand →
SKU → bill of materials → trim and flower required → strain plan → **what to
plant 56+ days ago.**

Today the business grows and then sells. The AI's job is to run that chain
backwards, so the planting decision is made from demand instead of habit.
This is the single change that turns a grow into a manufacturer.

Blocked on: SKU master (0 rows), bills of materials, open orders (0 rows) —
all in [BACKLOG.md](BACKLOG.md).

## Idea 4 · The Compliance Clock that cannot be missed

The licence outranks every dollar figure in this file. Untested material,
harvests past the limit, custody flags, lab results overdue — each is a clock,
and the platform already sees all of them. The AI's job is to make it
**structurally impossible** for one to run out unnoticed: escalate on a
schedule, never clear itself, and always name the accountable person.

Partly built already — `alert_outbox` is append-only and nags until resolved,
per the owner's own instruction that no issue may go unresolved.

## Idea 5 · Memory that survives the people

17 active employees. When someone leaves, how they made decisions leaves with
them. Every judgment the AI shadows and scores ([SHADOW_LOG_SPEC.md](SHADOW_LOG_SPEC.md))
is institutional knowledge that stays. This is the quiet one, and in five
years it may be worth the most.

---

## What Agent D recommends doing first

**Measure room-day utilisation.** It is read-only, it cannot break anything
(Rule Zero), it answers the "25 days behind" question in dollars, and it
establishes the master KPI everything else is judged against. Then the strain
scorecard, because it is the highest-value decision currently being made
without evidence — on a table that already exists and is empty.
