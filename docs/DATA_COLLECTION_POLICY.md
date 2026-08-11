# Data Collection Policy, Procedure and Agent Rules

Twisted Growers LLC · MC281714 · MP281909
Established 11 August 2026 · Owner: Vinny

This exists because a forensic audit produced four wrong figures in one day, and
**every one of them was a data-handling error, not a business problem.** The rules
below are written from those specific failures.

---

## 1 · The hard rule

> **Every single item in question is drilled to its TAG, its MANIFEST and its COA.
> No drifting from this.** — Owner, 11 August 2026

Nothing leaves or enters the facility without all three, in both directions. It
follows that:

**A tag showing no manifest or no COA is a hole in OUR IMPORT — never a compliance
failure.** The manifests prove the distinction beyond argument: 2,643 manifests
appear in the transfer report, we hold **2,643** documents, **zero missing**. The COA
fetch, by contrast, ran once on 6 August 2026 and stopped at 983. Same business, same
compliance, different import completeness.

Any report that presents a missing certificate as a compliance finding is wrong and
must be corrected.

---

## 2 · Collection procedure

### 2.1 What must be pulled, and how often

| Source | Cadence | Why |
|---|---|---|
| Metrc packages (API) | daily | current position; **active list only, not history** |
| Metrc transfers report | weekly | the only complete tag history — 15,496 tags vs 4,343 |
| Metrc lab results (API) | daily | 2,642 tags back to Sep 2023 — the deepest lab source |
| COA documents | **daily until complete, then daily** | currently 983 of an unknown total |
| Manifest documents | daily | currently complete; keep it that way |
| Inventory Point in Time | **at every period close** | the only way to know a past position |
| Adjustments | weekly | the waste and destruction record |
| Harvest reports | weekly | production |
| Apex shipping-orders | daily | the sales record of truth |

### 2.2 The retention trap

**Metrc reports have a rolling window of roughly 708 days.** Anything older cannot be
re-pulled, ever. Two consequences:

1. **Point-in-time snapshots must be taken at every close and archived**, because they
   cannot be recreated afterwards. We currently hold three dates, one of which covers a
   single licence — which is why **2024 cannot be closed on a counted position.**
2. Reports are **per licence**. A pull under MC281714 does not contain MP281909. Both
   must be pulled, every time, and labelled.

### 2.3 Filing

Every export is registered in `source_export` with a SHA-256 hash, the licence, the
period it covers and what it was used to prove. A file whose provenance is unknown is
not evidence.

**A filename does not state its period — the title block inside does.** Header rows sit
at row 0, 9, 12 or 13 depending on the report; read with `header=0` and every column
returns `Unnamed` with the values shifted one row.

---

## 3 · Agent rules for reading and mapping

These are enforced in `brain/AGENT_DATA_RULES.md` and injected into every agent
runtime.

### 3.1 Before reporting any number

1. **Check the closed-system constraint first. A part cannot exceed the whole.**
   Two wrong figures this week — a 9.8% yield and a 6,511 lb conversion loss — would
   each have been caught by one line of arithmetic. The package system has exactly four
   ways out: sold, wasted, on hand, or converted. Anything derived must fit inside that.
2. **Ask which line could come out wrong.** If none can, it is an identity, not a
   reconciliation. `wet − waste − packaged = moisture loss` closes on fabricated
   numbers because Metrc *defines* it that way.
3. **When a total looks short, test the JOIN before blaming the SOURCE.** An inner join
   to incomplete headers produced three separate false findings, understating 2024
   outbound by 518.45 lb.
4. **Never plug a residual to make a total close**, and never tune an input until a
   variance disappears. The variance is the evidence; fitting it destroys the evidence.

### 3.2 Building any tag population

**Never build a tag universe from one source.** The seven sources and their coverage:

| Source | Tags |
|---|---:|
| transfer report | 15,496 |
| package mirror | 4,343 |
| adjustments | 1,879 |
| lab results (report) | 1,016 |
| COA extracts | 969 |
| point-in-time | 811 |
| inventory report | 508 |
| **union** | **18,468** |

`metrc_packages` is the **active** package list, not the history. 14,125 tags carrying
13,524 lb are absent from it. Any balance keyed on it structurally cannot see most
shipments.

### 3.3 Mapping certificates

- A **COA belongs to the lot that was tested**, not to each retail unit cut from it. A
  direct tag match reaches 969 tags; **inheriting down the package tree reaches 17,003
  of 18,468 (92.1%).**
- Lineage edges come from **two** sources — `metrc_packages.SourcePackageLabels` and
  `metrc_rpt_package_transfers.source_package` — because neither alone covers the
  14,124 tags with no package record.
- Evidence order: parsed COA PDF → COA file held → Metrc lab API → report export.
  **Always record which source answered and how many hops away**, so a reader can judge
  the strength of the link.

### 3.4 Direction and ownership

- **Transfer rows have a direction, and the `licence` column is not it.** The report
  holds both legs; direction lives only in `source_row->>'Origin Lic.'` / `'Dest. Lic.'`.
- **Direction is read per tag, per manifest. Never inferred from the counterparty.**
  We buy *and* sell with other manufacturers — they stock our brand in their stores and
  we buy their material — so a two-way flow is ordinary trade, not storage.
- **Ownership is read from the item's originating licence**, never from whoever shipped
  it. Third-party material always carries the company that grew or processed it.
- A **3PL warehouse is neither a customer nor a supplier.** Eagle Eyes held our material
  Aug 2024 – Feb 2025; neither leg is a sale or a purchase. What did not come back was
  sold, so only the **net** is a sale.

### 3.5 Units, weights and measures

- **Pounds and units are different measures and are never summed.** 23,950 units of
  vapes, edibles and seeds have no defensible pound equivalent — `Item.UnitWeight` is
  NULL on all of them.
- A **wet pound and a cured pound are not the same pound.** Fresh frozen enters at field
  moisture; only 0.20 of it is dry matter.
- **Live plants are counted, never weighed.**
- Item fields are nested under `raw->'Item'`. Reading `raw->>'ProductName'` returns
  nothing and **fails silently** — it emptied the category, strain and product-line
  filters on every report until caught.
- Postgres word boundary is `\y`. `\b` means **backspace** and silently matches nothing.

### 3.6 Standards, costs and provisional figures

- **Nothing is hardwired.** Every yield, cost and formulation lives in an editable
  table, effective-dated, overridable at tag, batch, brand, product line, category or
  globally. Most specific wins.
- **Editing a figure going forward must never restate a closed period.** That is why
  every table is effective-dated rather than holding a single current value.
- **Every seeded figure is marked `provisional`** and appears on *Provisional Figures*
  until real measurements replace it. A cost or margin built on a provisional rate is
  indicative only and must be labelled as such.
- Every resolver returns **which scope it matched, who set it, and its evidence
  status**, so a report can always show its own basis.

### 3.7 Corrections

- State the correction plainly, withdraw the wrong figure explicitly, and record what
  caused it. Four figures were withdrawn on 11 August 2026: a 796.9 lb shortfall, a
  9.8% yield, a 53.4% yield, and a 6,511 lb conversion loss.
- A wrong figure that has been reported to the owner is corrected **in the same place
  it was reported**, not quietly in a later document.

---

## 4 · Permissions

Cost and yield inputs are visible and editable only to **owner, executive, CFO and
admin** — `f_can_manage_inventory()`. Anyone else is granted access through the
permission screen by enabling the `manage_inventory` capability, which is registered
for all twelve roles so it needs no code change.

---

## 5 · Outstanding collection work

| Item | Size | Action |
|---|---|---|
| **COA fetch incomplete** | 1,465 tags with no certificate imported | Re-run the COA fetch; it ran once on 6 Aug 2026 and stopped |
| COA files held but unparsed | 817 documents | Parse them — they already cover 1,931 tags by inheritance |
| 31 Dec 2025 point-in-time | 3,364 rows generated | Never imported — `scratchpad/pit2025_*.sql` |
| 2024 close | — | No MP281909 snapshot exists; the report carries no weight column |
| Production batch input weights | — | Humans to capture actual fresh frozen, trim and flower per run. Metrc's own `Processing Loss` reason holds 534 events totalling **0.5 lb**, so the field that should carry extraction loss is empty |

### The 1,465 outstanding certificates, by period

Concentrated in **Oct 2024 – Nov 2025**: Feb 2025 (135 tags), Oct 2025 (114),
Nov 2025 (118), Apr 2025 (94), Jul 2025 (92), Mar 2025 (72), Sep 2025 (71),
Jun 2025 (75). Pull COA reports for those months first.

---

## 6 · Where this is enforced

`brain/AGENT_DATA_RULES.md` — injected into every agent runtime
`conversion_factors` — owner rulings, with provenance and evidence status
`counterparty_role` — what each counterparty is, and whether its legs count
`production_yield_standard` / `production_standard_override` — the calculator
`inventory_cost_rate` / `cost_tracking_policy` — costs and what carries them
`preroll_formulation` — the flower:trim split, by period
`source_export` — every file, hashed, with what it proved
Reports → Inventory & Audit — 23 pages, 8 admin-only

---

## 7 · Certificate coverage as at 11 August 2026

Resolution order: the tag itself → up the package lineage → across the harvest lot.

| Basis | Tags | % |
|---|---:|---:|
| On the tag itself | 3,658 | 19.81 |
| Inherited — package lineage | 13,345 | 72.26 |
| Inherited — harvest lot | 1,148 | 6.22 |
| **NOT IMPORTED — harvest lot has none either** | **287** | **1.55** |
| Not tested (seeds, immature plants) or no lineage | 30 | 0.16 |

**98.29% of 18,468 tags carry a certificate. 287 remain to pull.**

How it got there — each step was a defect in my own method, not in the business:

| Coverage | What was wrong |
|---:|---|
| 969 | direct tag match only — a COA belongs to the tested LOT, not each retail unit |
| 12,774 | package lineage, but on parsed PDFs alone |
| 17,003 | added the other three certificate sources; the Metrc lab **API** alone covers 2,642 tags back to Sep 2023, against 1,016 in the report export I had been using |
| **18,151** | added harvest-lot inheritance — a **primary** package has no parent package, so package-only lineage could never reach it. This one route answered **1,148 tags** |

### The 287 outstanding

**354 tag-lines carrying 5,349.7 lb name no harvest at all** and sit outside the
package mirror — spanning June 2024 to June 2026. These are the priority: they are
known only from the transfer report, which for these lines carries no
`source_harvest`.

Named lots outstanding: `PII F1 20240524 / 20240525` (26 tags),
`TG Apple Fritter - 20260608 f4`, `TG Apple Fritter - 20260713 F2`,
`TG Lemon Drop - 20260713 f2`, `TG Orange Cream - 20260713 F2`,
`Neon Sunshine F3 Harvest`, `Candyland F3`.

The August 2026 lots are simply recent — those certificates may not be back yet.

### Rule this established

**Count DISTINCT tags.** The first version of this table reported 28,324 rows against
18,468 tags, because a tag can name several harvests and the join fanned out. That is
the same fan-out that inflated 2024 production to 3,662.7 lb against the correct
2,494.4, and the same one that produced a false 9.8% extraction yield. Three times in
one day. **Any join through harvests, parents or manifests fans out by default —
prove it doesn't before reporting the number.**
