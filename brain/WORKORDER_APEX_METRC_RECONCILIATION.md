# WORK ORDER — Apex ↔ Metrc sales reconciliation

**Raised by Agent G (TG-07 Sales), 10 August 2026. Self-contained: everything needed is
below, no prior conversation required.**

Everything here was measured against the live database on 10 Aug 2026. Re-measure before
relying on any number — the schema and the data both move daily.

---

## 1. What exists now

Apex is connected and pulling. `apex_raw` holds real traffic:

| entity | rows |
|---|---|
| shipping-orders | 1,739 (13,135 line items) |
| batches | 1,004 |
| products | 483 |
| buyers | 438 |
| buyer-leads | 79 · available-inventory 44 · tags 38 · buyer-stages 11 · operations 5 · brands 5 · net-terms 2 · company 1 · deal-flows 1 |
| receiving-orders | 0 — `status: ok` on a full pull, genuinely empty. We sell on Apex, we do not buy. |

**Views built (all `security_invoker = on`):**

- `v_apex_order_metrc_link` — one row per Apex order, the Metrc record beside it
- `v_manifest_reconciliation` — one row per outbound Metrc manifest, both sides, date for date
- `v_manifest_discrepancy_summary` — monthly; lab and internal transfers in their **own columns**
- `v_manifest_discrepancy_audit` — **360 rows a human must settle**, everything on the row
- `v_apex_field_coverage` + `apex_field_map` — makes "fully mapped" checkable
- `entity_note` / `v_entity_note_active` — business context on any entity

**Gate:** `tools/checks/apex-registry-vs-spec.mjs`, wired into ci.yml and `npm run check`.

---

## 2. THREE UNIT TRAPS — read before touching any figure

Each was measured, each is now guarded by a `verification_checks` row, and **each is
invisible from the field name.**

| Trap | Effect if missed |
|---|---|
| **Every `*_raw` money field is in CENTS** | $6,471,357 reads as **$647,044,908** — 100× over |
| **`order_price_raw` on a LINE is a UNIT price** — line total is price × `order_quantity` | $6,990,914 reads as **$2,877,174** — 59% under |
| **`cost_of_goods` has no `_raw` twin on the order line** but does on the batch | Margin mixes cents with dollars |

Divide through `conversion_factors.apex_money_raw_minor_units`. Never a literal.

Proof the model holds: **1,296 of 1,297 orders reconcile to the exact cent**; the whole book
differs by **$0.02** (invoice `Twiste-1397`, five lines, floating-point rounding).

---

## 3. THE JOIN — it is not what the brief said

The briefs state the join is exact via `metrc_package_label` on the order line and
`manifest_number` on the order. **Measured: 8 of 13,135 lines, and 0 of 1,739 orders.**
Apex declares both fields and returns them empty. Owner ruled 10 Aug 2026 that operators
will **not** be asked to start filling them.

**What works instead: the INVOICE NUMBER, digits normalised.**

Apex writes `TWISTE-1737`. The operator types `1737` into Metrc. Same identifier, two
renderings — 966 of Metrc's 1,001 distinct values are digits only.

```
regexp_replace(invoice_number, '\D', '', 'g')
```

Raw equality: **7 matches.** Normalised: **975.** And **660 of those agree with the Metrc
declared value to the exact cent** — a wrong join does not produce 660 penny-perfect
agreements on an independently typed value.

This is **not** a fuzzy match — it is one key written two ways, the same class as resolving
"Nova Farms LLC" vs "Nova Farms, LLC" by licence number. But the Metrc side is
operator-entered free text and can be mistyped, so `match_basis` says so on every matched row.
**Never present it as an exact key.**

### The key did not exist before 2025-01-30

- **2025-01-30** — first Metrc wholesale record carrying an invoice number
- **2025-01-30** — first Apex order that matches one

Same day, measured independently. Every Apex order from 2024-09-20 to 2025-01-29 is
unmatchable **by construction**. Not missing, not undeclared — the field was blank on one
side. Do not report those as failures.

---

## 4. POPULATION — an outbound manifest is not a sale

**Classify from `licence_type_prefix`, the registry table. NEVER from hardcoded prefixes.**

I hardcoded `MX` as the transporter prefix, taken from prose. **`MX` does not exist in the
registry.** The real prefix is **`MT`**, and **`ML`** is a second laboratory prefix. That
error put 26 transporter manifests into my sales figures, one carrying **$142,736**. It is
the documented $901,430 error, reproduced.

Distinct outbound manifests (2,355 total, from 4,072 rows — **1,717 are duplicates**, always
use `distinct manifest_number`):

| Kind | Manifests | First |
|---|---:|---|
| **SALE** | 1,162 | 2024-06-22 |
| Internal transfer (our own second licence) | 1,033 | 2024-07-18 |
| Laboratory sample | 134 | 2024-01-20 |
| Transporter / storage | 26 | 2024-08-26 |

**First manifest ever = 2024-01-20, and it was a LAB transfer. First actual sale =
2024-06-22.** Five months apart. Anchoring a sales reconciliation on "first manifest" starts
it five months before trading began.

**There is no 2023 data on either side.** Zero rows, both systems. Note that no Metrc export
has ever been *requested* for a period before 2024 (`metrc_report_imports.period_start`), so
for Metrc this is "never asked for", not proven absence.

---

## 5. EAGLE EYES (MT281320) — read `entity_note` before concluding anything

Owner, 10 Aug 2026: **third-party inventory storage, not a customer and not a haulier.** They
warehoused our finished goods and shipped on our behalf for a few months. **The material
remained ours throughout** — a manifest to this licence is our own stock moving into storage,
never revenue. It ended because storage conditions were unacceptable and **whatever was unsold
was transferred back**.

Measured: 12 outbound manifests from 2024-08-26; 19 inbound returns 2024-10-24 → 2025-02-04;
last movement 2025-02-20.

**THE OPEN PIECE — the mass balance does not close:**

| Of 142 tags sent to storage | |
|---|---:|
| Returned under the same tag (unsold, proven) | 48 |
| Appear on a sale manifest (all 6 also partly returned) | 6 |
| **Neither returned nor sold under their own tag** | **94** |
| Tags returned that were never sent | 129 |

Repackaging is the leading hypothesis — Metrc mints a new tag on a repack — **but it is
unproven**: `source_package` is NULL on all 177 returned rows in the report export.

**Next step, cheapest first:** run `f_material_origin(tag)` over the 129 returned tags (it
walks `SourcePackageLabels` on the **API** mirror, not the report) and see how many trace to
one of the 94. If lineage is there, the balance closes. Otherwise: the 2,683 manifest PDFs on
disk, then the Metrc API per package.

**Anyone comparing the two tag sets directly will conclude 94 packages went missing and 129
appeared from nowhere. Both are false.**

---

## 6. Where the reconciliation stands

Sales only, 1,162 sale manifests:

| Status | Manifests |
|---|---:|
| **RECONCILED** (within the $1.00 tolerance) | 686 |
| Value differs — Apex sold more | 215 |
| Value differs — Metrc declares more | 145 |
| No Metrc value — matched but manifest has no priced line | 65 |
| No Apex order for that invoice | 47 |
| Before 2025-01-30 — key did not exist | 18 |
| No invoice number on the Metrc record | 12 |

**Audit list: 360 manifests, gross $815,121.09, net $351,572.89.** Sales only, above
tolerance. `v_manifest_discrepancy_audit` carries every field needed to settle a row plus a
`where_to_look` column.

**Journal entry:** 15 manifests within tolerance but not exactly zero. **Total −$0.34.** The
other 671 are exact to the cent.

**Owner rulings, both recorded as rows, not code:**
- ≤ $1.00 is rounding — book Apex (`conversion_factors.apex_metrc_rounding_tolerance_usd`)
- Apex is the sales figure of record (`figure_of_record.sales_revenue`); Metrc holds the
  **declared transfer price**, a regulatory filing that legitimately differs
- $5.00 was authorised for one run and **not used** — measured, it buys 3 invoices and $6.90

---

## 7. Open, and NOT done

1. **`v_manifest_reconciliation` still classifies from hardcoded prefixes.** Must read
   `licence_type_prefix`. This is rule G1 and it is the bug that produced §4.
2. **The Eagle Eyes lineage trace** — §5.
3. **`apex-sync` is committed but NOT deployed.** Production runs v1. Four fixes are not live:
   watermark advancing to finish-time (a 69-second permanent gap on every pull), undefined
   `MAX_RATE_RETRIES` (ReferenceError inside the 429 handler), 429 conflating rate-limit with
   spending-cap, and silent 12,000-row truncation reported as `ok`.
4. **Apex is not registered with the Sentinel.** Five entities failed for two hours and
   nothing raised an alarm.
5. **`apex_sync_run.credits_used`** — code written, not deployed. Until then all four cost
   controls are tuned against no feedback.
6. **Margin is not computable** — `cost_of_goods` on 50 of 13,135 lines. Source from the batch.
7. **Nothing mapped into typed tables yet.** `sales_orders`, `sales_order_lines`, `invoices`,
   `shipments` are all still 0 rows. The field census is done and `v_apex_field_coverage` is
   live to prove nothing is dropped.
8. **285 views run as SECURITY DEFINER** and bypass RLS (`actions_register`, critical).
   Every Sales view sets `security_invoker = on`, so the backlog stops growing.

---

## 8. The rule this episode teaches

Three times in one session I reached a confident, well-evidenced, wrong conclusion:
transporter-as-sale, then transporter-as-haulage, then a mass balance that looked like loss.
**Every correction came from the owner, not from the data.** None of it was derivable.

That is what `entity_note` is for. Before concluding anything about a licence, a manifest or a
package, read `v_entity_note_active` for it. And when the owner explains something, write it
there — otherwise the next agent re-derives the same wrong answer.
