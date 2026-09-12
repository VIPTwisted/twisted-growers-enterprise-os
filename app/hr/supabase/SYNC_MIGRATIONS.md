# Migration mirror — sync runbook (HR platform)

The **live Supabase database is the source of truth** and is always deployed. This
`supabase/migrations/` folder is a *mirror* (version control / local dev / disaster recovery).
It was created 2026-07-15, so only this session's migrations are mirrored — pull the rest with
the Supabase CLI.

Supabase project ref: **`zsmdejhgdyyaakqsjhmk`**

## One-time
```bash
npm i -g supabase       # or use: npx supabase
supabase login
```

## Sync
```bash
./supabase/sync-migrations.sh          # link + db pull + commit + push
# …or manually:
supabase link --project-ref zsmdejhgdyyaakqsjhmk
supabase db pull
git add supabase/migrations && git commit -m "chore(db): sync migration mirror" && git push
```

## Note
`supabase db pull` will write every migration that exists in the DB but not in this folder,
including the full pre-2026-07-15 history. This session's 5 migrations (`20260715…`) are already
mirrored.
