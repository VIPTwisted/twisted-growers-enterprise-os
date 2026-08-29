# money-grain must read git

Status: helper landed on `grok/money-grain-reads-git` off `5101b42`. **Do not merge until harvest is on main.**

## Why
`tools/checks/money-grain.mjs` does `readdirSync(supabase/migrations)`. CI checks out git. A desktop that ran `sync-migrations.mjs` has extra gitignored credential SQL. That is the 973 vs 974 pin failure (Gates run 446, #93).

## Wire (B, after harvest PR exists or is merged)
In `tools/checks/money-grain.mjs`:

1. Drop `readdirSync` from the fs import if unused.
2. `import { listMigrationSqlFiles } from "../lib/migration-tree-files.mjs";`
3. Replace
   `const files = readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();`
   with
   `const files = listMigrationSqlFiles(root);`

Digest stays. Same 977 files on a clean clone of `5101b42`. Dirty disks stop changing the count.

Do not re-pin in the same commit unless harvest already added files.
