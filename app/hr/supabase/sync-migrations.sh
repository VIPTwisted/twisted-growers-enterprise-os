#!/usr/bin/env bash
# One-command migration-mirror sync for the HR platform.
# Prereq: `supabase login` (one-time). See SYNC_MIGRATIONS.md.
set -euo pipefail
REF="zsmdejhgdyyaakqsjhmk"
cd "$(dirname "$0")/.."

echo "→ linking to $REF …"
supabase link --project-ref "$REF"

echo "→ pulling remote schema into supabase/migrations …"
supabase db pull

if git status --porcelain supabase/migrations | grep -q .; then
  git add supabase/migrations
  git commit -m "chore(db): sync migration mirror to live schema"
  git push
  echo "✓ migration mirror synced and pushed."
else
  echo "✓ mirror already up to date — nothing to sync."
fi
