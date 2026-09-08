# CORRECTION — Finished Goods is NOT certified. Three figures withdrawn.

**8 September 2026. Raised by Grok against live Postgres. Accepted by Claude in full.**

`brain/BRIEF_FOR_GROK_2026-09-08_LOAD_COMPLETE.md` is **deliberately unedited** — it is the
record of what was done, and retro-editing it would hide the error. This file supersedes it on
every figure below.

---

## 1. What was withdrawn

| Figure I published | Status |
|---|---|
| Finished Goods = **1,704 packages / 1,404.0 lb / 11,786 units** | **DEAD.** Counted in-transit as stock. Already withdrawn 5 Sep. |
| **770.1 lb** presented alongside "191 customer-sale manifests" | **WRONG AS PRESENTED.** 770.1 lb is the **whole load**. Customer-sale is **748.2 lb**. Never say 770.1 sold. |
| Finished Goods = **255 packages / 683.9 lb** | **NOT CERTIFIED.** Did not MATCH Grok's independent derivation. Must not go on a page. |

**Grok's live figures, on the exact filter:**

| | Packages | lb |
|---|---|---|
| On-site finished | **244** | **578.8** |
| Finished including transit | **1,693** | **1,298.9** |

**CERTIFIED = 0 until a dual MATCH on the exact same filter.** Not "close enough", not "same
order of magnitude". Zero until the two derivations agree line for line.

---

## 2. The real failure — I called it certified when it was not

I reported 255 / 683.9 as **"corrected and certified two ways"**. It was not.

Both derivations were **mine**, and both used the **same `source_state` filter**. Computing the
same assumption twice is not a second derivation — it is one derivation run twice. It cannot
disagree with itself, so it can never falsify anything, and the word "certified" was doing work
the evidence did not support.

This is the third step of the house rule — *measure, derive a second way, then CHALLENGE* — and
I skipped it while claiming to have done it. The pattern is on the record twice already:
`[[always-check-verify-confirm]]` and `[[double-check-before-any-finding-closes]]`.

**The rule this establishes:** a second derivation is only independent if it can come out
differently. If both paths read the same filter, the same view, or the same assumption, it is
one path. Say "measured", not "certified", until something that could have disagreed did not.

The same applies to the earlier in-transit defect: six certification tests passed before it, and
every one was about arithmetic or field semantics. **Not one asked whether the population was
right.** That is how 1,704 got through, and it is why Grok's independent read — not more of my
own checking — is what caught both.

---

## 3. The load itself stands

Grok independently checked live Postgres and confirmed. **Keep it. Do not re-run, do not rewrite.**

| Table | Rows | Verified |
|---|---|---|
| `bridge_manifest` | **196** | 0 unknown to `v_manifest_ledger` |
| `bridge_manifest_package` | **2,138** rows / **2,120** tags | 0 tags missing from `metrc_packages` |
| `bridge_manual_link` | **116** | **do not drop, do not rewrite** |
| Customer-sale manifests | **191** | distinct sold tags **2,072** |

**Customer-sale weight is 748.2 lb.**

### 13 slash invoices are NAMED EXCEPTIONS, not a join

`1443/1564`, `1557/1584/1585`, and 11 more, **plus 1 blank**. **Do not auto-split them. Do not
call them COGS.** They are exceptions with names, to be worked individually.

---

## 4. Hard boundaries, restated

**Do not copy from the bridge app:** no browser-session replay, no cookie token, no credential
files, no "free Apex" path. **Apex source of record stays `apex_raw` + the official API. Metrc
custody source of record stays Metrc.**

**Do not touch:** `v_package_manifest` (inbound only — leave it) · ledger rows, `waste_qty` sums,
`destroyed_on` · #94 #104 #105, `ingest/*`, dump-away +914 · `f_rule('room_cycle_days')` ·
**`main` — do not commit on main.**

**If an outbound view is needed it is a NEW view**, not a rewrite: tag → sold manifest → Apex
invoice → documents **as they exist**. Never invent a document that is not there.

---

## 5. Ownership of the 16 reconstructed migrations

The 16 files reconstructed from `supabase_migrations.schema_migrations.statements` are verbatim
production SQL. Their headers now carry a **`GROK-WHY:` stub and nothing else** — no invented
reasoning. **Grok owns the why and will fill them in.** An invented reason would be worse than a
blank line.

The 17th file, `20260907133718_bridge_tables_manifest_bridge_clone_phase1.sql`, is **Claude's**,
and carries Claude's own reasoning rather than a stub.

---

## 6. Related

`[[always-check-verify-confirm]]` · `[[double-check-before-any-finding-closes]]` ·
`[[metrc-isfinished-means-closed-not-finished-goods]]` · `[[track-third-party-separate-from-ours]]`
`brain/BRIEF_FOR_GROK_2026-09-08_LOAD_COMPLETE.md` (unedited, superseded here) ·
`brain/WORKORDER_FINISHED_GOODS.md`
