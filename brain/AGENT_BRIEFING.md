# Agent briefing — Twisted Growers Enterprise OS
### Paste this to any agent. Self-contained. Read it before touching anything.

You are working on a system that runs a **licensed Massachusetts cannabis
company**. Metrc is the legal record. This platform is a **read-only mirror**
of it. A wrong number here can reach a state filing.

---

## ⛔ BEFORE ANYTHING ELSE — RUN THIS QUERY. ALL RULES SINCE DAY 1 APPLY TO YOU

**Owner, 12 Aug 2026: "ALL RULES APPLY; TO ALL FUTURE NEW AGENTS MUST READ AND
FOLLOW ALL RULES WE HAVE CREATED SINCE DAY 1."**

```sql
select source, rule_key, rule, what_it_means, never_do_this, authority, standing
from v_house_rules order by source, rule_key;
```

**35 standing rules, five kinds, one window** — owner rulings, IRC 280E doctrine,
audit assertions, disagreement classes, and logged root causes you must never
repeat. This briefing does **not** restate them, deliberately: a copy goes stale
the day a rule is added and then *lies* to the agent reading it, which is the
drift the owner has banned. `v_house_rules` is generated from the rule tables, so
a rule added after this file was written still reaches you.

**Two you will need within your first hour, both owner rulings from 12 Aug 2026:**

- **`tag_missing_means_go_find_the_manifest`** — a tag absent from `metrc_packages`
  is **never** "unknown". Every physical item carries a tag and every tag moved on
  a manifest. Check third-party status, then look the tag up in
  `metrc_rpt_package_transfers`, and report **what the manifest says**. *Proven the
  hour it was given: 484 "missing" adjustment tags, **all 484** had a manifest.*
- **`tested_means_a_coa_exists_go_find_it`** — if Metrc says `TestPassed`, a
  certificate **exists**. Search order is fixed: Metrc's lab result and attached
  document → the parent or sibling tag's certificate → **Apex last resort only**.
  You may write "certificate not yet retrieved" and must name where you looked.
  You may **never** imply material is untested when Metrc says it passed.

**The shape both share, and the habit to build:** an absence in our mirror is a
statement about *our retrieval*, never about the material. Hunt before you file.

---

## 🔒 HARD RULE — PROOF REQUIRED. "NEVER TESTED" IS A CLAIM, NOT AN EXCUSE
**Owner, 8 Aug 2026: "All items you show as untested, no COA or manifest — I need
to see what Metrc inventory and seed-to-sale shows for each tag. That means it's
in the facility, and Metrc tracks exactly what room it is in, per law."**

**Massachusetts law requires Metrc to hold the CURRENT ROOM for every tagged
package.** So a package you claim never left must be visible in Metrc inventory,
in a NAMED ROOM, with its seed-to-sale chain. If you cannot show that, the claim
fails and you may not report it.

**ALL FOUR SOURCES MUST AGREE — and three are outside this platform:**
| source | what it must say |
|---|---|
| Metrc `lab_testing_state` | `NotSubmitted` or `NotRequired` |
| `metrc_lab_results` (the laboratories) | **zero** results |
| `metrc_rpt_package_transfers` (the state custody export) | **zero** manifest lines |
| document store | **zero** certificates filed DIRECTLY against it |

**An INHERITED certificate is not a contradiction** — crude and badder made from
tested flower carry the parent's certificate while never having been submitted
themselves. **A certificate at depth 0 IS a contradiction.**

**Use `v_never_tested_proof`.** It shows Metrc's room, room type, state, quantity
and the full seed-to-sale chain in and out, per tag. Nothing in it is inferred.
`select * from v_never_tested_proof where proof like 'FAILS%'` **must return zero
rows.** Registered as `nevertested.contradictions` and re-derived nightly.

**Measured 8 Aug 2026: 111 packages PROVEN, 0 failures, 0 missing a room.** They
sit in five rooms — Hydrocarbon (~60 crude/badder/distillate), Solventless (~16
bubble hash and rosin), Production Room (9 gummies), Fulfillment Vault (24 of the
27 are **SEEDS**, which are `NotRequired` because seeds are not lab tested — that
is the entire 2,400-unit NotRequired figure), Biomass Prep (2). **None is in a
finished-goods sales location.**

**The general form: a benign explanation is the one you must evidence hardest,
because nobody challenges it.**

## RULE ZERO — outranks everything, including "move fast"
**Never do anything that can break system.** Measure before you change. Verify
after. If a change cannot be undone, it needs the owner. **Slow is fine.
Broken is not.**

## ⚠ THE BRAIN CAN BE WRONG — INCLUDING THIS FILE
**This document is printed to you verbatim at session start. That makes it
trusted, which makes a stale number in it worse than no number at all.**

On 7 Aug 2026 two statements written into this file were **false within two
hours** — it claimed `coa_extract` held no cultivator (980 of 983 did) and that
1,919 packages had no certificate (coverage was 2,088). An agent obeying it
would have hand-opened PDFs for an answer already in the database.

> **Every number here is a CLAIM, and every claim carries the query that proves
> it — `brain_claims`, re-derived nightly by `tg_check_brain_claims()`. Drift
> raises a finding. On its first run it caught one: this file said 2,642 manifest
> documents when the live figure was 2,663.**

**So: if a figure here matters to what you are about to do, RE-MEASURE IT.**
Quote the live number, not the written one, and if they differ **the difference
is the finding** — correct the file, never silence the claim. Prose and rules in
this document are durable; **numbers are perishable.**

## THE META-TRAP — the one that has cost most
**A decision recorded is not a decision implemented.**
Sales endpoints were "permanently disabled" on 6 Aug and were still firing 401s
a day later. Nine sync rules were drafted and never merged. An agent row read
"disabled" in its own description while `enabled` stayed true.

> **A finding is NOT CLOSED until something in code, config or a check enforces
> it. When you close one, NAME THE GUARD. If there is no guard, say so plainly
> in the finding — an unguarded fix expires.**

---

## THE TEN TRAPS — every one has already cost real money
Full register: `brain/DATA_TRAPS_REGISTER.md`. These are the ones that bite.

1. **A summary/footer row is not a transaction.** One became a sale and added
   **$1,692,460 of fabricated revenue**, quoted to the owner before anyone
   checked.
2. **$0.01 placeholder prices.** ~319 lines. In `metrc_rpt_wholesale` they
   aggregate to $0.02/$0.03 — **filter `>= 1.00`, never `> 0.01`.** They
   dragged a realised price from $807 to $363.
3. **A manifest-level weight repeated onto every package line.** Per-pound
   figures off those rows are meaningless.
4. **Repackaged material keeps the original harvest name.** Counting it
   inflates production **up to 142%**. Primary production =
   `SourcePackageCount = 0`.
5. **Wet and dry never mix.** Fresh frozen is ~79.3% of wet weight; **dried
   flower packages out at 19.02% — measured live across 380 harvests, NOT the
   15.5% previously written here.** Configured ratio `fresh_frozen_wet_to_dry`
   = **4.50**; measured 4.17. Summing wet and dry once overstated harvests by
   3,800 lb, **and it is live on the dashboard right now**: Command and
   Inventory publish *"Total on hand, dry-equivalent"* = **2,519.2 lb**, which
   contains **603.9 lb of fresh frozen unconverted**. True figure **2,049.5 lb**
   — overstated **469.7 lb / 22.9%**. Manufacturing tile 3 states that same
   material is 134.2 lb dry-equivalent **on the same refresh**. Proof: 10 of 10
   source harvests balance to the gram with **zero moisture removed**.
   *(The old line here also claimed "71 packages exceed the 15 lb cap, all
   Fresh Frozen, 100.4 lb wet ≈ 22 lb dry". **All of that was wrong.** 68 exceed
   it at 453.59237, 33 at the workbook's 454 — the 35-package gap is a cluster
   sitting at EXACTLY 15.0000 lb at 454 g/lb, a phantom violation manufactured
   by the 454-vs-453.59237 trap. And they are not all fresh frozen: of the 33,
   eleven are.)*
6. **Countable items have no weight** (`f_is_weight`). **Never assume grams**
   (`f_to_pounds`) — 18.2 lb once vanished to a bad divide. **AND THE MIRROR OF
   IT, which cost more:** refusing to invent a weight is **NOT** a licence to
   report **no number**. `case when f_is_weight(uom) then f_to_pounds(...) end`
   nulls the row, so a counted item publishes as nothing — that hid **18,822
   units across 143 active packages**, including 5,163 gummies sitting inside an
   ownership report as the word "countable". **Use `f_quantity_text(qty, uom)`**
   — "12.5 lb" or "1,933 ea". Cross-check any pounds total against
   **`v_countable_inventory`**. Never add units to pounds; never publish a row
   with no quantity on it.
7. **Catalogue row counts are ESTIMATES.** `reltuples` reads 0 on small tables.
   **Always `select count(*)`.** Five populated tables were called empty this
   way on 7 Aug.
8. **A custody movement is not a sale — BUT A TRANSPORTER LICENCE ALONE DOES NOT
   TELL YOU WHICH.** *(Corrected by owner ruling, 8 Aug 2026. The old rule read
   "a transporter (MT) destination is never a sale" and that is WRONG — applying
   it would have stripped $86,468 of REAL revenue.)*

   **Two firms, both MT licences, opposite answers:**

   | | Eagle Eyes (MT281320) | MMM Transport (MT281556) |
   |---|---|---|
   | ruling | **STORAGE — not a sale** | **DELIVERS — a real sale** |
   | what moved | bulk material | **branded finished goods** |
   | came back | **119 tags, $378,741 declared** | 7 of 50, all within 3 days |
   | value | **$1,113,053 — REMOVE** | **$86,468 — KEEP** |

   **THE TEST IS THE RETURN LEG, NOT THE LICENCE PREFIX.** Storage sends material
   back; delivery does not, because a buyer received it. 42 of the 43 MMM
   packages with no return are **`Twisted |` branded consumer product** — bulk
   biomass comes home, finished goods do not. Also note prices going out to
   Eagle Eyes were impossible on their face: 2.1 lb at $142,736, and the same
   product at $2,593/lb and $668/lb eleven weeks apart.

   **Correction to remove is $1,113,053, NOT the $1,199,521 full MT total, and
   NOT the $901,430 in older notes** — that figure was Eagle Eyes only, Buds
   only, priced ≥ $1. **Never apply a licence-prefix rule to money without
   checking whether the material returned.**
9. **Truncated Metrc tags** (`1479`, not the 24-character tag). Two collisions
   already observed. Resolve full tags before any join.
10. **Maturity censoring.** A pull takes ~8 months to package out; ~46% lands
    in 30 days. Comparing a young period to a mature one manufactured a fake
    decline — the truth was **40% the other way**.

11. **"Ours" on a package is an ITEM fact, not an OWNERSHIP fact.**
    `ItemFromFacilityLicenseNumber` names whoever defined the *item*. Repack
    received material under a new item name and **the field flips to us**.
    **191 active packages / 420.6 lb** read as ours today and trace to outside
    licences. Use **`f_material_origin(tag)`**, never the raw field. Same root
    cause as the C6d breach (consigned material counted as on-hand stock).
12. **A LICENCE FIELD CAN HOLD A LIST, AND `f_is_ours()` TAKES ONE.**
    A laboratory prints the client's licences as they appear on the licence
    itself — **`License #: MC281714, MP281909`** — so `coa_extract.client_license`
    holds that whole **string**. `f_is_ours('MC281714, MP281909')` returns
    **false**: it matches neither member. **621 of our own 983 certificates are
    stored that way** (666 in total carry more than one licence), and a check
    written for the single case classified every one of them as an outside
    company — reporting *our own product* as somebody else's, and turning a
    3-package question into a claimed 164. **It never errored. It answered the
    wrong question.** Use **`f_any_ours(text)`** (any member is ours) or
    **`f_all_ours(text)`**. `f_is_ours()` stays correct for a SINGLE licence.
    *The general form: a field that usually holds one value sometimes holds a
    list. Check before you compare.*
13. **`metrc_packages` is NOT unique on `tag`.** 7 of 3,574 tags appear twice,
    always MC281714 + MP281909 — the same package visible in both of our own
    facilities. Legitimate Metrc behaviour, but it **silently doubles any join
    on tag**, and it raised a 21000 on the first version of `f_material_origin`.

---

## 🛑 OWNERSHIP FIGURES ARE SUSPENDED — DO NOT QUOTE ONE (Inspector, 8 Aug 2026)
**`v_ownership_verdict` says 19 packages are CONFIRMED NOT OURS. Reverse one word
in one line of SQL and the same data says 156.**

`v_certificate_resolved` chooses a certificate with
`row_number() over (partition by package_tag order by depth)` — the SHALLOWEST.
Agent D wrote that this was "a tie-break, not a reasoning". The Inspector re-ran
it with the ordering reversed and changed nothing else:

| tie-break | CONFIRMED NOT OURS | weight | units |
|---|---|---|---|
| shallowest wins (live) | **19 packages** | 128.5 lb | 1,494 |
| deepest wins | **156 packages** | 328.4 lb | 15,836 |

**142 of the 191 verdicts are produced by the ordering, not by evidence** — in
those, the nearest certificate names Twisted Growers and a deeper one names an
outside licensee. And depth is BIASED: ours is nearer in 506 cases, outside in 3.
Two packages of identical weight and identical lineage get opposite verdicts
purely by which certificate the ordering happened to reach.

> **Until the owner rules which certificate is authoritative — the sample nearest
> the PACKAGE or the one nearest the CULTIVATOR — quote NO ownership figure from
> this view, in either direction.** The conflict itself is real and independently
> confirmed; only the verdict placed on it is not.

**AND THE QUESTION IS WRONG FOR 114 OF THEM.** Those are countable manufactured
goods — ZEN gummies, Dope Chemist and NoBull vapes — made from bought-in
distillate. The view asks *"was anything in this package's history grown by
someone else?"* and prints the answer under the heading *ownership*. For flower
those are the same question. **For a gummy we made from distillate we bought,
they are not** — that is business line 5, normal trade. The distinction that
matters is **bought (ours) versus tolled (not ours)**, and nothing in the chain
can tell them apart while `material_purchases` is empty.

## ⚖ OWNERSHIP METHODOLOGY — owner ruling, 7 Aug 2026. Use it on ANY doubt.
**"You check ours first. You caught a match — but then you confirm with the COA,
since there is doubt."** The certificate from the **testing laboratory** is the
independent source for who cultivated the material. Our own fields are not.

**The order is fixed:**
1. **Check ours.** `ItemFromFacilityLicenseNumber`, and whether it is one of
   MC281714 / MP281909.
2. **If it says ours, look for doubt.** Any of these is doubt:
   `SourcePackageCount > 0` (a repack) · an inbound manifest anywhere in the
   lineage · source harvests **not** in `metrc_harvests` · harvest names that
   break our convention **`TG <strain> - <YYYYMMDD> <room>`** · a tag series that
   is not `1A40A030000E5B1` (MC281714) or `1A40A030000E5B2` (MP281909).
3. **On doubt, go to the COA. DO NOT PROCEED WITHOUT IT.** Not to another
   internal field — internal fields share the same origin and cannot disconfirm
   each other. **A check that cannot fail proves nothing.**
4. **Disagreement is the finding.** Report both, never average, never pick
   silently.

### HOW TO READ A COA FOR THE CULTIVATOR — it is always on there
**The COA calls it `Client Info`.** On a Green Analytics Massachusetts report
the header block carries, verbatim:

```
Client Info                              Sample Identification
Greater Goods, LLC          METRC Batch ID:  Bruce Banner F1 Harvest
445 Myles Standish Blvd.    METRC Sample ID: 1A40A0300011815000000016
Taunton, MA 02780           METRC Source ID: 1A40A0300011815000000021
License: MB282344
Metrc Manifest: 3086180
```

**`Client Info` + `License:` is the cultivator, manufacturer or processor.**
`METRC Batch ID` is the harvest. `METRC Source ID` is the package the sample
was cut from. Cross-check all three against the package before you conclude.

**`coa_extract` NOW HOLDS THE ANSWER — query it first.** `client_license` and
`client_name` are populated on **980 of 983** certificates, read from six lab
layouts. Use **`v_ownership_verdict`** (every conflict already judged) or
**`f_item_documents(tag)`** (per line item). Only open a PDF when those come back
empty. The files are at `metrc_documents.storage_path`; the URL is permanent and
tokenless — **never call `createSignedUrl` for a platform page**, it REQUIRES an
expiry and that is how 3,666 links came to die on one day.

**Worked, 7 Aug 2026 — `coa/2267739.pdf`, GAMA report `GGDB-00016`:**
platform said `MP281909` Twisted Growers · **certificate said `MB282344`
Greater Goods, LLC.** Batch, source package and the Yeast-and-Mold fail all
matched the certificate exactly — **the only discrepancy was ownership, and it
was ours.**

**Bringing material in and processing it is NORMAL BUSINESS** — remediation and
manufacturing inputs are two of the five lines. Material moving into extraction
is not a problem. **Mislabelling whose it is, is.** It corrupts yield, cost,
loss and on-hand in one move.

**Certificate coverage, measured 7 Aug 2026 after the backfill:** **2,287 packages** have one — 969 direct, **1,318 inherited through lineage** (a
certificate belongs to the package the lab SAMPLED; everything made from it
carries the same certified facts). 439 need none, 70 are mid-flight, and
**779 are a genuine gap of which only 7 are still active** — 182 of those are a
pure download, the document id is already held.

**All 191 ownership conflicts are judged in `v_ownership_verdict`:**
**CONFIRMED NOT OURS — figure SUSPENDED, see below** by the laboratory · 115 pkgs /
252.1 lb INCONCLUSIVE · 22 UNPROVEN.
> **INCONCLUSIVE IS NOT AGREEMENT.** The certificate client is whoever
> **submitted the sample**. That is the cultivator only when the cultivator
> submitted it. A certificate naming **us** on material the lineage says came
> from outside is what **paying for a retest** looks like — **not proof we grew
> it.** Never report it as ownership.

## 📄 DOCUMENTS: EVERY ITEM TESTED OR SOLD CARRIES ITS COA **AND** ITS MANIFEST
**Owner, 7 Aug 2026: both are sent to the customer BEFORE the order ships.** They
are also the defence if a vendor disputes a bill. So both must be attached to the
item and searchable — not filed in a folder somewhere.

**Chain of custody is seed to sale. The manifest is the custody record OUTSIDE
the facility. Ours is only half built:**

**USE `v_item_documents` (per item) and `v_document_package_link` (the link).**
`f_package_documents(tag)` still works for a single package but only sees the
inbound side. **Never read `metrc_documents.package_tag` to answer "does this
item have its manifest" — it is null on all 2,690 manifests and always will be.**

**A manifest covers MANY packages.** One column cannot hold that. It is a LINK.
Writing a single tag onto the document row is the same one-to-one-on-many-to-many
error that capped COA coverage at 34%. Fixed 7 Aug 2026 by deriving the link from
`metrc_rpt_package_transfers` — **19,256 rows, 2,643 manifests, full 24-character
tags — which existed all along and nothing had ever joined.**

| | links | packages | documents |
|---|---|---|---|
| COA direct | 983 | 969 | 983 |
| COA inherited via lineage | 1,123 | 1,119 | 416 |
| **Manifest → packages on it** | **19,248** | **15,488** | **2,663** *(grows as manifests arrive — verified by `brain_claims`)* |
| Manifest inbound | 1,027 | 1,027 | 211 |

**Our packages:** COMPLETE 869 · COA only 1,219 · MANIFEST only 419 · NEITHER
1,067. **Tested or sold and not COMPLETE = must not go to a customer.**
`document_sends` has **0 rows** — nothing has ever been recorded as sent.

### ⚠ THE "OUTBOUND BLIND SPOT" WAS AGENT D'S OWN READING ERROR — CORRECTED 8 Aug
**The recipient IS in the database, one level down in the JSON.**

| path | populated |
|---|---|
| `raw->>'RecipientFacilityLicenseNumber'` (top level) | **0 of 2,550** |
| **`raw->'_delivery'->>'RecipientFacilityLicenseNumber'`** | **2,530 of 2,550** |

Agent D read the top level, found null on all 2,550, declared the outbound half
of chain of custody unknowable, and built a PDF-parsing pipeline, an edge
function and two cron jobs to recover data **that was already synced**. The
deliveries endpoint HAD been pulled; the `_delivery` block also carries
`RecipientFacilityName`, `InvoiceNumber`, `ShipmentTransactionType` and
`PaymentTermDays`. Only the last 20 manifests (3 days of sync lag) are genuinely
unresolved.

> **THE LESSON, WHICH IS THE POINT: a null is not an absence. Before declaring
> data missing, look INSIDE the record.** One wrong `->>` produced a confident
> platform-wide finding and a night of unnecessary construction. The PDF parse
> still earns its keep as independent corroboration — 689 comparisons, 689
> matches — but it was never the only route.

**Sales views still cannot see it.** `v_sales_history` and `v_customer_manifests`
read the TOP-LEVEL key, so `customer_license` is null on 2,550 of 2,550 and **any
rule that says "a transporter is not a customer" has nothing to test.**

> **We can see everything that came in and who sent it. We cannot see where
> anything went.** 17,191 packages shipped, destination unknown.

That blanks: who bought what, the $901,430 storage-movement question, where
failed material went, and **228 outgoing lab runs carrying 1,402 sample
packages** — against **29** sample packages visible in `metrc_packages`.

**Two fixes, both real.** (1) Durable: pull the deliveries endpoint. (2) Now:
**2,683 manifest PDFs are already on disk** and print destination, licence,
transporter and dates. Same as the COAs — the answer is in files nobody parsed.

**⚠ MANIFEST PDF LAYOUT TRAP.** Under `pdftotext -layout` labels and values are
**offset by one line**:
```
1. Destination              Jushi MA, Inc.
                            1673                  <- invoice number
Invoice Number              MR282118              <- destination LICENCE
Destination License Number  420 Middlesex Street  <- address
```
**Pairing a label with the value on its own line gives the wrong answer every
time.** Anchor on licence patterns: `MX######` = transporter, `IL######` = lab,
anything else that is not MC281714/MP281909 = the destination.

### Weight sent out for testing — nobody accounts for it
755 certificates state a sample weight: **6,804 g = 15.00 lb**, mean 9 g. Across
all 983 tests ≈ **19.5 lb** has physically left into laboratories. The platform
shows **0.57 lb**. **Seven labs: GVA (IL281359, 709 certs) · Analytics Labs
(IL281280) · Safetiva (IL281354) · Kaycha · Green Analytics (IL281277) · MCR ·
ProVerde (IL281355).**

**Testing batch cap is 15 lb DRY** — a hard cluster at exactly 15.0 in the data.
Packages above it are **Fresh Frozen, which is WET** (100.4 lb wet ≈ 22 lb dry).

## THREE DATABASE RULES — each has broken production
- **NEVER `drop view … cascade`.** Blanked every dashboard **three times**,
  silently. Use `create or replace`.
- **NEVER `grant … to anon`.** And revoking from `anon` alone is a no-op while
  PUBLIC holds the grant — revoke from `public, anon`, verify with
  `has_function_privilege`.
- **NEVER delete from the append-only forensic tables.** One migration took
  `watchdog_findings` from 100 rows to 43 **without a DELETE**. Watch the row
  count, not just the verb.

Also: **RLS on at table creation, never after.** **Anchor scripted edits on a
function signature**, never a common line — that put state in the wrong
component three times.

---

## HOW TO FIX — the protocol, every time
1. **Measure first.** Record the number you are about to change.
2. **One change.** Not three.
3. **Measure again with the same query.** Report both numbers.
4. **Know the undo before you start.** State it in your report.
5. **Verify what you did NOT touch.** **117 of the 142 supabase reads in the
   front end bind `data` and never bind `error`** — a permission denial, a
   dropped view and a statement timeout all become `[]` — and `?? []` appears
   **263** times. A blank dashboard is the classic silent failure.
   *(Measured 11 Aug 2026 and enforced by `tools/checks/silent-failures.mjs`,
   which ratchets both counts. The 129 that stood here from 8 Aug was a manual
   count nothing ever re-derived.)*
6. **Stay in your lane.** Out-of-lane findings go to `actions_register` or a
   work order — never a quiet fix in someone else's file.
7. **If you cannot verify it, do not do it.** Report instead.

## HOW TO REPORT A NUMBER
State the **basis** before the figure — wet or dry, cost or price, own
production or resale, plants started or plants harvested. **Most disputed
numbers are not wrong; they answer a different question.** Derive anything that
matters **two independent ways**. **If they disagree, the disagreement IS the
finding** — report both, never average, never pick silently. State sample
sizes. State what you could not measure and why. Mark derived figures as
derived.

**Watch for a check that cannot fail:** if source B is computed from source A,
it proves nothing.

---

## THE BUSINESS — five lines, and the platform can only see one clearly
Twisted Growers is not only a grower. **Reporting that assumes it is will be
wrong.**
1. **Own production** — grown and packaged here. Cost basis $1,100/lb (2025
   actual, accountants; 2024 was $1,250).
2. **Remediation** — failed material bought at a discount, fixed, sold.
3. **Distribution** — other licensees' product taken on to sell.
4. **Tolling / white label** — **we do not own the material.** Revenue is a
   **fee**, never a $/lb. `third_party_material` holds 65.7 lb of others' BHO
   and distillate in the Fulfillment Vault.
5. **Manufacturing inputs** — bought to cover shortfalls (distillate for
   vapes, flower for infused pre-rolls). Can also be **sold on if surplus, or
   held for later** — destination is decided AFTER arrival and can change.

**Never blend these into one price per pound. Never measure one against
another's cost basis.** Own production realises ~$950/lb declared; bought-in
~$289/lb. **`material_purchases` and `third_party_purchases` are both EMPTY**,
so what was paid for bought-in material exists nowhere — **margin on lines 2,
3 and 5 is uncomputable, and any figure claiming otherwise is invented.**

## ⚠ APEX IS THE SALES SOURCE OF RECORD — NOT METRC (owner, 7 Aug)
**A Metrc manifest price is a COMPLIANCE DECLARATION, not a sale.** The
invoice, discount and true unit price live in **Apex** — to which access is not
yet obtained.

**Every price figure derived from Metrc must be labelled "declared wholesale
transfer price", never "realised sale".** This includes $807.50/lb bulk flower
and $1,430/lb packaged. It also explains the anomalies: ~319 lines at $0.01,
manifests priced flat per package regardless of weight, the same product at
$668 and $2,593/lb weeks apart, and storage movements carrying prices at all.
**Not sloppiness — a different system of record.**

## FIVE NUMBERS AGENTS KEEP GETTING WRONG
- **Moisture loss: 73.5% across the 271 harvests that DRIED.** 62.5% is the
  trap — it includes 77 fresh-frozen harvests that never dried. Band 70–77%
  means *wet weight that did not become product*, and **it is a residual, so
  the mass balance always closes — that test proves nothing.**
- **Room capacity: F1/F3 1,140 · F2/F4 1,050** (`conversion_factors`).
  `grow_rooms` says 1,150 for all four and is **wrong** — 1,150 came from
  `Labor Calculator!B2`, *"Estimated total plants — Editable"*, a **crew-sizing
  input**, not a room capacity.
- **`projected_fresh_frozen_lb` IS DRY.** The source column is headed *"Fresh
  Frozen Weight (**Dry**/LBS)"*. Valuing it at the fresh-frozen rate instead of
  dry gives a **nine-fold error** ($104,200 vs $957,021 on 870 lb).
- **Trim price: $250/lb** (`Summary Sheet`, and what the platform imported).
  `Volatile IN_OUT` hardcodes **$300** and the VAPE tab reads it — a **$1.61
  per cartridge** difference. Three tab headers still say $300.
- **454 vs 453.59237.** Every workbook conversion divides by 454. Use
  `f_to_pounds()`; know that `valuation_rates` has the rounding baked in.

## WHAT IS TRUE NOW — these override older documents
- **Potency is LIVE.** `metrc_lab_results` holds 101,608 rows across 2,642
  packages and `v_lab_results` reads it directly, with `total_thc_source` on
  every row. **`lab_result_values` and `coa_documents` stay empty by
  decision** — one home per figure. Do not populate them.
- **983 COAs and 2,690 manifests are stored** with signed links.
  `f_package_documents(tag)` serves both. Manifest coverage 99.7%; **COA
  coverage 34% only because the package↔document link is one-to-one on
  many-to-many data** — 480 certificates cover more than one package, one
  covers 24.
- **Licences: MC281714 cultivation, MP281909 manufacturing.** A third number
  (157557) is the owner's Metrc **user ID**, not a licence.
- **Cost basis $1,100/lb is a COST, not a price** — the accountants' 2025
  actual. 2024 was $1,250.
- **The platform is 100% read-only.** Not one order, weight, approval or punch
  can be created in it.
- **HANDOFF.md counts are stale.** Re-measure before relying on any number in
  it.
- **The desktop bridge is BROKEN** — it authenticates with the publishable key
  and lost its grants. **Do not re-grant anon to fix it.**

## WHERE EVERYTHING IS
| | |
|---|---|
| Rules, locked facts | `CLAUDE.md` |
| Everything the platform has learned | `brain/INDEX.md` |
| Every data trap | `brain/DATA_TRAPS_REGISTER.md` |
| When it breaks | `brain/RUNBOOK_RECOVERY.md` |
| The plan and its phases | `brain/PROJECT_PLAN.md` |
| Decisions needing the owner | `brain/CONTRADICTIONS.md` |
| Which rules are actually enforced (4 of 42) | `brain/RULE_LEDGER.md` |
| Lane ownership | `docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md` |

**A tile without a drill-down is not finished. A number without provenance is
a guess. The theme is locked — neon green, zero purple; if your task seems to
need a theme change, STOP and ask.**
