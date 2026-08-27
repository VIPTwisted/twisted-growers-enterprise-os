# Withheld migrations — applied to production, cannot be filed

**Measured 26 August 2026 against `fxetuqjryttnypgepsru`. Owner ruling the same day: names only, and they stay unfiled.**

**Four** migrations ran in production and have no file in this repository, because their
recorded statements in `supabase_migrations.schema_migrations` carry live credentials.

```
20260805154324  metrc_auto_sync_schedule                      withheld by the mirror
20260805173721  metrc_reference_tables_and_schedule           withheld by the mirror
20260807224411  permanent_document_urls_no_expiry_anywhere    withheld by the mirror
20260805215014  vincent_user_and_ai_budget                    gitignored by name
```

They are excluded two different ways, and the difference matters. The first three trip
`SECRET_PATTERNS`, so `tools/sync-migrations.mjs` refuses to write them at all. The fourth
does **not** trip the patterns — the mirror writes it to disk on every run — and it is kept
out of the repository by name in `.gitignore` instead.

So a machine that has run the mirror has one more file in `supabase/migrations/` than a
clean clone does. That is not cosmetic: `tools/checks/money-grain.mjs` seals the migration
tree by reading the **directory**, so the two disagree on the digest. It turned the Netlify
build red on 26 Aug, when a re-pin was measured on a working tree instead of on a clean
checkout. Measure that digest in a fresh clone, never in a tree where the mirror has run.

## No SQL lives in this file, and none may be added to it

This directory has a sibling, `docs/rejected-migrations/`, which holds the *body* of
migrations that were rejected. That convention is deliberately **not** followed here.
A rejected migration is safe to keep because it never ran; these four ran, and the
reason they cannot be filed is the very thing a file would contain.

`tools/hooks/guard-secrets.mjs` blocks a credential-bearing body from reaching disk
whatever the intent, and it is right to. Do not work around it to "complete the record".
The record is the four names above.

## Why nobody noticed for three weeks

The mirror printed a `WITHHELD` warning for each one on every run, and then its own
summary line contradicted it:

```
936 applied migrations in the database · 933 already in repo · 0 newly mirrored ·
40 diverged (left alone) · 0 unnamed/empty skipped.
Repo is complete against the live database.
```

`withheld` was counted and never printed. So the run said the repository was complete
while holding back three files, and left the reader to notice unaided that 933 is not
936. Nobody did. Every operator who ran the tool got a refusal, saw a green summary,
and moved on.

Fixed in the same commit that created this file: the summary now prints the withheld
count and refuses to claim completeness while anything is held back.

## What it costs while it stands

Production is running SQL this repository does not contain. `supabase db reset` from a
clean clone will not reproduce production, and the reasoning behind these three
migrations exists nowhere but the ledger.

It does **not** currently turn `migration-drift` red. All three predate the newest
baseline dump, and a full schema dump genuinely puts production's *shape* into the
repository, so the squash covers them. The shape is filed. The provenance is not.

## What would close it

Not a code change. In order:

1. Rotate the credential each migration embeds — until that happens the value is live
   in the ledger regardless of what this repository holds.
2. Scrub the statements in `supabase_migrations.schema_migrations` for those three
   versions.
3. Re-run `node tools/sync-migrations.mjs`. With the secret gone the patterns no longer
   match, the three files are written, and this document is deleted rather than edited.

Step 1 is a production credential operation and needs the owner. Steps 2 and 3 follow
from it and are mechanical.

## Related

- `tools/lib/db.mjs` — why the gates that should have surfaced this could not run at all.
- `tools/checks/migration-drift.baseline.json` — the `missing: 0` ratchet, and why the
  squash forgives anything older than the newest dump.
- PR #16 — the drift census this came out of.
