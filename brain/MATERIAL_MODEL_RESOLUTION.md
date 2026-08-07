# Resolving inbound material — one field, one table, one check

**Question, owner 7 Aug 2026: "How do you resolve this?"** — the tangle of
`bought_as` unset on 30 suppliers, no destination tracking, `material_purchases`
empty, `third_party_material` holding two different things, and tolling with no
flag.

**The resolution is not a new data model. It is one field, one table already
built, and one verification check.**

---

## 1 · ONE FIELD: ownership. This is the only thing genuinely missing.

Everything else follows from answering *"is this ours?"*

| `ownership` | Meaning | Counts as our stock? | Revenue is |
|---|---|---|---|
| **purchased** | We bought it. Ours. | **Yes** | Product sale |
| **tolled** | Customer's material, processed and returned | **NO** | A service fee |
| **consigned** | Held to sell for someone else | **NO** | A commission |

**Without this one field, tolled material is indistinguishable from stock we
own** — which inflates inventory, production and yield, and is why
`third_party_material` currently holds purchased inputs and custody material
side by side with no way to tell them apart.

## 2 · ONE TABLE: `material_purchases` — already built, never used

Its existing columns answer every remaining question. Nothing needs adding
except `ownership` above:

| Question | Column already there |
|---|---|
| What did we pay? | `unit_cost`, `freight`, `other_landed_cost` |
| From whom, when? | `supplier`, `po_invoice`, `purchase_date`, `received_date` |
| How much, in what unit? | `purchased_qty`, `uom` |
| **What happened to it?** | `allocated_qty`, `work_order`, `allocation_date`, `production_complete` |
| Did it sell? | `fg_release_date`, `first_sale_date`, `revenue_from_lot` |
| Cash in? | `cash_collected_date` |

**This is the destination dimension.** It is per lot, it changes over time, and
it can split — consumed in manufacture, sold on because there was too much, or
still held. **Exactly what the owner described, and exactly what a
supplier-level field cannot carry.**

`suppliers.bought_as` stays as it is. It describes the **condition** at
purchase — sound · failed for remediation · biomass for extraction — and its
check constraint is correct. **Two dimensions, two homes, neither collapsed
into the other.**

## 3 · ONE CHECK: reconcile the ledger against the physical count

**Do not merge `third_party_material` into `material_purchases`.** They are
different kinds of truth and both are needed:

- **`material_purchases`** — the **ledger**. What we bought, what it cost, what
  became of it.
- **`third_party_material`** — the **physical count**. What is actually in the
  Fulfillment Vault, walked and confirmed (*"CONFIRMED 7/31 VT"*).

**Reconciling them is a `verification_checks` row** — the platform's own
pattern: derive one fact two independent ways, and **the disagreement is the
finding**. Ledger says 65.7 lb of distillate on hand, count says 61 lb → that
gap is worth more than either number alone.

**⚠ Blocker on this check: the custody register uses truncated Metrc tags**
(`1479`, `4722`) not full 24-character tags, and two truncated-tag collisions
are already on record. **Resolve full tags before wiring the reconciliation**,
or it will match the wrong package silently.

---

## Entry order — start now, do not backfill

**The single biggest risk to this is trying to reconstruct two years of
purchase history. Do not.**

1. **Set `ownership` on what is on hand today** — the 65.7 lb in the custody
   register and the 847 lb of bought-in stock. Perhaps an hour.
2. **Set `bought_as` on the 30 unset suppliers.** Thirty dropdowns.
3. **Record every NEW purchase from today forward** into `material_purchases`
   as it happens. One row per lot at receipt.
4. **Backfill only where a number is already needed** — the distillate behind
   the vape cost, and anything in the current remediation or resale lines.
5. Then the reconciliation check, once tags are resolved.

**What it unlocks, in order of value:** manufactured cost per unit stops
resting on an assumed base-oil price · remediation margin becomes computable ·
distribution margin becomes computable · tolled material stops inflating stock
· and the third-party half of the business becomes visible for the first time.

**None of this is engineering.** It is one field, a table that already exists,
and typing.
