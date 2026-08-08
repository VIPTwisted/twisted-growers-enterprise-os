# Metrc: closing a harvest and recording moisture loss

**For the admin, and for every team member trained on harvest close-out.**
Written 8 August 2026. Every instruction below is cited to Metrc's own user
guide, `source/Metrc_User_Guide_v7.1.pdf`. Nothing here is invented; where
something is unknown it says so.

> **Read this first.** Moisture loss is **not** a number anybody types into
> Metrc. There is no "moisture loss" field and no adjustment to make. It is what
> Metrc does **automatically** when you finish a harvest correctly. Almost every
> mistake in this area comes from people looking for a field that does not exist.

---

## The rule, in Metrc's own words

> *"When a harvest batch is complete, it is very likely to have remaining weight,
> this is attributable to moisture loss. After all the product is packaged and no
> waste remains in the Harvest Batch, **finishing the batch will take the
> remaining balance to 'moisture loss'.**"*
> — Metrc User Guide, page 149

> *"Finish Batch button is used to finish a Harvest or Manicure batch once all
> packages have been created and all waste has been reported. **There should
> always be weight left in a harvest batch to account for the moisture loss for
> that harvest batch.**"*
> — Metrc User Guide, page 142

**Read that second line twice.** Leftover weight is not a mistake to be corrected.
It is *required*. A harvest that finishes at exactly zero has almost certainly had
its water packaged or wasted as if it were flower, which is a false record.

---

## The procedure — in this order, every time

### Step 1 · Package everything usable off the harvest
Packages of bud and of shake/trim are created **from the harvest batch**, which
is what removes the weight from it (p.143). All bud packages must be strain
specific (p.141).

As packages are created, the harvest's remaining wet weight falls. That is
correct and expected.

### Step 2 · Report all waste — on the day it happens
Use the **Report Waste** button on the harvest (p.147).

> *"All waste must be reported on the day it is created."* — p.141

You may report waste more than once on the same harvest (p.147). Waste is stems,
larf, unusable material — **never** water. There is no waste reason for
evaporation, and using one would be a false entry.

### Step 3 · Finish the harvest
Only once every package is made and no waste is outstanding.

1. Harvest screen → select the batch → **Finish**
2. Enter the **Date Finished** — the date you actually finished packaging off it
3. Click **Finish Batches** (p.149)

**Metrc now books the remaining balance as moisture loss by itself.** Nothing
else is required. Do not adjust, do not waste it, do not package it.

### If you finish a harvest by mistake
Go to the **Inactive** tab to the right of the Harvest tab, highlight the
finished batch, and click **Unfinish** to bring it back to active (p.149).

---

## What good looks like, on our own numbers

Measured across our record on 8 August 2026:

| | Harvests | Wet in | Packaged | Left at finish |
|---|---|---|---|---|
| Dried | 276 | 34,082 lb | 19.9% | **72.8%** |
| Fresh frozen | 74 | 5,771 lb | 77.9% | **1.2%** |

**Fresh frozen is the sanity check.** It is packaged wet and never dries, so
almost nothing should be left at finish — and 1.2% is what we see. Dried flower
leaves about **73%**, which is the water. Our owner-set goal is **73.5%**.

**So if a dried harvest finishes leaving far less than about 70%, something is
wrong** — most likely water was packaged or wasted as product. Raise it, do not
correct it quietly (rule D2: never fix a Metrc problem only in this platform).

---

## ⚠ ONE THING IS NOT YET SETTLED — do not skip this

Our 276 finished harvests **still report a remaining `CurrentWeight` through the
Metrc API**, totalling about 24,826 lb. Two readings are possible and **the API
cannot tell us which**:

- **A — nothing is wrong.** Metrc booked the moisture loss on finish exactly as
  page 149 describes, and `CurrentWeight` is simply the historical balance the
  harvest held. Nothing to do.
- **B — the loss was never booked.** The harvests were finished but the balance
  was not processed, and Metrc still believes we hold 24,826 lb we do not have.
  That would overstate our inventory to the state.

### The two-minute test that settles it

**Anyone with a Metrc login can do this. It settles roughly 24,800 lb.**

1. Log in to Metrc → **Plants** → **Harvested** → the **Inactive** tab
2. Find `TG Gush Mintz - 20250923 f1` (finished 31 March 2026)
3. Look at what Metrc shows for that harvest

| What you see | Reading | What to do |
|---|---|---|
| Moisture loss recorded, remaining weight zero or absent | **A — fine** | Record it in `moisture_loss_entries` and close the finding. Nothing to fix in Metrc. |
| It still shows ~436.6 lb sitting in the harvest | **B — real** | Every finished harvest needs its balance resolved. Raise a `metrc_corrections` row before touching anything (rule D2). |

**Until someone runs that test, no agent and no report may state which it is.**
The platform tracks the open question in `v_moisture_loss_register`, whose
`status` column says per harvest whether the loss has been recorded.

---

## Onboarding checklist — sign off per person

Give this to each team member who will close harvests. They confirm each line.

- [ ] I know moisture loss is **never typed** into Metrc — it is the automatic
      result of finishing a harvest correctly.
- [ ] I package all usable product off the harvest **first**.
- [ ] I report waste **on the day it happens**, and waste never includes water.
- [ ] I finish the harvest only when packaging and waste are both complete.
- [ ] I know leftover weight at finish is **expected and required** — roughly 73%
      on dried flower — and I do not try to zero it out.
- [ ] I know fresh frozen is different: it is packaged wet and leaves almost
      nothing behind.
- [ ] If I finish a harvest by mistake, I use **Unfinish** on the Inactive tab.
- [ ] If a harvest looks wrong, I raise it. I never correct a Metrc problem only
      in this platform — that hides it from the state (rule D2).

**Signed:** ________________  **Date:** ____________  **Trained by:** ____________

---

## Where this lives in the platform

| Thing | Where |
|---|---|
| Per-harvest status, and whether the loss was recorded | `v_moisture_loss_register` |
| The record of each recorded loss | `moisture_loss_entries` — append-only, cannot be deleted (H2) |
| Corrections owed to Metrc | `metrc_corrections` — cannot close without who, when and a Metrc reference |
| The expected band | `f_rule('expected_moisture_pct_min')` / `_max`, editable on Settings (G1) |
| The goal | `f_rule('moisture_loss_goal_pct')`, currently 73.5% |

**This platform is a read-only mirror of Metrc and has no write credentials
(rule D1).** Recording something here does not change Metrc. Every step above
happens in Metrc itself, by a human.
