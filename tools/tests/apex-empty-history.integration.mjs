import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import test from "node:test";
import pg from "pg";

const original = readFileSync(new URL("../../supabase/migrations/20260911134123_gpt_apex_sync_source_verification.sql", import.meta.url), "utf8");
const overlap = readFileSync(new URL("../repairs/gpt-apex-verification-paging-overlap.sql", import.meta.url), "utf8");
const repair = readFileSync(new URL("../repairs/gpt-apex-empty-history.sql", import.meta.url), "utf8");
const continuity = readFileSync(new URL("../../supabase/migrations/20260912044301_gpt_apex_require_continuous_history_for_records.sql", import.meta.url), "utf8");
const companyStart = "2023-11-30T17:52:07Z";
const receiving = "receiving-orders";
const base = "https://app.apextrading.com/api";
const sha = value => createHash("sha256").update(value).digest("hex");
const fixture = `
create table apex_entity(entity text primary key,label text,endpoint text,api_version text default 'v1',root_key text default 'orders',supports_delta boolean default true,supports_paging boolean default true,nesting jsonb default '{}',scope_needed text,required boolean default true,delta_required boolean default true,min_interval_minutes integer default 10,why text);
create table apex_raw(id bigserial primary key,entity text not null,apex_id text,payload jsonb not null,payload_hash text generated always as (md5(payload::text)) stored,fetched_at timestamptz default clock_timestamp(),run_id uuid,unique(entity,apex_id,payload_hash));
create table apex_watermark(entity text primary key,updated_at_from timestamptz,last_success_at timestamptz,last_attempt_at timestamptz,consecutive_errors integer default 0);
create table apex_sync_run(id bigserial primary key,run_id uuid,entity text,started_at timestamptz,finished_at timestamptz,status text,http_status integer,rows_seen integer,rows_written integer,watermark_before timestamptz,watermark_after timestamptz,error text,meta_total integer);
create table integration_secrets(name text primary key,value text);
create schema net;
create table net._http_response(id bigint primary key,status_code integer,content text,created timestamptz default clock_timestamp(),timed_out boolean default false,error_msg text);
create table net.fixture_http_request(id bigserial primary key,url text,params jsonb,headers jsonb,timeout_milliseconds integer);
create function net.http_get(url text,params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 5000) returns bigint language sql as $$ insert into net.fixture_http_request(url,params,headers,timeout_milliseconds) values(url,params,headers,timeout_milliseconds) returning id $$;
grant usage on schema public to anon,authenticated,service_role;
grant select,insert,update on apex_entity,apex_raw,apex_watermark,apex_sync_run to service_role;
grant select on integration_secrets to service_role;
grant usage,select on all sequences in schema public to service_role;
`;

test("Apex empty-history proof in isolated PostgreSQL with mocked HTTP", async t => {
  let client, other, admin, database, embedded;
  if (process.env.APEX_TEST_PGLITE_MODULE) {
    assert.ok(!process.env.CI, "CI must exercise native PostgreSQL concurrency");
    const { PGlite } = await import(pathToFileURL(process.env.APEX_TEST_PGLITE_MODULE).href);
    embedded = new PGlite();
    client = { query: (s, p) => p ? embedded.query(s, p) : embedded.exec(s).then(r => r.at(-1)) };
  } else {
    assert.ok(process.env.APEX_TEST_PGURL, "APEX_TEST_PGURL must name a disposable test service");
    const url = new URL(process.env.APEX_TEST_PGURL);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Refusing a non-loopback fixture database");
    admin = new pg.Client({ connectionString: url.href }); await admin.connect();
    database = `apex_empty_fixture_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`create database ${database}`); url.pathname = `/${database}`;
    client = new pg.Client({ connectionString: url.href }); await client.connect();
    other = new pg.Client({ connectionString: url.href }); await other.connect();
  }
  try {
    for (const role of ["anon", "authenticated", "service_role"]) await client.query(`do $$ begin create role ${role}; exception when duplicate_object then null; end $$`);
    await client.query("alter role service_role bypassrls");
    await client.query(fixture);
    await client.query(`begin; ${original} commit;`);
    await client.query(`begin; ${overlap} commit;`);
    await client.query("insert into apex_entity(entity,endpoint,scope_needed,min_interval_minutes,required,delta_required) values('receiving-orders','/receiving-orders','view:receiving-orders',720,true,true),('transporter-orders','/transporter-orders','view:transporter-orders',240,false,false)");
    await client.query(`begin; ${repair}; commit;`);
    await client.query(`begin; ${continuity} commit;`);
    const query = (s, p) => client.query(s, p);
    const result = async (s, p) => (await query(s, p)).rows[0].result;
    const reset = async () => {
      await query("reset role; truncate apex_record_verification,apex_sync_page_receipt,apex_sync_verification,apex_empty_history_proof,apex_raw,apex_sync_run,apex_watermark,apex_entity,integration_secrets,net._http_response,net.fixture_http_request restart identity cascade;");
      await query("insert into apex_entity(entity,endpoint,scope_needed) values('receiving-orders','/receiving-orders','view:receiving-orders'),('transporter-orders','/transporter-orders','view:shipping-orders'),('fixture','/fixture','view:fixture'); insert into integration_secrets values('APEX_API_KEY','fixture-only-fake-token')");
      await query("insert into apex_raw(entity,apex_id,payload) values('company','4064',$1)", [JSON.stringify({ id: 4064, created_at: companyStart })]);
      await query("insert into apex_watermark(entity,updated_at_from) values($1,$2)", [receiving, companyStart]);
    };
    const start = (entity = receiving, connection = client) => connection.query("select tg_apex_begin_empty_history($1) result", [entity]).then(r => r.rows[0].result);
    const progress = id => result("select tg_apex_progress_empty_history($1) result", [id]);
    const proof = id => result("select to_jsonb(p) result from apex_empty_history_proof p where id=$1", [id]);
    const requests = () => query("select * from net.fixture_http_request order by id").then(r => r.rows);
    const wm = (entity = receiving) => result("select to_jsonb(w) result from apex_watermark w where entity=$1", [entity]);
    const respond = async (req, value, overrides = {}) => {
      const body = typeof value === "string" ? value : JSON.stringify(value);
      await query("insert into net._http_response(id,status_code,content,timed_out,error_msg) values($1,$2,$3,$4,$5)", [req.id, overrides.status ?? 200, body, overrides.timedOut ?? false, overrides.error ?? null]);
    };
    const empty = entity => ({ orders: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 1, path: `${base}/v1/${entity}` }, links: { next: null, prev: null } });
    const budget = async (id, body = { data: { credits_used: 100, monthly_credit_limit: 100000 } }) => {
      await respond((await requests())[0], body); return progress(id);
    };
    const respondLegs = async (id, transform = (label, body) => body) => {
      const p = await proof(id);
      for (const [label, request] of Object.entries(p.requests)) {
        if (label === "usage") continue;
        const body = label === "company" ? { company: { id: 4064, created_at: companyStart } }
          : label === "welcome" ? { access: ["view:company", "view:receiving-orders", "view:shipping-orders"] } : empty(p.entity);
        const changed = transform(label, body);
        if (changed !== undefined) await respond(request, changed);
      }
    };
    const makeProof = async (entity = receiving) => {
      const p = await start(entity); assert.equal((await budget(p.id)).state, "probing");
      await respondLegs(p.id); assert.equal((await progress(p.id)).state, "proven_empty"); return proof(p.id);
    };
    const beginSync = (entity = receiving) => result("select tg_apex_verification_begin($1,$2,$3,2) result", [randomUUID(), entity, companyStart]);
    const finish = (run, complete = true) => result("select tg_apex_verification_finish($1,$2,$3,null,200) result", [run.run_id, run.entity, complete]);
    const emptyPage = async run => {
      const body = JSON.stringify({ orders: [], meta: { total: 0, current_page: 1, last_page: 1 } });
      return result("select tg_apex_verification_page($1,$2,1,$3,$4,$5) result", [run.run_id, run.entity,
        { per_page: "2", page: "1", updated_at_from: run.request_from }, body, sha(body)]);
    };
    const nonemptyPage = async run => {
      const body = JSON.stringify({ orders: [{ id: 73, updated_at: run.started_at }], meta: { total: 1, current_page: 1, last_page: 1 } });
      return result("select tg_apex_verification_page($1,$2,1,$3,$4,$5) result", [run.run_id, run.entity,
        { per_page: "2", page: "1", ...(run.request_from ? { updated_at_from: run.request_from } : {}) }, body, sha(body)]);
    };

    await t.test("proof uses exact GET scope, preserves body hashes and leaves cursor untouched", async () => {
      for (const entity of [receiving, "transporter-orders"]) {
        await reset(); const before = entity === receiving ? await wm() : null; const p = await makeProof(entity);
        const sent = await requests(); assert.equal(sent.length, 6);
        assert.deepEqual(sent.map(r => r.url), [`${base}/v1/usage`, `${base}/v1/company`, `${base}/v1/welcome`, ...Array(3).fill(`${base}/v1/${entity}`)]);
        for (const request of sent) {
          assert.equal(request.headers.Accept, "application/json"); assert.equal(request.headers.Authorization, "Bearer fixture-only-fake-token");
          assert.equal(request.timeout_milliseconds, 20000);
        }
        assert.deepEqual(sent.slice(3).map(r => r.params.cancelled ?? null), [null, "false", "true"]);
        for (const request of sent.slice(3)) {
          assert.equal(request.params.per_page, "1"); assert.equal(request.params.page, "1");
          assert.ok(Date.parse(request.params.updated_at_from) < Date.parse(companyStart));
          assert.ok(!("with_items" in request.params));
        }
        assert.equal(p.context.company_id, "4064"); assert.equal(p.context.credential_sha256, sha("fixture-only-fake-token"));
        assert.equal(Object.keys(p.evidence).length, 6);
        for (const evidence of Object.values(p.evidence)) assert.equal(evidence.response_sha256, sha(evidence.response_body));
        if (entity === receiving) assert.deepEqual(await wm(), before);
        assert.equal(await result("select count(*)::int result from apex_raw where entity=$1", [entity]), 0);
        assert.equal((await progress(p.id)).state, "proven_empty"); assert.equal((await requests()).length, 6, "replay must issue no source requests");
      }
    });

    await t.test("ordinary first empty delta stays unverified; a proven bootstrap permits only a completed current replay", async () => {
      await reset(); let run = await beginSync(); await emptyPage(run);
      assert.match((await finish(run)).error, /Empty first delta/); assert.equal(Date.parse((await wm()).updated_at_from), Date.parse(companyStart));
      const p = await makeProof(); run = await beginSync(); await emptyPage(run);
      await query("set role service_role"); let completed;
      try { completed = await finish(run); } finally { await query("reset role"); }
      assert.equal(completed.state, "api_verified"); assert.equal(completed.empty_history_proof_id, p.id); assert.equal(completed.records_seen, 0);
      assert.equal((await wm()).updated_at_from, completed.started_at);
      assert.deepEqual(await finish(run), completed, "lost completion response resolves from the existing receipt");
    });

    await t.test("missing responses wait without turning silence into proof", async () => {
      await reset(); const p = await start(); assert.equal((await progress(p.id)).waiting_for, "usage"); assert.equal((await requests()).length, 1);
      await budget(p.id); await respondLegs(p.id, (label, body) => label === "cancelled" ? undefined : body);
      assert.equal((await progress(p.id)).state, "probing"); assert.equal((await proof(p.id)).finished_at, null);
    });

    await t.test("known credit headroom is required before the five source probes", async () => {
      for (const body of [{}, { data: { credits_used: 1, monthly_credit_limit: null } }, { data: { credits_used: -1, monthly_credit_limit: 100 } }, { data: { credits_used: 80, monthly_credit_limit: 100 } }]) {
        await reset(); const p = await start(); const refused = await budget(p.id, body);
        assert.equal(refused.state, "refused"); assert.match(refused.error, /credit/i); assert.equal((await requests()).length, 1);
        assert.equal(Date.parse((await wm()).updated_at_from), Date.parse(companyStart));
      }
    });

    await t.test("HTTP failure, malformed JSON and contradictory metadata cannot prove emptiness", async () => {
      const invalid = [
        ["nonempty", b => ({ ...b, orders: [{ id: 5 }], meta: { ...b.meta, total: 1 } })],
        ["missing-total", b => { delete b.meta.total; return b; }],
        ["string-total", b => ({ ...b, meta: { ...b.meta, total: "0" } })],
        ["next-page", b => ({ ...b, links: { ...b.links, next: "https://example.invalid/page/2" } })],
        ["wrong-page", b => ({ ...b, meta: { ...b.meta, current_page: 2 } })],
        ["wrong-path", b => ({ ...b, meta: { ...b.meta, path: `${base}/v1/shipping-orders` } })],
        ["missing-orders", b => { delete b.orders; return b; }],
        ["bad-json", () => "<html>not JSON</html>"],
      ];
      for (const [name, change] of invalid) {
        await reset(); const p = await start(); await budget(p.id); await respondLegs(p.id, (label, body) => label === "cancelled" ? change(body) : body);
        const done = await progress(p.id); assert.equal(done.state, "refused", name); assert.ok(done.error, name);
        assert.equal(Date.parse((await wm()).updated_at_from), Date.parse(companyStart));
      }
      for (const overrides of [{ status: 403 }, { status: 422 }, { timedOut: true }, { error: "connection refused" }]) {
        await reset(); const p = await start(); await respond((await requests())[0], {}, overrides);
        assert.equal((await progress(p.id)).state, "refused"); assert.equal((await requests()).length, 1);
      }
    });

    await t.test("source company, required scope and unfiltered history are validated", async () => {
      for (const mode of ["company-id", "company-date", "scope", "extra-filter"]) {
        await reset(); const p = await start(); await budget(p.id);
        await respondLegs(p.id, (label, body) => {
          if (mode === "company-id" && label === "company") body.company.id = 999;
          if (mode === "company-date" && label === "company") body.company.created_at = "2024-01-01T00:00:00Z";
          if (mode === "scope" && label === "welcome") body.access = ["view:company"];
          return body;
        });
        if (mode === "extra-filter") await query("update apex_empty_history_proof set requests=jsonb_set(requests,'{cancelled,params,invoice_number}','\"one-order-only\"') where id=$1", [p.id]);
        assert.equal((await progress(p.id)).state, "refused", mode);
      }
    });

    await t.test("changed credential/account/endpoint, raw rows and active workers invalidate pending proof", async () => {
      for (const mode of ["token", "account", "policy", "raw", "active"]) {
        await reset(); const p = await start(); await budget(p.id); await respondLegs(p.id);
        if (mode === "token") await query("update integration_secrets set value='rotated-fixture-token'");
        if (mode === "account") await query("update apex_raw set payload=payload||'{\"id\":999}' where entity='company'");
        if (mode === "policy") await query("update apex_entity set root_key='data' where entity=$1", [receiving]);
        if (mode === "raw") await query("insert into apex_raw(entity,apex_id,payload) values($1,'1','{\"id\":1}')", [receiving]);
        if (mode === "active") await beginSync();
        assert.equal((await progress(p.id)).state, "refused", mode);
      }
      await reset(); await beginSync(); await assert.rejects(() => start(), /sync is running/);
      await reset(); await query("insert into apex_raw(entity,apex_id,payload) values($1,'1','{\"id\":1}')", [receiving]);
      await assert.rejects(() => start(), /zero-record mirror/); assert.equal((await requests()).length, 0);
    });

    await t.test("an expired reservation is refused and its evidence remains immutable", async () => {
      await reset(); const p = await start();
      // Fixture-only time travel in a freshly created disposable database.
      await query("alter table apex_empty_history_proof disable trigger apex_empty_history_immutable");
      try { await query("update apex_empty_history_proof set started_at=clock_timestamp()-interval '1 hour' where id=$1", [p.id]); }
      finally { await query("alter table apex_empty_history_proof enable trigger apex_empty_history_immutable"); }
      const done = await progress(p.id); assert.equal(done.state, "refused"); assert.match(done.error, /expired/);
      await assert.rejects(() => query("update apex_empty_history_proof set error='erase refusal' where id=$1", [p.id]), /immutable/);
    });

    await t.test("continuity requires the same proof and exact cursor; a gap or changed source context fails", async () => {
      await reset(); const p = await makeProof();
      // Move proof start behind the default overlap in the fixture so the second
      // acceptance must use the predecessor, rather than the inception branch.
      await query("alter table apex_empty_history_proof disable trigger apex_empty_history_immutable");
      try { await query("update apex_empty_history_proof set started_at=started_at-interval '1 hour' where id=$1", [p.id]); }
      finally { await query("alter table apex_empty_history_proof enable trigger apex_empty_history_immutable"); }
      let run = await beginSync(); await emptyPage(run); const first = await finish(run); assert.equal(first.state, "api_verified");
      run = await beginSync(); await emptyPage(run); const next = await finish(run); assert.equal(next.state, "api_verified"); assert.equal(next.empty_history_proof_id, p.id);
      await query("update apex_watermark set updated_at_from=updated_at_from+interval '2 minutes' where entity=$1", [receiving]);
      run = await beginSync(); await emptyPage(run); assert.equal((await finish(run)).state, "incomplete", "cursor not backed by predecessor must fail");
      for (const mode of ["token", "account", "policy"]) {
        await reset(); await makeProof();
        if (mode === "token") await query("update integration_secrets set value='rotated-fixture-token'");
        if (mode === "account") await query("update apex_raw set payload=payload||'{\"id\":999}' where entity='company'");
        if (mode === "policy") await query("update apex_entity set scope_needed='different' where entity=$1", [receiving]);
        run = await beginSync(); await emptyPage(run); assert.equal((await finish(run)).state, "incomplete", mode);
      }
    });

    await t.test("nonempty deltas cannot bypass history continuity or changed source context", async () => {
      for (const mode of ["valid", "token", "account", "policy", "gap", "delta_disabled"]) {
        await reset(); const p = await makeProof();
        if (mode === "token") await query("update integration_secrets set value='rotated-fixture-token'");
        if (mode === "account") await query("update apex_raw set payload=payload||'{\"id\":999}' where entity='company'");
        if (mode === "policy") await query("update apex_entity set scope_needed='different' where entity=$1", [receiving]);
        if (mode === "gap") await query("update apex_watermark set updated_at_from=clock_timestamp()+interval '10 minutes' where entity=$1", [receiving]);
        if (mode === "delta_disabled") await query("update apex_entity set supports_delta=false where entity=$1", [receiving]);
        const before = await wm(); const run = await beginSync(); await nonemptyPage(run);
        const done = await finish(run);
        assert.equal(done.state, mode === "valid" ? "api_verified" : "incomplete", mode);
        if (mode === "valid") {
          assert.equal(done.empty_history_proof_id, p.id);
          assert.equal(Date.parse((await wm()).updated_at_from), Date.parse(run.started_at));
        } else {
          assert.match(done.error, /history context or cursor continuity/, mode);
          assert.equal((await wm()).updated_at_from, before.updated_at_from, mode);
          assert.equal(done.empty_history_proof_id, null, mode);
        }
      }
    });

    await t.test("cadence changes do not invalidate factual history evidence", async () => {
      await reset(); const p = await makeProof(); await query("update apex_entity set min_interval_minutes=11,why='fixture cadence change' where entity=$1", [receiving]);
      const run = await beginSync(); await emptyPage(run); const done = await finish(run);
      assert.equal(done.state, "api_verified"); assert.equal(done.empty_history_proof_id, p.id);
    });

    await t.test("raw rows from a failed pull and unrelated legacy receipts cannot initialize an empty feed", async () => {
      await reset(); const pending = await start();
      let run = await beginSync();
      const body = '{"orders":[{"id":7}],"meta":{"total":2,"last_page":2,"current_page":1}}';
      await result("select tg_apex_verification_page($1,$2,1,$3,$4,$5) result", [run.run_id, receiving,
        { page: "1", per_page: "2", updated_at_from: run.request_from }, body, sha(body)]);
      assert.equal((await finish(run, false)).state, "incomplete");
      assert.equal((await progress(pending.id)).state, "refused", "partial raw population invalidates an empty proof");
      run = await beginSync(); await emptyPage(run);
      assert.equal((await finish(run)).state, "incomplete", "raw existence cannot replace proof after bootstrap began");
      assert.equal(Date.parse((await wm()).updated_at_from), Date.parse(companyStart));

      await reset(); await makeProof();
      await query("update apex_watermark set updated_at_from=clock_timestamp()+interval '2 minutes' where entity=$1", [receiving]);
      await query("insert into apex_sync_verification(run_id,entity,started_at,lease_until,finished_at,state,policy,cursor_after,page_size,terminal_page,manifest_sha256) select $1,e.entity,clock_timestamp()-interval '1 minute',clock_timestamp(),clock_timestamp(),'api_verified',to_jsonb(e),w.updated_at_from,2,true,repeat('0',64) from apex_entity e join apex_watermark w using(entity) where e.entity=$2", [randomUUID(), receiving]);
      run = await beginSync(); await emptyPage(run);
      assert.equal((await finish(run)).state, "incomplete", "legacy success without the matching proof cannot bridge a gap");
    });

    await t.test("missing company evidence or key after proof produces an incomplete durable receipt", async () => {
      for (const mode of ["company", "key"]) {
        await reset(); await makeProof(); const run = await beginSync(); await emptyPage(run);
        if (mode === "company") await query("delete from apex_raw where entity='company'");
        else await query("delete from integration_secrets where name='APEX_API_KEY'");
        const done = await finish(run); assert.equal(done.state, "incomplete", mode);
        assert.match(done.error, /initialization context/, mode);
        assert.equal(Date.parse((await wm()).updated_at_from), Date.parse(companyStart));
        assert.equal(await result("select count(*)::int result from apex_sync_run where run_id=$1", [run.run_id]), 1);
      }
    });

    await t.test("restoring the prior completion function preserves proof, received data and current cursor", async () => {
      const priorFinish = original.match(/create or replace function public\.tg_apex_verification_finish\([\s\S]*?\$fn\$;/i)?.[0];
      const repairedFinish = repair.match(/create or replace function public\.tg_apex_verification_finish\([\s\S]*?\$function\$;/i)?.[0];
      assert.ok(priorFinish && repairedFinish, "both exact function versions must be available for recovery");
      await reset(); const p = await makeProof(); let run = await beginSync(); await emptyPage(run);
      const completed = await finish(run); assert.equal(completed.state, "api_verified");
      await query("insert into apex_raw(entity,apex_id,payload) values('fixture','received-after-deploy','{\"id\":\"received-after-deploy\"}')");
      const snapshot = () => result("select jsonb_build_object('proof',(select jsonb_agg(p order by id) from apex_empty_history_proof p),'raw',(select jsonb_agg(a order by id) from apex_raw a),'runs',(select jsonb_agg(v order by started_at,run_id) from apex_sync_verification v),'pages',(select jsonb_agg(p order by page_no) from apex_sync_page_receipt p),'watermark',(select jsonb_agg(w order by entity) from apex_watermark w)) result");
      const before = await snapshot();
      try {
        await query(priorFinish); assert.deepEqual(await snapshot(), before, "function recovery must not rewrite any persisted data");
        run = await beginSync(); await emptyPage(run); const refused = await finish(run);
        assert.equal(refused.state, "incomplete"); assert.match(refused.error, /Empty first delta/);
        assert.equal((await wm()).updated_at_from, completed.cursor_after, "old function must hold the newer cursor, never restore an old one");
        assert.equal((await proof(p.id)).state, "proven_empty");
        assert.equal(await result("select count(*)::int result from apex_raw where apex_id='received-after-deploy'"), 1);
        assert.deepEqual((await snapshot()).proof, before.proof); assert.deepEqual((await snapshot()).raw, before.raw);
      } finally { await query(continuity.match(/create or replace function public\.tg_apex_verification_finish\([\s\S]*?\$function\$;/i)[0]); }
    });

    await t.test("finished evidence is immutable and workers/browser roles cannot manufacture proof", async () => {
      await reset(); const p = await makeProof();
      await assert.rejects(() => query("update apex_empty_history_proof set state=state where id=$1", [p.id]), /immutable/);
      await assert.rejects(() => query("delete from apex_empty_history_proof where id=$1", [p.id]), /immutable/);
      for (const role of ["anon", "authenticated", "service_role"]) {
        await query(`set role ${role}`);
        try {
          await assert.rejects(() => start(), /permission denied/); await assert.rejects(() => progress(p.id), /permission denied/);
          await assert.rejects(() => query("update apex_empty_history_proof set error='fake'"), /permission denied/);
          await assert.rejects(() => query("truncate apex_empty_history_proof cascade"), /permission denied/);
          if (role !== "service_role") await assert.rejects(() => proof(p.id), /permission denied/);
          else assert.equal((await proof(p.id)).state, "proven_empty");
        } finally { await query("reset role"); }
      }
    });

    await t.test("simultaneous bootstrap requests share one reservation and one vendor request", { skip: other ? false : "local WASM has one session; CI exercises native concurrency" }, async () => {
      await reset(); const [a, b] = await Promise.all([start(receiving, client), start(receiving, other)]);
      assert.equal(a.id, b.id); assert.equal((await requests()).length, 1);
    });
  } finally {
    if (embedded) await embedded.close();
    else { if (other) await other.end(); if (client) await client.end(); if (admin) { await admin.query(`drop database if exists ${database}`); await admin.end(); } }
  }
});
