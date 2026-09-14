import assert from "node:assert/strict";
import test from "node:test";

import { readOnlySql } from "../../bridge/codex-postgres-mcp.mjs";

test("TG OS Codex database tool admits one read-only statement", () => {
  assert.equal(readOnlySql("select 1"), true);
  assert.equal(readOnlySql("/* evidence */ with x as (select 1) select * from x;"), true);
  assert.equal(readOnlySql("show transaction_read_only"), true);
  assert.equal(readOnlySql("explain select 1"), true);
});

test("TG OS Codex database tool refuses writes and statement stacking", () => {
  assert.equal(readOnlySql("update tasks set status = 'done'"), false);
  assert.equal(readOnlySql("delete from tasks"), false);
  assert.equal(readOnlySql("with d as (delete from tasks returning *) select * from d"), false);
  assert.equal(readOnlySql("explain analyze delete from tasks"), false);
  assert.equal(readOnlySql("select pg_sleep(10)"), false);
  assert.equal(readOnlySql("select set_config('search_path', 'public', false)"), false);
  assert.equal(readOnlySql("copy tasks to stdout"), false);
  assert.equal(readOnlySql("select 1; select 2"), false);
  assert.equal(readOnlySql(""), false);
});
