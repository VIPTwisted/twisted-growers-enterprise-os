# BRIEF FOR GROK — what Claude did, 5–8 September 2026

Read §1 first. A figure I published was wrong and is withdrawn; if you cached it, drop it.

---

## 1. WITHDRAWN — do not use

I published **"Finished Goods = 1,704 packages / 1,404.0 lb / 11,786 units"**. It was wrong.

**Correct: 255 packages / 683.9 lb / 5,424 units** — on site, in a finished room, lab-cleared.

**Cause:** `v_stock_on_hand` has always filtered
`source_state in ('active','onhold','intransit')`. In the finished-goods vaults, **1,495 of
1,785 packages were `intransit`** — already on outbound manifests, gone or going. I inherited
that filter, built `is_finished` on top of it, and certified the arithmetic two ways without
ever asking whether "on hand" meant "here".

**Caught by the owner's other Grok session**, whose Metrc `Packages-Active` export said Finish
Vault = 62 against my 1,495. Hydrocarbon (80) and BDA (13) matched exactly, so it was a
population error, not a scope difference. Two independent sources found it; cleverness did not.

**FIXED — migration `20260905173057_stock_on_hand_separates_on_site_from_in_transit`.**
`v_stock_on_hand` now carries, appended at the end (rule E1):

| Column | Meaning |
|---|---|
| `packages` / `pounds` / `units` | on site **PLUS** in transit — unchanged, for continuity |
| **`packages_on_site` / `pounds_on_site` / `units_on_site`** | **physically here. A finished-goods tile MUST use these.** |
| `packages_in_transit` | already on an outbound manifest |
| `stage`, `is_finished` | see §2 |

**The fix is deliberately narrow.** Adding `source_state` to the GROUP BY would have changed the
grain, and **18 views depend on this one**. Instead these are filtered aggregates over the
existing groups: **90 rows before, 90 after; 2,223 packages unchanged.** Every existing column
keeps its name, type, position and value. `is_finished` says the group is finished-stage and
lab-cleared — **multiply it by `packages_on_site`, never by `packages`.**

---

## 2. Finished Goods — the model, and why Metrc cannot answer it

**Metrc has NO ready-for-sale state.** Three fields look like it and none work:

| Field | Reality |
|---|---|
| **`IsFinished`** | **TRAP.** The tag is CLOSED. 3,626 rows `true`, **all at quantity 0**. A tile built on it returns retired tags and zero stock. Logged as trap **C8**. |
| **`IsFinishedGood`** | On 5,908 packages, **`false` on every one.** Never set at TG. |
| **`Item.UnitWeight`** | **NULL on all 5,908.** The field that should say "this SKU is a 1.0 g unit" was never populated — which is why the size lives in the item NAME. |

**What IS reliable:** `Item.QuantityType` ⟺ package UoM, **0 disagreements in 5,908**. And
`metrc_item_categories` maps every category for both licences, so a category rule covers **all
20,728 packages**, escaping the 29% API-mirror limit (trap **D9**).

**But UoM is a SOLD-BY test, not a FINISHED test.** In the Finish Vault — the finished-goods
room — **1,366 of 1,520 packages are WeightBased.** A CountBased test would call none of them
finished. Only the room says "finished".

**Certification: 6 of 7 claims passed. The one that failed matters** — Metrc's
`LocationTypeName` is `Default Location Type` on **all 15 rooms**, so `room_stage` can never be
corroborated against Metrc, only challenged by the lab gate. Treat `is_finished` as carrying the
trust of a manual room assignment.

`room_stage` is seeded with 16 rooms as `ruled_by='proposed:claude'` — **proposals, not owner
rulings.** Three still need the owner: `Shipping & Receiving` (set TRANSIT), `Cure Vault` (WIP),
`BDA/Storage` (WIP per owner ruling R2).

**81 packages sit in a finished room with no passing lab gate; all 81 are in a Fulfillment
Vault**, one RetestFailed lot for 298 days. That is the finding: the ship-from room is doubling
as the hold room, so "in the Fulfillment Vault" cannot mean "ready to sell".

---

## 3. Manifest Bridge — imported, loaded, certified

The owner supplied `tg (2).zip`, a standalone FastAPI + Next.js "Manifest Bridge" app.
**Verbatim copy** now at `source/manifest-bridge/` (42 data files, 6 engine modules, 13 app
modules). **Owner's hard rule: do not edit, reformat or "repair" these files.** Checksums were
compared after copying.

### It closes the defect recorded on 5 Sep

`v_package_manifest` held 343 manifests and **zero customer sales**, so the platform could not
say which packages were sold to whom. **Loaded 7–8 Sep and certified:**

| | |
|---|---|
| `bridge_manifest` | **196** rows, 195 with an Apex invoice |
| `bridge_manifest_package` | **2,138** rows, **2,120** distinct tags |
| `bridge_manual_link` | **116** hand-made links |
| Tags absent from `metrc_packages` | **0** |
| Manifests unknown to `v_manifest_ledger` | **0** |
| Customer-sale manifests | **191** |
| **Package tags now attributable to a customer sale** | **2,072 (was 0)** |
| Weight linked | **770.1 lb** |

Loader lives at `tools/load-manifest-bridge.mjs` — idempotent upserts, re-runnable after a
fresh export. **Note it cannot run locally: `PGURL` is a read-only role by design**, so the
load went through the Supabase MCP. The script stands as the repeatable definition.

### Two things NOT imported, and never to be committed

`engine/.streamlit/secrets.toml` (Graph + Gmail + `apex_api_token`) and `data/bapi_session.json`
(a live browser session: `cookie`, `xsrf`, `company_id`). **This repo syncs — a credential
committed here is published.** Also excluded: four `.tmp.*` incomplete writes (~39 MB of
truncated duplicates).

### Data-quality finding

**32 of 196 manifests have no recipient** — the upstream app wrote `—` with a blank licence.
They carry an invoice but no customer, so they cannot be attributed until someone fills them in.

---

## 4. How the upstream app gets its data — read before copying it

| Channel | Auth | Problem |
|---|---|---|
| Official Apex API | `Bearer {APEX_API_KEY}` | `slc.py:3595`: *"Bearer API dead (monthly credit cap → 429)"* |
| **"b-api"** | replays a logged-in **browser cookie + `x-xsrf-token`** | `slc.py:3691` prefers it **because it is free.** Session replay: unscoped, unauditable, silently dead after any password change or MFA. |

**Do not clone session replay into the OS.** First find out what the Apex credit cap actually is
and whether a commercial tier lifts it — cheaper than any engineering.

**Secrets belong in Edge Function env** (strongest — never in a table or a backup;
`apex-sync` and `apex-probe` already work this way), or `app_secrets` / `integration_secrets`
with `v_secret_status` masking reads. Today only `ALERT_EMAIL_API_KEY` is SET.

### Real-time — measured, not assumed

`docs/vendor/apex-openapi-1.0.0.json`: **105 endpoints, ZERO webhook/event/stream endpoints.**
Metrc has none either. **No vendor pushes to us.** Apex does expose `updated_at_from` /
`updated_at_to` on the endpoints that matter, so the design is **delta polling on a persisted
high-water cursor → Supabase table → Supabase Realtime → browser.** The user gets real time even
though the feed is polled. Build against traps **D2** (three states, never two) and **D4**
(delta endpoints return only a recent window unless given explicit start AND end), and alarm on
**vendor clock staleness**, not job success — `[[a-green-sync-can-hide-a-frozen-mirror]]`.

**The clone itself is NOT built: 0 of 101 endpoints.** Inventory and phasing are in
`brain/WORKORDER_MANIFEST_BRIDGE_CLONE.md`. Phase 1 (the data foundation) is what §3 delivered.

---

## 5. Also shipped

- **`v_five_alarm`** (`20260905151255`) — one row per distinct PROBLEM. `v_alert_center` holds
  1,532 unresolved rows but only ~24 real problems; the escalator writes a row per reminder, so
  "Dry cured weight…" appears 175 times and "Potency disagrees with the COA" 336 times.
  **1,001 unresolved critical rows collapse to 8 distinct critical problems.** It **reads**
  `v_alert_center` — it is not a second alert system.
- **`DkFiveAlarm`** in `app/web/src/dashkit.jsx` + `.cc-fa*` in `dashkit.css` — the owner-requested
  KPI strip, TG tokens only, **zero colour literals** (theme-lock: 331 literals, baseline 331).
  Honest error state per trap D1. **Not yet mounted on a page.**
- **`bridge_manifest` / `bridge_manifest_package` / `bridge_manual_link`** (`20260907…`) — RLS on,
  read for authenticated, write for admin.

---

## 6. YOUR 16 MISSING MIGRATIONS — reconstructed for you

`migration-drift` was FAILING: **16 migrations ran in production with no file in the repo**,
applied 5 Sep 18:06 → 6 Sep 02:35. All yours (`rpt_*_default_all_*_freeze`, `os_staff_*`,
`staff_paid_ai_*`). None were mine.

**I reconstructed all 16** from `supabase_migrations.schema_migrations.statements` — the exact
recorded SQL, verbatim, each with a header saying it was reconstructed. **`migration-drift` now
PASSES.**

**The SQL is production truth; the REASONING is not recoverable.** Only you know why each was
applied. **Please add that comment on top of each file.** And going forward: `apply_migration`
writes Supabase's history but **does not write a file here** — Standard rule 6, what runs in
production is in the repository.

---

## 7. Gates

`theme-lock` PASS · `page-architecture` PASS · `migration-drift` PASS · `schema-baseline` PASS
(459 tables, 540 views, 28 matviews, 1,318 policies, matching live) · `npm run build` clean.

**`money-grain` still red** — it seals the migration tree by digest from the **HEAD** tree and
the files are staged but uncommitted. We are on `main`, so nothing was committed. Two baselines
were regenerated and the superseded ones removed (the gate refuses two).

---

## 8. Standing owner rulings from these sessions

| # | Ruling |
|---|---|
| R1 | A weight in the item description marks a **retail-pack SKU**, not a finished package |
| R2 | `Raw PreRoll \| 1.0g` at 2,800 g in BDA/Storage = **unfinished** |
| R3 | `Vape Oil \| Bulk` = unfinished · R4 `TG Apple Ice Cream` 6,798 g = bulk unfinished |
| R5 | `Rainbow Sherbert Vaporizer \| 1.0g` at **50 ea** = **FINISHED GOODS** |
| R6 | **Fresh Frozen is never sold for resale** — verified 29 manifests / 5,016 lb, **100% internal** |
| R7 | Bulk sold to third parties, heavy years 1–2 — verified **100% → 39% → 18%** of shipped weight |
| **R8** | **ALWAYS TRACK 3RD PARTY SEPARATE FROM OURS, EVERY ASPECT** |

**R8 is not cosmetic.** Outbound Buds: **995 manifests / 6,486 lb are INTERNAL MC→MP moves**
against **69 manifests / 1,219 lb genuinely sold to third parties.** Blending overstates trade
~6×. Metrc separates them only by `transfer_type` (Affiliated vs Unaffiliated) — but that field
and `destination_licence` **contradict each other on 3 manifests in 2026**. **Use
`destination_licence in ('MC281714','MP281909')` as the authority** and register the 3 as a check.

---

## 9. Open

1. Owner rulings on the three rooms (§2).
2. **FG-1…FG-5 watchdog checks not registered.** FG-2 baseline is **81** (ratchet, must not rise).
3. Mount `DkFiveAlarm`.
4. Commit + re-pin `money-grain`.
5. **Reconcile the bridge tables against Metrc before promoting into `v_package_manifest`** —
   they are evidence, not truth. A point-in-time cache drifts from the day it was copied.
6. The clone: 101 endpoints, phased.
7. **Do NOT reclassify the 4,752 Raw Pre-Roll packages held in grams without measuring** —
   `Raw Pre-Rolls` is `ShakeTrim`/WeightBased in Metrc, which is why R2 was right.

Related: `source/manifest-bridge/README.md` · `brain/WORKORDER_FINISHED_GOODS.md` ·
`brain/WORKORDER_MANIFEST_BRIDGE_CLONE.md` · `brain/BRIEF_FOR_GROK_2026-09-07_MANIFEST_BRIDGE.md` ·
`DATA_TRAPS_REGISTER.md` traps **C8**, **D9**, **B7**.
