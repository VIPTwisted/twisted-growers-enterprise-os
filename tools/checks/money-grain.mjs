#!/usr/bin/env node
/* The published tag-line report must never regain additive invoice money. */
import { readFileSync } from "node:fs";
import { listMigrationSqlFiles } from "../lib/migration-tree-files.mjs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationDir = join(root, "supabase/migrations");

export function stripSqlComments(sql) {
  let out = "";
  let quote = null;
  for (let i = 0; i < sql.length;) {
    const c = sql[i], n = sql[i + 1];
    if (quote) {
      out += c;
      if (c === quote) {
        if (n === quote) { out += n; i += 2; continue; }
        quote = null;
      }
      i++; continue;
    }
    if (c === "'" || c === '"') { quote = c; out += c; i++; continue; }
    if (c === "-" && n === "-") {
      const end = sql.indexOf("\n", i);
      out += " ".repeat((end === -1 ? sql.length : end) - i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    out += c; i++;
  }
  return out;
}

export function normalizedSqlDigest(sql) {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

export function migrationTreeDigest(entries) {
  const manifest = [...entries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, sql }) => `${name}\0${normalizedSqlDigest(sql)}`)
    .join("\n");
  return createHash("sha256").update(manifest).digest("hex");
}

export function inspectMoneyContract(sql) {
  const code = stripSqlComments(sql);
  const findings = [];
  const need = (test, message) => { if (!test) findings.push(message); };
  need(/create or replace view public\.v_apex_invoice_truth/i.test(code), "missing invoice-grain Apex truth view");
  need(/recognized_total_usd/i.test(code), "missing additive non-cancelled Apex measure");
  need(/create or replace view public\.v_metrc_manifest_invoice_truth/i.test(code), "missing manifest-grain reconciliation view");
  need(/create or replace view public\.v_forensic_sold_by_tag_safe/i.test(code), "missing safe tag-line wrapper");
  need(/null::numeric as total_usd/i.test(code), "tag-line total_usd is not refused");
  need(/null::numeric as apex_invoice_usd/i.test(code), "tag-line apex_invoice_usd is not refused");
  need(/fact_view\s*=\s*'v_forensic_sold_by_tag_safe'/i.test(code), "published report is not repointed to the safe view");
  need(/update\s+public\.nav_registry\s+set\s+table_ref\s*=\s*'v_forensic_sold_by_tag_safe'\s+where\s+view_key\s*=\s*'forensic_sold_by_tag'\s+and\s+enabled\s+and\s+table_ref\s*=\s*'v_forensic_sold_by_tag'\s*;/i.test(code), "published menu road is not atomically repointed from the unsafe view to the safe view");
  need(/if\s+not\s+exists\s*\(\s*select\s+1\s+from\s+public\.nav_registry\s+where\s+view_key\s*=\s*'forensic_sold_by_tag'\s+and\s+enabled\s+and\s+table_ref\s*=\s*'v_forensic_sold_by_tag_safe'\s*\)\s+then\s+raise\s+exception\s+'MONEY_NAV_CONTRACT:[^']+'\s*;/i.test(code), "published menu road has no executable safe-view postcondition");
  need(/measures\s*=\s*array\['pounds'\]/i.test(code), "published tag report still registers money as a measure");
  need(/v_truth\s*<>\s*v_control/i.test(code), "migration has no executable invoice-grain control total");
  return findings;
}

export function inspectTagMoneyContainment(sql) {
  const code = stripSqlComments(sql);
  const findings = [];
  const need = (test, message) => { if (!test) findings.push(message); };
  need(!/\bbegin\s+(isolation\s+level\s+\w+\s*)?;/i.test(code) && !/\bcommit\s*;/i.test(code), "migration contains transaction control instead of using the apply runner transaction");
  need(/set\s+local\s+lock_timeout/i.test(code) && /set\s+local\s+statement_timeout/i.test(code), "runner-owned transaction has no bounded lock/statement timeouts");
  need(/create\s+or\s+replace\s+view\s+public\.v_tag_lifecycle\s+with\s*\(\s*security_invoker\s*=\s*true\s*\)\s+as/i.test(code), "lifecycle is not replaced in place with security_invoker preserved");
  need(/create\s+or\s+replace\s+view\s+public\.v_forensic_sold_by_tag\s+with\s*\(\s*security_invoker\s*=\s*true\s*\)\s+as/i.test(code), "raw sold-by-tag road is not replaced in place with security_invoker preserved");
  need(/join\s+public\.v_metrc_manifest_invoice_truth\s+\w+\s+on\s+\w+\.manifest_number\s*=\s*\w+\.manifest_number/i.test(code), "lifecycle invoice identity is not exact-number bridged");
  need(!/\bmv_forensic_sales\b/i.test(code), "legacy proximity-matched sales source remains in the containment");
  need(/null::numeric\s+as\s+stage5_invoice_usd/i.test(code), "tag-grain invoice dollars are not refused");
  need(/null::text\s+as\s+stage5_payment_status/i.test(code), "tag-grain payment status is not refused");
  need(/null::numeric\s+as\s+total_usd/i.test(code), "raw sold-by-tag total_usd is not refused");
  need(/null::text\s+as\s+payment_status/i.test(code), "raw sold-by-tag payment status is not refused");
  need(/refresh\s+materialized\s+view\s+public\.mv_tag_documents\s*;/i.test(code), "document trinity is not refreshed synchronously");
  need(/stage5_apex_invoice\s+is\s+distinct\s+from\s+\w+\.apex_invoice_number/i.test(code), "exact invoice identity has no executable reconciliation");
  need(/apex_invoice_usd\s+is\s+not\s+null/i.test(code), "published money has no executable zero-value assertion");
  need(/b833a4d42c4bfb5d27b6af6845701c2d/i.test(code)
    && /direct_projection_views/i.test(code)
    && /td\[\.\]apex_invoice_usd/i.test(code),
  "complete direct-projection definition inventory is not sealed");
  need(/exists\s*\(\s*select\s+1\s+from\s+public\.v_forensic_sold_by_tag_safe\s+where\s+total_usd\s+is\s+not\s+null\s+or\s+payment_status\s+is\s+not\s+null\s+or\s+apex_invoice_usd\s+is\s+not\s+null\s*\)/i.test(code),
  "safe wrapper has no executable zero-money/payment assertion");
  need(/b1a5fbaf21f040a05b7977f6826b0ead/i.test(code)
    && /61c2020d9ac60d4f6238fa4cd8c3073b/i.test(code)
    && /safe_depends_on_sold/i.test(code),
  "unchanged root/safe definitions and dependency are not sealed");
  need(!/for\s+\w+\s+in[\s\S]*?apex_invoice_usd[\s\S]*?execute\s+format/i.test(code),
  "migration re-executes every derived money view inside the bounded apply transaction");
  need(/protected navigation changed/i.test(code), "protected TopMenu/TG Workspace state is not asserted");
  need(/nav_role_visibility/i.test(code), "protected role visibility state is not asserted");
  need(/exact invoice bridge differs from independent raw-number derivation/i.test(code), "exact bridge has no independent raw-number proof");
  need(/623cf2d6b0ce24d39509e78528ae6337/i.test(code), "exact bridge definition is not sealed");
  need(/apex_invoice_usd[\s\S]*?x\)\s*<>\s*57\s+then/i.test(code)
    && /apex_invoice_usd[\s\S]*?x\)\s*<>\s*'eef181234378e7983cb774baaef6fb37'/i.test(code),
  "intentional 58-to-57 money-column dependency removal is not sealed");
  need(!/\b(drop|alter)\s+(materialized\s+)?view\s+(if\s+exists\s+)?public\.(v_tag_lifecycle|mv_tag_documents)\b/i.test(code), "protected lifecycle/document object is dropped or altered");
  need(!/\balter\s+(materialized\s+)?view\s+public\.(v_tag_lifecycle|mv_tag_documents)\s+rename\b/i.test(code), "protected lifecycle/document object is renamed");
  need(!/\bcascade\b/i.test(code), "containment uses CASCADE");
  const replaceAt = code.search(/create\s+or\s+replace\s+view\s+public\.v_tag_lifecycle/i);
  const refreshAt = code.search(/refresh\s+materialized\s+view\s+public\.mv_tag_documents\s*;/i);
  const postAt = code.search(/document-trinity rows fail lifecycle reconciliation/i);
  need(replaceAt >= 0 && refreshAt > replaceAt && postAt > refreshAt, "containment order is not source → refresh → postcondition");
  return findings;
}

async function runTagMoneyExecutionFixture(connectionString) {
  const client = new Client({ connectionString });
  const schema = `money_grain_fixture_${process.pid}`;
  const q = (sql) => client.query(sql.replaceAll("__fixture__", schema));
  await client.connect();
  try {
    await q(`drop schema if exists __fixture__ cascade; create schema __fixture__;`);
    await q(`
      create table __fixture__.packages(tag text primary key, manifest text not null);
      create table __fixture__.exact_bridge(manifest text primary key, invoice_no text, invoice_date date);
      create table __fixture__.legacy_sales(manifest text primary key, guessed_invoice text, total_usd numeric, payment_status text);
      create table __fixture__.migration_history(version text primary key);
      insert into __fixture__.packages values ('TAG-1','M-1'),('TAG-2','M-1');
      insert into __fixture__.exact_bridge values ('M-1','INV-EXACT','2026-08-19');
      insert into __fixture__.legacy_sales values ('M-1','INV-GUESS',100,'unpaid');
      create view __fixture__.lifecycle with (security_invoker=true) as
        select p.tag, l.guessed_invoice as invoice_no, current_date as invoice_date,
               l.total_usd as invoice_usd, l.payment_status
        from __fixture__.packages p join __fixture__.legacy_sales l using(manifest);
      create materialized view __fixture__.documents as select * from __fixture__.lifecycle;
      create unique index documents_tag on __fixture__.documents(tag);
      create view __fixture__.dependent with (security_invoker=true) as select * from __fixture__.documents;
      create view __fixture__.raw_sold with (security_invoker=true) as
        select p.tag, l.guessed_invoice as invoice_no, l.total_usd, l.payment_status,
               d.invoice_usd as apex_invoice_usd
        from __fixture__.packages p join __fixture__.legacy_sales l using(manifest)
        join __fixture__.documents d using(tag);
      create view __fixture__.safe_wrapper with (security_invoker=true) as
        select tag, null::numeric as total_usd, null::text as payment_status,
               null::numeric as apex_invoice_usd
        from __fixture__.raw_sold;
      create view __fixture__.sold_dependent with (security_invoker=true) as select * from __fixture__.raw_sold;
    `);
    const before = await q(`select '__fixture__.lifecycle'::regclass::oid lifecycle_oid,
                                   '__fixture__.documents'::regclass::oid document_oid,
                                   '__fixture__.raw_sold'::regclass::oid sold_oid,
                                   '__fixture__.safe_wrapper'::regclass::oid safe_oid,
                                   (select relowner from pg_class where oid='__fixture__.lifecycle'::regclass) lifecycle_owner,
                                   (select relowner from pg_class where oid='__fixture__.raw_sold'::regclass) sold_owner,
                                   (select relacl::text from pg_class where oid='__fixture__.lifecycle'::regclass) lifecycle_acl,
                                   (select relacl::text from pg_class where oid='__fixture__.raw_sold'::regclass) sold_acl,
                                   (select count(distinct rw.ev_class)
                                      from pg_attribute a
                                      join pg_depend dep on dep.refobjid=a.attrelid and dep.refobjsubid=a.attnum
                                      join pg_rewrite rw on rw.oid=dep.objid
                                     where a.attrelid='__fixture__.documents'::regclass
                                       and a.attname='invoice_usd'
                                       and rw.ev_class <> '__fixture__.documents'::regclass) money_dependency_count,
                                   (select sum(invoice_usd) from __fixture__.documents) repeated_total;`);
    if (Number(before.rows[0].repeated_total) !== 200 || Number(before.rows[0].money_dependency_count) !== 2) {
      throw new Error(`execution fixture did not reproduce repeated invoice money/dependencies: ${JSON.stringify(before.rows[0])}`);
    }

    await q(`begin;
      insert into __fixture__.migration_history values ('positive_apply');
      create or replace view __fixture__.lifecycle with (security_invoker=true) as
        select p.tag, b.invoice_no, b.invoice_date,
               null::numeric as invoice_usd, null::text as payment_status
        from __fixture__.packages p left join __fixture__.exact_bridge b using(manifest);
      refresh materialized view __fixture__.documents;
      create or replace view __fixture__.raw_sold with (security_invoker=true) as
        select p.tag, b.invoice_no, null::numeric as total_usd, null::text as payment_status,
               null::numeric as apex_invoice_usd
        from __fixture__.packages p left join __fixture__.exact_bridge b using(manifest);
      do $$ begin
        if exists(select 1 from __fixture__.documents where invoice_usd is not null or payment_status is not null) then
          raise exception 'fixture containment failed';
        end if;
        if exists(select 1 from __fixture__.documents where invoice_no is distinct from 'INV-EXACT') then
          raise exception 'fixture exact identity failed';
        end if;
        if exists(select 1 from __fixture__.raw_sold where total_usd is not null or payment_status is not null or apex_invoice_usd is not null or invoice_no is distinct from 'INV-EXACT') then
          raise exception 'fixture raw sold road failed';
        end if;
        if exists(select 1 from __fixture__.safe_wrapper where total_usd is not null or payment_status is not null or apex_invoice_usd is not null) then
          raise exception 'fixture safe wrapper road failed';
        end if;
      end $$;
      commit;`);

    const after = await q(`select '__fixture__.lifecycle'::regclass::oid lifecycle_oid,
                                  '__fixture__.documents'::regclass::oid document_oid,
                                  '__fixture__.raw_sold'::regclass::oid sold_oid,
                                  '__fixture__.safe_wrapper'::regclass::oid safe_oid,
                                  count(*) filter(where invoice_usd is not null or payment_status is not null) unsafe_rows,
                                  (select count(*) from __fixture__.safe_wrapper
                                    where total_usd is not null or payment_status is not null or apex_invoice_usd is not null) safe_unsafe_rows,
                                  count(*) filter(where invoice_no='INV-EXACT') exact_rows,
                                  (select count(*) from pg_indexes where schemaname='__fixture__' and tablename='documents' and indexname='documents_tag') index_count,
                                  (select count(*) from pg_depend dep join pg_rewrite rw on rw.oid=dep.objid
                                    where dep.refobjid='__fixture__.documents'::regclass and rw.ev_class='__fixture__.dependent'::regclass) dependency_count,
                                  (select count(*) from pg_depend dep join pg_rewrite rw on rw.oid=dep.objid
                                    where dep.refobjid='__fixture__.raw_sold'::regclass and rw.ev_class='__fixture__.sold_dependent'::regclass) sold_dependency_count,
                                  (select count(distinct rw.ev_class)
                                     from pg_attribute a
                                     join pg_depend dep on dep.refobjid=a.attrelid and dep.refobjsubid=a.attnum
                                     join pg_rewrite rw on rw.oid=dep.objid
                                    where a.attrelid='__fixture__.documents'::regclass
                                      and a.attname='invoice_usd'
                                      and rw.ev_class <> '__fixture__.documents'::regclass) money_dependency_count,
                                  (select reloptions from pg_class where oid='__fixture__.lifecycle'::regclass) lifecycle_options,
                                  (select reloptions from pg_class where oid='__fixture__.raw_sold'::regclass) sold_options,
                                  (select reloptions from pg_class where oid='__fixture__.safe_wrapper'::regclass) safe_options,
                                  (select relowner from pg_class where oid='__fixture__.lifecycle'::regclass) lifecycle_owner,
                                  (select relowner from pg_class where oid='__fixture__.raw_sold'::regclass) sold_owner,
                                  (select relacl::text from pg_class where oid='__fixture__.lifecycle'::regclass) lifecycle_acl,
                                  (select relacl::text from pg_class where oid='__fixture__.raw_sold'::regclass) sold_acl,
                                  (select count(*) from __fixture__.migration_history where version='positive_apply') history_count
                           from __fixture__.documents;`);
    const a = after.rows[0];
    if (String(a.lifecycle_oid) !== String(before.rows[0].lifecycle_oid)
        || String(a.document_oid) !== String(before.rows[0].document_oid)
        || String(a.sold_oid) !== String(before.rows[0].sold_oid)
        || String(a.safe_oid) !== String(before.rows[0].safe_oid)
        || Number(a.unsafe_rows) !== 0 || Number(a.safe_unsafe_rows) !== 0 || Number(a.exact_rows) !== 2
        || Number(a.index_count) !== 1 || Number(a.dependency_count) < 1 || Number(a.sold_dependency_count) < 1
        || Number(a.money_dependency_count) !== 1
        || !a.lifecycle_options?.includes("security_invoker=true") || !a.sold_options?.includes("security_invoker=true")
        || !a.safe_options?.includes("security_invoker=true")
        || String(a.lifecycle_owner) !== String(before.rows[0].lifecycle_owner)
        || String(a.sold_owner) !== String(before.rows[0].sold_owner)
        || a.lifecycle_acl !== before.rows[0].lifecycle_acl || a.sold_acl !== before.rows[0].sold_acl
        || Number(a.history_count) !== 1) {
      throw new Error(`execution fixture invariant failed: ${JSON.stringify(a)}`);
    }

    let rejected = false;
    try {
      await q(`begin;
        insert into __fixture__.migration_history values ('negative_apply');
        create or replace view __fixture__.raw_sold with (security_invoker=true) as
          select p.tag, l.guessed_invoice as invoice_no, l.total_usd, l.payment_status,
                 l.total_usd as apex_invoice_usd
          from __fixture__.packages p join __fixture__.legacy_sales l using(manifest);
        do $$ begin
          if exists(select 1 from __fixture__.raw_sold where total_usd is not null or payment_status is not null or apex_invoice_usd is not null) then
            raise exception 'TAG_MONEY_FIXTURE: restored tag money rejected';
          end if;
        end $$;
        commit;`);
    } catch (error) {
      await q("rollback;");
      if (error?.code !== "P0001" || error?.message !== "TAG_MONEY_FIXTURE: restored tag money rejected") throw error;
      rejected = true;
    }
    if (!rejected) throw new Error("execution fixture accepted restored tag-grain money");
    const rolledBack = await q(`select
      (select count(*) from __fixture__.raw_sold where total_usd is not null or payment_status is not null or apex_invoice_usd is not null) unsafe_rows,
      (select count(*) from __fixture__.migration_history where version='negative_apply') failed_history_rows;`);
    if (Number(rolledBack.rows[0].unsafe_rows) !== 0 || Number(rolledBack.rows[0].failed_history_rows) !== 0) {
      throw new Error("failed fixture did not roll back DDL/data/history atomically");
    }

    let safePaymentRejected = false;
    try {
      await q(`begin;
        insert into __fixture__.migration_history values ('negative_safe_payment');
        create or replace view __fixture__.safe_wrapper with (security_invoker=true) as
          select tag, null::numeric as total_usd, 'unpaid'::text as payment_status,
                 null::numeric as apex_invoice_usd
          from __fixture__.raw_sold;
        do $$ begin
          if exists(select 1 from __fixture__.safe_wrapper where total_usd is not null or payment_status is not null or apex_invoice_usd is not null) then
            raise exception 'TAG_MONEY_FIXTURE: restored safe payment status rejected';
          end if;
        end $$;
        commit;`);
    } catch (error) {
      await q("rollback;");
      if (error?.code !== "P0001" || error?.message !== "TAG_MONEY_FIXTURE: restored safe payment status rejected") throw error;
      safePaymentRejected = true;
    }
    if (!safePaymentRejected) throw new Error("execution fixture accepted restored safe-wrapper payment status");
    const safeRolledBack = await q(`select
      (select count(*) from __fixture__.safe_wrapper where total_usd is not null or payment_status is not null or apex_invoice_usd is not null) unsafe_rows,
      (select count(*) from __fixture__.migration_history where version='negative_safe_payment') failed_history_rows;`);
    if (Number(safeRolledBack.rows[0].unsafe_rows) !== 0 || Number(safeRolledBack.rows[0].failed_history_rows) !== 0) {
      throw new Error("failed safe-wrapper fixture did not roll back DDL/data/history atomically");
    }
  } finally {
    try { await q(`drop schema if exists __fixture__ cascade;`); } finally { await client.end(); }
  }
}

const good = `
create or replace view public.v_apex_invoice_truth as select recognized_total_usd;
create or replace view public.v_metrc_manifest_invoice_truth as select 1;
create or replace view public.v_forensic_sold_by_tag_safe as
select null::numeric as total_usd, null::numeric as apex_invoice_usd;
update report_registry set fact_view = 'v_forensic_sold_by_tag_safe', measures = array['pounds'];
update public.nav_registry set table_ref = 'v_forensic_sold_by_tag_safe'
where view_key = 'forensic_sold_by_tag' and enabled and table_ref = 'v_forensic_sold_by_tag';
if not exists (select 1 from public.nav_registry where view_key = 'forensic_sold_by_tag'
and enabled and table_ref = 'v_forensic_sold_by_tag_safe') then
raise exception 'MONEY_NAV_CONTRACT: route is unsafe'; end if;
if v_truth <> v_control then raise exception 'bad'; end if;`;
const bad = good.replace("null::numeric as total_usd", "invoice_total as total_usd");
const badNav = good.replace("where view_key = 'forensic_sold_by_tag' and enabled and table_ref = 'v_forensic_sold_by_tag';", "where view_key = 'some_other_route' and enabled and table_ref = 'v_forensic_sold_by_tag';")
  + "\nselect 1 from public.nav_registry where view_key = 'forensic_sold_by_tag';";
const badComment = good.replace(/update public\.nav_registry[\s\S]*?table_ref = 'v_forensic_sold_by_tag';/, "update public.nav_registry set table_ref = 'v_forensic_sold_by_tag_safe' where view_key = 'some_other_route' and enabled and table_ref = 'v_forensic_sold_by_tag';")
  + "\n-- update public.nav_registry set table_ref = 'v_forensic_sold_by_tag_safe' where view_key = 'forensic_sold_by_tag' and enabled and table_ref = 'v_forensic_sold_by_tag';";
const badTarget = good.replace("set table_ref = 'v_forensic_sold_by_tag_safe'", "set table_ref = 'v_forensic_sold_by_tag'");
const badBroad = good.replace("where view_key = 'forensic_sold_by_tag' and enabled and table_ref = 'v_forensic_sold_by_tag';", "where enabled;");
const badCurrentGuard = good.replace(" and table_ref = 'v_forensic_sold_by_tag';", ";");
const badAssertion = good.replace(/if not exists \(select 1 from public\.nav_registry[\s\S]*?end if;/, "");
const reviewedFixtureSql = "select 'independently reviewed migration';";
const reviewedFixtureEntries = [{ name: "later.sql", sql: reviewedFixtureSql }];
const reviewedFixtureDigest = migrationTreeDigest(reviewedFixtureEntries);
if (inspectMoneyContract(good).length
    || !inspectMoneyContract(bad).some((x) => x.includes("total_usd"))
    || !inspectMoneyContract(badNav).some((x) => x.includes("atomically"))
    || !inspectMoneyContract(badComment).some((x) => x.includes("atomically"))
    || !inspectMoneyContract(badTarget).some((x) => x.includes("atomically"))
    || !inspectMoneyContract(badBroad).some((x) => x.includes("atomically"))
    || !inspectMoneyContract(badCurrentGuard).some((x) => x.includes("atomically"))
    || !inspectMoneyContract(badAssertion).some((x) => x.includes("postcondition"))
    || migrationTreeDigest(reviewedFixtureEntries) !== reviewedFixtureDigest
    || migrationTreeDigest([{ name: "renamed.sql", sql: reviewedFixtureSql }]) === reviewedFixtureDigest
    || migrationTreeDigest([{ name: "backdated.sql", sql: "select 1;" }, ...reviewedFixtureEntries]) === reviewedFixtureDigest
    || migrationTreeDigest([{ name: "later.sql", sql: `${reviewedFixtureSql} -- changed` }]) === reviewedFixtureDigest) {
  throw new Error("money-grain detector self-test failed");
}

/* git ls-files, not readdirSync: sync-migrations writes gitignored
   credential-bearing files back onto disk, so a dirty tree and a clean clone
   disagree and the pin goes red on the first CI run. */
const files = listMigrationSqlFiles(root);
const grainFile = "20260819184318_money_grain_is_a_contract_not_a_format.sql";
const navFile = "20260819203618_every_published_sold_by_tag_road_refuses_line_grain_money.sql";
const containmentFile = "20260819220553_tag_grain_invoice_money_and_proximity_identity_are_refused.sql";

if (!files.includes(grainFile)) {
  console.error(`money-grain: FAIL — reviewed contract file is missing: ${grainFile}`);
  process.exit(1);
}
if (!files.includes(navFile)) {
  console.error(`money-grain: FAIL — reviewed navigation hotfix file is missing: ${navFile}`);
  process.exit(1);
}
if (!files.includes(containmentFile)) {
  console.error(`money-grain: FAIL — reviewed root containment file is missing: ${containmentFile}`);
  process.exit(1);
}
const navSql = readFileSync(join(migrationDir, navFile), "utf8").replace(/\r\n/g, "\n");
const containmentSql = readFileSync(join(migrationDir, containmentFile), "utf8").replace(/\r\n/g, "\n");
/* Temporary immutable-hotfix seal. Regex fixtures explain a detector, but they
   cannot prove PL/pgSQL reachability. This reviewed digest locks the complete
   normalized migration: moving the UPDATE into a string/IF false, weakening its
   predicate, or changing its postcondition changes the digest and stops release.
   Replace this one-file seal only when an execution-backed migration harness owns
   the rule. Post-deploy, the live registry assertion below the migration is also
   re-run through the database connector before the finding can close. */
const expectedNavDigest = "3459baa899ab90c8b3cab07aed5fac4724e6460af017447522d87bfaeff76203";
const navDigest = normalizedSqlDigest(navSql);
if (navDigest !== expectedNavDigest) {
  console.error(`money-grain: FAIL — ${navFile} differs from the independently reviewed hotfix (${navDigest}).`);
  process.exit(1);
}
const expectedContainmentDigest = "ba3e5425529f2f199e846d40a845998983ac701c1fc7d1f84b0075919e2998d6";
const containmentDigest = normalizedSqlDigest(containmentSql);
if (containmentDigest !== expectedContainmentDigest) {
  console.error(`money-grain: FAIL — ${containmentFile} differs from the independently reviewed containment (${containmentDigest}).`);
  process.exit(1);
}
/* Fail closed on the complete migration tree, including filenames and backdated
   additions. A tail boundary can be moved by renaming the seal or inserting an
   older-sorting file. The one reviewed tree digest makes both acts fail. Every
   future migration requires a newly reviewed tree digest; arbitrary PostgreSQL
   is never classified by regex. */
const migrationEntries = files.map((name) => ({
  name,
  sql: readFileSync(join(migrationDir, name), "utf8"),
}));
/* RE-PINNED 26 Aug 2026, 939 files. The previous seal (255de9a8…) covered a 925-file tree and
 * was already stale on main before this branch existed: PR #17 merged 14 Metrc exception-queue
 * migrations without re-pinning, so main measured 945 files at ee59a4c9… and money-grain was
 * red on main itself. Verified by running this gate against a pristine checkout of origin/main.
 *
 * This tree is that one plus the C1 drift census: 3 migrations mirrored from production, 8
 * renamed onto the ledger versions apply_migration actually assigned, 10 deleted (2 duplicates
 * and the 8 the owner ruled abandoned), and the 19 Aug baseline dump replaced by a fresh one.
 * 945 − 10 + 3 + 1 = 939.
 *
 * WHAT A RE-PIN DOES AND DOES NOT MEAN. This is a tamper seal on filenames and bodies, so that
 * the money contract cannot be circumvented by renaming the seal or backdating a file into the
 * tree. It is not a semantic approval of the SQL: inspectMoneyContract and
 * inspectTagMoneyContainment below run against the contract files regardless of this digest,
 * and both pass on this tree. Re-pinning to whatever happens to be on disk in order to get a
 * green build would be --bless wearing a different hat; the number is stated here, with the
 * arithmetic, so the diff that changes it is the thing reviewed.
 *
 * CORRECTED 26 Aug 2026, and the correction is the instructive part. The first re-pin said 939
 * files at 364abdcb… and turned the Netlify build red, because it was measured on a working
 * tree and not on what git carries. This gate reads the DIRECTORY. Four migrations whose
 * recorded statements contain live credentials are ignored by name in .gitignore, and
 * sync-migrations.mjs rewrites them onto disk on every run — so an operator who has run the
 * mirror has 939 files and a clean clone has 938, and only one of those is what CI builds.
 *
 * The repo already learned this once, in migration-drift.mjs: "the comparison runs against what
 * GIT has, not what this disk has ... judging the working tree instead would make the verdict
 * depend on who is sitting at the machine." That note was written about a different gate and
 * this one still reads the disk. 58b63b00… is the clean-clone tree, verified by running the
 * full chain in a fresh checkout of main with the mirror never run.
 *
 * RE-PINNED 28 Aug 2026, 946 files, at the owner's instruction after main went red at 8f17bb3.
 * The 58b63b00… seal covered the tree before three merges landed: PR #24 (7 C2 P1 migrations
 * for the exception-queue role gate), PR #23 (1 recon migration filed from production), and
 * PR #26, which replaced the 26 Aug schema baseline dump with a fresh one — one file removed,
 * one added, net zero on the count but a different tree.
 *
 * MEASURED THE WAY THIS COMMENT BLOCK SAYS TO, not on the working tree. A local run reported
 * 947 files at 939d988f… because supabase/migrations/20260805215014_vincent_user_and_ai_budget.sql
 * is one of the credential-carrying files .gitignore hides and sync-migrations.mjs writes back
 * on every run — it is on this operator's disk and in no clone. Moving it aside reproduces CI's
 * file set exactly: 946 files at c5e29294…, the same digest the failing Gates run on 8f17bb3
 * printed. Two independent readings agreeing is the only reason this number is written down.
 *
 * Nothing about the gate is loosened. The digest is the only line that changes; every check
 * below it runs unchanged and passes on this tree.
 *
 * RE-PINNED AGAIN 28 Aug 2026, 948 files, after main went red at f6f2d9c. Two migrations landed
 * on top of the 946-file tree, both from PR #25, the period bus tower:
 *
 *   20260828165623_last_12_calendar_months_is_not_365_days.sql
 *   20260828165638_dashboards_open_on_the_week_so_far.sql
 *
 * Neither is this lane's work and neither was read for meaning here - re-pinning is a tamper
 * seal, not an approval of their SQL, and the money contract checks below run against the
 * contract files regardless and pass.
 *
 * Measured on the clean-clone file set as this block requires: the gitignored credential
 * migration 20260805215014_vincent_user_and_ai_budget.sql was moved aside first, giving 948
 * files at 0bd978a2… . The failing Gates run on f6f2d9c printed the same 948 files and the same
 * 0bd978a2… . Two independent readings agreeing is again the only reason this number is here.
 *
 * RE-PINNED 28 Aug 2026, 949 files, off f1a4481. ONE re-pin covering a two-PR sequence, at the
 * owner's instruction to wait for the rename rather than seal a tree twice:
 *
 *   PR #28 filed 20260828170000_c_zero_invoice_total_is_not_a_zero_order.sql, but
 *          apply_migration had given production the version 20260828170957, so migration-drift
 *          read it as a production migration with no file and main went red on THAT gate.
 *   PR #30 renamed the file onto the version production actually assigned.
 *
 * Net effect on the 948-file tree is a single added file, 20260828170957_c_zero_invoice_total_
 * is_not_a_zero_order.sql. Sealing after #28 alone would have pinned a tree that #30 was about
 * to change, and burned a second re-pin.
 *
 * Same clean-clone measure: credential migration aside, 949 files at b7ef410c… locally, and the
 * Gates run on f1a4481 printed the same count and the same b7ef410c… . Two readings.
 *
 * RE-PINNED 28 Aug 2026, 950 files, off 6e4abf1. One migration landed on the 949 tree, from
 * PR #31: 20260828172903_a_report_states_which_system_it_read.sql. Not this lane's work and not
 * read for meaning here.
 *
 * THE SECOND READING CAME FROM SOMEWHERE ELSE THIS TIME, and the difference is worth recording.
 * The two previous pins were corroborated by the failing Gates run printing the same digest. On
 * 6e4abf1 Gates failed EARLIER, on "Schema baseline is fresh", so the money-grain step never ran
 * and there was no CI digest to compare against. Pinning on a single reading is exactly how the
 * 26 Aug re-pin turned the build red, so the corroboration was taken a different way: the tree
 * digest was recomputed from the GIT OBJECT STORE at HEAD - file list and every body read via
 * git ls-tree and git show, never touching the working directory - and independently reproduced
 * 950 files at 0941b504… . That path cannot see the gitignored credential migration at all,
 * which makes it a cleaner reading of what CI checks out than moving a file aside and trusting
 * the disk. Both readings agree.
 *
 * Nothing about the gate changes but the digest.
 *
 * RE-PINNED 28 Aug 2026, 950 files, off eb039fd. This one was PREDICTED: PR #34 re-dumped the
 * schema baseline, swapping 20260828163820_baseline_live_schema.sql for 20260828173845_ - a
 * rename at 99% similarity, so the count stays 950 and the tree is different. The dump PR said
 * in its own body that merging it would turn this gate red and would need a re-pin after, and it
 * did. A seal and the thing it seals are not bundled into one diff.
 *
 * Both readings again, and the CI one was unavailable a second time - the GitHub API refused the
 * connection while the cross-check was being fetched. The two that stand are the gate itself on
 * the clean-clone file set (credential migration aside, restored after) and the independent
 * recomputation from the git object store, working directory untouched. Both give 950 files at
 * c28491c3… .
 *
 * RE-PINNED 28 Aug 2026, 951 files, off 2a34037. One migration landed, from PR #36:
 * 20260828175342_the_two_invoice_truth_reports_get_a_page.sql. Not this lane's work and not read
 * for meaning here.
 *
 * The baseline was checked BEFORE pinning and did not need a re-dump: that migration registers a
 * page and a role, creates no view, and schema-baseline still passes against live at
 * 450 / 521 / 28 / 850. So this is a pin on its own, with no dump to sequence behind it and no
 * second red gate waiting after the merge.
 *
 * THREE readings agreed this time, the CI one having been unavailable for the previous two pins:
 * the gate on the clean-clone file set, the recomputation from the git object store, and the
 * failing Gates run on 2a34037 itself. All three give 951 files at 0eb93a71… .
 *
 * RE-PINNED 28 Aug 2026, 952 files, off a4b1af4. One migration landed, from PR #38:
 * 20260828181427_three_hr_pages_open_on_the_frame_that_fits_them.sql - six HR pages joining the
 * period bus. Not this lane's work and not read for meaning here.
 *
 * The baseline was checked before pinning and again did not need a re-dump: schema-baseline
 * still passes against live at 450 / 521 / 28 / 850. Pin only.
 *
 * Two readings: the gate on the clean-clone file set, and the recomputation from the git object
 * store with the working directory untouched. Both give 952 files at a327d5a9… .
 *
 * RE-PINNED 28 Aug 2026, 953 files, off 176b817. One migration landed, from PR #41:
 * 20260828184523_c2_plant_census_is_a_snapshot_not_an_activity_window.sql - a single nav_registry
 * row corrected from an activity window to a snapshot, because v_plant_census carries no activity
 * date to window on.
 *
 * Baseline checked before pinning: schema-baseline still passes against live at
 * 450 / 521 / 28 / 850, so this is a pin on its own.
 *
 * Two readings: the gate on the clean-clone file set, and the recomputation from the git object
 * store with the working directory untouched. Both give 953 files at 951ab2e6… .
 *
 * RE-PINNED 28 Aug 2026, 954 files, off e5716dc. One migration landed, from PR #44:
 * 20260828185029_c2_metrc_exception_queues_are_a_snapshot_not_an_activity_window.sql - the same
 * single-row correction PR #41 made for plant_census, applied to xq_metrc_exceptions. Both pages
 * were marked as activity windows and neither has an activity date to window on; a frame over
 * either could only drop live rows by when they synced, or by when a defect started.
 *
 * The owner has closed the nav corrections on this ticket, so this is the last of that sequence.
 *
 * Baseline checked before pinning: schema-baseline still passes against live at
 * 450 / 521 / 28 / 850. Pin only.
 *
 * Two readings: the gate on the clean-clone file set, and the recomputation from the git object
 * store with the working directory untouched. Both give 954 files at a5ed273c… .
 *
 * RE-PINNED 28 Aug 2026, 955 files, off c9ba29c. Four PRs landed on the 954 tree and only ONE of
 * them moved it:
 *
 *   PR #46, #47  cultivation and HR pages onto the period bus - #47 brought the one migration,
 *                20260828191021_a_file_and_a_queue_are_positions_not_periods.sql
 *   PR #48       the report runner's range and search rules - JSX, a lib and a test, no migration
 *
 * Worth stating because it is the usual confusion about this seal: it tracks the migration
 * DIRECTORY, not the branch. Front-end work can merge all day without touching it, and a single
 * one-row nav migration moves it. #48 in particular changed three files and none of them count.
 *
 * Baseline checked before pinning: schema-baseline still passes against live at
 * 450 / 521 / 28 / 850. Pin only.
 *
 * Two readings: the gate on the clean-clone file set, and the recomputation from the git object
 * store with the working directory untouched. Both give 955 files at a6a9671c… . */
/* RE-PINNED 29 Aug 2026 — 969 files at 6154e280… , up from 967 at 13e79de3… .
 *
 * WHAT MOVED. Five migrations that had already run in production were brought
 * into line with the repository so migration-drift could pass and the site could
 * publish again: renamed onto the versions apply_migration actually assigned
 * them, with the superseded schema baseline replaced by a current one. Plus one
 * genuinely new migration, which appends a measured sentence to ten nav
 * descriptions and changes no schema. Two net files.
 *
 * MEASURED FROM A PRISTINE CHECKOUT, NOT A WORKING TREE, AND THAT IS THE WHOLE
 * DISCIPLINE OF THIS LINE. This gate reads the DIRECTORY. Four migrations whose
 * recorded statements carry live credentials are ignored by name in .gitignore,
 * and tools/sync-migrations.mjs writes them back onto disk every time it runs —
 * so an operator who has run the mirror sees more files than a clean clone does,
 * and only the clean clone is what CI builds. Pinning from a working tree is how
 * this seal turned the Netlify build red on 27 Aug: the number was true of one
 * machine and of nowhere else.
 *
 * So: a fresh detached worktree at this commit, mirror never run. `ls *.sql` and
 * `git ls-files` both return 969 and `git status` on that directory is empty,
 * which together are the check that no untracked file crept into the count.
 *
 * DERIVED TWICE. The gate's own migrationTreeDigest over that checkout, and an
 * independent recomputation of the same algorithm from scratch. Both return
 * 6154e280d4d33c53c50372437eb50a8bc542f9429eae81d771a2d70e132c986f. */
/* RE-PINNED 29 Aug 2026, 980 files, for the phase-aware plant-mirror branch.
 * Re-taken after the room-resolution patch changed this branch own migration:
 * a harvest room now resolves from its plants LocationName first and the name
 * parse second, so FR4 names five harvests including 2343302.
 * ONE new migration since the previous 979-file seal, and on 29 Aug it was RENAMED
 * to the version production actually recorded:
 *   20260829153000_c_plant_mirror_is_phase_and_harvest_aware.sql   (placeholder)
 *   20260829154740_c_plant_mirror_is_phase_and_harvest_aware.sql   (prod stamp)
 * The pin travels in the same PR as the .sql, per the owner's standing rule, so
 * the tree and the seal are never briefly out of step on any branch.
 *
 * A RENAME MOVES THIS DIGEST EVEN THOUGH THE COUNT DOES NOT. The manifest hashes
 * `name\0sqlDigest` per entry, so 980 -> 980 with one different name is a different
 * tree. Anyone reading only the count would conclude nothing changed and would pin
 * the old value; the file list is the thing that moved, not its length.
 *
 * The body was also replaced with the exact bytes of schema_migrations.statements
 * for 20260829154740 (md5 a051947237fbf6cea10605c244ec0fe5). Supabase strips
 * comment-only lines when it records statements, so the file lost 63 header lines
 * and 12 inline ones. ZERO executable SQL differs - verified line by line against
 * the previous content, not assumed.
 *
 * Counted with listMigrationSqlFiles(), i.e. `git ls-files`, so the count is what
 * CI sees rather than what happens to be sitting on this laptop. The rename was
 * COMMITTED before the digest was taken - staged-but-uncommitted, `git ls-tree`
 * and `git ls-files` disagree and the seal would cover a tree that never existed.
 * Measured twice by different routes that agreed: money-grain's own run, and an
 * independent recomputation over the blobs in the HEAD tree.
 */
/* RE-PINNED 4 Sep 2026, still 980 files, for the schema baseline re-dump.
 * The schema-baseline gate compares the baseline's own BASELINE COUNTS header to
 * the live catalogues, and production had moved 455 -> 457 tables and 533 -> 535
 * views. dump-schema.mjs writes a NEW timestamped file, so the swap is one
 * deletion and one addition:
 *   20260829141208_baseline_live_schema.sql   (removed, 455/533/28/859)
 *   20260904180423_baseline_live_schema.sql   (added,   457/535/28/859)
 *
 * THE COUNT IS UNCHANGED AT 980 AND THE DIGEST STILL MOVES, for the same reason
 * the 29 Aug rename moved it: the manifest hashes `name\0sqlDigest` per entry, so
 * a swapped name and a rewritten body are a different tree at an identical length.
 * Reading only the count would say nothing happened.
 *
 * Policies did NOT drift. Both baselines record 859, and 859 is what
 * `pg_policies where schemaname='public'` and a pg_policy/pg_class/pg_namespace
 * join independently return. The 871 in circulation is `count(*) from pg_policy`
 * across every schema - public 859 plus storage 10 plus cron 2 - which this
 * baseline neither dumps nor could recreate.
 *
 * Counted with listMigrationSqlFiles(), i.e. `git ls-files`, and the swap was
 * COMMITTED before the digest was taken. Measured twice by routes that share no
 * code and agreed: money-grain's own run over the working tree, and a
 * recomputation over the blobs in the HEAD tree. Both returned 980 files and
 * 69a8a47e7b91c55040edcfdf6ee1f0cfe0d38f667b5ba587c3f5f22a906ddec0.
 *
 * RE-PINNED 5 Sep 2026. The baseline was re-dumped — 20260904180423 out,
 * 20260905130719 in — because production had gained 1 table and 4 views and the
 * 914 blanket grok policies had been dropped, so schema-baseline was red on every
 * open PR. A baseline swap moves this digest by construction; that is the same
 * reason #112 re-pinned it on 4 Sep, and it is not a new migration.
 *
 * The order matters and it caught an error here. Run against the UNCOMMITTED
 * working tree the check reported 979 files and f0a665c7...; run again after the
 * swap was committed it reported 980 files and 3bdfeb9a.... git ls-files does not
 * see a staged rename the same way. The committed figure is the real one, which is
 * why the paragraph above insists on committing first. Pinning 3bdfeb9a.
 */
/* RE-PINNED 5 Sep 2026, 990 files at 1f5322dd… . Filed the 9 prod stamps that
 * were blocking migration-drift (limit 0). leftover_grok is 0. Counted with
 * listMigrationSqlFiles() after git add.
 */
const expectedMigrationTreeDigest = "1f5322ddd5685d9252e97806947db21a6ea60ad337099daeaac88c7450518ebf";
const actualMigrationTreeDigest = migrationTreeDigest(migrationEntries);
if (actualMigrationTreeDigest !== expectedMigrationTreeDigest) {
  console.error(`money-grain: FAIL — migration tree differs from the independently reviewed ${files.length}-file manifest (${actualMigrationTreeDigest}).`);
  process.exit(1);
}
const contractSql = `${readFileSync(join(migrationDir, grainFile), "utf8")}\n${navSql}`;
const findings = inspectMoneyContract(contractSql);
if (findings.length) {
  console.error("money-grain: FAIL");
  findings.forEach((finding) => console.error(`  - ${finding}`));
  process.exit(1);
}
const containmentFindings = inspectTagMoneyContainment(containmentSql);
if (containmentFindings.length) {
  console.error("money-grain: FAIL — tag/document root containment");
  containmentFindings.forEach((finding) => console.error(`  - ${finding}`));
  process.exit(1);
}
const containmentMutants = [
  containmentSql.replace("null::numeric as stage5_invoice_usd", "i.total_usd as stage5_invoice_usd"),
  containmentSql.replace("null::text as stage5_payment_status", "i.payment_status as stage5_payment_status"),
  containmentSql.replace("null::numeric as total_usd", "m.invoice_total_usd_non_additive as total_usd"),
  containmentSql.replace("null::text as payment_status", "'unpaid'::text as payment_status"),
  containmentSql.replace("join public.v_metrc_manifest_invoice_truth", "join public.mv_forensic_sales"),
  containmentSql.replace("refresh materialized view public.mv_tag_documents;", "-- refresh removed"),
  containmentSql.replace("with (security_invoker = true) as", "as"),
  containmentSql.replace("623cf2d6b0ce24d39509e78528ae6337", "00000000000000000000000000000000"),
  containmentSql.replace("b833a4d42c4bfb5d27b6af6845701c2d", "00000000000000000000000000000000"),
  containmentSql.replace("b1a5fbaf21f040a05b7977f6826b0ead", "00000000000000000000000000000000"),
  containmentSql.replace("61c2020d9ac60d4f6238fa4cd8c3073b", "00000000000000000000000000000000"),
  containmentSql.replace(/(v_forensic_sold_by_tag_safe\s+where total_usd is not null\s+or )payment_status is not null\s+or /, "$1"),
  containmentSql.replaceAll("td[.]apex_invoice_usd", "coalesce(td.apex_invoice_usd, 0)"),
  containmentSql.replace("x) <> 57 then", "x) <> b.money_deps then"),
  containmentSql.replace("eef181234378e7983cb774baaef6fb37", "2eebe724db2d03440058ba35a95bc02e"),
  `${containmentSql}\ncommit;`,
];
if (!containmentMutants.every((sql) => inspectTagMoneyContainment(sql).length > 0)) {
  throw new Error("tag-money containment detector self-test failed");
}

let execution = "not configured in this runner";
if (process.env.MONEY_TEST_PGURL) {
  await runTagMoneyExecutionFixture(process.env.MONEY_TEST_PGURL);
  execution = "ephemeral PostgreSQL positive/negative fixtures passed";
}
console.log(`money-grain: PASS — sold-by-tag quarantine and root containment are sealed; ${execution}.`);

