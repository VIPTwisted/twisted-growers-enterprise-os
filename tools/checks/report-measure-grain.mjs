#!/usr/bin/env node
/* A subtotal needs independent canonical measure provenance, a selected live
   proof, complete deterministic rows, and explicit eligibility/null policy. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const ROOT = resolve(import.meta.dirname, "../..");
const APP = readFileSync(resolve(ROOT, "app/web/src/App.jsx"), "utf8");
const POLICY = readFileSync(resolve(ROOT, "app/web/src/lib/report-measure-contract.js"), "utf8");
const MIGRATION_FILE = "20260819224500_report_totals_require_declared_grain.sql";
const MIGRATION = readFileSync(resolve(ROOT, "supabase/migrations", MIGRATION_FILE), "utf8");
const findings = [];
const need = (condition, message) => { if (!condition) findings.push(message); };

need(/certifiedPopulationVerdict[\s\S]*loadedMeasureVerdict[\s\S]*selectReportContract/.test(APP), "ReportScreen bypasses shared population/value-grain policy");
need(/supabase\.rpc\("f_report_registry_runtime",\s*\{\s*p_fact_view:/.test(APP), "runtime proof is not scoped to the selected fact view");
need(/rowsContractDigest/.test(APP) && /contractDigest:\s*reg\?\.contract_digest/.test(APP), "rows can total without a post-read contract digest");
need(/snapshotVerified:\s*reg\?\.population_snapshot_verified/.test(APP), "browser totals do not require a database snapshot receipt");
need(!/snapshotVerified:\s*true/.test(APP), "browser fabricates a database snapshot receipt");
need(/for \(const key of \(Array\.isArray\(reg\?\.grain_keys\) \? reg\.grain_keys : \[\]\)\)/.test(APP),
  "pagination is not deterministically ordered by an explicitly validated grain-key array");
need(/Numeric field verdicts/.test(APP) && /Contract observed at/.test(APP), "first-party exports omit contract and per-field verdicts");
need(/context\.contractDigest/.test(APP) && /context\.snapshotId/.test(APP) && /context\.measureVerdicts/.test(APP), "audit drill omits contract, snapshot, or per-measure verdicts");
need(!/function\s+rpSummable\s*\(/.test(APP), "old numeric-name subtotal heuristic still exists");
need(/canonical_relation/.test(POLICY) && /value_grain_keys/.test(POLICY) && /source_verified/.test(POLICY), "JS trusts report-authored value-grain strings");
need(/forbid_for_eligible/.test(POLICY) && /loadedMeasureVerdict/.test(POLICY), "eligible NULL measures are silently omitted");
need(/canonicalKeyValue/.test(POLICY) && /No loaded rows exist to verify/.test(POLICY), "blank/canonical duplicate or zero-row keys can verify");
need(/create table public\.measure_semantic_registry/i.test(MIGRATION), "canonical measures have no independent registry");
need(/canonical_relation_oid[\s\S]*canonical_definition_md5/.test(MIGRATION), "canonical measure source identity/definition is not sealed");
need(/before insert or update of report_key,fact_view,enabled,measures,row_grain,grain_keys,measure_contracts/i.test(MIGRATION), "report identity can bypass its contract trigger");
need(/security invoker[\s\S]*f_report_registry_runtime\(p_fact_view text\)/i.test(MIGRATION), "runtime is not selected-view SECURITY INVOKER");
need(/nullif\(btrim\(\(%I\)::text\)/.test(MIGRATION), "DB verifier accepts blank or unnormalised grain keys");
need(/row_count=0 then 'REFUSED — no rows to verify'/.test(MIGRATION), "zero rows can be certified");
need(/eligible sum values are incomplete/.test(MIGRATION), "DB verifier ignores missing eligible measure values");
need(/false,null::text,'REFUSED — no snapshot-bound database population receipt exists'/.test(MIGRATION), "runtime can imply a browser population shares one database snapshot");
need(/count\(\*\)<>\(select count\(\*\) from jsonb_object_keys\(r\.measure_contracts\)\)/.test(MIGRATION), "a disabled or missing canonical semantic can false-verify");
need(/order by n\.view_key,n\.role/.test(MIGRATION), "protected role fingerprint is not the canonical ordering");
need(!/\b(drop|truncate)\s+(table|view|materialized\s+view)\b/i.test(MIGRATION), "migration uses destructive relation DDL");

async function setupBase(client) {
  await client.query(`
    do $roles$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
      if not exists(select 1 from pg_roles where rolname='tg_desktop_reader') then create role tg_desktop_reader nologin; end if;
    end $roles$;
    create table public.report_registry(report_key text primary key,title text not null,category text not null,fact_view text not null,
      date_column text,dimensions text[] not null,measures text[] not null,description text not null,owner_note text,enabled boolean not null default true,
      created_at timestamptz default now(),updated_at timestamptz default now());
    alter table public.report_registry enable row level security;
    create policy report_registry_read on public.report_registry for select to authenticated using(true);
    grant select on public.report_registry to authenticated,service_role;
    create table public.nav_registry(view_key text primary key,surface text,category_order integer,item_order integer);
    create table public.nav_role_visibility(role text,view_key text);
    create table public.schema_migrations(version text primary key,name text not null);
    create view public.v_apex_invoice_truth as select * from(values
      ('ORDER-1'::text,100::numeric,false),('ORDER-2'::text,null::numeric,true),('ORDER-3'::text,null::numeric,false)
    )x(apex_order_id,recognized_total_usd,cancelled);
    grant select on public.v_apex_invoice_truth to authenticated,service_role,tg_desktop_reader;
    insert into public.report_registry(report_key,title,category,fact_view,date_column,dimensions,measures,description,owner_note,enabled)
    values('sales.apex_invoice_truth','Apex Invoice Truth — one row per order','Sales','v_apex_invoice_truth',null,'{}',
      array['recognized_total_usd'],'The additive Apex sales surface.',null,true);
    insert into public.report_registry(report_key,title,category,fact_view,date_column,dimensions,measures,description,owner_note,enabled)
    select 'dummy.'||i,'Dummy '||i,'Fixture','v_dummy_'||i,null,'{}',
      case when i=24 then array['m1','m2','m3','m4','m5','m6','m7','m8'] else array['m1','m2','m3'] end,
      'Fixture debt',null,true from generate_series(1,24)i;
  `);
}

async function expectRejected(client, sql, pattern) {
  try { await client.query(sql); return false; }
  catch (error) { return error.code === "P0001" && pattern.test(error.message); }
}

async function runExecutionFixture(connectionString) {
  const admin = new Client({ connectionString });
  const database = `report_grain_fixture_${process.pid}`;
  const parsed = new URL(connectionString); parsed.pathname = `/${database}`;
  const fixture = new Client({ connectionString: parsed.toString() });
  await admin.connect();
  try {
    await admin.query(`create database "${database}"`); await fixture.connect(); await setupBase(fixture);

    await fixture.query("begin");
    await fixture.query("insert into public.schema_migrations values('20260819224500','report_totals_require_declared_grain')");
    await fixture.query(MIGRATION);
    const failedApply = await expectRejected(fixture,
      "update public.report_registry set fact_view='v_dummy_1' where report_key='sales.apex_invoice_truth'",
      /canonical source\/value grain does not match/);
    await fixture.query("rollback");
    need(failedApply, "runner transaction did not reject semantic republish with exact guard error");
    const rolledBack = await fixture.query(`select (select count(*) from public.schema_migrations) history,
      (select count(*) from information_schema.tables where table_schema='public' and table_name='measure_semantic_registry') semantic_table`);
    need(rolledBack.rows[0].history === "0" && rolledBack.rows[0].semantic_table === "0", "failed apply left history or DDL behind");

    await fixture.query("begin");
    await fixture.query("insert into public.schema_migrations values('20260819224500','report_totals_require_declared_grain')");
    await fixture.query(MIGRATION); await fixture.query("commit");

    const applied = await fixture.query(`select
      (select count(*) from public.v_report_measure_governance where contract_status='DECLARED CANONICAL MEASURE — live proof required') canonical,
      (select count(*) from public.v_report_measure_governance where contract_status='UNVERIFIED — total refused') refused,
      (select verdict from public.f_verify_report_grains('sales.apex_invoice_truth')) verdict,
      (select invalid_measure_rows from public.f_verify_report_grains('sales.apex_invoice_truth')) invalid,
      (select count(*) from public.f_report_registry_runtime('not_registered')) unrelated`);
    need(applied.rows[0].canonical === "1" && applied.rows[0].refused === "77", "governance census is not 1 canonical and 77 refused");
    need(applied.rows[0].verdict === "REFUSED — eligible sum values are incomplete" && applied.rows[0].invalid === "1", "eligible NULL fixture was falsely certified");
    need(applied.rows[0].unrelated === "0", "unregistered runtime lookup touched unrelated contracts");

    const snapshot = await fixture.query("select population_snapshot_verified,population_snapshot_id,population_snapshot_reason from public.f_report_registry_runtime('v_apex_invoice_truth') where report_key='sales.apex_invoice_truth'");
    need(snapshot.rows[0]?.population_snapshot_verified === false && snapshot.rows[0]?.population_snapshot_id == null
      && /no snapshot-bound/.test(snapshot.rows[0]?.population_snapshot_reason ?? ""), "runtime fabricated a snapshot-bound population receipt");

    await fixture.query("set role authenticated");
    const auth = await fixture.query("select grain_verified,invalid_measure_rows from public.f_report_registry_runtime('v_apex_invoice_truth') where report_key='sales.apex_invoice_truth'");
    const direct = await fixture.query("select verdict from public.f_verify_report_grains('sales.apex_invoice_truth')");
    await fixture.query("reset role");
    need(auth.rows[0]?.grain_verified === false && auth.rows[0]?.invalid_measure_rows === "1" && direct.rows.length === 1, "authenticated invoker execution did not enforce live completeness");

    let anonDenied = false;
    await fixture.query("set role anon");
    try { await fixture.query("select * from public.f_report_registry_runtime('v_apex_invoice_truth')"); }
    catch (error) { anonDenied = error.code === "42501"; }
    await fixture.query("reset role"); need(anonDenied, "anon can execute the runtime proof");

    need(await expectRejected(fixture,
      "update public.report_registry set fact_view='v_dummy_1' where report_key='sales.apex_invoice_truth'",
      /canonical source\/value grain does not match/), "fact_view-only republish bypassed the guard");

    await fixture.query("begin");
    await fixture.query("update public.measure_semantic_registry set enabled=false where measure_key='apex.recognized_sales'");
    const disabled = await fixture.query("select verdict,source_verified from public.f_verify_report_grains('sales.apex_invoice_truth')");
    await fixture.query("rollback");
    need(disabled.rows[0].verdict === "REFUSED — canonical relation, definition, or grain key drifted" && disabled.rows[0].source_verified === false,
      "a disabled canonical semantic was falsely certified");

    await fixture.query("begin");
    await fixture.query(`create function public.fixture_measure_bomb() returns numeric language plpgsql as $bomb$
      begin raise exception 'UNRELATED_CONTRACT_WAS_EXECUTED'; end $bomb$`);
    await fixture.query("create or replace view public.v_apex_invoice_truth as select 'ORDER-X'::text apex_order_id,public.fixture_measure_bomb() recognized_total_usd,false cancelled");
    await fixture.query("update public.measure_semantic_registry set canonical_definition_md5=md5(pg_get_viewdef('public.v_apex_invoice_truth'::regclass,true)) where measure_key='apex.recognized_sales'");
    const selectedOnly = await fixture.query("select count(*) count from public.f_report_registry_runtime('not_registered')");
    await fixture.query("rollback");
    need(selectedOnly.rows[0].count === "0", "an unrelated runtime lookup executed a certified fact-view verifier");

    await fixture.query("begin");
    await fixture.query("create or replace view public.v_apex_invoice_truth as select 'ORDER-X'::text apex_order_id,1::numeric recognized_total_usd,false cancelled");
    const drift = await fixture.query("select verdict from public.f_verify_report_grains('sales.apex_invoice_truth')");
    await fixture.query("rollback"); need(drift.rows[0].verdict === "REFUSED — canonical relation, definition, or grain key drifted", "unreviewed source-definition drift was certified");

    await fixture.query("begin");
    await fixture.query("create or replace view public.v_apex_invoice_truth as select '   '::text apex_order_id,1::numeric recognized_total_usd,false cancelled");
    await fixture.query("update public.measure_semantic_registry set canonical_definition_md5=md5(pg_get_viewdef('public.v_apex_invoice_truth'::regclass,true)) where measure_key='apex.recognized_sales'");
    const blank = await fixture.query("select verdict from public.f_verify_report_grains('sales.apex_invoice_truth')");
    await fixture.query("rollback"); need(blank.rows[0].verdict === "REFUSED — blank grain keys", "blank grain key was certified");

    await fixture.query("begin");
    await fixture.query("create or replace view public.v_apex_invoice_truth as select * from(values(' A '::text,1::numeric,false),('A'::text,2::numeric,false))x(apex_order_id,recognized_total_usd,cancelled)");
    await fixture.query("update public.measure_semantic_registry set canonical_definition_md5=md5(pg_get_viewdef('public.v_apex_invoice_truth'::regclass,true)) where measure_key='apex.recognized_sales'");
    const dup = await fixture.query("select verdict from public.f_verify_report_grains('sales.apex_invoice_truth')");
    await fixture.query("rollback"); need(dup.rows[0].verdict === "REFUSED — canonical grain keys are not unique", "trimmed duplicate keys were certified");

    await fixture.query("begin");
    await fixture.query("create or replace view public.v_apex_invoice_truth as select null::text apex_order_id,null::numeric recognized_total_usd,false cancelled where false");
    await fixture.query("update public.measure_semantic_registry set canonical_definition_md5=md5(pg_get_viewdef('public.v_apex_invoice_truth'::regclass,true)) where measure_key='apex.recognized_sales'");
    const empty = await fixture.query("select verdict from public.f_verify_report_grains('sales.apex_invoice_truth')");
    await fixture.query("rollback"); need(empty.rows[0].verdict === "REFUSED — no rows to verify", "zero-row relation was certified");
  } finally {
    await fixture.end().catch(() => {}); await admin.query(`drop database if exists "${database}" with(force)`).catch(() => {}); await admin.end();
  }
}

if (process.env.MONEY_TEST_PGURL) await runExecutionFixture(process.env.MONEY_TEST_PGURL);
if (findings.length) { console.error(`report-measure-grain: FAIL — ${findings.length} finding(s)`); findings.forEach((f) => console.error(`- ${f}`)); process.exit(1); }
console.log(`report-measure-grain: PASS — totals require independent canonical provenance and a snapshot-bound database population receipt${process.env.MONEY_TEST_PGURL ? " (PostgreSQL fixture passed)" : " (static runner)"}.`);
