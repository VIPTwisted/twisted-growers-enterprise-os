# Manifest Bridge — imported source data and engine

**Imported 7 September 2026** from the owner's `tg (2).zip` (Downloads). Upstream is a
standalone FastAPI + Next.js app, *"Manifest Bridge (tg)"*, a rebuild of `2.0/manifest_bridge.py`
that matches **planner pack orders ⇄ Metrc manifests**, content-verified, with payments, credit
and invoice email.

**Every file here is a VERBATIM COPY. Nothing was edited, reformatted or repaired.** Owner's hard
rule, 7 Sep 2026. `UPSTREAM_README.md` is the upstream author's own README, also unmodified. This
file is the only thing written by us.

## CERTIFIED 9 September 2026, before commit — and the first pass FAILED

The owner asked for certification before this went into git. It was run against a **fresh
extract of the original `tg (2).zip`**, not against the working copy, because certifying a copy
against itself proves nothing.

**First pass: 50 of 61 identical, 11 DIFFERED.** `app/*.py` and `engine/stshim.py` had picked up
CRLF where the zip has LF — content identical, bytes not. Harmless in effect, but it made the
sentence above *false*, and an earlier version of this file claimed checksums had been compared
when only the JSON files had been. The 11 were restored byte-exact from the zip and re-verified.

| Check | Result |
|---|---|
| Files byte-identical to the original zip | **61 of 61** |
| In the repo but not in the zip | **0** |
| `data-min/*.json.gz` decompress to the originals | **4 of 4 exact** |
| `engine/.streamlit/secrets.toml` present | **no** — deliberately excluded |
| `data/bapi_session.json` present | **no** — deliberately excluded |
| Credential literals in the Python | **none.** `slc.py:2385` matched only because a *filename* constant sits beside a comment saying "token-saver" |
| `storage_token` values (1,609 uses, 159 distinct) | **not credentials.** All relative paths under `private/`, all `.pdf`; **0** carry a signature, expiry or access key; **0** are absolute URLs. Fetching them still requires Apex auth |

**Deliberately still excluded:** the two credential files above, and four
`apex_bridge_ordercache.json.tmp.*` crash artifacts (~39 MB of truncated duplicates).

---

## Why this matters — the headline

On 5 September 2026 a defect was recorded: **the platform cannot say which packages were sold to
a customer.** `v_manifest_ledger` holds 2,921 manifests, 1,509 of them customer sales, but
`v_package_manifest` — the only view mapping package tags to manifests — holds 343 manifests and
**zero** customer sales. Package-level sales attribution and per-package COGS are blocked by it.

**`data/apex_bridge_pkgcache.json` closes a large part of that hole.** Measured against production:

| Check | Result |
|---|---|
| Manifests in the file | **196** |
| Recognised by `v_manifest_ledger` | **196 — 100%** |
| Of those, customer sales | **191** |
| That already have package links in `v_package_manifest` | **0** |
| **New customer-sale package links this supplies** | **191** |

It carries **2,120 distinct 24-character Metrc package tags** across **2,138 tag↔manifest pairs**,
each row already joined to an Apex invoice, a recipient and a recipient licence.

---

## Layout

```
source/manifest-bridge/
  README.md            <- this file, the only one we wrote
  UPSTREAM_README.md   <- the upstream author's README, verbatim
  data/                <- 42 JSON/txt caches, verbatim (44 MB)
  engine/              <- 6 Python modules: the Apex/Metrc engine, verbatim
  app/                 <- 13 Python modules: the FastAPI layer, verbatim
```

### The files that carry real data

| File | Size | What it holds |
|---|---|---|
| **`data/apex_bridge_pkgcache.json`** | 11.9 MB | **The prize.** Keyed by Metrc manifest id → `manifest_number`, `invoice`, `recipient`, `recipient_license`, and `mpkgs[]` where each entry is `package_tag`, `batch_name`, `item_name`, `quantity`, `unit`, plus the full Metrc `raw` payload. |
| `data/apex_bridge_ordercache.json` | 21.7 MB | 256 Apex orders keyed by order id, each with the complete `order` object. |
| `data/metrc_inventory_cache.json` | 3.8 MB | Metrc inventory snapshot. |
| `data/apex_data_cache.json` | 2.6 MB | General Apex cache. |
| `data/apex_inventory.json` | 2.5 MB | Apex-side inventory. |
| `data/metrc_mp_manifests.json` | 1.3 MB | MP281909 manifests, `pulled_at 2026-09-04 11:57`. |
| `data/apex_unpaid_vendors.json` | 62 KB | Unpaid vendor positions. |
| `data/apex_manifest_links.json` | 858 B | ~10 **manual** order→manifest links a human made by hand. Small but high-value: these are decisions no algorithm reproduced. |
| `data/metrc_linked_tags.json` / `metrc_posted_tags.json` | ~2 KB each | 57 and 53 order-line → package-tag overrides. |
| `data/apex_net_terms.json`, `apex_invoice_floor.json`, `apex_delivery_notes.json`, `apex_seller_company.json`, `apex_pack_stats.json` | small | Terms, price floors, delivery notes, seller mapping, pack statistics. |

### The engine — how it talks to Apex and Metrc

`engine/apex_core.py` (9.7 KB) is the Apex client. `engine/slc.py` (430 KB) and
`engine/planner.py` (139 KB) are the matching and planning logic. `engine/stshim.py` fakes
Streamlit so the engine runs headless. `app/*.py` is the FastAPI layer over it —
`bridge.py`, `inventory.py`, `metrctools.py`, `labtools.py`, `picking_full.py`, `picksheet.py`,
`review.py`, `blast.py`, `ai.py`.

**Read `engine/apex_core.py` before writing any new Apex client.** It is working code against
the live API and it settles questions the OpenAPI spec in `docs/vendor/` does not.

---

## DELIBERATELY NOT IMPORTED

**Two credential files were excluded and must never be committed:**

- `backend/engine/.streamlit/secrets.toml` (816 B) — Graph / email secrets
- `backend/data/bapi_session.json` (2.8 KB) — a live session token

They remain in the owner's zip only. This repository syncs, so a credential committed here is a
credential published. If the engine is ever run from this repo, supply those out of band.

**Four incomplete writes excluded** (~39 MB): `apex_bridge_ordercache.json.tmp.*`. They are
crash artifacts from a partial save — truncated copies of the ordercache, not extra data.
Including them would put four half-written duplicates of the same file in the repository.

`node_modules`, `.venv`, `__pycache__` and the Next.js frontend were not imported: 52,153 files
and 1.5 GB, almost all of it third-party dependencies.

---

## Trust boundary

**This is a THIRD-PARTY CACHE, not a source of record.** Metrc remains the legal record; Apex
remains the sales source of record. Everything here was written by another application at a
point in time — `metrc_mp_manifests.json` says `pulled_at 2026-09-04`, and the caches will drift
from live from the day they were copied.

Use it to **discover** links and to **cross-check**. Never load a figure from here into a view
that reports as fact without deriving it a second way. It is exactly the kind of file that
produced traps A1, B2 and C1 in `brain/DATA_TRAPS_REGISTER.md`.

Related: `brain/BRIEF_FOR_GROK_2026-09-05.md` §6 (the defect this addresses),
`docs/vendor/APEX_API_MANUAL.md`, `docs/vendor/apex-openapi-1.0.0.json`.
