import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { transform } from "../../app/web/node_modules/esbuild/lib/main.js";

const sql = readFileSync(new URL("../repairs/metrc-backfill-completion.sql",import.meta.url),"utf8");
const beforeSql = readFileSync(new URL("../repairs/metrc-backfill-before.sql",import.meta.url),"utf8");
const helperSource = readFileSync(new URL("../../app/supabase/functions/metrc-sync/backfill.ts",import.meta.url),"utf8");
const { code } = await transform(helperSource,{loader:"ts",format:"esm"});
const { backfillClaim,claimBackfill } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("worker accepts only an exact explicit backfill contract", async () => {
  assert.equal(backfillClaim(new URLSearchParams("endpoints=plants")),null);
  const valid = new URLSearchParams({backfillAttempt:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",endpoints:"plants",license:"TEST-LIC",winStart:"2026-01-01T00:00:00Z",winEnd:"2026-01-02T00:00:00Z"});
  const expected = backfillClaim(valid);
  for (const [key,value] of [["backfillAttempt","bad"],["endpoints","plants,packages"],["license",""],["winEnd","2025-01-01"],["winStart","bad"],["full","1"]]) {
    const params = new URLSearchParams(valid); params.set(key,value);
    assert.throws(()=>backfillClaim(params));
  }
  assert.equal(await claimBackfill({rpc:async(name,args)=>{
    assert.equal(name,"tg_claim_metrc_backfill_attempt"); assert.deepEqual(args,expected);
    return {data:17,error:null};
  }},expected),17);
  await assert.rejects(()=>claimBackfill({rpc:async()=>({data:null,error:{message:"already claimed"}})},expected),/already claimed/);
  for (const data of [null,0,"17",Number.MAX_SAFE_INTEGER+1]) {
    await assert.rejects(()=>claimBackfill({rpc:async()=>({data,error:null})},expected),/valid reserved run/);
  }
});

test("backfill completion, concurrency, permissions and recovery in isolated Postgres", async (t) => {
  const connection = process.env.METRC_TEST_PGURL;
  assert.ok(connection,"METRC_TEST_PGURL must explicitly identify the disposable test service");
  const parsed = new URL(connection);
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(parsed.hostname),"Refusing a non-loopback fixture database");
  const admin = new pg.Client({connectionString:connection}); await admin.connect();
  const database = `metrc_fixture_${randomBytes(8).toString("hex")}`;
  let client,other;
  try {
    await admin.query(`create database ${database}`);
    parsed.pathname=`/${database}`;
    client=new pg.Client({connectionString:parsed.href}); await client.connect();
    other=new pg.Client({connectionString:parsed.href}); await other.connect();
    for (const role of ["anon","authenticated","service_role"]) {
      await admin.query(`do $$ begin create role ${role}; exception when duplicate_object then null; end $$;`);
    }
    await client.query(`
      create table public.metrc_sync_runs(id bigserial primary key,endpoint text,license text,started_at timestamptz default now(),finished_at timestamptz,status text default 'running',records integer,error text,note text,system text);
      create table public.metrc_backfill_window(id bigserial primary key,endpoint text not null,licence text not null,win_start timestamptz not null,win_end timestamptz not null,status text not null default 'pending',records integer,sync_run_id bigint,attempted_at timestamptz,finished_at timestamptz,attempts integer not null default 0,note text,created_at timestamptz not null default now());
      create table public.fixture_requests(id bigserial primary key,path text not null);
      create table public.fixture_control(fail_dispatch boolean not null default false);
      insert into public.fixture_control default values;
      create table public.fixture_business_rows(id text primary key,quantity numeric);
      insert into public.fixture_business_rows values('ARRIVED-BEFORE-REPAIR',1);
      create function public.tg_call_function(p_path text,p_body jsonb default '{}'::jsonb) returns bigint language plpgsql as $$ declare n bigint; begin
        if (select fail_dispatch from public.fixture_control) then raise exception 'simulated transport setup failure'; end if;
        insert into public.fixture_requests(path) values(p_path) returning id into n; return n; end $$;
    `);
    await client.query(beforeSql);
    await client.query("revoke all on function public.tg_metrc_backfill_next() from public; grant execute on function public.tg_metrc_backfill_next() to authenticated,service_role;");
    const before=(await client.query("select pg_get_functiondef('public.tg_metrc_backfill_next()'::regprocedure) as definition,proacl::text as acl from pg_proc where oid='public.tg_metrc_backfill_next()'::regprocedure")).rows[0];
    await client.query(`begin; ${sql} commit;`);
    const reset=async()=>client.query("truncate public.metrc_backfill_attempt,public.metrc_backfill_window,public.metrc_sync_runs,public.fixture_requests; update public.fixture_control set fail_dispatch=false;");
    const enqueue=async()=>client.query("insert into public.metrc_backfill_window(endpoint,licence,win_start,win_end) values('plants','TEST-LIC','2026-01-01T00:00:00.123456Z','2026-01-02T00:00:00Z') returning *");
    const drive=async(c=client)=>(await c.query("select public.tg_metrc_backfill_next() as result")).rows[0].result;
    const attempt=async()=>(await client.query("select * from public.metrc_backfill_attempt order by attempt_number desc limit 1")).rows[0];
    const window=async()=>(await client.query("select * from public.metrc_backfill_window order by id limit 1")).rows[0];
    const claim=async(a,c=client,licence="TEST-LIC")=>c.query("select public.tg_claim_metrc_backfill_attempt($1,'plants',$2,'2026-01-01T00:00:00.123456Z','2026-01-02T00:00:00Z') as id",[a.id,licence]);
    const finish=async(a,status,records=4)=>client.query("update public.metrc_sync_runs set status=$2,records=$3,finished_at=now() where id=$1",[a.run_id,status,records]);
    const cool=async()=>client.query("update public.metrc_backfill_window set finished_at=now()-interval '4 minutes' where status='failed'");

    await t.test("dispatch reserves its run; unrelated successes cannot finish it",async()=>{
      await reset();await enqueue();
      await client.query("insert into public.metrc_sync_runs(endpoint,license,status,records,finished_at) values('plants (delta)','OTHER-LIC','ok',99,now())");
      await drive();const a=await attempt();const w=await window();assert.equal(w.sync_run_id,a.run_id);
      const path=(await client.query("select path from public.fixture_requests")).rows[0].path;
      const params=new URL(`https://fixture.invalid/${path}`).searchParams;
      assert.equal(params.get("backfillAttempt"),a.id);assert.equal(params.get("winStart"),"2026-01-01T00:00:00.123456Z");
      await drive();assert.equal((await window()).status,"running");
      assert.equal((await client.query("select count(*)::int n from public.fixture_requests")).rows[0].n,1);
      await assert.rejects(()=>claim(a,client,"WRONG-LIC"),/mismatched/);
      const races=await Promise.allSettled([claim(a),claim(a,other)]);
      assert.equal(races.filter(x=>x.status==="fulfilled").length,1);
      assert.equal(races.filter(x=>x.status==="rejected").length,1);
      await finish(a,"ok");await drive();assert.equal((await window()).status,"done");
    });
    await t.test("partial and failed attempts keep evidence and stop at the existing budget",async()=>{
      await reset();await enqueue();
      for(const status of ["partial","error","partial"]){
        await drive();const a=await attempt();await claim(a);await finish(a,status);await drive();
        assert.equal((await window()).status,"failed");assert.equal((await attempt()).state,status);await cool();
      }
      assert.match(await drive(),/attempt budget/);
      assert.equal((await client.query("select count(*)::int n from public.metrc_backfill_attempt")).rows[0].n,3);
      assert.equal((await client.query("select count(*)::int n from public.fixture_requests")).rows[0].n,3);
      assert.equal((await window()).records,4);
    });
    await t.test("timeout is uncertain, blocks automatic retry, and refuses a late claim",async()=>{
      await reset();await enqueue();await drive();const a=await attempt();
      await client.query("update public.metrc_backfill_attempt set created_at=now()-interval '11 minutes'");
      assert.match(await drive(),/uncertain/);assert.equal((await window()).status,"failed");
      await assert.rejects(()=>claim(a),/expired/);await cool();assert.match(await drive(),/uncertain/);
      assert.equal((await window()).attempts,1);
    });
    await t.test("unclaimed, contradictory or changed-window successes never become done",async()=>{
      for(const variant of ["unclaimed","error-on-ok","null-count","changed-window"]){
        await reset();await enqueue();await drive();const a=await attempt();
        if(variant!=="unclaimed")await claim(a);
        await finish(a,"ok",variant==="null-count"?null:4);
        if(variant==="error-on-ok")await client.query("update public.metrc_sync_runs set error='incomplete substate' where id=$1",[a.run_id]);
        if(variant==="changed-window")await client.query("update public.metrc_backfill_window set win_end=win_end+interval '1 day'");
        assert.match(await drive(),/uncertain/);assert.notEqual((await window()).status,"done");
      }
    });
    await t.test("two dispatchers cannot race before the worker starts",async()=>{
      await reset();await enqueue();await client.query("begin");
      try {await drive();assert.match(await drive(other),/another backfill dispatcher/);await client.query("commit");}
      catch(e){await client.query("rollback");throw e;}
      assert.equal((await client.query("select count(*)::int n from public.fixture_requests")).rows[0].n,1);
    });
    await t.test("dispatch failure rolls back reservation, attempt and window mutation together",async()=>{
      await reset();await enqueue();await client.query("update public.fixture_control set fail_dispatch=true");
      await assert.rejects(()=>drive(),/simulated transport/);
      assert.equal((await window()).status,"pending");assert.equal((await window()).attempts,0);
      assert.equal((await client.query("select count(*)::int n from public.metrc_backfill_attempt")).rows[0].n,0);
      assert.equal((await client.query("select count(*)::int n from public.metrc_sync_runs")).rows[0].n,0);
    });
    await t.test("legacy running windows and exhausted failures cannot masquerade as complete",async()=>{
      await reset();await enqueue();await client.query("update public.metrc_backfill_window set status='running'");
      assert.match(await drive(),/uncorrelated legacy/);
      await client.query("update public.metrc_backfill_window set status='failed',attempts=3");
      assert.match(await drive(),/remain incomplete/);
    });
    await t.test("new claim and attempt history are unavailable to browser roles",async()=>{
      for(const role of ["anon","authenticated"]){
        await client.query(`set role ${role}`);
        try {
          await assert.rejects(()=>client.query("select * from public.metrc_backfill_attempt"),/permission denied/);
          await assert.rejects(()=>client.query("select public.tg_claim_metrc_backfill_attempt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','plants','TEST-LIC',now(),now())"),/permission denied/);
        } finally {await client.query("reset role");}
      }
    });
    await t.test("reapply and restore preserve new data, attempt evidence and original function ACL",async()=>{
      await reset();await enqueue();await drive();const a=await attempt();await claim(a);await finish(a,"ok");await drive();
      await client.query("insert into public.fixture_business_rows values('ARRIVED-AFTER-REPAIR',2)");
      const snapshot=async()=>(await client.query("select jsonb_build_object('windows',(select jsonb_agg(w) from public.metrc_backfill_window w),'attempts',(select jsonb_agg(a) from public.metrc_backfill_attempt a),'business',(select jsonb_agg(b order by id) from public.fixture_business_rows b)) as data")).rows[0].data;
      const expected=await snapshot();await client.query(`begin; ${sql} commit;`);assert.deepEqual(await snapshot(),expected);
      await client.query(beforeSql);
      const restored=(await client.query("select pg_get_functiondef('public.tg_metrc_backfill_next()'::regprocedure) as definition,proacl::text as acl from pg_proc where oid='public.tg_metrc_backfill_next()'::regprocedure")).rows[0];
      assert.deepEqual(restored,before);assert.deepEqual(await snapshot(),expected);
    });
  } finally {
    if(other)await other.end();if(client)await client.end();
    await admin.query(`drop database if exists ${database}`);await admin.end();
  }
});
