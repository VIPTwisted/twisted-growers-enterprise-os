# Never-tested inventory — walk list for Metrc

**111 active packages that this platform states were never submitted for testing.**
Owner rule, 8 Aug 2026: *"Any item that does not have a manifest or COA, that you
claim was never tested, will have to reconcile in Metrc as such."*

Every row below reconciles on **four independent sources** — three of them outside
this platform's own reasoning:

| source | result |
|---|---|
| Metrc `lab_testing_state` | `NotSubmitted` or `NotRequired` — **Metrc's own word** |
| `metrc_lab_results` (the laboratories) | **0 results** on every one |
| `metrc_rpt_package_transfers` (the state custody export) | **0 manifest lines** on every one |
| Document store | **0 certificates filed directly** against any of them |

49 carry an **inherited** certificate from tested parent material — expected on
crude and badder made from tested flower, and not a contradiction. **None has one
of its own.**

Live check: `select * from v_never_tested_reconciliation where reconciliation like 'CONTRADICTION%'`
must return **zero rows**. Registered in `brain_claims` as `nevertested.contradictions`
and re-derived nightly.

## What the list is, in one line per room

- **Fulfillment Vault — 24 of the 27 rows are SEEDS.** `NotRequired`: seeds are not
  lab tested. That is the entire 2,400-unit "NotRequired" figure. Tagged 19 Dec 2023.
- **Hydrocarbon — ~60 packages.** Crude, badder, distillate, isolate. Extraction
  output mid-process.
- **Solventless — ~16 packages.** Live bubble hash and hash rosin.
- **Production Room — 9 packages.** Gummies being made.
- **Biomass Prep — 2 packages.**

**Nothing is in a finished-goods sales location.**

| Metrc tag | category | item | quantity | location | packaged | days |
|---|---|---|---|---|---|---|
