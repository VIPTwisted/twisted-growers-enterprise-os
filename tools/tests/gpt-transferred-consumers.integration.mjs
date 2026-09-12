import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
// Native CI uses a new disposable database on an explicitly loopback-only service.
// Embedded PostgreSQL remains an opt-in local rehearsal, never a CI substitute.
let db, admin, database, embedded;
const fixtureRole='transferred_reader_'+randomUUID().replaceAll('-','');
const fixtureOwner='transferred_owner_'+randomUUID().replaceAll('-','');
if (process.env.TRANSFERRED_TEST_PGLITE_MODULE) {
 assert.ok(!process.env.CI, 'CI must run native PostgreSQL');
 const {PGlite}=await import(pathToFileURL(process.env.TRANSFERRED_TEST_PGLITE_MODULE).href);
 embedded=new PGlite();
 db={exec:s=>embedded.exec(s),query:s=>embedded.query(s)};
} else {
 assert.ok(process.env.TRANSFERRED_TEST_PGURL, 'TRANSFERRED_TEST_PGURL must identify a disposable loopback test service');
 const url=new URL(process.env.TRANSFERRED_TEST_PGURL);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Refusing non-loopback fixture database');
 admin=new pg.Client({connectionString:url.href}); await admin.connect();
 database='transferred_fixture_'+randomUUID().replaceAll('-','');
 await admin.query(`create database ${database}`); url.pathname=`/${database}`;
 db=new pg.Client({connectionString:url.href}); await db.connect();
 db.exec=s=>db.query(s);
}
const before=JSON.parse(readFileSync(new URL('../repairs/gpt-transferred-before.json',import.meta.url),'utf8'));
const migration=readFileSync(new URL('../repairs/gpt-transferred-custody-consumers.sql',import.meta.url),'utf8');
const adapt=s=>s.replaceAll('fixture_reader',fixtureRole);
const q=s=>db.exec(adapt(s)); const rows=async s=>(await db.query(adapt(s))).rows;
try {
await q(`create role ${fixtureOwner} nosuperuser nocreatedb nocreaterole noinherit; create role fixture_reader; grant usage,create on schema public to ${fixtureOwner}; set role ${fixtureOwner};`);
assert.equal((await rows('select rolsuper from pg_roles where rolname=current_user'))[0].rolsuper,false,'fixture executes as non-superuser owner');
await q(`
create table metrc_packages(id bigint,license text,tag text,item_name text,quantity numeric,uom text,location text,packaged_on date,lab_testing_state text,finished boolean,raw jsonb,synced_at timestamptz,source_state text,provenance text,report_as_of date);
create function f_is_ours(text) returns boolean language sql immutable as 'select $1 in (''MC'',''MP'')';
create table inventory_snapshot(taken_on date,license text,tag text,item_name text,category text,strain text,quantity numeric,uom text,pounds numeric,location text,lab_state text,packaged_on date,origin text,stock_status text,source_state text);
create function f_is_weight(text) returns boolean language sql immutable as 'select $1 = ''g''';
create function f_to_pounds(numeric,text) returns numeric language sql immutable as 'select $1/453.59237';
create table metrc_plants(room text,license text,strain text,tag text,planted_on date,phase text,source_state text);
create table metrc_plant_batches(license text,strain text,name text,count numeric,planted_on date,batch_type text,source_state text);
create table v_harvest_stage_map(stage text,room text,license text,strains text,harvest text,current_weight numeric,wet_weight numeric,uom text,harvest_start date,days_since_takedown int,sub_room text,harvest_type text,lab_state text);
create table mv_tag_documents(tag text,coa_certificate_id bigint,coa_document_link text,manifest_no text,manifest_document_link text,apex_invoice_no text,apex_invoice_usd numeric);
`);
for(const f of before.functions) await q(f.definition);
for(const v of before.views) await q(`create view ${v.name} with(security_invoker=true) as ${v.definition}`);
await q('grant select on v_inventory_locator,v_inventory_reconciliation to fixture_reader; revoke all on function tg_snapshot_inventory(date) from public;');
const security=async()=>rows(`select relname,relowner,relacl::text,reloptions::text from pg_class where relname in ('v_inventory_locator','v_inventory_reconciliation') order by relname`);
await q("comment on view v_inventory_locator is 'preserved view comment'; comment on function tg_snapshot_inventory(date) is 'preserved function comment';");
const originalSecurity=await security();
const functionSecurity=()=>rows("select oid,proname,proowner,proacl::text,prosecdef,proconfig::text,provolatile,proparallel,obj_description(oid) comment from pg_proc where oid in ('f_stock_status(text,boolean)'::regprocedure,'tg_snapshot_inventory(date)'::regprocedure) order by proname");
const originalFunctionSecurity=await functionSecurity();
await q(`insert into metrc_packages select n,'MC','tag'||n,'item'||n,10,'g','Room',current_date,'TestPassed',false,'{"Quantity":10,"IsFinished":false,"InitialQuantity":10}'::jsonb,now(),s,'fixture',current_date from unnest(array['active','onhold','intransit','transferred','inactive','unknown']) with ordinality as x(s,n);
update metrc_packages set raw=raw||'{"IsOnHold":true}' where source_state in ('onhold','transferred');
insert into metrc_packages select 7,'MP','tag1','other-licence',20,'g','Room',current_date,'TestPassed',false,'{"Quantity":20,"IsFinished":false}'::jsonb,now(),'active','fixture',current_date;`);
// Demonstrate the original defects before repair.
assert.equal((await rows("select identifier from v_inventory_locator where identifier='tag4'")).length,1);
assert.equal((await rows("select on_hold from v_inventory_reconciliation where item='item4'"))[0].on_hold,'10.0');
assert.equal((await rows("select identifier from v_inventory_locator where identifier='tag1'")).length,1);
// Fixture dependencies are typed stand-ins; PostgreSQL deparses casts differently.
// Bind ONLY expected preflight hashes to this fixture catalog; execute unchanged revised bodies.
let fixtureMigration=migration;
for (const v of before.views) {
 const [{hash}]=await rows(`select md5(pg_get_viewdef('public.${v.name}'::regclass,true)) hash`);
 fixtureMigration=fixtureMigration.replace(v.hash,hash);
}
// Production permission regression: ownership does not grant catalog UPDATE.
await assert.rejects(q("begin; select oid from pg_catalog.pg_proc where oid='public.f_stock_status(text,boolean)'::regprocedure for update"),e=>e.code==='42501');
await q('rollback');
const lockBlock=migration.slice(migration.indexOf('do $lock_functions$'),migration.indexOf('-- Separate statement'));
const preflightBlock=fixtureMigration.slice(fixtureMigration.indexOf('do $preflight$ begin'),fixtureMigration.indexOf('end $preflight$;')+'end $preflight$;'.length);
const identity=()=>rows("select oid,proname,md5(pg_get_functiondef(oid)) hash,proowner,proacl::text,proconfig::text from pg_proc where oid in ('public.f_stock_status(text,boolean)'::regprocedure,'public.tg_snapshot_inventory(date)'::regprocedure) order by oid");
const initialIdentity=await identity();
// A successful owner rename round trip changes neither identity nor definition.
await q('begin'); await q(lockBlock);
assert.deepEqual(await identity(),initialIdentity); await q('rollback');
// A temporary-signature collision must abort without renaming the original.
await q('begin');
const [{temporary_name}]=await rows("select format('gpt_custody_lock_%s_%s','public.f_stock_status(text,boolean)'::regprocedure::oid,txid_current()) temporary_name");
await q(`create function public.${temporary_name}(text,boolean) returns text language sql as 'select $1'`);
await assert.rejects(q(lockBlock),/Temporary function signature collision/); await q('rollback');
assert.deepEqual(await identity(),initialIdentity);
// Rename locking must not hide a body change that preceded lock acquisition.
await q('begin');
const oldStatus=before.functions.find(f=>f.name==='f_stock_status').definition;
await q(oldStatus.replace("'In transit'","'Preceding body drift'"));
await q(lockBlock);
assert.notEqual((await identity()).find(f=>f.proname==='f_stock_status').hash,initialIdentity.find(f=>f.proname==='f_stock_status').hash);
await assert.rejects(q(preflightBlock),/Definition drift: f_stock_status/); await q('rollback');
assert.deepEqual(await identity(),initialIdentity);
// Original signature disappearance must fail, and rollback restores the name/OID.
await q('begin; alter function public.f_stock_status(text,boolean) rename to preceding_rename');
await assert.rejects(q(lockBlock),/Missing function to lock/); await q('rollback');
assert.deepEqual(await identity(),initialIdentity);
console.log('PASS: non-superuser owner, catalog42501 refusal, permitted rename lock, exact identity preservation, collision/drift/missing-name rollback');
const packagesBefore=await rows('select to_jsonb(p) payload from metrc_packages p order by id');
await q(fixtureMigration);
assert.deepEqual(await rows('select to_jsonb(p) payload from metrc_packages p order by id'),packagesBefore,'every package field preserved');
assert.deepEqual(await functionSecurity(),originalFunctionSecurity,'function owners, grants, modes, paths and comments preserved');
assert.equal((await rows("select obj_description('v_inventory_locator'::regclass) comment"))[0].comment,'preserved view comment');
assert.deepEqual(await security(),originalSecurity,'view owners, grants and options preserved');
assert.equal((await rows("select has_function_privilege('fixture_reader','tg_snapshot_inventory(date)','execute') ok"))[0].ok,false);
assert.equal((await rows("select f_stock_status('transferred',false) status"))[0].status,'Transferred — accepted by recipient');
assert.equal((await rows("select f_stock_status('intransit',false) status"))[0].status,'In transit');
assert.equal((await rows("select f_stock_status(null,false) status"))[0].status,'Not recorded');
const locator=await rows("select identifier,license,category from v_inventory_locator order by identifier,license");
assert.equal(locator.filter(r=>r.identifier==='tag4').length,0,'accepted transfers are not live conflicts');
assert.equal(locator.filter(r=>r.identifier==='tag1').length,2,'same tag under two licences preserved');
assert.equal(locator.find(r=>r.identifier==='tag3').category,'In transit');
assert.equal(locator.find(r=>r.identifier==='tag5').category,'State conflict');
assert.equal(locator.find(r=>r.identifier==='tag6').category,'State conflict');
let transferred=(await rows("select * from v_inventory_reconciliation where item='item4'"))[0];
assert.equal(transferred.on_hold,null); assert.equal(transferred.failed_testing_held,null); assert.equal(transferred.reconciliation_status,'Transferred; historical balance not verified');
await q("update metrc_packages set lab_testing_state='TestFailed' where source_state in ('transferred','active')");
transferred=(await rows("select * from v_inventory_reconciliation where item='item4'"))[0];
assert.equal(transferred.failed_testing_held,null);
assert.equal((await rows("select failed_testing_held from v_inventory_reconciliation where item='item1'"))[0].failed_testing_held,'10.0');
assert.equal((await rows("select on_hold from v_inventory_reconciliation where item='item2'"))[0].on_hold,'10.0');
await assert.rejects(q("select tg_snapshot_inventory((now() at time zone 'America/New_York')::date - 1)"),/Current mirror cannot reconstruct/);
await assert.rejects(q("select tg_snapshot_inventory((now() at time zone 'America/New_York')::date + 1)"),/Current mirror cannot reconstruct/);
await q('select tg_snapshot_inventory()');
assert.deepEqual((await rows('select distinct source_state from inventory_snapshot order by source_state')).map(r=>r.source_state),['active','intransit','onhold']);
assert.equal((await rows('select count(*)::int n from inventory_snapshot'))[0].n,4);
assert.equal((await rows("select quantity::text,finished,raw->>'IsFinished' raw_finished from metrc_packages where source_state='transferred'"))[0].quantity,'10');
// A stale or repeated migration must fail before replacing anything.
await assert.rejects(q(fixtureMigration),/Definition drift/); await q('rollback');
// Test the exact migration lock prefix, with a genuinely independent backend.
// PGlite is one backend and cannot provide an honest concurrency result.
if (embedded) console.log('SKIP: two-session DDL contention (embedded runtime; native CI runs it)');
else {
 const competitor=new pg.Client(db.connectionParameters);
 await competitor.connect();
 try {
  await competitor.query(`set role ${fixtureOwner}; set lock_timeout='250ms'; set statement_timeout='5s'`);
  const lockPrefix=migration.slice(0,migration.indexOf('do $preflight$ begin'));
  assert.ok(lockPrefix.includes('rename to') && lockPrefix.includes('access share mode'));
  for (const target of ['function','view']) for (const release of ['rollback','commit']) {
   const definitionQuery=target==='function'
    ? "select pg_get_functiondef('public.f_stock_status(text,boolean)'::regprocedure) definition"
    : "select pg_get_viewdef('public.v_inventory_locator'::regclass,true) definition";
   const [{definition}]=await rows(definitionQuery);
   const originalDDL=target==='function'?definition:`create or replace view public.v_inventory_locator with(security_invoker=true) as ${definition}`;
   const replacement=target==='function'
    ?originalDDL.replace('Transferred — accepted by recipient','Competing transfer label')
    :originalDDL.replace("'State conflict'::text","'Competing state conflict'::text");
   assert.notEqual(replacement,originalDDL,'competitor must attempt an actual change');
   await q(lockPrefix);
   try {
    await assert.rejects(competitor.query(replacement),e=>e.code==='55P03','competing DDL must time out on our transaction locks');
    assert.equal((await rows(definitionQuery))[0].definition,definition,'blocked competitor cannot change definition during preflight window');
    await q(release);
    // Retrying after either termination path proves locks were released.
    await competitor.query(replacement);
    assert.notEqual((await rows(definitionQuery))[0].definition,definition,'competitor proceeds after lock release');
    await q(originalDDL);
   } finally {await q('rollback');}
  }
  console.log('PASS: native function/view replacements blocked during lock window and released after both rollback and commit');
 } finally {await competitor.end();}
}
console.log('PASS: actual four revised consumers, original defect controls, licence grain, state exclusions, retained conflicts, hold/failure cases, snapshot, security preservation, definition-drift refusal');
} catch (error) {console.error(error.message); process.exitCode=1;} finally {
 if(embedded) await embedded.close();
 else {
  try { if(db) await db.end(); }
  finally { if(admin) { try { if(database) await admin.query(`drop database ${database}`); await admin.query(`drop role if exists ${fixtureRole}`); await admin.query(`drop role if exists ${fixtureOwner}`); } finally {await admin.end();} } }
 }
}
