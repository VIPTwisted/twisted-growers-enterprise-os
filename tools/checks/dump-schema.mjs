#!/usr/bin/env node
/* PHASE 0 — make the schema reproducible.
 *
 * THE PROBLEM THIS SOLVES. The repository holds 6 migration files describing 4 tables. The live
 * database holds 229 tables, 225 views, 514 RLS policies and 30 cron jobs. So the schema exists
 * in exactly ONE place: production, of a licensed business.
 *
 * That is the real blocker under "no staging environment". Docker is incidental — even a paid
 * Supabase branch seeds from migration history, so it would come up nearly empty too. Nothing can
 * be tested anywhere else until the schema can be rebuilt from the repo.
 *
 * WHY THIS EXISTS RATHER THAN `supabase db dump`. That command needs Docker, and Docker Desktop on
 * this machine fails to start on stale socket reparse points that Windows cannot delete. This
 * needs only the pg driver, so recoverability no longer depends on a container runtime starting.
 *
 * WHAT IT WRITES. supabase/migrations/<timestamp>_baseline_live_schema.sql containing, in
 * dependency order: extensions, enums, tables, constraints, indexes, functions, views,
 * materialized views, RLS enablement, policies, grants and cron jobs.
 *
 * IT IS READ-ONLY. It only ever SELECTs from catalogues. It cannot modify the database.
 *
 * CREDENTIALS. Read from .mcp.json (gitignored) or PGURL. Never printed, never written into the
 * output file.
 *
 *   node tools/checks/dump-schema.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function connectionString() {
  if (process.env.PGURL) return process.env.PGURL;
  const p = join(ROOT, ".mcp.json");
  if (!existsSync(p)) {
    console.error("No PGURL set and no .mcp.json found. Cannot connect.");
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(p, "utf8"));
  const url = cfg?.mcpServers?.["twisted-growers"]?.args?.[0];
  if (!url) { console.error("No connection string in .mcp.json"); process.exit(1); }
  /* pg 8.22+ treats sslmode=require as verify-full, and Supabase's pooler certificate is not in
     the default Node trust store, so a plain 'require' fails with "self-signed certificate in
     certificate chain". uselibpqcompat restores libpq semantics: the connection is still
     ENCRYPTED, the certificate chain simply is not verified. Acceptable for a read-only dump to
     a known host; not a pattern to copy into anything that writes. */
  return url.replace(/sslmode=[a-z-]+/, "uselibpqcompat=true&sslmode=require");
}

/* WHY THIS DIED, AND WHAT IT WAS NOT. Diagnosed 12 Aug 2026.
 *
 * The dump printed "connected (read-only dump)" and then died with "Connection terminated
 * unexpectedly". Three plausible causes were ruled out by measurement, not by guessing:
 *
 *   NOT credentials  - schema-baseline-fresh.mjs reads live counts on the same string.
 *   NOT statement_timeout - that returns an ERROR ("canceling statement..."). A dead socket
 *                      with no server message means the BACKEND went away mid-query.
 *   NOT pooler idle-drop - keepAlive was added first and changed nothing, because the
 *                      connection was never idle. It was busy killing itself.
 *
 * THE ACTUAL CAUSE was the VIEWS section's recursive CTE. It walked the view dependency graph
 * with UNION ALL and no de-duplication, which enumerates every distinct PATH through the graph
 * rather than every node. pg_depend carries one row per referenced COLUMN, so the 278 real
 * edges between our 484 views appear as 2,037 traversable edges. Measured row counts per level
 * on 12 Aug 2026:
 *
 *      depth 0:        484        depth 3:     55,357
 *      depth 1:      2,037        depth 4:    112,766
 *      depth 2:     12,125        depth 5:    276,503
 *
 * That is a ~2.5-6x multiplier per level against a cap of `depth < 12`, i.e. of the order of
 * 10^9 rows in the recursive working table. The backend exhausts memory and is killed; the
 * client sees a socket close with no message. At 225 views this query was survivable, so it
 * worked for months and then stopped - the query did not change, the schema grew into it.
 *
 * THE FIX, and note it captures MORE, not less:
 *   1. Collapse pg_depend's per-column rows to a DISTINCT edge set (2,037 -> 278).
 *   2. UNION, not UNION ALL, in the recursive term. Rows are (oid, depth), so the working
 *      table is bounded by nodes x maxdepth = 484 x 13 = 6,292. `max(depth) group by` gives
 *      byte-identical output either way - duplicate paths never changed the answer.
 *   3. Constrain the CONSUMER side to the public schema. The old recursion did not, so a view
 *      in another schema could enter the result and then be emitted as `public.<name>`.
 *   4. One query for all view definitions instead of 2 round trips per view (968 -> 1).
 *
 * AND SO IT CANNOT COME BACK SILENTLY: every step is named and timed, a failure reports WHICH
 * step died rather than one bare driver message, and the view count is asserted against
 * pg_class before the file is written. A dump that quietly captures fewer views than exist is
 * the exact defect this whole file was built to end - a 6-file baseline once described 4
 * tables while production held 244.
 */
const client = new pg.Client({
  connectionString: connectionString(),
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120000,
  query_timeout: 120000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  connectionTimeoutMillis: 30000,
  application_name: "tg-dump-schema",
});

/* A pg Client emits 'error' as an EventEmitter event when the socket dies underneath it. With
   no listener, Node treats that as an unhandled 'error' event and terminates the process on the
   spot - so the whole diagnostic catch block below never ran, for precisely the failure it was
   written to explain. The in-flight query promise still rejects, so this listener only has to
   exist for the rejection to reach the catch. */
let socketDeath = null;
client.on("error", (e) => { socketDeath = e; });

/* Every catalogue read goes through here so that no query can fail anonymously. */
let step = "startup";
const timings = [];
const q = async (c, sql, params) => {
  const t0 = Date.now();
  try {
    const { rows } = await c.query(sql, params);
    timings.push({ step, ms: Date.now() - t0, rows: rows.length });
    return rows;
  } catch (e) {
    e.tgStep = step;
    e.tgSql = sql.trim().split("\n")[0].slice(0, 120);
    e.tgMs = Date.now() - t0;
    throw e;
  }
};

const out = [];
const section = (t) => {
  step = t.split(" —")[0].split(" -")[0].trim();
  console.log(`  ${step}`);
  out.push(`\n-- ${"=".repeat(74)}\n-- ${t}\n-- ${"=".repeat(74)}\n`);
};
const done = () => {};   // sections report through `timings`, printed at the end and on failure

try {
  await client.connect();
  console.log("connected (read-only dump)");

  out.push("-- BASELINE SCHEMA, extracted from the live database.");
  out.push("-- Generated by tools/checks/dump-schema.mjs. Do not hand-edit.");
  out.push("-- This file exists so the schema can be rebuilt somewhere that is not production.");

  section("EXTENSIONS");
  for (const r of await q(client, `
    select 'create extension if not exists ' || quote_ident(extname) ||
           ' with schema ' || quote_ident(n.nspname) || ';' as ddl
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where extname <> 'plpgsql' order by extname`)) out.push(r.ddl);

  section("ENUM TYPES");
  for (const r of await q(client, `
    select 'create type public.' || quote_ident(t.typname) || ' as enum (' ||
           string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) || ');' as ddl
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
    group by t.typname order by t.typname`)) out.push(r.ddl);

  section("TABLES");
  const tables = await q(client, `
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' order by c.relname`);
  for (const { relname } of tables) {
    const cols = await q(client, `
      select column_name, data_type, udt_name, is_nullable, column_default,
             character_maximum_length, numeric_precision, numeric_scale
      from information_schema.columns
      where table_schema='public' and table_name=$1 order by ordinal_position`, [relname]);
    const defs = cols.map((c) => {
      let t = c.data_type === "USER-DEFINED" ? `public.${c.udt_name}`
            : c.data_type === "ARRAY" ? `${c.udt_name.replace(/^_/, "")}[]`
            : c.data_type === "character varying" && c.character_maximum_length
              ? `varchar(${c.character_maximum_length})`
            : c.data_type === "numeric" && c.numeric_precision
              ? `numeric(${c.numeric_precision},${c.numeric_scale ?? 0})`
            : c.data_type;
      let s = `  ${JSON.stringify(c.column_name).replace(/"/g, '"')} ${t}`;
      if (c.column_default) s += ` default ${c.column_default}`;
      if (c.is_nullable === "NO") s += " not null";
      return s;
    });
    out.push(`create table if not exists public.${relname} (\n${defs.join(",\n")}\n);`);
  }

  section("CONSTRAINTS — primary keys, uniques, foreign keys, checks");
  for (const r of await q(client, `
    select 'alter table public.' || quote_ident(rel.relname) ||
           ' add constraint ' || quote_ident(con.conname) || ' ' ||
           pg_get_constraintdef(con.oid) || ';' as ddl
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace and n.nspname='public'
    order by case con.contype when 'p' then 1 when 'u' then 2 when 'f' then 3 else 4 end,
             rel.relname, con.conname`)) out.push(r.ddl);

  section("INDEXES");
  for (const r of await q(client, `
    select indexdef || ';' as ddl from pg_indexes
    where schemaname='public'
      and indexname not in (select conname from pg_constraint where contype in ('p','u'))
    order by tablename, indexname`)) out.push(r.ddl);

  section("FUNCTIONS");
  for (const r of await q(client, `
    select pg_get_functiondef(p.oid) || ';' as ddl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and not exists (select 1 from pg_depend d
                      where d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e')
    order by p.proname`)) out.push(r.ddl);

  section("VIEWS — created in dependency order");
  const views = await q(client, `
    with recursive edges as (
      /* DISTINCT is load-bearing: pg_depend records one row per referenced COLUMN, so without
         it the 278 real edges between our views present as 2,037 and the walk below explodes. */
      select distinct rw.ev_class as consumer, dep.refobjid as producer
      from pg_depend dep
      join pg_rewrite rw on rw.oid = dep.objid
      join pg_class  pc on pc.oid = dep.refobjid and pc.relkind in ('v','m')
      join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
      join pg_class  cc on cc.oid = rw.ev_class    and cc.relkind in ('v','m')
      join pg_namespace cn on cn.oid = cc.relnamespace and cn.nspname = 'public'
      where rw.ev_class <> dep.refobjid
    ),
    deps as (
      select c.oid, 0 as depth
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('v','m')
      union                       -- NOT "union all"; see the header note. Bounds the walk.
      select e.consumer, d.depth + 1
      from deps d join edges e on e.producer = d.oid
      where d.depth < 12
    ),
    ranked as (select oid, max(depth) as depth from deps group by oid)
    select c.relname, c.relkind::text as kind, r.depth,
           pg_get_viewdef(c.oid, true) as def
    from ranked r join pg_class c on c.oid = r.oid
    order by r.depth, c.relname`);

  for (const v of views) {
    out.push(v.kind === "m"
      ? `create materialized view if not exists public.${v.relname} as\n${v.def}`
      : `create or replace view public.${v.relname} as\n${v.def}`);
  }
  done();

  /* COMPLETENESS ASSERTION. The dump is a recoverability artefact: a thin one is worse than a
     missing one, because a thin one looks like success. If the dependency walk ever loses a
     view again, this stops the run and NAMES what was lost, rather than writing a short file
     that passes every downstream check. */
  step = "VIEWS completeness assertion";
  const missing = await q(client, `
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v','m')
      and not (c.relname = any($1::text[]))
    order by c.relname`, [views.map((v) => v.relname)]);
  if (missing.length) {
    throw new Error(
      `dependency walk lost ${missing.length} view(s) that exist in pg_class — ` +
      `refusing to write a thin baseline. Missing: ${missing.map((m) => m.relname).join(", ")}`);
  }

  section("ROW LEVEL SECURITY");
  for (const r of await q(client, `
    select 'alter table public.' || quote_ident(c.relname) ||
           ' enable row level security;' as ddl
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity order by c.relname`)) out.push(r.ddl);

  section("POLICIES");
  for (const r of await q(client, `
    select 'create policy ' || quote_ident(p.polname) || ' on public.' || quote_ident(c.relname) ||
           ' as ' || case when p.polpermissive then 'permissive' else 'restrictive' end ||
           ' for ' || case p.polcmd when 'r' then 'select' when 'a' then 'insert'
                                    when 'w' then 'update' when 'd' then 'delete' else 'all' end ||
           ' to ' || coalesce((select string_agg(quote_ident(pg_get_userbyid(r)), ', ')
                               from unnest(p.polroles) r where r <> 0), 'public') ||
           coalesce(' using (' || pg_get_expr(p.polqual, p.polrelid) || ')', '') ||
           coalesce(' with check (' || pg_get_expr(p.polwithcheck, p.polrelid) || ')', '') || ';' as ddl
    from pg_policy p join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    order by c.relname, p.polname`)) out.push(r.ddl);

  section("GRANTS — application roles only");
  for (const r of await q(client, `
    select 'grant ' || string_agg(distinct privilege_type, ', ') || ' on public.' ||
           quote_ident(table_name) || ' to ' || quote_ident(grantee) || ';' as ddl
    from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated','service_role')
    group by table_name, grantee order by table_name, grantee`)) out.push(r.ddl);

  /* Optional sections. The dump must NOT fail wholesale because one part is inaccessible - a
     read-only role cannot see the cron schema, and losing 229 tables of DDL over that would be
     absurd. Each records why it is absent rather than leaving a silent gap (rule A3). */
  section("SCHEDULED JOBS — cron. Review before running anywhere but production.");
  let jobs = "not readable";
  try {
    const rows = await q(client, `
      select '-- select cron.schedule(' || quote_literal(coalesce(jobname,'job'||jobid)) || ', ' ||
             quote_literal(schedule) || ', ' || quote_literal(command) || ');' as ddl
      from cron.job order by jobid`);
    rows.forEach((r) => out.push(r.ddl));
    jobs = String(rows.length);
  } catch (e) {
    out.push(`-- NOT CAPTURED: ${e.message.trim()}`);
    out.push("-- The dumping role cannot read the cron schema. Re-run with a role that can, or");
    out.push("-- recreate schedules by hand. Absence recorded rather than left silent (rule A3).");
    console.warn("  cron jobs not captured:", e.message.trim());
  }

  const counts = (await q(client, `
    select (select count(*) from pg_tables where schemaname='public') tables,
           (select count(*) from pg_views  where schemaname='public') views,
           (select count(*) from pg_matviews where schemaname='public') matviews,
           (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
            join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') policies`))[0];
  counts.jobs = jobs;

  /* Record what was captured, machine-readably, so schema-baseline-fresh.mjs can compare this
     file against the live database instead of only checking its age. A baseline that merely
     LOOKS recent is not recoverability - on 8 Aug 2026 the age check passed at 22h old while
     production had moved 244 -> 260 tables and 539 -> 567 policies underneath it. */
  out.splice(3, 0,
    `-- BASELINE COUNTS: tables=${counts.tables} views=${counts.views} ` +
    `matviews=${counts.matviews} policies=${counts.policies}`);

  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const dir = join(ROOT, "supabase", "migrations");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${ts}_baseline_live_schema.sql`);
  writeFileSync(file, out.join("\n") + "\n");

  console.log(`wrote ${file}`);
  console.log(`  ${counts.tables} tables · ${counts.views} views · ${counts.matviews} matviews`);
  console.log(`  ${counts.policies} policies · ${counts.jobs} cron jobs (commented out)`);
  console.log(`  ${(out.join("\n").length / 1024).toFixed(0)} KB`);

  /* The three slowest steps, always. A step that is quietly creeping toward the timeout is the
     early warning that this file did not get in 2026 - the VIEWS walk went from survivable to
     fatal with no signal at all, because nothing was ever timed. */
  const slow = [...timings].sort((a, b) => b.ms - a.ms).slice(0, 3);
  console.log(`  slowest steps: ${slow.map((t) => `${t.step} ${(t.ms / 1000).toFixed(1)}s`).join(" · ")}`);
} catch (err) {
  /* NAME THE STEP. A bare "Connection terminated unexpectedly" cost real diagnostic time on
     12 Aug 2026 because it did not say which of 14 catalogue reads had died. */
  console.error(`\ndump failed during step: ${err.tgStep ?? step ?? "unknown"}`);
  console.error(`  ${err.message}`);
  if (socketDeath && socketDeath.message !== err.message) {
    console.error(`  socket also reported: ${socketDeath.message}`);
  }
  if (err.tgSql) console.error(`  query began: ${err.tgSql}`);
  if (err.tgMs != null) console.error(`  it had been running ${(err.tgMs / 1000).toFixed(1)}s`);
  if (timings.length) {
    console.error("  steps that completed before it:");
    for (const t of timings) console.error(`    ${t.step.padEnd(34)} ${(t.ms / 1000).toFixed(1)}s  ${t.rows} row(s)`);
  }
  if (/terminated unexpectedly|socket hang up|ECONNRESET/i.test(err.message)) {
    console.error(
      "\n  A closed socket with NO server error message means the backend went away mid-query,\n" +
      "  not that credentials or the network are wrong. Look for a catalogue query whose result\n" +
      "  set grew unbounded - that is what happened to the view dependency walk. Do not respond\n" +
      "  by capturing less; find the query and bound it.");
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
