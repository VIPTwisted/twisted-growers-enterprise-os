import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../app/web/src/budz.jsx", import.meta.url), "utf8");

test("Budz keeps queue bigint ids separate from OS task UUID ids", () => {
  assert.match(source, /const BRIDGE_JOB_ID = "\(\[0-9\]\+\)"/);
  assert.match(source, /const PLATFORM_TASK_ID = "\(\[0-9a-f\]\{8\}-\[0-9a-f-\]\{27,\}\)"/);
  assert.match(source, /cancel\|stop\|pause\|resume\|prioriti\[sz\]e\|revise[\s\S]{0,120}\\d\+/);
});

test("authorized task write-back uses live approval, activity and exact task re-read", () => {
  assert.match(source, /supabase\.rpc\("f_ai_may"/);
  assert.match(source, /from\("task_activity"\)\.insert/);
  assert.match(source, /from\("tasks"\)[\s\S]{0,200}\.eq\("id", inserted\.id\)/);
  assert.match(source, /f_ai_may allowed · exact re-read/);
});

test("bridge controls use compare-and-set status and revision", () => {
  assert.match(source, /\.eq\("status", job\.status\)/);
  assert.match(source, /\.contains\("context", \{ revision: expectedRevision \}\)/);
  assert.match(source, /TG OS task control · compare-and-set · exact re-read/);
});
