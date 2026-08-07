# Edge Function Recovery Manifest

**Recovered 7 Aug 2026 by Agent D's recovery task.** All 20 deployed Supabase Edge Functions
(project `fxetuqjryttnypgepsru`) were pulled from the live deployment into this directory.
**The LIVE deployment remains the source of record** until each file has been diffed and
redeployed from the repo — **do not blind-redeploy** anything from here.

Each `index.ts` carries a recovery header naming the deployed version it was taken from.
Line counts are approximate (non-blank lines, including the 2-line recovery header).

| slug | deployed version | verify_jwt | approx lines | one-line purpose | redactions |
|---|---|---|---|---|---|
| metrc-sync | v15 | true | 336 | Pulls Metrc packages/harvests/plants/plant-batches/transfers/items/strains/locations/sales per licence into `metrc_*` tables with delta cursors and per-licence capability gating | `ADMIN_KEY` literal |
| integration-settings | v3 | false | 47 | Owner/executive endpoint to list and upsert prefixed integration secrets into the `integration_secrets` table | none |
| sheet-sync | v1 | false | 183 | Pulls the finished-goods Google Sheet tabs as CSV and replaces `product_inventory` and `third_party_material` wholesale | none |
| seed-templates | v1 | false | 23 | One-shot seeder: reads `templates_seed.json` from the `seeds` bucket, inserts into `templates`, deletes the file | `KEY` literal |
| seed-tables | v1 | false | 48 | One-shot generic seed loader for allowlisted empty harvest/go-live tables from a JSON file in the `seeds` bucket | `SEED_KEY` literal |
| clickup-sync | v2 | false | 91 | Mirrors ClickUp workspaces, spaces, lists and tasks into `clickup_*` tables using the stored ClickUp token | `ADMIN_KEY` literal |
| clickup-customize | v4 | false | 69 | Creates ClickUp lists (structure names only) in named spaces via the stored token — owner-approved scope | `ADMIN_KEY` literal |
| metrc-probe | v3 | true | 57 | Raw Metrc endpoint probe returning status, body slice or field shape for diagnosis; admin-key gated only | `ADMIN_KEY` literal |
| metrc-report-import | v1 | false | 108 | Lands rows from Metrc report/grid CSV exports; maps items/strains/locations rows into their `metrc_*` tables | `ADMIN_KEY` literal |
| metrc-lab-sync | v1 | false | 101 | Walks tested packages and records per-package lab results plus Certificate of Analysis document links | `ADMIN_KEY` literal |
| metrc-reference-sync | v1 | false | 118 | Syncs Metrc reference data (UoM, employees, item categories, lab test types, waste types) and back-fills transfer delivery recipients | `ADMIN_KEY` literal |
| budz-chat | v3 | true | 114 | In-app AI assistant: builds a context slice from reporting views and calls the Anthropic API with budget cap and usage logging | none |
| sheet-push | v1 | false | 79 | Receives row pushes from a Google Apps Script authenticated by a per-source push token; replaces the `sheet_rows` snapshot | none |
| metrc-documents | v3 | true | 201 | Downloads manifest and COA PDFs from Metrc into the `metrc-documents` bucket and maintains 30-day signed download links | `ADMIN_KEY` literal |
| manifest-parse | v1 | false | 89 | Extracts text from stored manifest PDFs to find customer emails/phones; `?apply=1` writes them to `customers` | `ADMIN_KEY` literal |
| metrc-catalog-sync | v2 | true | 131 | Windowed, paged sync of Metrc items/strains/locations per licence (works around TotalRecords:0 quirk and pageSize-20 cap) | `ADMIN_KEY` literal |
| metrc-lab-backfill | v1 | true | 116 | Resumable per-package lab result backfill driven by the `metrc_lab_backfill` queue table | `ADMIN_KEY` literal |
| metrc-delivery-detail | v1 | true | 76 | Fetches per-transfer delivery detail to fill recipient licence numbers on manifests (licence number, not drifting names) | `ADMIN_KEY` literal |
| coa-extract | v1 | true | 59 | Hands out unread COA documents (GET) and stores externally-parsed certificate values (POST) into `coa_extract` | `ADMIN_KEY` literal |
| report-ingest | v3 | true | 72 | Ingests non-CSV report rows via the DB RPC `tg_import_report_do` with stated-total verification for chunked files | `ADMIN_KEY` literal |

## Redactions

16 files contained the **same** hardcoded literal admin/seed key (values are not recorded here;
the live functions still carry the real value). In every recovered copy the literal was replaced
with `"<REDACTED — lives in Supabase function secrets>"`:

- `metrc-sync/index.ts` — `ADMIN_KEY`
- `seed-templates/index.ts` — `KEY`
- `seed-tables/index.ts` — `SEED_KEY`
- `clickup-sync/index.ts` — `ADMIN_KEY`
- `clickup-customize/index.ts` — `ADMIN_KEY`
- `metrc-probe/index.ts` — `ADMIN_KEY`
- `metrc-report-import/index.ts` — `ADMIN_KEY`
- `metrc-lab-sync/index.ts` — `ADMIN_KEY`
- `metrc-reference-sync/index.ts` — `ADMIN_KEY`
- `metrc-documents/index.ts` — `ADMIN_KEY`
- `manifest-parse/index.ts` — `ADMIN_KEY`
- `metrc-catalog-sync/index.ts` — `ADMIN_KEY`
- `metrc-lab-backfill/index.ts` — `ADMIN_KEY`
- `metrc-delivery-detail/index.ts` — `ADMIN_KEY`
- `coa-extract/index.ts` — `ADMIN_KEY`
- `report-ingest/index.ts` — `ADMIN_KEY`

**Consequence:** a redacted file will NOT run as-is. Before any redeploy, the key must be moved
to a real Supabase function secret (e.g. `TG_ADMIN_KEY` read via `Deno.env.get`) — which is
also the correct fix for the underlying problem: one shared static header key currently
bypasses executive JWT auth on 16 deployed functions.

## Security observations (recorded, not fixed)

- The same literal admin key is a full auth bypass (`x-admin-key` header) on 16 functions,
  including ones that write to the database and read Metrc with production credentials.
- 10 of 20 functions have `verify_jwt=false` at the gateway; most re-check an owner/executive
  JWT in code, but `metrc-probe` and `manifest-parse` accept ONLY the shared admin key, and
  `sheet-push` relies solely on a per-source push token stored in `sheet_sources`.
- All observed Metrc calls are read-only (GET); ClickUp gets structure-only writes
  (`clickup-customize` POST creates lists). No function writes to Metrc.
- `sheet-sync` and `sheet-push` delete-and-replace whole tables on each run.
