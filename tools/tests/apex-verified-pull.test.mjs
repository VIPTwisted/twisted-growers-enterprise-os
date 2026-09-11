import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { transform } from "../../app/web/node_modules/esbuild/lib/main.js";

const source = readFileSync(new URL("../../app/supabase/functions/apex-sync/verified-pull.ts", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "ts", format: "esm" });
const { pullVerifiedEntity } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const run = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const seed = "2023-01-01T00:00:00Z";
const policy = { entity: "fixture", api_version: "v1", endpoint: "/fixture", supports_delta: true, supports_paging: true, nesting: { with_items: "true" } };
const closed = { run_id: run, entity: "fixture", state: "api_verified", ok: true, records_seen: 2, records_written: 1, page_count: 2 };
function harness(options = {}) {
  const calls = [], requests = [], pauses = [];
  const dependencies = {
    pageSize: 2, maxPages: 2, pauseMs: 250, maxRateRetries: 3,
    sleep: async ms => { pauses.push(ms); },
    get: async (path, params) => {
      requests.push({ path, params });
      return options.get ? options.get(requests.length) : new Response('{"data":[{"id":9007199254740993123,"amount":123.1234567890123456789}]}');
    },
    db: { rpc: async (name, args) => {
      calls.push({ name, args });
      if (options.rpc) { const result = options.rpc(name, args, calls); if (result !== undefined) return result; }
      if (name.endsWith("begin")) return { data: { run_id: run, entity: "fixture", state: "running", request_from: seed, policy }, error: null };
      if (name.endsWith("page")) return { data: { has_more: args.p_page === 1 }, error: null };
      return { data: closed, error: null };
    } },
  };
  return { calls, requests, pauses, run: () => pullVerifiedEntity(dependencies, "fixture", run, seed) };
}

test("verified worker preserves response text and follows database pagination verdict", async () => {
  const h = harness(); assert.match(await h.run(), /^1 new of 2 returned/);
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests[1], { path: "/v1/fixture", params: { with_items: "true", per_page: "2", page: "2", updated_at_from: seed } });
  for (const { args } of h.calls.filter(x => x.name.endsWith("page"))) {
    assert.match(args.p_body, /9007199254740993123/);
    assert.match(args.p_body, /123\.1234567890123456789/);
    assert.equal(args.p_sha256, createHash("sha256").update(args.p_body).digest("hex"));
  }
  assert.equal(h.calls.at(-1).args.p_complete, true);
});
test("database reservation failure sends no vendor request", async () => {
  const h = harness({ rpc: name => name.endsWith("begin") ? { data: null, error: { message: "already active" } } : undefined });
  assert.match(await h.run(), /^ERROR.*already active/); assert.equal(h.requests.length, 0);
});
test("every page, receipt and final persistence failure is reported", async () => {
  for (const mode of ["page-write", "missing-page-verdict", "finish-write", "incomplete"]) {
    const h = harness({ rpc: (name, args) => {
      if (name.endsWith("page") && mode === "page-write") return { data: null, error: { message: "insert failed" } };
      if (name.endsWith("page") && mode === "missing-page-verdict") return { data: {}, error: null };
      if (name.endsWith("finish")) {
        if (mode === "finish-write") return { data: null, error: { message: "log write failed" } };
        if (!args.p_complete || mode === "incomplete") return { data: { ...closed, ok: false, state: "incomplete", error: "not complete" }, error: null };
      }
    } });
    assert.match(await h.run(), /^(ERROR|INCOMPLETE)/, mode);
    if (mode !== "incomplete") assert.equal(h.calls.at(-1).args.p_complete, false);
  }
});
test("a lost completion response is resolved from the committed receipt", async () => {
  let finishes = 0;
  const h = harness({ rpc: name => name.endsWith("finish") && ++finishes === 1 ? { data: null, error: { message: "reply lost" } } : undefined });
  assert.match(await h.run(), /^1 new of 2 returned/); assert.equal(finishes, 2);
});
test("source failures and page ceiling cannot claim a completed pull", async () => {
  for (const mode of ["403", "429-cap", "ceiling"]) {
    const h = harness({
      get: mode === "ceiling" ? undefined : () => new Response("refused", { status: mode === "403" ? 403 : 429 }),
      rpc: name => name.endsWith("page") ? { data: { has_more: true }, error: null }
        : name.endsWith("finish") ? { data: { ...closed, ok: false, state: "incomplete" }, error: null } : undefined,
    });
    assert.match(await h.run(), /^ERROR/, mode); assert.equal(h.calls.at(-1).args.p_complete, false);
    assert.equal(h.requests.length, mode === "ceiling" ? 2 : 1);
  }
});
test("rate retries repeat the same page and honor Retry-After", async () => {
  const h = harness({ get: n => n === 1 ? new Response("rate limit", { status: 429, headers: { "retry-after": "2" } }) : new Response('{"data":[]}') });
  await h.run(); assert.equal(h.pauses[0], 2000); assert.deepEqual(h.requests[0], h.requests[1]);
});
