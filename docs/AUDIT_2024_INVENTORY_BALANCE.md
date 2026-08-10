# 2024 Inventory Audit — the full forensic balance

**Twisted Growers LLC** · Cultivation MC281714 · Manufacturing MP281909
**Prepared 10 August 2026.** Every figure was computed from the live Metrc and
Apex mirrors on that date, and the query is stated beside it. Nothing here is
carried forward from an earlier document without being re-derived.

---

## The headline, stated plainly

**2024 does not balance to zero, and the earlier claim that it did was wrong.**

The previous version of this report said "0.0 lb unexplained". That figure came
from Metrc's own residual arithmetic, which is an *identity* — it closes against
itself by construction and proves nothing. Measured properly, against the
company's own moisture band, **2024 has a shortfall of 704 to 1,633 lb.**

That is the honest number. Everything below shows how it was reached.

---

## 1 · What entered the company in 2024

### 1a · Off our own plants — 132 harvests, all finished

Metrc records these as one pool. They are **two different businesses** and must
never be added on the same basis:

| Stream | Harvests | Wet lb | Waste | Packaged off | Residual | Residual % |
|---|---:|---:|---:|---:|---:|---:|
| **Dried** | 128 | 14,107.0 | 837.1 | 2,348.1 | 10,921.9 | **77.4%** |
| **Fresh frozen** (never dries) | 4 | 369.5 | 78.0 | 287.1 | 4.5 | **1.2%** |
| **Total** | 132 | 14,476.6 | 915.0 | 2,635.2 | 10,926.4 | 75.5% |

**All 132 are finished. None is still open.** This matters more than any other
fact in the report: a finished harvest declares that nothing further will be
taken off it. Its residual therefore cannot be held product — it can only be
water plus unrecorded loss.

### 1b · Bought in from third parties — 1,314.3 lb

Material we did **not** grow. It is input mass: counting it as our production
overstates yield, omitting it from intake breaks the balance.

| Category | Tags | lb received |
|---|---:|---:|
| Fresh Frozen Flower | 26 | **1,050.4** |
| Shake/Trim (by strain) | 23 | 179.0 |
| Buds | 13 | 57.2 |
| Shake/Trim | 6 | 26.6 |
| Infused Pre-Rolls | 9 | 1.1 |

Principal suppliers: **Coastal Cultivars 681.5 lb** and **Flower Power Growers
368.9 lb**, both fresh frozen, both fully consumed. Trim came from Northeast
Alternatives, Coastal Healing, Berkshire Roots, 27 Broom Street and Impressed.

Trim is used for economy pre-rolls and for manufacturing.

### 1c · Moved between our own two licences — 1,112.0 lb — NOT new mass

836.0 lb of Buds and 276.0 lb of Shake/Trim crossed from MC281714 to MP281909.
This is the same company. **It must never appear in intake or in sales.**

---

## 2 · Where the mass went

### 2a · Destroyed, wasted and adjusted away — 1,477.3 lb

| Channel | Events | lb |
|---|---:|---:|
| Harvest waste (recorded at cut) | 131 | 915.0 |
| Package adjustments — negative | 96 | 540.0 |
| Plant waste | 3,467 | 22.3 |
| **Plants destroyed** | **0** | — |

**Zero plants were destroyed in 2024.** The 3,773 destruction events in the
system all belong to other years.

540.0 lb of the adjustments sit on the manufacturing licence, against just
0.0 lb on cultivation. Metrc's stated reasons are *Entry Error · Over/Under
Pulled · Processing Loss · Spoilage · Waste*. Record corrections and real
material loss are **not separated**, because Metrc does not separate them, and
inventing a split would be a guess.

### 2b · Water — and why the residual is not inventory

Metrc's `CurrentWeight` is *wet − waste − packaged*. It is a **residual, not a
measurement**, and it carries evaporated water forever.

Read literally, company-wide it says **29,412 lb** is sitting in rooms. Against
that, total physical on-hand inventory is **2,554.7 lb**. It implies a **65% dry
yield, which does not exist.**

**Three independent controls prove it is water:**

1. **Fresh frozen is computed by the identical arithmetic and never dries.**
   It returns **1.2%**. The dried stream returns **77.4%**. A formula artifact
   would appear in both. It does not.
2. **The Cure Vault holds zero packages.** 85 package rows have touched it; all
   85 are finished; **0.0 lb on hand**. Yet the harvest residual attributes
   8,462 lb to it. That 8,462 lb has no physical counterpart anywhere.
3. **A harvest's room is `DryingLocationName` — a label that does not move.**
   Only packages carry a location that moves. Reading the label as a location is
   what put 12,804 lb in the Fulfillment Vault and 8,462 lb in the Cure Vault.

### 2c · Shipped out

Classified by **Metrc's own `transfer_type`**, never by guessing from names:

| Classification | Manifests | lb | Meaning |
|---|---:|---:|---|
| Affiliated Transfer | 17 | 1,214.0 | Our own licences — not a sale |
| Unaffiliated Transfer | 14 | 653.0 | Arm's length — see §3 |
| Lab Transfer | 28 | 0.8 | Testing |

---

## 3 · Sales — Apex is the record of truth, not Metrc

**Metrc is seed-to-sale compliance software. It is not a sales or accounting
system.** Its price fields are unreliable in both directions, and 2024 proves it
twice over.

### 3a · The Eagle Eyes trap, caught again

Metrc shows **$522,410.43** of "Unaffiliated" wholesale value for 2024. Of that,
**$514,120.09 — 98.4% — went to Eagle Eyes Transport Solutions (MT281320), a
TRANSPORTER.** It covers 129 lines carrying **22.1 lb**. Booked as revenue that
is $23,264 per pound.

It is haulage and storage. It is not a sale. This is the same confusion that
once booked $901,430 of Eagle Eyes storage as revenue.

### 3b · Metrc's prices on the real shipments are near zero

| Destination | Licence | lb | Metrc value |
|---|---|---:|---:|
| Flower Power Growers | MC283122 | 346.2 | **$0.12** |
| Flower Power Growers | MP281983 | 167.0 | **$0.11** |
| Bud's Goods & Service | MP281507 | 103.2 | **$0.06** |
| Northeast Alternatives | MP281319 | 13.5 | $3,370.05 |
| Coastal Cultivars | MP281764 | 1.1 | $4,920.00 |

### 3c · 2024 revenue, from Apex

**$226,351.72 across 51 orders to 35 buyers. First order 20 September 2024.**

This confirms the owner's account: the company grew first, and selling began
late in 2024.

| Buyer | Orders | Revenue |
|---|---:|---:|
| Fernway | 4 | $36,150.00 |
| Legal Greens | 10 | $34,091.00 |
| Clean Technique Labs | 1 | $18,500.00 |
| Stories Cannabis — Fall River | 2 | $13,704.00 |
| Major Bloom Worcester | 1 | $12,862.00 |
| Flower & Soul | 3 | $10,702.13 |
| BASK | 1 | $8,645.00 |
| *…28 more buyers* | | |

**Collections are clean.** Outstanding is $0.00 on effectively every 2024
account. A further 91 orders totalling $67,478.35 were cancelled.

> **Unit trap, recorded so it is never repeated.** Every Apex `*_raw` money
> field is an **integer number of cents**. `total_raw: 6931600` is $69,316.00.
> Summing them as dollars reports 2024 revenue as **$22,635,172** — a 100×
> overstatement that looks entirely plausible on a dashboard.

---

### 3d · Metrc ↔ Apex does NOT balance, and cannot be made to today

The owner's requirement is explicit: *"what left Metrc must match Apex inventory"*,
*"find discrepancies using manifest"*, *"all Apex orders have a manifest and COA"*.

**It cannot be computed.** Not because the analysis is hard — because the join key
does not exist in the data Apex's API returns.

| Join key | State |
|---|---|
| `manifest_number` on the Apex order header | **NULL on all 1,739 orders** |
| `metrc_package_label` on Apex order lines | **Set on 8 of 13,135 lines (0.1%)**; 1 of those 8 matches a Metrc package |
| `batches` — documented as "the bridge to a Metrc package tag" | **Carries no Metrc field at all** |

This was first written up as a sync defect. **That was wrong, and the correction
matters.** Probed directly with `apex-probe` on 10 August 2026:

1. **The key holds the scopes.** `/v1/welcome` returns `view:dealdocs`,
   `view:receiving-orders`, `view:shipping-orders`. Not a permissions problem.
2. **`/v1/deal-docs` returns HTTP 200 with `meta.total: 0`** — with no filter,
   with `deal_flow_id=6600`, and with `order_id=856586`. Apex's own pagination
   says zero.
3. **`/v1/receiving-orders` returns `meta.total: 0`** from 2023-11-30.
4. **The order DETAIL endpoint agrees with the list.**
   `/v1/shipping-orders/856586` returns `manifest_number: null` and
   `metrc_package_label: null`. Reading one level deeper changes nothing.
5. **There is no v2.** `/v2/shipping-orders`, `/v2/deal-docs` and
   `/v2/receiving-orders` all return 404 *Resource Not Found*.

**Our sync is reading Apex correctly. Apex API v1 does not expose the manifests,
COAs, receiving orders or Metrc tags for this account, although the Apex UI
shows them.** That is a vendor question, not an engineering one, and no
reconciliation figure may be published until it is answered.

> **The rule this establishes.** Never report "no match found" when the join key
> itself is absent. That reports our own silence as a business finding. State
> that the key is missing, name which one, and stop.

### 3e · The watermark defect — found and fixed

A genuine defect surfaced while investigating the above, and it was silently
destroying history.

`receiving-orders` returned 0 rows in **200 milliseconds** and was logged
`status=ok`. `shipping-orders` took **69 seconds** for 1,739 rows over the same
window. `pullEntity` then advanced the cursor from `2023-11-30` to **today** —
because it advanced on *any* success, including a zero-row first pull.

Every later run therefore asked only "what changed since today". **Whatever sat
in the window we failed to read became permanently unreachable, behind a green
status.** It took a hand audit to find.

**Fixed in `apex-sync` v3.** An entity that has never once returned a row now
**holds** its cursor instead of advancing it. The asymmetry is the argument:
holding on a genuinely empty entity costs one cheap repeated call; advancing past
an unread window costs the history, silently and forever. A normal empty delta —
`shipping-orders` returning "0 new" tomorrow — still advances, because 1,739 rows
have already proved it non-empty.

The two poisoned cursors were reset to 2023-11-30.

### 3f · `apex-probe` — the instrument

Deployed 10 August 2026. GET only, gated on `TG_ADMIN_KEY`. Reports HTTP status,
elapsed time, the root keys actually present, Apex's own `meta.total`, and the
first record's field list.

```sql
select tg_call_function('apex-probe?path=/v1/deal-docs&keys=1&qs=order_id=856586');
-- then read net._http_response by the returned id
```

Two required entities sat at 0 rows behind a green status for a day. Redeploying
`apex-sync` to test each guess is slow and costs credits; the probe answers
directly. Same instrument, same reasoning, as `metrc-probe`.

---

## 4 · Why 2024 looks the way it does — the business reason

Stated by the owner, 10 August 2026, and recorded so no agent flags it again:

> The 2024 first harvests **tested low**. The company deliberately held that
> weight back rather than launch the brand on it. Most of it was then moved as
> **bulk at a major discount**.

This is a business decision, **not a discrepancy**. It explains the low realised
value per pound, the late start to selling, and inventory that sat untested
through the back half of 2024.

---

## 5 · The shortfall — the real unexplained figure

This is the part the earlier report got wrong.

| | lb |
|---|---:|
| Dried-stream wet in | 14,107.0 |
| Less harvest waste | −837.1 |
| **Usable wet** | **13,269.9** |
| Expected water loss at the company's own 70–77% band | 9,289 – 10,218 |
| **Expected dry product** | **3,052 – 3,981** |
| **Actually packaged** | **2,348.1** |
| **SHORTFALL** | **704 – 1,633** |

**The 2024 dry yield was 17.7% of usable wet.** The company's own band implies
23–30%.

Two readings are possible and the data cannot yet choose between them:

- the 2024 harvests dried harder than the band — plausible for first harvests
  that also tested low; or
- product left the count without being recorded.

**Neither may be asserted.** What can be asserted is that 704–1,633 lb is
unaccounted, and that closing it requires the 2024 COAs and manifests, not more
arithmetic.

---

## 6 · Where inventory physically sits today

From **packages only** — the sole object whose location moves.

**Company total on hand: 2,554.7 lb** (plus 196 unit-based packages and 24 seed
packages carrying no weight).

### Cultivation MC281714 — 416.1 lb

| Room | Category | Tags | lb |
|---|---|---:|---:|
| Fulfillment Vault | Buds | 35 | 165.5 |
| Pre Trim Storage Room | Buds | 21 | 152.8 |
| Finish Vault | Buds | 20 | 33.7 |
| Fulfillment Vault | Shake/Trim (by strain) | 2 | 26.6 |
| Pre Trim Storage Room | Shake/Trim | 4 | 26.2 |
| Pre Trim Storage Room | Shake/Trim (by strain) | 4 | 11.3 |
| **Cure Vault** | — | **0** | **0.0** |

### Manufacturing MP281909 — 2,138.6 lb

| Category | lb |
|---|---:|
| Fresh Frozen Flower | 603.9 |
| Buds | 598.6 |
| Shake/Trim (all forms) | 538.2 |
| Concentrate (bulk + refined) | 243.1 |
| Raw and infused pre-rolls | 154.9 |

Largest rooms: Freezer/Biomass 666.5 · Fulfillment Vault 597.9 · Pre-Trim
Storage 384.1 · Finish Vault 169.1 · Hydrocarbon 115.2 · Packaging 105.0.

### Held but not yet packaged — 833.4 lb

From **open harvests only**, corrected by the moisture rule:

| Room | Open harvests | Metrc residual | Really held | Water |
|---|---:|---:|---:|---:|
| Fulfillment Vault | 16 | 2,060 | **297.6** | 1,762 |
| Dry Room #2 | 4 | 882 | **233.8** | 648 |
| Pre Trim Storage Room | 6 | 757 | **156.6** | 600 |
| Cure Vault | 4 | 816 | **145.4** | 671 |
| **Total** | 30 | 4,515 | **833.4** | 3,682 |

### So the true flower and trim position is

| | lb |
|---|---:|
| Unpackaged, in open harvests | 833.4 |
| Packaged bulk flower (Buds) | 950.6 |
| Packaged trim (Shake/Trim) | 602.3 |
| **Total** | **2,386.3** |

**Not 29,412 lb.** The difference is water.

---

## 7 · Room roles, as stated by the owner

Recorded in `room_roles`, with attribution. Anything unconfirmed is marked so
and must not be presented as fact.

| Room | Role | Confirmed |
|---|---|---|
| Flower Rooms #1–#4, Mother Room | Live canopy — plants, not weight | owner |
| Dry Room #1, #2 | Drying — water leaves here | owner |
| Pre Trim Storage Room / Pre-Trim Storage | Dried, awaiting trim — **product** | owner |
| Packaging Room | Staged for 3.5 g jars and pre-rolls | owner |
| Fulfillment Vault | Bulk flower and outbound | owner |
| Finish Vault | Finished goods | owner |
| Freezer/Biomass Storage | Fresh frozen and biomass | owner |
| **Cure Vault** | Curing / bulk storage | **UNCONFIRMED** |
| Hydrocarbon, Solventless, Production, Biomass Prep | Manufacturing | inferred |

---

## 8 · Open questions — these require answers, not analysis

1. **616.4 lb went to Flower Power and Bud's Goods in 2024 with no Apex sale.**
   Flower Power has no Apex order at any date. Bud's Goods' three October 2024
   orders were all **cancelled**; real trading with them begins 1 June 2025.
   Metrc prices them at $0.12, $0.11 and $0.06. Since Apex is the record of
   truth for sales, **these were not sales.** What were they — toll processing,
   a swap against the fresh frozen we bought from Flower Power, or consignment?

2. **Is the Cure Vault the drying room?** It carries 8,462 lb of harvest
   residual and holds zero packages.

---

## 9 · What is NOT proven, and must not be presented as if it were

1. **42 harvests are named by 2024 packages and are absent from our records.**
   The packages carry the names; the harvest sync only reaches back to
   15 May 2024. **Metrc has them. We have not pulled them.** Until then,
   packages made January–May 2024 cannot be traced to plants.

2. **`metrc_rpt_lab_results` holds nothing for 2024.** 39,531 rows across 1,016
   tags, earliest test date **10 January 2025**. 2024 potency cannot be verified
   from the platform — only from the paper COAs. This is a sync gap, not an
   absence of testing.

3. **`manifest_number` is NULL on every Apex order.** Apex and Metrc cannot
   currently be joined on manifest, so the money and the weight cannot be tied
   line by line.

4. **`shipped_lb` is NULL on all 155 inbound Unaffiliated lines**, and
   `shipped_uom` is NULL with it, so the weight cannot be recomputed. The
   third-party intake weight comes from the package records instead.

5. **16 of 91 outbound 2024 transfers have no line-level export**, so they are
   unclassified and could still move the figures.

6. **Opening stock at 1 January 2024 is not established** — packages exist from
   October 2023 — so this is a *movement* statement for the year, not a closing
   balance certified against a starting one.

7. **Adjustments are not split** between record corrections and real loss.

---

## 10 · What would close 2024

| # | Action | Owner | Closes |
|---|---|---|---|
| 1 | **Ask Apex support how manifests, COAs and Metrc tags are exposed via API for company 4064** | Vinny / Apex | The entire Metrc↔Apex reconciliation. **Blocking.** |
| 2 | Owner answers the two questions in §8 | Vinny | 616.4 lb of unclassified movement |
| 3 | Backfill the 42 missing harvests from Metrc | platform | Seed-to-sale for Jan–May 2024 |
| 4 | Pull 2024 lab results, or index the paper COAs | platform | The low-potency account; §9.2 |
| 5 | Import the remaining 16 manifests' package lines | platform | Completes the outbound figure |
| 6 | Establish opening stock at 1 Jan 2024 | platform | Turns this into a closing balance |

**Item 1 is the blocker.** Items 3–6 refine figures already stated. Item 1 is the
difference between a movement statement and a reconciled year, and it cannot be
solved by writing more code — the data is not on the API surface we hold.

---

## 11 · Can 2024 be closed? — NO, not yet

Asked directly by the owner. The honest answer, and what it would take.

| Test | State |
|---|---|
| Metrc internal arithmetic consistent | **PASS** — fields agree to 4 decimals |
| Every on-hand tag traces to a source harvest | **PASS** — 100% of vault tags name theirs |
| Destruction fully accounted, all channels | **PASS** — 1,477.3 lb across 4 channels |
| Ours / third-party / collective separated | **PASS** — `v_material_sourcing` |
| Physical position known by room | **PASS** — 2,554.7 lb, `v_inventory_position_by_room` |
| Sales figure from the system of record | **PASS** — $226,351.72 from Apex |
| **Plant-side mass balance closes** | **FAIL — 704 to 1,633 lb unexplained** |
| **Metrc outbound reconciles to Apex** | **CANNOT RUN — join key absent from the API** |
| **2024 COAs available to verify potency** | **FAIL — zero 2024 rows; paper only** |
| **Opening stock at 1 Jan 2024 established** | **FAIL — not established** |

**Six of ten pass. 2024 cannot be signed off as balanced.** Saying otherwise
would repeat exactly the mistake this audit was called to correct — the earlier
report declared "0.0 lb unexplained" on the strength of an identity that closes
against itself.

What *can* be said with confidence: nothing is lost or unaccounted in the
**package** record, every tag traces, the destruction is fully explained, and the
revenue figure is sound. The gap is on the **harvest** side and in the **Apex
join** — and both have named, actionable paths above.

---

## Corrections made during this audit

Recorded because the wrong figures were stated before they were checked. This
list is part of the audit, not an appendix to it.

| Stated | Corrected to | Why |
|---|---|---|
| "0.0 lb unexplained — 2024 balances" | **704–1,633 lb short** | The residual is an identity; it closes against itself and proves nothing |
| 2,114.3 lb "shipped out" implying sales | **653.0 lb**, then **not sales at all** | 84 of 91 manifests were labs, internal or storage; Apex is the sales authority |
| 4,855.2 lb produced | **2,494.4 lb** | Repackaged children counted as new production |
| $522,410 of 2024 Metrc "sales" | **$226,351.72 from Apex** | 98.4% of the Metrc figure was a transporter |
| Apex 2024 revenue $22,635,172 | **$226,351.72** | `*_raw` money fields are cents, not dollars |
| "10,926 lb of held bulk flower" | **833.4 lb held, 950.6 lb packaged** | The rest is water; proven three independent ways |
| "72 packages with no harvest behind them" | **All 72 name their harvest** | The harvests are absent from our sync, not from the record |
| "Pre Trim holds 152.8 lb, only 1 tested" | **Packaged 4 Aug 2026, at the lab now** | Six days old, not held-back stock |
| "60.2 lb of 2024 flower still in the vault" | **0.04 lb** | Four abandoned lab-sample tags at 0.01 lb each |
| Holyoke trim "all 363.1 lb still on hand" | **162.3 lb across 10 tags** | An identical total in another room, checked before it was asserted |
| "Apex manifests are missing from our mirror — a sync defect" | **Apex API v1 does not expose them** | The detail endpoint returns the same nulls as the list, the scopes are present, and v2 is 404. Our sync reads Apex correctly. |

---

*Prepared by Agent B. Every figure is reproducible from the live database. No
number in this report was carried over from an earlier document without being
re-derived, and every figure that changed under checking is listed above.*
