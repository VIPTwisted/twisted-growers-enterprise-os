import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import test from "node:test";
import pg from "pg";

const migration = readFileSync(new URL("../../supabase/migrations/20260912121116_gpt_queue_metrc_quantity_precision_repair.sql", import.meta.url), "utf8");
const retryMigration = readFileSync(new URL("../../supabase/migrations/20260912123148_gpt_metrc_precision_rebuild_statistics.sql", import.meta.url), "utf8");
const marker = "$tg_repair_body$";
const begin = migration.indexOf(marker) + marker.length;
const end = migration.indexOf(marker, begin);
assert.ok(begin >= marker.length && end > begin);
// Exercise the actual queue, hash seal, execution boundary and immutable receipt.
// The full 204-relation repair has a separate preserved rehearsal; this small
// transactional payload deliberately makes failures easy to inject and observe.
const payload = `
alter table public.metrc_packages alter column quantity type numeric;
update public.metrc_packages set quantity=(raw->>'Quantity')::numeric;
create temp table tg_quantity_changed on commit drop as select id from public.metrc_packages;
create temp table tg_quantity_preflight on commit drop as select x from generate_series(1,204) x;
create view public.precision_fixture_view as select quantity from public.metrc_packages;
`;

for (const attempt of [1, 2]) test(`Metrc precision attempt ${attempt} retains atomic repair and durable failure evidence`, async t => {
  let client, admin, database, embedded;
  if (process.env.PRECISION_TEST_PGLITE_MODULE) {
    assert.ok(!process.env.CI, "CI must run native PostgreSQL");
    const { PGlite } = await import(pathToFileURL(process.env.PRECISION_TEST_PGLITE_MODULE).href);
    embedded = new PGlite();
    client = { query: (s, p) => p ? embedded.query(s, p) : embedded.exec(s).then(r => r.at(-1)) };
  } else {
    assert.ok(process.env.PRECISION_TEST_PGURL, "PRECISION_TEST_PGURL must identify a disposable test service");
    const url = new URL(process.env.PRECISION_TEST_PGURL);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Refusing a non-loopback fixture database");
    admin = new pg.Client({ connectionString: url.href }); await admin.connect();
    database = `precision_job_fixture_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`create database ${database}`); url.pathname = `/${database}`;
    client = new pg.Client({ connectionString: url.href }); await client.connect();
  }
  const q = (s, p) => client.query(s, p);
  const scalar = async s => (await q(s)).rows[0].result;
  const runner = attempt === 1 ? "run_metrc_precision" : "run_metrc_precision_v2";
  const getter = attempt === 1 ? "metrc_precision_sql" : "metrc_precision_sql_v2";
  const run = () => scalar(`select tg_maintenance.${runner}() result`);
  const state = () => scalar(`select jsonb_build_object(
    'type',(select format_type(atttypid,atttypmod) from pg_attribute where attrelid='metrc_packages'::regclass and attname='quantity'),
    'rows',(select jsonb_agg(to_jsonb(p) order by id) from metrc_packages p),
    'view',to_regclass('public.precision_fixture_view')::text) result`);
  const reset = async (fault = "", expired = false) => {
    await q("drop schema if exists tg_maintenance cascade; drop view if exists precision_fixture_view; drop table if exists metrc_packages; delete from cron.job;");
    await q("create table metrc_packages(id int primary key,quantity numeric(14,3),raw jsonb); insert into metrc_packages select x,1.234,'{\"Quantity\":1.2345}'::jsonb from generate_series(1,6) x;");
    let template = migration;
    if (attempt === 2) {
      const previousFault = `do $$ begin raise exception 'Precision final check timed out at "public"."v_dept_dash_cfo"'; end $$;`;
      await q(migration.slice(0, begin) + payload + previousFault + migration.slice(end));
      const prior = await scalar("select tg_maintenance.run_metrc_precision() result");
      assert.equal(prior.status, "failed");
      assert.match(prior.error, /Precision final check timed out/);
      template = retryMigration;
    }
    const first = template.indexOf(marker) + marker.length;
    const last = template.indexOf(marker, first);
    let sql = template.slice(0, first) + payload + fault + template.slice(last);
    if (expired) sql = sql.replace("clock_timestamp()+interval '20 minutes'", "clock_timestamp()-interval '1 minute'");
    await q(sql);
  };
  try {
    for (const role of ["anon", "authenticated", "service_role"]) await q(`do $$ begin create role ${role}; exception when duplicate_object then null; end $$`);
    await q(`create schema cron;
      create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text);
      create function cron.schedule(text,text,text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid $$;
      create function cron.unschedule(text) returns boolean language sql as $$ with removed as(delete from cron.job where jobname=$1 returning 1) select exists(select 1 from removed) $$;`);

    await t.test("successful repair is scheduled once, private, exact and immutable", async () => {
      await reset();
      assert.equal(await scalar("select count(*)::int result from cron.job"), 1);
      assert.match(await scalar("select command result from cron.job"), /statement_timeout='15min'/);
      for (const role of ["anon", "authenticated", "service_role"]) {
        await q(`set role ${role}`);
        try { await assert.rejects(run, /permission denied/); } finally { await q("reset role"); }
      }
      const result = await run();
      assert.equal(result.status, "completed", result.error);
      assert.equal(result.receipt.quantity_type, "numeric");
      assert.equal(result.receipt.repaired_rows, 6);
      assert.equal(result.receipt.verified_dependencies, 204);
      assert.equal(result.receipt.remaining_source_quantity_mismatches, 0);
      assert.equal(await scalar("select count(*)::int result from cron.job"), 0);
      assert.deepEqual(await run(), result);
      for (const sql of ["update tg_maintenance.metrc_quantity_precision_run set error='erased'", "delete from tg_maintenance.metrc_quantity_precision_run", "truncate tg_maintenance.metrc_quantity_precision_run"]) await assert.rejects(() => q(sql), /immutable/);
      await q("insert into metrc_packages values(7,0.000000123456789,'{\"Quantity\":0.000000123456789}')");
      assert.equal(await scalar("select quantity::text result from metrc_packages where id=7"), "0.000000123456789");
    });
    for (const code of ["P0001", "57014"]) await t.test(`${code} after DDL and data changes rolls back the repair and keeps terminal failure`, async () => {
      await reset(`do $$ begin raise exception 'fixture failure after repair' using errcode='${code}'; end $$;`);
      const before = await state(); const result = await run();
      assert.equal(result.status, "failed"); assert.match(result.error, new RegExp(code));
      assert.deepEqual(await state(), before);
      assert.equal(await scalar("select count(*)::int result from cron.job"), 0);
      assert.deepEqual(await run(), result);
      await assert.rejects(() => q("update tg_maintenance.metrc_quantity_precision_run set status='pending'"), /immutable/);
    });
    await t.test("expired work cannot start", async () => {
      await reset("", true); const before = await state();
      assert.equal((await run()).status, "expired"); assert.deepEqual(await state(), before);
      assert.equal(await scalar("select count(*)::int result from cron.job"), 0);
    });
    await t.test("changed SQL or job identity cannot replace the sealed repair", async () => {
      await reset(); const before = await state();
      await assert.rejects(() => q("update tg_maintenance.metrc_quantity_precision_run set repair_sha256='replacement' where status='pending'"), /identity is immutable/);
      await q(`create or replace function tg_maintenance.${getter}() returns text language sql immutable set search_path=pg_catalog as $$ select 'select 1'::text $$`);
      assert.match((await run()).error, /hash changed/); assert.deepEqual(await state(), before);
    });
    await t.test("receipt refuses an incomplete repair", async () => {
      await reset("delete from pg_temp.tg_quantity_changed where id=6;"); const before = await state();
      const result = await run(); assert.equal(result.status, "failed"); assert.match(result.error, /does not reconcile/);
      assert.deepEqual(await state(), before);
    });
    await t.test("second attempt refuses an unresolved predecessor or an existing retry", async () => {
      await reset(); const before = await state();
      await assert.rejects(() => q(retryMigration), attempt === 1 ? /Previous precision attempt/ : /Second precision attempt already exists/);
      assert.deepEqual(await state(), before);
    });
  } finally {
    if (embedded) await embedded.close();
    else { if (client) await client.end(); if (admin) { if (database) await admin.query(`drop database ${database}`); await admin.end(); } }
  }
});
