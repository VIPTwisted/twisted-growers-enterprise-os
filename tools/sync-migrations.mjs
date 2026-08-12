#!/usr/bin/env node
// tools/sync-migrations.mjs — Agent I, 12 Aug 2026.
//
// OWNER ORDER: "I want Supa, git and Netlify all deploying and syncing together."
//
// THE DRIFT THIS KILLS. Migrations applied through the Supabase MCP land in the LIVE database
// and in supabase_migrations.schema_migrations (name + full statements) — but no file appears
// in supabase/migrations/, so git falls behind the database it claims to describe. Measured
// 12 Aug 2026: 34 migrations applied in one working day, zero mirrored. The same failure class
// as the three edge functions that ran for days with no source in the repo.
//
// WHAT IT DOES. Reads schema_migrations and writes one file per applied migration the repo is
// missing: supabase/migrations/<version>_<name>.sql, content = the recorded statements,
// verbatim. Existing files are NEVER overwritten (the repo copy may carry review commentary;
// divergence is reported, not clobbered). Run it, review `git status`, commit the new files by
// name. Supa → git → Netlify, one direction, no hand-copying.
//
// CONNECTION. Reads SUPABASE_DB_URL from the environment. Locally that comes from the
// gitignored .mcp.json's connection string — NEVER commit it. In CI there is no database and
// this script is NOT part of the gate chain; it is an operator tool.
//
// EXIT CODES. 0 = repo already complete or files written. 1 = cannot connect / cannot write.
// It prints what it did in words — never a bare success.

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set. Take it from the local (gitignored) .mcp.json. Never commit it.');
  process.exit(1);
}

const dir = resolve(process.cwd(), 'supabase', 'migrations');
mkdirSync(dir, { recursive: true });

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows } = await client.query(
  `select version, name, statements
     from supabase_migrations.schema_migrations
    order by version`
);
await client.end();

let written = 0, present = 0, diverged = 0, unnamed = 0;
for (const r of rows) {
  if (!r.name || !Array.isArray(r.statements) || r.statements.length === 0) { unnamed++; continue; }
  const file = resolve(dir, `${r.version}_${r.name}.sql`);
  const body = r.statements.join(';\n\n') + ';\n';
  if (existsSync(file)) {
    present++;
    const onDisk = readFileSync(file, 'utf8');
    // Whitespace-insensitive comparison: the repo copy may be reformatted, not different.
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    if (norm(onDisk) !== norm(body)) {
      diverged++;
      console.warn(`DIVERGED (not overwritten — reconcile by hand): ${r.version}_${r.name}.sql`);
    }
    continue;
  }
  writeFileSync(file, body);
  written++;
  console.log(`written: ${r.version}_${r.name}.sql`);
}

console.log(
  `\n${rows.length} applied migrations in the database · ${present} already in repo · ` +
  `${written} newly mirrored · ${diverged} diverged (left alone) · ${unnamed} unnamed/empty skipped.\n` +
  (written ? 'Review git status and commit the new files BY NAME - never sweep another agent’s work.' :
             'Repo is complete against the live database.')
);
process.exit(0);
