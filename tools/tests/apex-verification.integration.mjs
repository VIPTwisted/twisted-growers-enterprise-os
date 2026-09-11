import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import test from "node:test";
import pg from "pg";

const migration = readFileSync(new URL("../repairs/gpt-apex-sync-verification.sql", import.meta.url), "utf8");
const firstMigration = readFileSync(new URL("../../supabase/migrations/20260911134123_gpt_apex_sync_source_verification.sql", import.meta.url), "utf8");
const upgrade = readFileSync(new URL("../repairs/gpt-apex-verification-paging-overlap.sql", import.meta.url), "utf8");
const seed = "2023-01-01T00:00:00Z";
const fixture = `
create table apex_entity(entity text primary key,endpoint text,api_version text default 'v1',root_key text default 'data',supports_delta boolean default true,supports_paging boolean default true,nesting jsonb default '{}');
create table apex_raw(id bigserial primary key,entity text not null,apex_id text,payload jsonb not null,payload_hash text generated always as (md5(payload::text)) stored,fetched_at timestamptz default now(),run_id uuid,unique(entity,apex_id,payload_hash));
create table apex_watermark(entity text primary key,updated_at_from timestamptz,last_success_at timestamptz,last_attempt_at timestamptz,consecutive_errors integer default 0);
create table apex_sync_run(id bigserial primary key,run_id uuid,entity text,started_at timestamptz,finished_at timestamptz,status text,http_status integer,rows_seen integer,rows_written integer,watermark_before timestamptz,watermark_after timestamptz,error text,meta_total integer);
grant usage on schema public to anon,authenticated,service_role;
grant select,insert,update on apex_entity,apex_raw,apex_watermark,apex_sync_run to service_role;
grant usage,select on all sequences in schema public to service_role;
`;

test("Apex source evidence and cursor transaction in isolated PostgreSQL", async t => {
  let client, other, admin, database, embedded;
  const embeddedPath = process.env.APEX_TEST_PGLITE_MODULE;
  if (embeddedPath) {
    assert.ok(!process.env.CI, "CI must run native PostgreSQL, including concurrent sessions");
    const { PGlite } = await import(pathToFileURL(embeddedPath).href);
    embedded = new PGlite();
    client = { query: (s, p) => p ? embedded.query(s, p) : embedded.exec(s).then(r => r.at(-1)) };
  } else {
    const connection = process.env.APEX_TEST_PGURL;
    assert.ok(connection, "APEX_TEST_PGURL must name the disposable test service");
    const url = new URL(connection);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Refusing a non-loopback fixture database");
    admin = new pg.Client({ connectionString: connection }); await admin.connect();
    database = `apex_fixture_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`create database ${database}`);
    url.pathname = `/${database}`;
    client = new pg.Client({ connectionString: url.href }); await client.connect();
    other = new pg.Client({ connectionString: url.href }); await other.connect();
  }
  try {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await client.query(`do $$ begin create role ${role}; exception when duplicate_object then null; end $$;`);
    }
    await client.query("alter role service_role bypassrls");
    await client.query(fixture);
    await client.query(`begin; ${firstMigration} commit;`);
    await client.query(`begin; ${upgrade} commit;`);
    const query = (s, p) => client.query(s, p);
    const result = async (s, p) => (await query(s, p)).rows[0].result;
    const reset = async () => {
      await query("reset role; truncate apex_record_verification,apex_sync_page_receipt,apex_sync_verification,apex_raw,apex_sync_run,apex_watermark,apex_entity cascade; insert into apex_entity(entity,endpoint) values('fixture','/fixture');");
    };
    const begin = (id = randomUUID(), c = client) => c.query("select tg_apex_verification_begin($1,'fixture',$2,2) result", [id, seed]).then(r => r.rows[0].result);
    const page = (id, n, body, override = {}) => {
      const text = typeof body === "string" ? body : JSON.stringify(body);
      return result("select tg_apex_verification_page($1,'fixture',$2,$3,$4,$5) result", [id, n,
        { per_page: "2", page: String(n), updated_at_from: seed, ...override }, text, createHash("sha256").update(text).digest("hex")]);
    };
    const finish = (id, complete = true, error = null, status = 200) => result("select tg_apex_verification_finish($1,'fixture',$2,$3,$4) result", [id, complete, error, status]);
    const wm = () => result("select coalesce((select to_jsonb(w) from apex_watermark w where entity='fixture'),'null') result");

    await t.test("all pages and exact decimal/large-ID payloads survive without JS rounding", async () => {
      await reset(); await query("set role service_role");
      const run = await begin();
      const first = '{"data":[{"id":9007199254740993123,"amount":123456789.123456789,"nested":{"x":null}}],"meta":{"total":2,"last_page":2,"current_page":1}}';
      assert.equal((await page(run.run_id, 1, first)).has_more, true, "short page must obey source's explicit next page");
      assert.equal((await page(run.run_id, 1, first)).replayed, true);
      await page(run.run_id, 2, { data: [{ id: "second", amount: 0 }], meta: { total: 2, last_page: 2, current_page: 2 } });
      const done = await finish(run.run_id);
      assert.equal(done.state, "api_verified"); assert.equal(done.records_seen, 2); assert.equal(done.records_written, 2);
      assert.equal(done.manifest_sha256.length, 64);
      assert.equal((await result("select payload->>'amount' result from apex_raw where apex_id='9007199254740993123'")), "123456789.123456789");
      assert.equal((await wm()).updated_at_from, done.started_at);
      assert.deepEqual(await finish(run.run_id), done, "completion reply may be retried without double-writing");
      assert.equal(await result("select count(*)::int result from apex_sync_run"), 1);
      await query("reset role");
    });
    await t.test("page receipt and all its records roll back together on a storage failure", async () => {
      await reset(); const run = await begin();
      await query("alter table apex_raw add constraint fixture_refuse check (apex_id<>'bad')");
      try { await assert.rejects(() => page(run.run_id, 1, { data: [{ id: "good" }, { id: "bad" }] }), /fixture_refuse/); }
      finally { await query("alter table apex_raw drop constraint fixture_refuse"); }
      for (const table of ["apex_raw", "apex_sync_page_receipt", "apex_record_verification"]) assert.equal(await result(`select count(*)::int result from ${table}`), 0);
      assert.equal((await finish(run.run_id, false, "failed insert")).state, "error");
      assert.equal((await wm()).updated_at_from, null);
    });
    await t.test("failed final log insert cannot advance cursor or mark proof complete", async () => {
      await reset(); const run = await begin(); await page(run.run_id, 1, { data: [{ id: 1 }] });
      await query("alter table apex_sync_run add constraint fixture_log_failure check(status<>'ok')");
      try { await assert.rejects(() => finish(run.run_id), /fixture_log_failure/); }
      finally { await query("alter table apex_sync_run drop constraint fixture_log_failure"); }
      assert.equal(await wm(), null);
      assert.equal(await result("select state result from apex_sync_verification"), "running");
      assert.equal((await finish(run.run_id)).state, "api_verified");
    });
    await t.test("missing, repeated, reordered and changed pages never pass", async () => {
      for (const mode of ["missing", "repeat", "changed-replay", "wrong-params", "wrong-current", "changed-total", "short-total", "empty-more", "bad-root", "missing-id"]) {
        await reset(); const run = await begin();
        await page(run.run_id, 1, { data: [{ id: 1 }], meta: { total: 2, last_page: 2, current_page: 1 } });
        if (mode !== "missing") {
          const body = { data: [{ id: 2 }], meta: { total: 2, last_page: 2, current_page: 2 } };
          if (mode === "repeat") body.data = [{ id: 1 }];
          if (mode === "changed-total") body.meta.total = 3;
          if (mode === "wrong-current") body.meta.current_page = 1;
          if (mode === "short-total" || mode === "empty-more") body.data = [];
          if (mode === "empty-more") body.meta.last_page = 3;
          if (mode === "bad-root") delete body.data;
          if (mode === "missing-id") body.data = [{ amount: 1 }];
          await assert.rejects(() => page(run.run_id, mode === "changed-replay" ? 1 : 2, body, mode === "wrong-params" ? { updated_at_from: "2024-01-01" } : {}), undefined, mode);
        }
        const done = await finish(run.run_id);
        assert.equal(done.state, "incomplete", mode); assert.equal((await wm()).updated_at_from, null, mode);
        assert.equal(await result("select count(*)::int result from apex_raw"), 1, "valid earlier page remains available for recovery");
      }
    });
    await t.test("body hashes, unique identities and source success are mandatory", async () => {
      await reset(); let run = await begin();
      await assert.rejects(() => result("select tg_apex_verification_page($1,'fixture',1,'{}','{}',repeat('0',64)) result", [run.run_id]), /hash mismatch/);
      await assert.rejects(() => page(run.run_id, 1, { data: [{ id: 1 }, { id: 1 }] }), /repeats an identity/);
      for (const args of [[true, null, null], [true, null, 500], [null, null, 200]]) {
        await reset(); run = await begin(); await page(run.run_id, 1, { data: [{ id: 1 }] });
        assert.equal((await finish(run.run_id, ...args)).state, "incomplete");
        assert.equal((await wm()).updated_at_from, null);
      }
    });
    await t.test("the source cannot shrink, grow or omit its declared last page when total is absent", async () => {
      for (const last of [2, 4, null]) {
        await reset(); const run = await begin();
        await page(run.run_id, 1, { data: [{ id: 1 }], meta: { current_page: 1, last_page: 3 } });
        const meta = { current_page: 2 }; if (last !== null) meta.last_page = last;
        await assert.rejects(() => page(run.run_id, 2, { data: [{ id: 2 }], meta }), /last page changed/);
        assert.equal((await finish(run.run_id)).state, "incomplete");
        assert.equal((await wm()).updated_at_from, null);
      }
    });
    await t.test("delta overlap is policy-driven and does not move the first-history seed", async () => {
      await reset(); let run = await begin(); assert.equal(Date.parse(run.request_from), Date.parse(seed));
      await finish(run.run_id, false, "fixture stopped");
      await query("update apex_watermark set updated_at_from='2026-09-11T12:00:00.123456Z'; update apex_entity set verification_overlap_seconds=90");
      run = await begin();
      assert.equal(Date.parse(run.request_from), Date.parse(run.cursor_before)-90_000);
      await result("select tg_apex_verification_page($1,'fixture',1,$2,$3,$4) result", [run.run_id,
        { page: "1", per_page: "2", updated_at_from: run.request_from }, '{"data":[{"id":1}]}', createHash("sha256").update('{"data":[{"id":1}]}').digest("hex")]);
      const done = await finish(run.run_id); assert.equal(done.state, "api_verified");
      assert.equal(Date.parse(done.cursor_after), Date.parse(run.started_at));
    });
    await t.test("empty first delta holds cursor, while an explicit full empty population can be verified", async () => {
      await reset(); let run = await begin(); await page(run.run_id, 1, { data: [] });
      assert.match((await finish(run.run_id)).error, /Empty first delta/);
      await query("update apex_entity set supports_delta=false"); run = await begin();
      const text = '{"data":[],"meta":{"total":0,"last_page":1,"current_page":1}}';
      await result("select tg_apex_verification_page($1,'fixture',1,$2,$3,$4) result", [run.run_id, { page: "1", per_page: "2" }, text, createHash("sha256").update(text).digest("hex")]);
      assert.equal((await finish(run.run_id)).state, "api_verified");
    });
    await t.test("stored payload alteration, policy changes and concurrent cursor writes invalidate completion", async () => {
      for (const mode of ["payload", "policy", "cursor"]) {
        await reset(); const run = await begin(); await page(run.run_id, 1, { data: [{ id: 1, amount: 3 }] });
        if (mode === "payload") await query("update apex_raw set payload=payload||'{\"amount\":4}'");
        if (mode === "policy") await query("update apex_entity set nesting='{\"with_items\":\"true\"}'");
        if (mode === "cursor") await query("insert into apex_watermark(entity,updated_at_from) values('fixture','2025-01-01')");
        assert.equal((await finish(run.run_id)).state, "incomplete", mode);
        if (mode === "cursor") assert.match((await wm()).updated_at_from, /^2025-01-01/);
      }
    });
    await t.test("expired workers cannot finish late and active workers exclude another run", async () => {
      await reset(); const first = await begin();
      await assert.rejects(() => begin(), /still active/);
      await query("update apex_sync_verification set lease_until=clock_timestamp()-interval '1 second'");
      const next = await begin();
      assert.notEqual(next.run_id, first.run_id);
      await assert.rejects(() => page(first.run_id, 1, { data: [{ id: 1 }] }), /closed or expired/);
      assert.equal((await finish(first.run_id)).state, "error");
    });
    await t.test("simultaneous reservations have one owner", { skip: other ? false : "local WASM has one session; CI runs this on two native PostgreSQL connections" }, async () => {
      await reset();
      const races = await Promise.allSettled([begin(randomUUID(), client), begin(randomUUID(), other)]);
      assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
      assert.equal(races.filter(r => r.status === "rejected").length, 1);
    });
    await t.test("evidence is immutable and inaccessible to browser roles", async () => {
      await reset(); const run = await begin(); await page(run.run_id, 1, { data: [{ id: 1 }] }); await finish(run.run_id);
      for (const table of ["apex_sync_verification", "apex_sync_page_receipt", "apex_record_verification"]) {
        await assert.rejects(() => query(`delete from ${table}`), /immutable/);
        await assert.rejects(() => query(`update ${table} set entity=entity`), /immutable/);
        await query("set role service_role");
        try { await assert.rejects(() => query(`truncate ${table} cascade`), /permission denied/); }
        finally { await query("reset role"); }
        for (const role of ["anon", "authenticated"]) {
          await query(`set role ${role}`);
          try { await assert.rejects(() => query(`select * from ${table}`), /permission denied/); await assert.rejects(() => begin(), /permission denied/); }
          finally { await query("reset role"); }
        }
      }
    });
    await t.test("reapplying the additive migration preserves newer business data and all receipts", async () => {
      await reset(); const run = await begin(); await page(run.run_id, 1, { data: [{ id: "before" }] }); await finish(run.run_id);
      await query("insert into apex_raw(entity,apex_id,payload) values('fixture','after','{\"id\":\"after\"}')");
      const snapshot = () => result("select jsonb_build_object('raw',(select jsonb_agg(a order by id) from apex_raw a),'runs',(select jsonb_agg(v) from apex_sync_verification v),'pages',(select jsonb_agg(p) from apex_sync_page_receipt p),'records',(select jsonb_agg(r) from apex_record_verification r),'wm',(select jsonb_agg(w) from apex_watermark w)) result");
      const before = await snapshot(); await query(`begin; ${migration} commit;`); assert.deepEqual(await snapshot(), before);
    });
  } finally {
    if (embedded) await embedded.close();
    else { if (other) await other.end(); if (client) await client.end(); if (admin) { await admin.query(`drop database if exists ${database}`); await admin.end(); } }
  }
});
