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

import { writeFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { SECRET_PATTERNS } from './checks/secret-scan.mjs';

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

// THE MIRROR MUST NEVER WRITE A CREDENTIAL TO DISK.
//
// On 12 Aug 2026 this script mirrored 89 migrations and five of them carried live secrets — two
// edge-function admin keys and a signed storage URL — recorded verbatim in schema_migrations
// because the original migration was written with the literal in it. They were committed and
// pushed before check:secrets caught them at the Netlify build.
//
// Gitignoring them was not enough: this script still WROTE them, and the scanner reads the
// filesystem, not git. So every run recreated the exposure and failed the build again. A file
// that keeps coming back is not a file to keep deleting — it is a writer to fix.
//
// IT USES THE PROJECT'S OWN PATTERNS, NOT A SECOND COPY. My first attempt at this hand-rolled a
// list here — and it still missed three of the five, because an edge-function admin key is
// neither a JWT nor a Postgres URI and my guesses did not cover it. Two definitions of "what a
// credential looks like" is the same defect as eleven definitions of "which column holds a tag":
// count the definitions, more than one is the bug. SECRET_PATTERNS is the one definition, it is
// what the gate enforces, and improving it improves both at once.
//
// When it matches, this SKIPS the file. A missing mirror is a provenance gap someone notices; a
// leaked key is a credential someone replays.
// One definition, imported. See the note above.

let written = 0, present = 0, diverged = 0, unnamed = 0, withheld = 0;
for (const r of rows) {
  if (!r.name || !Array.isArray(r.statements) || r.statements.length === 0) { unnamed++; continue; }
  const file = resolve(dir, `${r.version}_${r.name}.sql`);
  const body = r.statements.join(';\n\n') + ';\n';

  const shape = SECRET_PATTERNS.find((p) => {
    const m = body.match(p.re);
    return m && !(p.ignore && p.ignore(m));   // an anon key is public by design, not a finding
  });
  if (shape) {
    withheld++;
    // Never print the value, and never print enough of the pattern to reconstruct it.
    console.warn(
      `WITHHELD (carries a credential, not written): ${r.version}_${r.name}.sql\n` +
      `    The recorded statements contain a secret. Rotate it, scrub the statements in\n` +
      `    supabase_migrations.schema_migrations, then re-run to mirror the file.\n` +
      `    Standing cases and the full reasoning: docs/WITHHELD_MIGRATIONS.md`
    );
    // If a previous run already wrote it, take it back off disk.
    if (existsSync(file)) { try { unlinkSync(file); console.warn(`    removed the copy a previous run left behind.`); } catch { /* report only */ } }
    continue;
  }
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

// THE SUMMARY MUST RECONCILE, OR IT IS NOT A SUMMARY.
//
// `withheld` was counted and never printed, so a run that refused to mirror three migrations
// reported "936 applied · 933 already in repo · 0 newly mirrored · 40 diverged · 0 unnamed" and
// left the reader to notice that 933 is not 936 on their own. Nobody did. Those three -
// 20260805154324, 20260805173721, 20260807224411 - have been absent from the repository since
// 5 and 7 Aug, and the WITHHELD warnings explaining why scrolled past every operator who ran
// this. The gap this tool exists to close was reported as closed.
//
// It is also why "Repo is complete against the live database" must not be said while anything
// is withheld: the repo is INCOMPLETE and the reason is recoverable, which is the one case
// where saying so matters most.
console.log(
  `\n${rows.length} applied migrations in the database · ${present} already in repo · ` +
  `${written} newly mirrored · ${diverged} diverged (left alone) · ${unnamed} unnamed/empty skipped · ` +
  `${withheld} WITHHELD carrying a credential.\n` +
  (withheld
    ? `INCOMPLETE: ${withheld} migration(s) cannot be mirrored until the credential in their\n` +
      'recorded statements is rotated and supabase_migrations.schema_migrations is scrubbed.\n' +
      'Until then production is running SQL this repository does not contain.'
    : written ? 'Review git status and commit the new files BY NAME - never sweep another agent’s work.' :
                'Repo is complete against the live database.')
);
process.exit(0);
