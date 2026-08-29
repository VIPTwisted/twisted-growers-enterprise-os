#!/usr/bin/env node
/* List supabase/migrations/*.sql the way CI sees them: git, not disk.
 *
 * money-grain.mjs used readdirSync. sync-migrations.mjs writes gitignored
 * credential-bearing files back onto disk, so a dirty tree and a clean clone
 * disagree. migration-drift already refused that. This is the shared list.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export function listMigrationSqlFiles(root) {
  const cwd = resolve(root);
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--", "supabase/migrations/*.sql"],
    { cwd, encoding: "utf8" },
  );
  return out
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/^supabase\/migrations\//, ""))
    .filter((name) => name.endsWith(".sql") && !name.includes("/"))
    .sort((a, b) => a.localeCompare(b));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = listMigrationSqlFiles(resolve(new URL("../..", import.meta.url).pathname));
  process.stdout.write(`${files.length}\n`);
}
