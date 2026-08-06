# Handoff package — read in this order

Prepared 6 August 2026. **Development is frozen.** Nothing in the platform
should be changed until the incoming agent has read all four documents below.

## 1. `../../CLAUDE.md` — THE RULES
**Single source of truth for rules.** 40 numbered rules in nine groups:
data honesty, weights and units, traceability and proof, Metrc, database safety,
front-end safety, configuration, issues and accountability, brand and voice.

Every rule has a failure behind it. Do not weaken, reinterpret or "improve" any
of them without the owner's explicit approval.

Also contains the **LOCKED FACTS** section — room capacity, cycle, yield basis
and money figures, confirmed against the owner's own workbooks. Do not re-derive
these. They were argued over for a full day before being settled.

## 2. `../../HANDOFF.md` — THE STATE
**Single source of truth for state.** Architecture, the measured State of the OS,
nine known defects with their evidence, the five ways this project has broken
before, security posture, immutable records, sync pipelines, and the verification
results from the takeover audit — including **four navigation entries that point
at views which no longer exist and will render empty**.

Section 12 states what the handoff deliberately does *not* contain, and why.

## 3. `SESSION_TRANSCRIPT.html` — THE REASONING
The complete working session: 223 owner messages, 763 replies, in order with
timestamps. Open it in any browser. It has a search box and filters for owner-only
or agent-only.

**This is the most valuable file for understanding *why* things are the way they
are.** Several decisions look arbitrary until you read the argument that produced
them — particularly the room capacity question, the moisture band, and the
grams-per-plant versus grams-per-square-foot correction.

Search it before assuming anything is a mistake. Definitions for the four missing
views are in here.

## 4. `../source-of-truth/` — THE OWNER'S DOCUMENTS
- `TG_2026_Harvest_Calendar_STRICT_8_WEEK_CYCLE.xlsm` — the authoritative harvest
  plan. 26 pulls, 56-day room cycle, 4 tables × 287.5 = 1,150 plants per room.
  **Note the column headed "Projected grams/sqft" is actually grams per PLANT.**
- `Manufacturing_Production_Worksheet.xlsx` — extraction, vape, pre-roll and
  rosin cost models. The Production Cost Calculator is built from these formulas.

---

## The four things to do first

1. **Deploy the staged front end** and verify it as a signed-in user. The
   database is correct; the site is one deploy behind.
2. **Rebuild `v_open_issues`** — it holds the owner's fix/leave/ignore/reset
   decisions and currently renders empty. Three other views are also missing;
   see `HANDOFF.md` section 11.
3. **Fix `tg_sweep_unknowns()`** — it re-raises questions the owner has already
   answered, so his answers evaporate overnight.
4. **Settle the moisture band.** It sits underneath every conversion, yield,
   inventory and valuation figure, and blocks 6,796 lb of Metrc corrections.

Then, and only then, ask the owner what to build next.

---

## How to work with this owner

He is not an engineer and does not want to be one. What has worked:

- Verify against live data before reporting anything
- Show the arithmetic
- Name what is missing and why it is missing
- Never invent a number to fill a gap
- Correct yourself plainly and move on
- Give a recommendation, not a menu of options
- When something genuinely needs his decision, ask one clear question with the
  consequences of each answer — then act on it

He will tell you directly when something is wrong. He is usually right about the
symptom even when the cause turns out to be different.
