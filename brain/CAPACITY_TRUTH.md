# Capacity truth — measured 7 August 2026

> ## ⚖️ EVIDENTIARY CONTEXT — owner, 7 August 2026
> Room turnaround is **the team's responsibility under contract**. The owner
> states the team has not been transparent and gave untruthful facts in
> meetings, and that establishing an accurate record is a core reason this
> platform exists — up to and including a termination decision.
>
> **Therefore the standard on this page is evidentiary, not operational.**
> Three rules follow, and they are binding on every agent:
>
> 1. **The record must be capable of exonerating as well as indicting.** A
>    record that only supports one conclusion is advocacy, not evidence, and
>    will not survive challenge. **Exculpatory findings must be surfaced as
>    prominently as adverse ones** — see the plan defects below, which show
>    part of the shortfall is measured against a plan that was never
>    achievable.
> 2. **Source of record is Metrc**, the state's own system, not our
>    interpretation of it. Dead time here is derived from `FloweringDate` and
>    `HarvestedDate` per plant — Metrc's own fields. Say so on every figure.
> 3. **State the sample size and the limits every time.** The 12.9-day mean
>    rests on **8 measured turns**; plant flowering data only begins
>    14 Oct 2025. Anyone quoting it must quote that too.
>
> **⚠️ Before any figure is used in a contractual conversation:** the
> platform's own `v_room_turn_audit` is **broken** (see below) and roughly
> half its FAIL verdicts are artefacts of its own grouping. If that view has
> been used to judge performance, **it has been producing false failures.**
> That must be corrected before any adverse number is relied on.


*First room-cycle and utilisation audit ever run on this business. Read-only.
Every figure verified two independent ways where possible; disagreements are
reported, never averaged.*

## The four answers

**1. The cycle is 65.3 days, not 56.** Mean 65.3, median 64, range 59–71
across 13 pulls in 2026. **No cycle was ever on time — the fastest all year
was 59 days.** Every cycle runs **+9.3 days** over standard; three cycles per
room × 9.3 = **28 days of accumulated drift**, which independently reproduces
the reported "25 days behind."

**2. Dead time between pulls is ~13 days, not 3–4.** Median 13, mean 12.9,
range 7–26. **The earlier 3–4 day hypothesis was REFUTED** — right mechanism,
understated 3–4×. Worst single turn: **F1 sat empty 26 days** (28 Apr–13 May).
The cycle decomposes exactly: **53.0 days flowering + 12.9 dead = 65.9**
against 65.3 observed — two derivations agreeing within 0.6 days.

**3. Room-day utilisation is 73.5%.** 4 rooms × 219 days = 876 available;
**644 measurably occupied; ~232 room-days produced nothing** — about eight
room-months of empty space in seven months. F4 84.0% · F2 76.3% · F1 74.0% ·
F3 59.8% (F3 understated — a flowering cohort is missing from `metrc_plants`;
with it the facility is nearer 79.6%. **Both reported, not averaged.**)

**4. No pull is missing. February and May ran LATE, not empty.** All 13
completed pulls map 1:1 to plan pulls 1–13. February's "missing" F2 pull
happened **9 March, 14 days late** — and F2 was physically full of flowering
plants all February (flowered 12 Jan, harvested 9 Mar), so it *could not* have
pulled. May's F4 slipped to 5 Jun, F1 to 26 Jun. **Decisive test:** an
unrecorded pull would leave a ~120-day gap; the largest gap in the entire 2026
dataset is **71 days.**

> **This corrects Agent D's earlier "~$399,000 of missing production."**
> The plants were not lost. The schedule slipped. The real loss is idle
> room-days, quantified below.

## Slippage is accelerating
Days late by pull: 0 · 1 · 8 · 14 · 14 · 14 · 22 · 21 · 22 · 18 · **26** ·
25 · 25. Pulls 14 (F4) and 15 (F1) are **not yet done**, ≥25 and ≥12 days late.

## Live state at the 5 Aug sync — needs eyes today
- **F2 has no flowering cohort at all — empty since 13 July, 23+ days.**
- **F1 is flowering 760 plants against 1,140 capacity — 380 short, 67% filled.**
- F3 and F4 full and flowering.
*(Caveat: `metrc_plants` last synced 5 Aug; a flip on 6–7 Aug would not show.)*

## Yield against the owner's 180 lb target
2025 pulls (2026 cannot be measured — see below): **155.4 lb per pull mean**,
median 150.2, range 34–267. **24.6 lb short of the 180 lb target; only 7 of 19
pulls (37%) hit it.**

Dry grams per plant — the fair measure, since it normalises for plants
diverted to fresh frozen: **F4 91.6 · F2 91.5 · F1 85.9 · F3 75.0.**
**F3 trails the leaders by 18%.**

## What the drift is worth — DERIVED, confirm before acting
If turnaround fell from 12.9 days to 4, the cycle becomes 53 + 4 = 57 days.
Cycles per room per year: 365 ÷ 57 = 6.4, against 365 ÷ 65.3 = 5.6.
**+0.8 cycles per room × 4 rooms = +3.2 pulls a year.**
3.2 × 155.4 lb = 497 lb × $1,100/lb ≈ **$547,000 a year.**
*Agent D's calculation from measured inputs. Not a measurement. The 62.5%
moisture lesson applies — check it before anyone spends against it.*

## Three broken artefacts found on the way

1. **`v_room_turn_audit` cannot be trusted.** It compares consecutive harvest
   *dates* rather than *pulls*, so it reports `FAIL — 1 days, 55 days EARLY`
   for the second day of the same pull. Roughly half its FAIL verdicts are
   artefacts of its own grouping.
2. **Room capacity is wrong in two places.** `v_room_turn_audit` hardcodes
   1,150 for all four rooms and `harvest_plan_2026.operating_est_room_plants`
   is 1,150 for all 26 pulls. Actual and `conversion_factors` both say
   **F1/F3 = 1,140, F2/F4 = 1,050** — **the plan overstates F2 and F4 by 100
   plants each.**
3. **The plan mixes wet and dry.** `harvest_plan_2026.projected_harvest_lb`
   **adds fresh-frozen pounds to dry flower pounds** (pull 1: 88.752 FF +
   88.752 flower = 177.505). If that FF figure is wet-basis — as all actual FF
   data is — this breaks rules B3/B4. **And the plan's own mean is 157 lb per
   pull, not the owner's 180 lb target.**

## What could not be measured
- **Actual dry pounds for any 2026 pull** — 0 of 61 dry harvests have finished
  packaging, and the remainder is recorded wet-basis. Only 2.4% (2024) and
  2.0% (2025) of dry harvests ever fully draw down, so Metrc never clears the
  residual. *Fix: finish harvests in Metrc, or extract per-package dry weights
  joined to source harvest.*
- **F3's occupancy for the 26 May pull** — cohort absent from `metrc_plants`;
  59.8% is a floor, not a reading.
- **Dead time for 4 of 13 turns** — plants flowering data begins 14 Oct 2025.
  The 12.9-day mean rests on 8 turns.
- **Whether F2 is genuinely empty or just unsynced.**
- **WHY rooms sit empty 7–26 days.** The data proves and sizes the gap; only
  cultivation can say whether it is cleaning, labour, clone availability or
  scheduling. **This is the single question worth asking them.**

## Verification performed
Room classification: 372 of 380 harvests parsed (8 unclassified, all pre-2026;
**2026 is 95 of 95**). Confirmed independently by joining plants to harvests
via `HarvestId` — every F1-named harvest's plants sit in Metrc's "Flower Room
#1", and so on for all four, **100% agreement**. Pull clustering is
unambiguous: within-pull gaps ≤3 days, between-pull gaps ≥58 days, nothing in
between. Weights agree **to the penny** between the API and the report export
across all 350 matched batches (11,289.1 lb packaged, 39,853.3 lb wet).
