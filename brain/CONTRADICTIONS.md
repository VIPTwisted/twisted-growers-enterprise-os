# Contradictions — the owner's arbitration queue

*Two sources disagree; per the house philosophy the disagreement is the
finding, and only the owner arbitrates. Each entry: both sides, both sources,
what settling it unlocks. When settled → strike through, record the ruling in
DECISIONS.md, fix the losing document. Assembled 7 Aug 2026 from the full
line-by-line read of every doc.*

---

## 1 · Moisture loss: the locked fact and the live config disagree
- CLAUDE.md LOCKED FACTS: **75–80%**, source "published drying guidance".
- Live platform: owner-set band **70–77%** on 6 Aug (recorded in
  `issue_decisions` under `moisture_band`), centred on the **measured 73.5%**
  weighted across the 271 harvests that actually dried (from Metrc's own
  Moisture Loss column).
**Settles:** which figure every valuation uses, and whether CLAUDE.md's
locked-facts table gets its first owner-approved amendment.

## 2 · Defect D1 (moisture / mass ledger): open or closed?
- HANDOFF.md: **OPEN** — "nothing may be adjusted in Metrc until settled."
- METRC_SYNC_2026-08-06.md: "**D1 CLOSED**" — band set 70–77 on the owner's
  decision.
**Settles:** whether Metrc corrections are unblocked. If closed, HANDOFF §4
and §10 must be corrected (strike-through, dated).

## ~~3 · D5 potency~~ — **LARGELY RESOLVED. Agent D was repeating a stale blocker.**
**Corrected 7 Aug 2026 after the owner pushed back ("we have imported and have
links to all COAs from testing and manifest… labs are the COAs"). Verified
live the same minute — he is right.**

- `metrc_documents` = **3,673 documents: 2,690 manifests (2,683 with files)
  and 983 COAs (983 with files — 100%).**
- `metrc_lab_results` = **101,608 rows across 2,642 packages, 552 test names.**
- **`v_lab_results` works today** and returns `total_thc`, `total_terpenes`,
  `coa_expires`, `days_until_expiry`, `manifest_number`, `supplier`,
  `verdict`, `turnaround_days` — **with `total_thc_source` on every row**
  stating either `"Metrc"` or `"COA - Metrc holds no result"`. Live samples
  returned real values (2.9% and 26.88% THC) with provenance attached.
- **Labs and COAs are the same evidence** viewed two ways: the API
  (`metrc_lab_results`) and the certificate document (`coa_extract`, 983
  parsed). `total_thc_source` is what tells them apart, exactly as rule A2
  requires.

**Agent D's error:** the `lab_result_values` table comment states plainly that
`v_lab_results` was repointed to `metrc_lab_results` on 7 Aug. Agent D read
that comment, quoted it in [LESSONS.md](LESSONS.md), and still went on
describing the potency data as "waiting on a decision" several times. **It was
not waiting. It was live.**

**What actually remains — much narrower:**
1. **Terpene totals are thin.** Only ~105 of 983 COAs yielded a terpene total
   and 46 a full profile, so `total_terpenes` is null on many rows. Improving
   the COA parser is the fix, not a decision.
2. **Tidiness, not availability:** `lab_result_values` and `coa_documents`
   remain empty by deliberate choice, with the reason recorded in the table
   comment. That is a documented decision, not a blocker.
3. Worth surfacing rather than fixing: one sampled package carries **two
   COAs — microbiology FAIL then PASS** — a real remediation-and-retest story
   the platform can now evidence end to end.

## ~~3b~~ · Original framing, retained for the record

HANDOFF frames it as two options, but there are three candidates:
- `lab_result_values` — designed canonical home, **empty** (0 rows).
- `metrc_rpt_lab_results` — report import, **39,531 staged rows**.
- `metrc_lab_results` — API sync, **101,608 rows covering 92% of tested
  packages**, already read by the live views since the 7 Aug fix.
**Settles:** "the single largest unrealised gain in the entire system."
Once ruled, rule C3 requires back-filling every past record. No agent may
guess this.

## ~~4 · Cultivation licence number~~ — **RULED BY OWNER, 7 Aug 2026**
**Settled, with a screenshot of the Metrc facility switcher as evidence:**
- **MC281714 — cultivation.** (Twisted Growers LLC)
- **MP281909 — manufacturing:** processing and all vapes, concentrates etc.
- **157557 is the owner's Metrc USER ID — not a licence at all.**

The locked facts were right. `docs/09_METRC_API_ACCESS.md` (2026-08-05) is
**wrong**: its Metrc integrator request template names "MC157557
(cultivation)". **That document must be corrected before the API application
is submitted** — a user ID in a licence field would stall onboarding.
Relevant to the Metrc auth model (`software:user` Basic auth), the user ID is
associated with the *user* key, never with a facility.

## 5 · Is the freeze lifted or not? Three documents still say frozen
- HANDOFF.md read-first box (7 Aug): **lifted**, agents working in lanes.
- Still saying FROZEN: `docs/handoff/README.md` line 3;
  `docs/handoff/00_START_NEW_CHAT.md` (the paste-this opening message:
  "The freeze holds until I lift it"); HANDOFF.md's own §10 step 1.
**Settles:** a new agent following the prescribed onboarding today would
refuse to work. The three stale texts need dated corrections.

## 6 · D6's prescribed fix cannot produce the 2025 tax figure
- HANDOFF D6/§13: the Metrc Inventory Point-in-Time export is the route.
- METRC_REPORT_SOURCES.md + METRC_SYNC: the export has **no quantity
  column** — "it says what was held, not how much." 7,266 rows staged, still
  no fileable figure.
**Settles:** the real route (QuickBooks? manual valuation? accountant
letter?) for the 2025 return. Forward years are covered by
`inventory_snapshot`.

## 7 · Laboratory turnaround limit: 2 days or 3?
- CLAUDE.md locked facts: **2 days** (measured: avg 0.32 d, p95 1 d).
- MENU_MAP.md (§8, §11): the page is built on a **3-day limit**.
**Settles:** the threshold `f_rule()` should carry and the page label.

## 8 · The desktop bridge vs "0 relations readable by anon"
- HANDOFF §6 (7 Aug): anon exposure **zero** across the board.
- SECURITY_CHANGE_2026-08-06.md: the bridge deliberately kept anon-readable
  `ai_bridge_jobs` and anon-writable heartbeat, because it authenticates
  with the public key. Either those grants survive (and "zero" is
  overstated) or they were revoked (and **the bridge is now broken**).
  Unmeasured. Also on record: the bridge once allowed unauthenticated RCE
  on the owner's workstation and was stopped; it has never been tested end
  to end.
**Settles:** whether the bridge gets its own credential (the recorded
recommendation) before it is ever restarted — or gets retired.

## 9 · Phantom weight: 6,796 lb, 24,896 lb, or a retracted concept?
- HANDOFF §3/§4: **6,796 lb across 87 closed harvests** (88 in MENU_MAP).
- METRC_SYNC first said **24,896 lb**, then retracted the framing entirely:
  moisture loss IS recorded in Metrc, in the export the Harvests report
  doesn't carry. Retraction kept on the record.
**Settles:** whether "phantom weight" tiles/findings stay, are re-derived
from the moisture report, or are withdrawn with a dated correction.

## 14 · "Selling below cost" is contaminated by RESALE — re-run required
**Owner, 7 Aug 2026:** *"Or sold to others who do the same — we act as
wholesaler for others too."* **Twisted Growers is a trader of third-party
material, not only a producer.** Two consequences, and both undermine the
headline figure Agent D reported:

1. **Resale revenue was blended into the "realised flower price."**
2. **Resale was measured against the $1,100 PRODUCTION cost basis**, which does
   not apply to material bought in and passed on. The cost of resale is what
   was paid for it — and `material_purchases` and `third_party_purchases` are
   **both empty**, so that number does not exist anywhere.

**First split (external customers, Eagle Eyes excluded, priced ≥ $1):**

| Origin | Lines | lb | Dollars | $/lb |
|---|---|---|---|---|
| **Our own (TG harvest)** | 3,146 | 2,748.2 | $2,611,458 | **$950.24** |
| **Bought in / resale** | 54 | 455.7 | $131,908 | **$289.45** |

**Against $1,100, own production is short by ~14%, not the 26.6% reported.**
Resale at $289/lb was dragging the blend down and should never have been in it.

**⚠ These figures are NOT clean and must not be quoted yet.** Two known
defects remain in this split:
- **The repeated-weight artifact is still in it.** Sample lines show the same
  20.018 lb package of *TG Ice Cream Cake Flower* priced at $35, $140, $105,
  $35, $280 and $140 per lb — the manifest-level weight stamped onto every
  package line. The pricing audit found ~319 such Buds lines and excluded them;
  this split did not.
- **The origin classification is imperfect.** It keys on a `TG ` prefix in the
  source harvest. `Sparq-Bulk-Warheads Buds` and `Warheads 05.14.2026` are
  clearly third party, but **`F1-BCG-060126` and `F1-M1-060126` are ambiguous**
  — F1 is also a Twisted Growers flower room. Some resale may be misclassified
  in either direction.

**What must happen before any margin claim is made again:** re-run the pricing
audit with (a) resale separated from own production, (b) the repeated-weight
and $0.01 lines excluded, and (c) origin classified from the licence that
packaged the material, not from a name prefix. **Then compare own production
to $1,100 and resale to what was actually paid — once that is recorded.**

*This is Challenger attack #1 — wrong basis — landing on Agent D's own work for
the second time today.*

## 13 · Cost per pound: $591.39 locked vs $1,100 accountant-verified for 2025
**The owner clarified 7 Aug 2026:** $1,100/lb is the **actual 2025 full cost
per pound, determined by the accountants after year end**, and is used as the
working cost factor in meetings until the next annual close. It is not a
sale price and not a guess.

CLAUDE.md's locked facts carry a different figure: **"Actual cost per pound
$591.39 — $285,000 × 6 months ÷ 2,891.5 saleable lb."** The two disagree by
nearly 2×, and **the platform's figure is the one that fails a reconciliation:**

```
$285,000/month × 12 = $3,420,000 annual cost
  ÷ $1,100/lb  (accountants)  ⇒  3,109 lb of saleable output implied
  ÷ $591.39/lb (platform)     ⇒  5,783 lb of saleable output implied

Measured 2025 dry flower: 19 pulls × 155.4 lb = 2,952 lb
  → plus trim, fresh frozen and concentrate, ≈3,100 lb total
```

**The accountants' $1,100 reconciles with measured Metrc production almost
exactly. The platform's $591.39 requires roughly DOUBLE the output the
business actually produced.** Two independent derivations, and the
disagreement names the loser.

**Consequence — this one is live and dangerous:** anyone using $591.39 for a
pricing, margin or make-versus-buy decision believes gross margin is roughly
twice what it is. Against realised flower prices in the $996–$1,050 range,
$591.39 shows a comfortable margin where the true position may be at or below
cost.

**Recommendation (owner's call):** correct the locked fact to $1,100 with the
accountants named as the source and 2025 as the period, and record $591.39 as
superseded rather than deleting it. Then re-derive it annually at close, per
the owner's stated practice. **Also worth noting: the annual figure is
output-dependent — if 2026 output falls below 2025, 2026 cost per pound will
land ABOVE $1,100, not at it.**

## 11 · Room capacity: 1,150 locked vs 1,140 / 1,050 in the live config
- CLAUDE.md LOCKED FACTS: **1,150 operating plants per room** (4 tables ×
  287.5).
- `conversion_factors.room_capacity_*`, measured 7 Aug: **F1 1,140 · F2 1,050
  · F3 1,140 · F4 1,050** — average 1,095, and the two 1,050 rooms are 8.7%
  below the locked figure.
**Settles:** every capacity, utilisation and per-room-day calculation.
*Also — and this is the sharper point:* every room's largest observed pull
**exactly equals** its recorded capacity, which is what you would see if the
capacity rows had been populated from maximum observed pulls. If so, the
`room-capacity-never-exceeded` check derives source B from source A — **a
check built to enforce "never compare a source to itself" doing exactly
that**, and one that can never fail. Settled by confirming where those four
values came from: a facility plan, or the harvest data.

## 12 · Two harvest pulls are missing — never grown, or never recorded?
`plants-metrc-vs-plan` fails at **14,211 actual vs 16,045 planned** (−1,834,
11.4% against an 8% tolerance). Decomposed by month it is **not drift**:
February **−1,050** and May **−950** account for 2,000 of 2,010 total
deviation; every other month is within a rounding error. February's actual of
1,140 is exactly one full room against a plan of two.
**≈2,000 plants × 82.3 g = 362.9 lb ≈ $399,000 at $1,100/lb.**
**Settles — and only cultivation can answer:** did F-rooms run empty in
February and May 2026, or did those pulls happen and never reach Metrc? One
is lost production; the other is a state-record gap. **The consequences are
completely different and the check cannot tell them apart.**

## ~~10 · A registered agent enabled for a permanently disabled endpoint~~ — **CLOSED 7 Aug 2026**
Agent D set `sync:sales` to `enabled = false` and recorded the full reason on
the row: neither licence is retail, 401 on both, 237 consecutive failures, and
the 6 Aug decision to disable was never applied. Re-enable only if a retail
licence is acquired. Fleet now 17 enabled, 1 deliberately disabled.

## ~~10 (original)~~ · A registered agent is enabled for an endpoint permanently disabled
- `agent_registry` row **`sync:sales`**: `enabled = true`, heartbeat every
  1,440 minutes — the platform expects it to run daily.
- Its own description: "Currently disabled and has never succeeded — 237
  consecutive authorisation failures." And the **6 Aug decision permanently
  disabled Metrc sales endpoints**: neither licence is retail, so both return
  401, and "a wholesaler's sales are its manifests."
**Settles:** whether the row is retired (with the reason on the record) or the
decision was reversed. As it stands the registry advertises an agent that
cannot succeed — and a registry that lists dead agents stops being evidence.
*Found 7 Aug 2026 by Agent D while measuring agent identity.*

---

*Standing note: counts drift across every document (cron jobs are 23, 19,
and 20 within one doc set; pages 262 vs 278; open questions 30 vs 44).
Per HANDOFF's own instruction these are never arbitrated — always re-measure
live. The only durable fix on record: generate HANDOFF.md from
`platform_state`.*

---

## OPEN — EXPIRING DOCUMENT LINKS STILL LIVE IN 8 VIEWS (raised 7 Aug 2026)
**Owner ruling: "I do not want expiry at all on our OS."** My layer is clean —
`f_item_documents`, `v_document_package_link` and `v_item_documents` carry
`storage_path` only, verified no URL and no token. **Eight views still serve a
pre-signed URL that dies 5–6 September 2026:**

| view | column |
|---|---|
| `v_document_library` | `open_download_print`, `url_expires_at` |
| `v_document_links` | `coa_url`, `manifest_url` |
| `v_product_identity` | `manifest_url`, `coa_url` |
| `v_customer_manifests` | `manifest_download`, `certificate_of_analysis_links` |
| `v_coa_register` | `coa_link` |
| `v_sales_history` | `manifest_link` |
| `v_metrc_transfer_ledger` | `manifest_link` |
| `v_issue_unconfirmed_manifests` | `manifest_link` |

**These are the front-end lane, not mine — flagged, not quietly rewritten.**

**THE PERMANENT FIX, and it costs nothing in privacy.** Serve documents through
an edge function — `/functions/v1/document/coa/2267739.pdf`. The URL is
**permanent, tokenless and never expires**, the function checks the caller's
session and streams the file from the private bucket. Every one of the 8 views
then stores a path, not a countdown. **This is not a trade-off between permanence
and privacy — it gives both.** The alternative, making the bucket public, gives
permanent URLs but means anyone holding a link can read our COAs and manifests,
including who we ship to. **Not done without an explicit owner decision.**
