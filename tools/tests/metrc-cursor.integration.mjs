import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import pg from 'pg';

const sql=readFileSync(new URL('../repairs/gpt-metrc-atomic-cursor.sql',import.meta.url),'utf8');
test('atomic Metrc completion, permissions, concurrency and data-preserving recovery',async t=>{
 let admin,client,other,database,embedded;
 const embeddedPath=process.env.METRC_CURSOR_PGLITE;
 if(embeddedPath){
  assert.ok(!process.env.CI,'CI must test real concurrent PostgreSQL sessions');
  const {PGlite}=await import(pathToFileURL(embeddedPath).href);embedded=new PGlite();
  client={query:(s,p)=>p?embedded.query(s,p):embedded.exec(s).then(r=>r.at(-1))};
 }else{
  assert.ok(process.env.METRC_TEST_PGURL,'METRC_TEST_PGURL must identify the disposable service');
  const url=new URL(process.env.METRC_TEST_PGURL);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Refusing a non-loopback database');
  admin=new pg.Client({connectionString:url.href});await admin.connect();
  database='cursor_fixture_'+randomUUID().replaceAll('-','');await admin.query(`create database ${database}`);
  url.pathname='/'+database;client=new pg.Client({connectionString:url.href});other=new pg.Client({connectionString:url.href});
  await client.connect();await other.connect();
 }
 try{
  for(const role of ['anon','authenticated','service_role'])await client.query(`do $$ begin create role ${role}; exception when duplicate_object then null; end $$;`);
  await client.query(`
   create table public.configurations(key text primary key,value jsonb not null,updated_by uuid,updated_at timestamptz not null default now());
   create table public.metrc_sync_runs(id bigserial primary key,endpoint text,license text,started_at timestamptz default now(),finished_at timestamptz,status text default 'running',records integer default 0,error text,note text);
   create table public.fixture_business(id text primary key,raw jsonb);
   grant usage on schema public to service_role,anon,authenticated;
   grant select,insert,update on public.configurations,public.metrc_sync_runs to service_role;
   grant usage,select on all sequences in schema public to service_role;
  `);
  await client.query(sql);
  const reset=async()=>client.query(`reset role; truncate configurations,metrc_sync_runs,fixture_business restart identity;
   insert into configurations(key,value) values('metrc_sync_cursors','{"A:packages":"2026-01-01T00:00:00Z","B:plants":"2026-01-01T00:00:00Z","unrelated":"keep exactly"}'),('unrelated_policy','{"value":123}');
   insert into fixture_business values('older','{"quantity":10}'),('received-after-repair','{"quantity":12}');`);
  const run=async(endpoint='packages',license='A',start='2026-01-03T00:00:00Z')=>(await client.query(`insert into metrc_sync_runs(endpoint,license,started_at) values($1,$2,$3) returning id`,[endpoint+' (delta)',license,start])).rows[0].id;
  const finish=(id,endpoint='packages',license='A',from='2026-01-01T00:00:00Z',to='2026-01-02T00:00:00Z',count=3,c=client)=>c.query('select tg_metrc_finish_cursor($1,$2,$3,$4,$5,$6) result',[id,endpoint,license,from,to,count]).then(r=>r.rows[0].result);
  const cursors=async()=>(await client.query("select value from configurations where key='metrc_sync_cursors'")).rows[0]?.value;
  const state=async id=>(await client.query('select * from metrc_sync_runs where id=$1',[id])).rows[0];

  await t.test('one feed changes only its key and commits an exact success receipt',async()=>{
   await reset();const id=await run();await client.query('set role service_role');
   const receipt=await finish(id);assert.equal(receipt.outcome,'advanced');assert.equal(receipt.records,3);
   const c=await cursors();assert.equal(Date.parse(c['A:packages']),Date.parse('2026-01-02'));assert.equal(c['B:plants'],'2026-01-01T00:00:00Z');assert.equal(c.unrelated,'keep exactly');
   const r=await state(id);assert.equal(r.status,'ok');assert.deepEqual(JSON.parse(r.note),receipt);assert.equal(r.finished_at.getTime(),Date.parse(receipt.committed_at));
  });
  await t.test('different feeds completing concurrently preserve both updates', {skip:!other},async()=>{
   await reset();const a=await run(),b=await run('plants','B');
   await Promise.all([finish(a),finish(b,'plants','B',undefined,undefined,4,other)]);
   const c=await cursors();assert.equal(Date.parse(c['A:packages']),Date.parse('2026-01-02'));assert.equal(Date.parse(c['B:plants']),Date.parse('2026-01-02'));assert.equal(c.unrelated,'keep exactly');
  });
  await t.test('an older completion cannot rewind a newer successful cursor',async()=>{
   await reset();const a=await run(),b=await run();await finish(b,'packages','A',undefined,'2026-01-03T00:00:00Z');
   const r=await finish(a);assert.equal(r.outcome,'kept_newer');assert.equal(Date.parse((await cursors())['A:packages']),Date.parse('2026-01-03'));
  });
  await t.test('competing old and new completions converge to the newer covered end', {skip:!other},async()=>{
   await reset();const a=await run(),b=await run();await Promise.all([finish(a),finish(b,'packages','A',undefined,'2026-01-03T00:00:00Z',3,other)]);
   assert.equal(Date.parse((await cursors())['A:packages']),Date.parse('2026-01-03'));assert.equal((await state(a)).status,'ok');assert.equal((await state(b)).status,'ok');
  });
  await t.test('lost-response replay returns the original receipt and rejects changed arguments',async()=>{
   await reset();const id=await run(),receipt=await finish(id);assert.deepEqual(await finish(id),receipt);
   await assert.rejects(()=>finish(id,'packages','A',undefined,undefined,4),/not eligible/);
   assert.deepEqual(JSON.parse((await state(id)).note),receipt);
  });
  await t.test('wrong feed, failed run, future window, reversed window and coverage gap refuse advancement',async()=>{
   for(const variant of ['wrong-feed','partial','future','reversed','gap','null-count']){
    await reset();const id=await run();const before=await cursors();
    if(variant==='partial')await client.query("update metrc_sync_runs set status='partial',finished_at=now() where id=$1",[id]);
    const args=[id,'packages','A','2026-01-01T00:00:00Z','2026-01-02T00:00:00Z',3];
    if(variant==='wrong-feed')args[2]='B';if(variant==='future')args[4]='2026-01-04T00:00:00Z';if(variant==='reversed')args[3]='2026-01-03T00:00:00Z';if(variant==='gap')args[3]='2026-01-01T12:00:00Z';if(variant==='null-count')args[5]=null;
    await assert.rejects(()=>finish(...args));assert.deepEqual(await cursors(),before);assert.notEqual((await state(id)).status,'ok');
   }
  });
  await t.test('malformed existing coverage fails without replacing it',async()=>{
   for(const value of ['[]','{"A:packages":null}','{"A:packages":"bad"}','{"A:packages":"infinity"}']){
    await reset();const id=await run();await client.query("update configurations set value=$1 where key='metrc_sync_cursors'",[value]);
    await assert.rejects(()=>finish(id));assert.deepEqual(await cursors(),JSON.parse(value));assert.equal((await state(id)).status,'running');
   }
  });
  await t.test('first completed explicit window can initialize absent coverage',async()=>{
   await reset();await client.query("delete from configurations where key='metrc_sync_cursors'");const id=await run();
   await finish(id);assert.equal(Date.parse((await cursors())['A:packages']),Date.parse('2026-01-02'));
  });
  await t.test('a persistence failure rolls back success and cursor together while retaining imported rows',async()=>{
   await reset();const id=await run();const before=await cursors();
   await client.query(`create function public.fixture_fail_finish() returns trigger language plpgsql as $$ begin if new.status='ok' then raise exception 'forced completion failure'; end if; return new; end $$;
    create trigger fixture_fail_finish before update on metrc_sync_runs for each row execute function fixture_fail_finish();`);
   await assert.rejects(()=>finish(id),/forced completion failure/);assert.deepEqual(await cursors(),before);assert.equal((await state(id)).status,'running');
   assert.equal((await client.query('select count(*)::int n from fixture_business')).rows[0].n,2);
   await client.query('drop trigger fixture_fail_finish on metrc_sync_runs; drop function fixture_fail_finish()');
  });
  await t.test('browser roles cannot invoke the completion API',async()=>{
   await reset();const id=await run();
   for(const role of ['anon','authenticated']){await client.query('set role '+role);await assert.rejects(()=>finish(id),/permission denied/);await client.query('reset role');}
   await client.query('set role service_role');await finish(id);await client.query('reset role');
  });
  await t.test('removing the new API leaves original and newer business data and cursor receipts intact',async()=>{
   await reset();const id=await run();await finish(id);const before=await cursors(),receipt=(await state(id)).note;
   await client.query('drop function public.tg_metrc_finish_cursor(bigint,text,text,timestamptz,timestamptz,integer)');
   assert.deepEqual(await cursors(),before);assert.equal((await state(id)).note,receipt);assert.equal((await client.query('select count(*)::int n from fixture_business')).rows[0].n,2);
   await client.query(sql);
  });
 }finally{
  if(embedded)await embedded.close();else{await other?.end();await client?.end();if(database)await admin.query(`drop database ${database} with (force)`);await admin?.end();}
 }
});
