# Strain & Product Library — module specification

**Agent H_COA · Strain & Product Library.** Blueprint for owner review, written
10 August 2026. **Nothing in here is built.** Every figure below was measured
live against `fxetuqjryttnypgepsru` on 10 Aug 2026 and carries the query that
produced it. Numbers are perishable — re-measure before relying on one.

Lane: all COA parsing, strain data, product-library and listing work. Agent B
retains the 2024 balance and does not touch these tables.

---

## 1 · What this module is, in plain English

One place that answers two different questions with the same evidence.

| Audience | The question | What they get |
|---|---|---|
| **Inside** — inventory, quality, compliance | *What is this, what did it test at, and where is the proof?* | Every strain, every batch, every certificate, every gap named out loud |
| **Outside** — customers, buyers, marketing | *What are you selling, how strong is it, and can I check?* | A published card with potency, terpenes, an image, and a certificate the buyer can open themselves |

It is a **new category in the same OS** — same Supabase, same repository, same
Netlify site. Not a separate application. It gets its own dashboard meeting the
rule-10 standard and feeds Control Tower and the Chief Executive Dashboard
(rule 4).

---

## 2 · Owner rulings that govern this module

### Standing (from the work order, 10 Aug 2026)

1. **The COA is the source of record for every lab figure. Metrc is not.**
   Never back-fill a COA gap with a Metrc number.
2. **Metrc carries no TAC and no terpenes.** `coa_extract.total_cannabinoids`
   is TAC.
3. **Ours only.** Use `f_is_ours()`. Do not match licences at a call site.
4. **Units.** Metrc reports Total THC (%) and Total THC (mg/g) under names that
   both begin "Total THC". % = mg/g ÷ 10. Mixing them produced an apparent
   798.75% concentrate.
5. **Never invent a customer-facing fact.**
6. **No expiring URLs.** Storage paths only.
7. **Journal every adjustment** in `audit_journal` with reason and basis,
   status `proposed`.

### Settled 10 August 2026, in this session

| # | Question | Ruling |
|---|---|---|
| **H1** | Is a sellable product its own record, separate from the strain? | **Split them.** `strain_library` = genetics only. New `product_catalog` = one row per sellable SKU, with a link table for blends. |
| **H2** | What potency does a customer-facing card show? | **Range + this batch.** The tested range across batches, the consistency figure, and the specific batch being sold — each with its own certificate link. Never one number. |
| **H3** | Who may set `strain_type`? | **It may be proposed from Metrc or from public reference material, and it must end up filled** — but every value carries its source on its face, and a web-sourced value says so on the card. *This amends standing rule 5 for this one field: see §6, which is how both survive.* |
| **H4** | How are cards and certificates shared? | **All four channels get built** — public card link, public certificate-verify page, file export (PCT + Shopify), printable sell sheet. Each is admin-switchable; the admin decides later which are on. |

---

## 3 · Measured starting position — and four corrections to the work order

### 3.1 The COA↔Metrc join already exists. Nothing had ever used it.

The work order states *"coa_extract.package_tag is series 1A40A01…; zero exact
matches; COA and Metrc testing cannot currently be joined."* Measured, that is
not the shape of the problem.

- **971 of 983** `coa_extract` rows carry a `1A40A03…` tag, not `1A40A01`.
- **All 969 distinct COA tags resolve** into `metrc_packages` **and** into
  `metrc_lab_results` (the API sync, 101,608 rows / 2,642 packages). That join
  works today.
- What does not join is **`metrc_rpt_lab_results`** — because it is keyed on the
  **laboratory sample package**, not the source package. Its 1,016 tags are all
  in our own `E5B1`/`E5B2` series and **none** appears in `metrc_packages`. The
  sample tag is the source tag **+1** (`…000000665` sampled from `…000000664`).

**The bridge column was already in the table and nothing had ever joined it:**

| Join | Resolves |
|---|---:|
| `metrc_rpt_lab_results.source_packages` → `metrc_packages.tag` | **963 of 1,008** |
| `metrc_rpt_lab_results.source_packages` → `coa_extract.package_tag` | **595 of 969 COA tags** |

Same shape as the manifest→package discovery of 7 Aug: 19,256 rows sitting
unjoined. This is a view, not a parser rewrite, and it moves to phase 1.

> The remaining 374 COA tags are not in the Lab Results report import at all.
> They are covered by `metrc_lab_results` (API), which reaches all 969. Two
> sources, different coverage — **state which one a figure came from** (A2).

### 3.1a ⚠ CORRECTION, 10 Aug 2026 — what this join is worth, withdrawn and restated

**I wrote above that closing this join "unlocks 595 COAs". Measured after
building it, that is wrong, and it is withdrawn on the record (rule K5).**

`select count(*) from (select distinct source_packages t from
metrc_rpt_lab_results …) s join coa_extract c on c.package_tag = s.t where not
exists (select 1 from metrc_lab_results m where m.package_tag = s.t)` returns
**0**. Every certificate reachable through `source_packages` was **already**
reachable through the API sync. The join adds **no certificate coverage at all**.

I counted the certificates the join *touches* and reported them as certificates
the join *gains*. Those are different questions, and the second one is the only
one that mattered.

**What the join is actually worth — larger than I predicted, in a different
place: 224 source packages carry laboratory results that the packages API never
returned.** 179 of them exist in `metrc_packages`, **none carries a certificate**,
and only 3 are still active with quantity. By item name they are overwhelmingly
**bulk intermediates** — badder, live hash rosin, crude, distillate, bulk vape
oil, gummies. Two consequences:

1. **Anything calling those packages untested from the API alone is wrong** —
   directly rule C0b, *"never tested is a claim, not an excuse"*.
2. They are **exactly the products the customer catalogue needs potency for**,
   because concentrates and vapes are where the API is thinnest.

### 3.1b 🔴 `overall_passed` carries TWO encodings, split by import

| Import | Encoding | Rows |
|---|---|---:|
| 03 Aug export | `True` / `False` | 16,081 |
| 06 Aug export | `Yes` / `No` | 23,450 |

Not by laboratory — by **import**. The same three labs appear under both. So
`where overall_passed = 'True'` silently drops an entire import, **59% of the
table**, and looks correct while doing it.

**Sized: failed samples are 96 normalised, against 73 by the naive filter — 23
failed laboratory tests invisible.** Fixed by `f_yesno()`, which returns **NULL**
for anything unrecognised rather than false, because guessing false on an unknown
turns a failed test into a pass. Its fixture re-reads every value live in the
column, so a third encoding in a future import fires on its own.

The two imports do **not** overlap — 0 `(sample, test)` pairs appear in both — so
counting across them does not double-count.

### 3.2 The COA parser cannot run again. Its queue is permanently empty.

`app/supabase/functions/parse-documents/index.ts` writes six fields and stamps
`client_parsed_at`. `v_coa_unparsed` excludes any certificate where
`client_parsed_at is not null`. All 983 are stamped, so **the queue is empty,
and both cron jobs (`parse-documents-backfill`, `parse-documents-daily`) report
success on zero work.**

That is the exact trap named in that file's own header comment — *"a document
downloaded and not parsed is WORSE than one not downloaded, because it looks
like coverage"* — reproduced one level down, on the fields rather than the
documents.

Populated across 983 certificates:

| Field | Populated | Field | Populated |
|---|---:|---|---:|
| `client_license` | 972 | **`metrc_batch_id`** | **0** |
| `client_name` | 981 | **`metrc_sample_id`** | **0** |
| `total_thc` | 808 | **`metrc_source_id`** | **0** |
| `total_cannabinoids` (TAC) | 742 | **`manifest_on_coa`** | **0** — never written |
| `total_terpenes` | 98 | **`report_date`** | **7** — never written |
| `terpene_profile` | 46 | `lab_report_id` | 2 |
| `pathogens` | 0 | `water_activity` | 0 |
| `parse_error` | 18 | | |

**Two distinct causes, and both need naming:**

1. **The deployed function never writes** `manifest_on_coa`, `report_date` or
   `client_address`. They are parsed and discarded. No amount of re-running
   fills them.
2. **The extractor is the wrong one.** The edge function reads with `unpdf`
   (`extractText`, reading order). The regexes — `/METRC Batch ID:\s*(.+?)\s*$/m`
   — assume layout-preserved two-column text. **The repository already holds a
   better parser**: `tools/documents/coa_client_parse.py` uses `pdfplumber`,
   knows five laboratory layouts, and carries four alternate patterns per field
   against the edge function's two. Production runs the weaker one.

**Consequence for the naming ladder.** Rung 2 of rule D4 — *"`coa_extract.metrc_batch_id`
names the harvest; the only independent source"* — **cannot fire on a single
package**, because the column is empty on all 983. A rung that can never answer
proves nothing (K1 question 4). CLAUDE.md describes a ladder with a missing rung.

`report_date`, where present, is in three conventions across six values:
`2026-05-06`, `04/06/2026`, `4/9/2026`. **`04/06/2026` versus `4/9/2026` cannot
be disambiguated without knowing the laboratory** — so the parse must store the
raw string, the parsed date, and a confidence, never a silently-guessed date.

### 3.3 Eleven certificates are being counted as third-party when the client is unreadable

Measured: **706 ours · 266 third-party · 11 client unknown.** The work order says
277 third-party, which folds the 11 unknowns in. Unknown is not third-party
(rule A3), and this field gates what may appear in a customer catalogue.

Confirmed good: **`f_is_ours` is now list-aware** — `f_is_ours` and `f_any_ours`
both return 706 against `client_license` values like `MC281714, MP281909`.
**CLAUDE.md data trap #12 still says `f_is_ours` handles only a single licence.**
That line is now wrong and will get the function re-broken by someone obeying it.
It needs an owner-approved amendment.

### 3.4 `v_product_listing` fans out, and nothing is publishable

302 rows over **272 distinct strains** — 28 strains appear more than once,
because the `on_hand` CTE groups by licence **and** category and the join
multiplies. Jane's own instructions warn that duplicate listings are the
principal PCT failure mode, so this defect ships straight into the retailer's
menu.

| `publish_readiness` | `coa_state` | Rows |
|---|---|---:|
| BLOCKED — no COA | no COA on file | 171 |
| BLOCKED — strain type not set | COA + TAC, terpenes unparsed | 116 |
| BLOCKED — strain type not set | COA on file, TAC unparsed | 15 |
| **READY** | **COA complete** | **0** |

Also measured: `strain_library` = **272** rows (not 302 — that is the fanned-out
count); `strain_image` = **0** rows; `strain_scorecard` = **0** rows.

### 3.5 🔴 `strain_library` is not a strain library — 92% of it is product names

**This is the finding that reorders the whole plan.** Only **22 of 272** names in
`strain_library` exist in the Metrc strain register. **250 do not**, and no
variant matching rescues any of them (stripping a leading `TG `: 0 rescued;
adding one: 0 rescued).

Real rows, sampled at random:

| Row in `strain_library` | What it actually is |
|---|---|
| `WIP_Extraction__Concentrate_Distillate_Second Pass___1.0g` | a work-in-progress item name |
| `WIP_Production__Flower_Trim_Bulk_Lemon Cherry Gelato_Hybrid_1.0g` | a work-in-progress item name |
| `TG Banana Mango seeds` | registered strain `TG Banana Mango` + an unstripped suffix |
| `Spritzer Crude`, `Golden Lemons Crude` | strain + product form |
| `Skywalker OG Liquid Shatter`, `Spec Ops Live Bubble Hash` | strain + product form |
| `Purple Taxi Live Badder Pre-Fill` | strain + product form |
| `Peaches and Cream Terpene Infused`, `Toad Venom Terpene Infused` | strain + descriptor |
| `BHO 1st Pas` | a process name, truncated |
| `Apple Pie A La Mode`, `Strawnana`, `Stud Muffin` | plausibly real, but unregistered |

`strain_library` was populated from the distinct output of `f_strain_from_item()`
over item names. That function strips a known list of product forms — it does not
know `seeds`, `Crude`, `Live Badder Pre-Fill`, `Terpene Infused`,
`Liquid Shatter`, `Live Bubble Hash`, or the `WIP_` convention.

**This is rule D4 corollary 1 — *an item name is a PRODUCT name, not a strain* —
the error that manufactured 805 false findings, now sitting inside the table we
were about to publish to customers.** Publishing it unreconciled puts
`WIP_Extraction__Concentrate_Distillate_Second Pass___1.0g` on a product card in
front of a buyer.

It also explains part of §3.4: many of the 171 "BLOCKED — no COA" rows are not
strains, so no certificate could ever resolve to them. The block was right for
the wrong reason.

---

## 4 · Data model

The governing decision is **H1: a strain is genetics; a product is a thing you
sell.** Today one table is asked to be both, which is what produces the 28
duplicates and what makes a blend impossible to list.

```
                    ┌─────────────────┐
   registered ─────►│ strain_library  │  genetics · type · terpene signature · copy
   Metrc strain     │  (1 per strain) │  images · status · provenance per field
                    └────────┬────────┘
                             │  product_strain (link — a blend has several)
                    ┌────────▼────────┐
   sellable SKU ───►│ product_catalog │  brand · line · pack size · category
                    │  (1 per SKU)    │  → one PCT row · one Shopify row
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
      ┌───────▼──────┐ ┌─────▼──────┐ ┌─────▼─────────┐
      │ coa_analyte  │ │product_img │ │listing_version│
      │ 1 row per    │ │ paths only │ │ append-only,  │
      │ analyte/COA  │ │            │ │ what was said │
      └──────────────┘ └────────────┘ └───────────────┘
```

### Layer 0 · Identity

| Object | State | Change |
|---|---|---|
| `strain_library` | 272 rows, 250 of them not strains | **Reconcile against `metrc_strains` (§5).** Add `metrc_strain_id`, `registered boolean`, and a provenance column per customer-facing field. |
| `product_catalog` | **new** | One row per sellable SKU: brand, product line (`f_product_line`), Jane brand category, pack size, non-standard size, dosage, ratio, container. |
| `product_strain` | **new** | Link. A blend has several rows; `f_strain_by_tag` returns `BLEND` and no strain, deliberately (D4 corollary 2), so the contributing list lives here and is **derived from source harvests, never typed** (corollary 4). |

### Layer 1 · Evidence

| Object | State | Change |
|---|---|---|
| `coa_extract` | 983 rows | Add `report_date_raw`, `report_date_parsed`, `report_date_confidence`. Populate the five dead identification fields. |
| `coa_analyte` | **new** | **The single highest-value structural change.** One row per analyte per certificate: `document_id, analyte, class (cannabinoid/terpene/screen), value, unit, loq, passed`. Terpenes stop being an unqueryable `jsonb` blob — *"top three terpenes for this strain"* becomes a query, and a terpene becomes something you can filter, rank and sell on. |
| `v_lab_sample_link` | **new** | The §3.1 join: sample package → source package → COA → strain. |

**Units guard (standing rule 4).** `coa_analyte.unit` is mandatory and
constrained. A `%` value and a `mg/g` value may never be compared or averaged
without conversion; the view that does the conversion is the only place the
factor 10 appears (rule G1 — config is rows, not scattered literals).

### Layer 2 · Media

`strain_image` (0 rows) plus a new `product_image`. **Storage paths only**
(standing rule 6), private bucket, served through the existing
`/functions/v1/document/…` edge-function pattern — permanent, tokenless, and
session-checked. This is the fix already recommended in `CONTRADICTIONS.md` for
the eight views still serving pre-signed URLs that expire 5–6 September 2026.

Jane's rules are enforced **at the gate**, not warned about afterwards
(rules J1/J2): PNG or JPEG · ≤ 4 MB · square · ≥ 1000 × 1000 px · white
background recommended · maximum 5 per product. An upload that fails is refused
with the reason, not accepted with a flag.

### Layer 3 · Publishing

`listing_version` — **append-only**, one row per published version of a card,
carrying the author, the timestamp, and **the exact certificate and potency
figures it was published against**. Three reasons:

1. A published claim is a claim (rule C1). If the batch changes, the card that
   went to a customer last month must still be reproducible.
2. It gives a share link a stable target that does not silently change under the
   person holding it.
3. It is the evidence if a buyer disputes what they were told.

The publish gate is the hardened `publish_readiness` logic, and per rule K2 it
ships with **both halves of its fixture** — positive (it blocks a card with no
certificate) and negative (it does **not** block a legitimate CBD-type strain,
or a blend with a contributing-strains list).

### Layer 4 · Distribution — all four, admin-switchable (H4)

| Channel | What it is, plainly | Who sees it | Risk |
|---|---|---|---|
| **Public card link** | One permanent web page per published product version: image, description, potency range plus the batch being sold, terpene profile, certificate link. Send it to a buyer by text or email; they need no login. | Anyone with the link | Shows no tags, no licences, no costs, no room, no customer names. The version is frozen, so the link cannot drift. |
| **Public certificate-verify page** | The buyer clicks or scans and sees **the actual certificate from the laboratory** — not our transcription of it. | Anyone with the link | Strongest trust signal available and we already hold 983 PDFs. A certificate names the client, so this publishes who made it — which for our own material is the point. **Third-party material must be excluded unless the owner rules otherwise.** |
| **File export** | The Jane PCT workbook (§7) and a Shopify CSV (§8). Email or upload. | Whoever you send it to | Lowest exposure. Also the slowest — a file is stale the moment it is sent. |
| **Printable sell sheet** | One page per strain or product, as a PDF, for sales calls and trade shows. Same data, on paper. | Whoever you hand it to | Cannot be recalled once printed, so it must carry the batch and the date it was produced on its face. |

Each is a row in an admin table with an on/off switch and the reason it was
switched (rule G1, rule H1 — a decision is recorded, never implicit).

### Layer 5 · Search, filter, date range

**One saved-view primitive, reused** — not a filter bar rebuilt per screen
(*share primitives, never layouts*). Search spans strain, product, terpene,
certificate number, batch, manifest and package tag. Date range applies to:
certificate report date · packaged date · published date · last tested. The
existing `date_range_presets` (27 rows) and `saved_views` (10 rows) are the
mechanism; they are not rebuilt.

---

## 5 · Reconciling the strain register — phase 0

Nothing customer-facing may be built on §3.5. The reconciliation is a **ladder,
and it runs in order**, exactly like the naming ladder in rule D4:

| Rung | Test | Outcome |
|---|---|---|
| **1** | Name matches `metrc_strains` exactly | **REGISTERED STRAIN** — carry forward |
| **2** | Name matches after stripping a known product form (`seeds`, `Crude`, `Live Badder`, `Terpene Infused`, `Liquid Shatter`, `Live Bubble Hash`, `Pre-Fill`, …) | **STRAIN + FORM** — the strain carries forward; the form becomes a `product_catalog` attribute |
| **3** | Name matches the `WIP_` convention or another item-naming pattern | **NOT A STRAIN** — retire from the library; it belongs to inventory, not genetics |
| **4** | Unregistered but plausible, and it appears on a harvest we own | **CANDIDATE** — raise for the owner. Either register it in Metrc or record why not. |
| **5** | Unregistered and traces to an outside licence | **THIRD-PARTY BATCH CODE** — never a strain of ours (D4 corollary 3) |

Every rung writes its verdict and its evidence. **Nothing is deleted** — a row
that leaves the library is marked retired with the reason, because a deletion
destroys the record of what was believed (rule K5).

The stripper built at rung 2 is the same defect that produced §3.5, so it ships
with fixtures: it must strip `TG Banana Mango seeds` → `TG Banana Mango`, and it
must **not** strip a legitimate strain whose registered name genuinely ends in a
word on the list.

### 5.1 BUILT AND MEASURED — 10 August 2026

| Object | What it is |
|---|---|
| `f_strip_product_form(text)` | Suffix-anchored, longest-match-first, bounded loop. Built from the 250 real unmatched names, not an imagined list. |
| `f_strain_name_class(text)` | Names what is not a strain and **why** (A3). Brands and suppliers read from `apex_raw` and `suppliers` — never hardcoded (G1). |
| `v_strain_register_reconciliation` | One row per `strain_library` entry: rung, verdict, evidence, `publishable_identity`. **Derives only** — deletes nothing, mutates nothing (K5). |
| `v_strain_name_proposal` | Spelling/spacing variants offered for human confirmation. **Proposals, never resolutions.** |
| `tg_selftest_strain_stripper()` | The fixture. **27 cases, 0 failures.** |

**Result — 272 rows, reconciling exactly:**

| Rung | Verdict | Rows |
|---:|---|---:|
| 1 | REGISTERED STRAIN | 22 |
| 2 | STRAIN + PRODUCT FORM | 33 |
| 2 | STRAIN + PRODUCT FORM (TG prefix applied) | 48 |
| 3 | NOT A STRAIN — work-in-progress item name | 12 |
| 3 | NOT A STRAIN — process or grade label | 11 |
| 3 | NOT A STRAIN — product SKU code | 6 |
| 3 | NOT A STRAIN — our own brand name | 4 |
| 3 | NOT A STRAIN — third-party batch code | 4 |
| 3 | NOT A STRAIN — process step | 2 |
| 4 | CANDIDATE — Apex sells it, Metrc has not registered it | 42 |
| 5 | UNRESOLVED — needs a person | 88 |

**Names with a proven registered identity went from 22 to 103.** 39 rows are
provably not strains and must never reach a customer card.

### 5.2 ⛔ A SIMILARITY THRESHOLD WAS TESTED AND REJECTED — do not reintroduce it

Trigram similarity looked like the obvious way to clear the 88. **Measured on the
live data, it does not work, and the failure is instructive.** Of its **six
highest-scoring** matches, **two were wrong**:

| Proposed | Score | Truth |
|---|---:|---|
| `Sour Diesel OG` → `TG Sour Diesel x Sour OG` | **0.900** | a different cross; `TG Sour Diesel` also exists |
| `Orange Cream Soda` → `TG Orange Cream` | **0.762** | a different strain |

Below 0.65 it was noise: `Bubble Gum` → `TG Gush Mintz` (0.217), `Espresso` →
`TG Fatso` (0.235), `Holyoke Wilds` → `TG Wedding Cake` (0.179).

**A high score is not evidence.** Ranking by confidence when the score does not
carry confidence is the precise shape that manufactured 805 false strain findings.

**What shipped instead is structural** — identical token count, character gap ≤ 2,
similarity used only as a tie-break *after* both hold. That rejects all four cases
above **by construction rather than by luck**, and yields **4 proposals**:
`Strawberry Jamz`→`TG Strawberry Jam` · `Cranberry Zkittles`→`TG Cranberry Zkittlez` ·
`Grape and Cream`→`TG Grapes and Cream` · `TG Super Boom`→`TG Super Boof`.

It **misses** `Marshmallow OG`→`TG Marshmellow OG` and `LMNT115 #5`→`TG LMNT 115 #5`.
That trade is deliberate: **a missed match costs one click; a wrong match publishes
the wrong strain to a customer.**

---

## 6 · Filling `strain_type` — how ruling H3 and standing rule 5 both survive

The owner has ruled that `strain_type` **must end up filled**, and may be sourced
from Metrc or from public reference material. Standing rule 5 says never invent a
customer-facing fact. Both hold, because **a sourced value is not an invented
one — provided the source travels with it.**

| Tier | Source | Coverage measured 10 Aug | How it appears |
|---|---|---:|---|
| **1** | **Apex `products.cultivar_type`** — the owner's own commercial classification | **257 of 483 products** | "Indica-dominant Hybrid — Apex product record" |
| **2** | `metrc_strains.raw` — `IndicaPercentage` / `SativaPercentage`, populated on **all 209** rows across 17 distinct values; `Genetics` on all 209 | **22 of 272 today**, rising with every strain reconciled in §5 | "Indica-dominant (70/30) — Metrc strain register" |
| **3** | Public reference material, retrieved and cited | The remainder | "Hybrid — *source*, retrieved 10 Aug 2026" |
| **4** | A person types it | Whatever tiers 1–3 cannot answer | "Hybrid — set by *name*, 10 Aug 2026" |

**Apex uses six values; Jane accepts four.** The mapping is an owner decision, not a
derivation: `Indica` → Indica · `Sativa` → Sativa · `Hybrid` → Hybrid ·
`Indica Dom. Hybrid` → Hybrid · `Sativa Dom. Hybrid` → Hybrid ·
**`Non-Cultivar Specific` → no Jane equivalent — open (§12).** Collapsing the two
"Dom. Hybrid" values loses real information, so the Apex value is retained
alongside the Jane value and shown on our own card.

**Three guards, all required:**

1. **Provenance is a column, not a comment.** `strain_type_source` and
   `strain_type_set_on` are `not null` whenever `strain_type` is set. A value
   with no source cannot be written.
2. **The tier shows on the customer card.** A Metrc-register value and a
   web-sourced value do not read the same, and rule 8 forbids stating anything
   without a real source. This is the line that keeps H3 from becoming rule 5's
   exception.
3. **Tier 2 is proposed, never published on its own.** It fills the field — which
   is what the owner asked for — but a card carrying a tier-2 value is flagged in
   the publishing queue until someone confirms it. Filled ≠ confirmed.

> ⚠ **One thing the owner should know before tier 2 runs.** Looking a strain up
> on a public site sends that strain's name out of the building. Individually
> harmless; **in bulk, the sequence of lookups discloses our entire genetics
> portfolio to whoever runs that site.** Two mitigations: use a static reference
> dataset downloaded once, or accept it deliberately and record the decision.
> Not something to do quietly either way (rule A5).

---

## 7 · PCT export — exact mapping

Nine product sheets, plus Instructions and Product Card which are reproduced
unchanged. Every sheet ends with **Product Description · Image Link · Jane
status ("Incomplete")**. `Lineage` is a controlled four-value list —
**Indica / Sativa / Hybrid / CBD** (Topical adds N/A) — and maps from
`strain_library.strain_type`, **never** from `strain_library.lineage`, which is
free-text genetics and has no column in the PCT at all.

`Product Name (Internal Use)` is a `JOIN(" | ", …)` and **the argument list
differs per sheet**. It is computed, never typed.

| Sheet | Columns (in order) | Name formula |
|---|---|---|
| **Flower** | Brand · Strain · Brand Category · Lineage · Std pack? · Next steps · Non-std [g] · **Name** · Description · Image · Status | Brand ǀ Strain ǀ Category ǀ Lineage ǀ *pack size only if non-standard* |
| **Pre-Roll** | Brand · Strain · Brand Category · Amount [g] · Pack Size · Total Weight · Lineage · **Name** · … | Brand ǀ Strain ǀ Category ǀ Amount ǀ Pack ǀ Total ǀ Lineage |
| **Edible** | Brand · Ratio & Product Name · Brand Category · Pack Size · Dosage (mg) · Lineage · **Name** · … | Brand ǀ Ratio&Name ǀ Category ǀ Pack ǀ Dosage ǀ Lineage |
| **Extract** | Brand · Strain · Brand Category · Std pack? · Next steps · Non-std [g] · Lineage · **Name** · … | Brand ǀ Strain ǀ Category ǀ *pack if non-std* ǀ Lineage |
| **Vape** | Brand · Ratio & Product Name · **Product Type** · Brand Category · Std pack? · Next steps · Non-std · Lineage · **Name** · … | Brand ǀ Ratio&Name ǀ Type ǀ Category ǀ *pack if non-std* ǀ Lineage |
| **Tincture** | Brand · **Category (Tincture/Pet Tincture/Sublingual/Spray)** · Brand Category · Ratio & Product Name · Container [ml/oz] · Dosage (mg) · Lineage · **Name** · … | Brand ǀ Category ǀ Ratio&Name ǀ Container ǀ Dosage ǀ Lineage |
| **Topical** | Brand · Ratio & Product Name · Brand Category · Container · Dosage [mg] · Lineage · **Name** · … | Brand ǀ Ratio&Name ǀ Category ǀ Container ǀ Dosage ǀ Lineage |
| **Gear** | Brand · Product Name · Brand Category · Description · Image · Status | *(no name formula, no strain, no lineage)* |
| **Merch.** | as Gear | — |

Standard pack sizes: **Flower** 1 · 2 · 3.5 · 7 · 14 · 28 · 56 g. **Extract and
Vape** 0.5 g (500 mg) · 1 g (1000 mg); **disposables always carry a weight**.
Anything else goes in the non-standard column and only then appears in the name.

**Two things the export must do that the template cannot:**

- **Refuse to emit a duplicate.** One product, one row per pack size — enforced,
  not hoped for. The §3.4 fan-out is exactly what Jane warns about.
- **Header fidelity.** Tincture and Topical say `Product Name`, the rest say
  `Product Name (Internal Use)`. The export matches the sheet it is writing.

**Round-trip.** A returned PCT imports back through the standard intake guard —
nothing lands unbalanced (rule J1), and a changed name or description is a
proposed change requiring a person, not a silent overwrite.

---

## 8 · Shopify export

A separate mapping, not a renamed PCT.

| Shopify column | Source |
|---|---|
| Handle | `strain_library.shopify_handle` (exists, unpopulated) |
| Title | `product_catalog` display name |
| Body (HTML) | `short_description` + `long_description` + terpene profile |
| Vendor | Brand |
| Type / Tags | `f_product_line()` · strain type · dominant terpenes |
| Variant Grams | pack size |
| Image Src | served path, permanent |
| **Metafields** | THC · TAC · total terpenes · top 3 terpenes · certificate link · batch · tested date · consistency |

The metafields are the part that matters — they are what makes the store
searchable by terpene and verifiable by certificate, which is where this beats a
standard cannabis storefront.

---

## 9 · Enhancements beyond the template

The owner's four, plus four the measured data already supports.

| # | Enhancement | Why it is possible now |
|---|---|---|
| 1 | **Potency block on the customer sheet** | The PCT has no potency fields at all. We hold THC, TAC and terpenes per strain. These are the first two questions a buyer asks. |
| 2 | **Terpene profile as a selling point** | Currently 46 profiles of 983. The single highest-value fix in this module — see `coa_analyte`. |
| 3 | **Certificate link per SKU** | The buyer verifies instead of trusting. 983 PDFs already on disk. |
| 4 | **Batch-level listings** | Potency varies by batch; one number per strain is an average nobody actually receives. |
| 5 | **Effects and flavour derived from the terpene profile** | Once `coa_analyte` exists this is a query, not copywriting — and the derivation is shown, so it is not an invented claim. |
| 6 | **"Back in stock ≈ date"** | The card knows pounds on hand; the platform knows the 56-day cycle and the 26 pulls. Derivable, and no competitor's catalogue does it. |
| 7 | **Consistency score** | `v_potency_by_strain.consistency_sd` is already computed. *"Tests within ±1.2% across 14 batches"* is a stronger claim than any single number, and it is true. |
| 8 | **Duplicate guard on export** | §3.4 and Jane's own warning. Make it impossible rather than checked. |

---

## 10 · Phases, each with an exit test

A phase is not finished because it was built. It is finished when its test passes.

| Phase | Work | Exit test |
|---|---|---|
| **0 · Reconcile the register** ✅ **10 Aug 2026** | §5 ladder over 272 rows | ✅ All 272 carry a rung verdict and evidence · ✅ fixtures 27/27, both halves · ✅ 39 non-strains identified and excluded from `publishable_identity` · **carried into phase 3:** wiring the verdict into the publish gate, which needs `product_catalog` to exist. |
| **1 · Close the join** ✅ **10 Aug 2026** | `v_lab_sample_link` · `v_lab_report_only_packages` · `f_yesno()` + fixture | ✅ all four figures re-derived a second way and agree exactly (39,531 rows · 1,008 source tags · 963 in the package book · 224 report-only) · ✅ fixtures 20/20 · ✅ **the predicted benefit was refuted and restated** (§3.1a) · ✅ the two-encoding trap found and guarded (§3.1b). |
| **2 · Rebuild the parser** | `pdfplumber` layouts · `coa_analyte` · fix `v_coa_unparsed` so a re-read is possible · write the fields that are currently discarded | `metrc_batch_id` non-null on a measured majority; terpene profiles rise from 46; the queue is demonstrably non-empty; rung 2 of the D4 ladder fires on a real package. |
| **3 · Split strain and product** | `product_catalog` · `product_strain` · retire the fan-out | One row per SKU. 28 duplicates gone. A blend lists with its contributing strains. |
| **4 · Fill and publish** | §6 tier ladder · images · `listing_version` | Every published card carries type, description, image, potency range, batch, certificate — and the provenance of each. |
| **5 · Distribute** | PCT · Shopify · card link · verify page · sell sheet · round-trip import | A PCT export opens in Excel with correct headers and computed names, and re-imports without a single unbalanced row. |

Phase 0 blocks the rest. This is the same discipline as `PROJECT_PLAN.md`.

---

## 11 · What must not ship without it

- **Every blocking check carries both halves of its fixture** (rule K2, and the
  top-tier bar's gate 2). It fires on a real violation; it stays quiet on a
  legitimate case.
- **Every tile drills to the individual items behind it** (C1), and totals
  reconcile to those items (C2).
- **Every item row carries its certificate and its manifest** (C3a), or states
  which reason it has neither.
- **No expiring URL anywhere** (standing rule 6).
- **Every customer-facing fact carries its source** (A2, rule 8, and §6 guard 2).
- **Nothing enters unbalanced** (J1) — including a returned PCT.
- **A room is never shown without its department** (J7) wherever stock appears.

---

## 12 · Open for the owner

1. **CLAUDE.md data trap #12** now describes `f_is_ours` incorrectly — it is
   list-aware, measured. Needs an amendment, or someone will re-break it.
2. **Rule D4 rung 2** describes a certificate rung that cannot fire until phase 2
   lands. Amend, or note it as known-broken.
3. **Third-party material on the public verify page** — excluded by default in
   this spec. Confirm.
4. **Tier-2 web lookup and portfolio disclosure** (§6). Static dataset, or accept
   deliberately?
5. ~~**Brand name and brand categories** exist nowhere in the database.~~
   **CLOSED 10 Aug 2026 — the owner pointed at Apex and he was right (§13).**
6. **`Non-Cultivar Specific`** is an Apex `cultivar_type` with no Jane
   equivalent. What should it export as — omit the product, or `N/A`?
7. **Four of five brands carry no licence** in Apex; only *Twisted* has
   `MP281909`. Intended, or an Apex data gap?
8. **Apex batch → Metrc harvest does not join** (§13.3). Needed for batch-level
   potency (ruling H2). Investigation, not a fix.

---

## 13 · Apex is the brand and product source — added 10 August 2026

*Owner, 10 Aug 2026: "YOU CAN DO BRAND IF YOU READ APEX REPORTS." He was right,
and it reaches much further than brand.* `apex_raw` holds **3,850 rows across 13
entities**, last pulled 00:03 on 10 Aug. Scope `view:brands` is live.

### 13.1 Brands — five, all with logos

| Brand | Licence | Logo |
|---|---|---|
| **Twisted** | MP281909 | yes |
| **Twisted Buds** | *null* | yes |
| **Dope Chemist** | *null* | yes |
| **No Bull** | *null* | yes |
| **North End Blunts** | *null* | yes |

Brand Category is a controlled vocabulary too: **11 Apex categories** (Flower ·
Prepack · Preroll · Bulk Extract · Extract · Cartridge · Plant Material · Seed ·
Live Plant · Pack to Order · Merchandise), each with long and short display
names, and **26 product types** beneath them. This maps onto the PCT's per-sheet
Brand Category directly. **No new vocabulary needs inventing.**

### 13.2 `apex products` (483 rows) already carries most of the PCT

| PCT field | Apex source | Populated |
|---|---|---:|
| Brand | `brand` | 460 |
| Brand Category | `category` + `product_type` | 483 |
| Strain | `cultivar` (object, `.name`) | 306 |
| **Lineage** | **`cultivar_type`** | **257** |
| Product Description | `description` (HTML) | **97** — not 105; 8 are `<p></p>`, empty once tags strip |
| Image Link | `images[].link` (S3) | **327 products, 327 images — exactly one each; none has the 5 Jane allows** |
| Pack size | `unit_size` · `packaged_unit_size` · `units_per_package` · `units_per_case` | 190 / 77 |
| Flavour | `flavor` (object) | 60 |

**Absent from Apex:** `product_sku` — **0 of 483**. `lineage` (genetics string) —
**null on all 483**, confirming the PCT Lineage column must come from
`cultivar_type` and never from a field of that name.

Only **142 of 483** products are unarchived. The catalogue publishes from those.

### 13.3 Three joins, measured

| Join | Result | Verdict |
|---|---|---|
| Apex `cultivar` → `metrc_strains` | 131 distinct cultivars · **0 exact** · **53 match once `TG ` is prepended** · 29 in `strain_library` · 58 Apex-only | **Works on a deterministic prefix rule.** Ships with fixtures: must match `Cap Junky`→`TG Cap Junky`; must **not** match a debug row. |
| Apex `batches.name` → `metrc_harvests.name` | 396 batches in `TG <strain> - <YYYYMMDD> <room>` form · **65 match** (61 before prefix normalisation) | **Broken. Do not build on it.** See below. |
| Apex `batches.lot_number` → Metrc tag | **0 populated** | No tag-level link exists. |

**On the batch join, a correction on the record (rule K5).** Mid-investigation I
asserted the `TG ` prefix would fix it, because `Apple Fritter - 20241230 F3`
failed while `TG Apple Fritter - 20241230 F3` matched. **That was wrong** —
normalising the prefix moved matches from 61 to 65 of 396, four rows. The actual
pattern is a **date cutoff**: every matched batch is dated **2024-05-16 to
2025-06-30**, while `metrc_harvests` runs to 2026-07-27. After mid-2025 the
strain names still line up and the dates do not. The join therefore needs
*(strain, approximate date)*, not a name string — and that is an investigation to
be run, not a rule to be written. **Ruling H2 (batch-level potency) depends on
it.**

Also found: one Apex batch dated **`1024-10-22`** — year 1024.

### 13.4 Test data is live in the sales system

Three of the 58 Apex-only cultivars are **`DEBUG CULTIVAR TEST`,
`DEBUG CULTIVAR 211501`, `END TO END TEST CULTIVAR`.** They must be excluded by
name pattern at the gate, not filtered in a view — a view can be bypassed and a
debug row on a customer card is unrecoverable.

### 13.5 ⚠ Out of this lane — hand to TG-06 Finance

`apex batches` carries **`true_cost` and `cost_of_goods` populated on all 1,004
rows**, plus `listing_price` and eight pack-tier prices. CLAUDE.md §C6c states
that margin on remediation and distribution is **uncomputable** because
`material_purchases` and `third_party_purchases` are empty. **That may no longer
be true.** Not touched, not acted on, raised here so it is not lost. A work order
belongs with TG-06.

---

*Provenance: written 10 Aug 2026 by Agent H_COA · Strain & Product Library, from
a full read of the live schema (345 tables · 327 views · 11 matviews · 53 cron
jobs), the repository, and the owner's Jane Product Configuration Template. Every
figure re-measured the same day. **Nothing in this specification has been built.***
