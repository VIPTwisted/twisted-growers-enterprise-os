import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../app/supabase/functions/bridge-queue/index.ts", import.meta.url), "utf8");

test("bridge queue claims immutable owner and positive revision context", () => {
  assert.match(source, /REVISION_BRIDGE_VERSION = '3\.0-codex-subscription'/);
  assert.match(source, /select\('id, question, context, provider, model, asked_by'\)/);
  assert.match(source, /revision: Number\.isFinite\(currentRevision\) && currentRevision > 0 \? currentRevision : 1/);
});

test("bridge queue refuses stale or missing answer revisions", () => {
  assert.match(source, /!Number\.isFinite\(expectedRevision\) \|\| !Number\.isFinite\(answerRevision\) \|\| expectedRevision !== answerRevision/);
  assert.match(source, /contains\('context', \{ revision: answerRevision \}\)/);
  assert.match(source, /does not carry the exact claimed revision/);
});

test("bridge queue cancellation state exposes revision and successful answers cannot be blank", () => {
  assert.match(source, /A successful answer cannot be blank/);
  assert.match(source, /revision: data\.context\?\.revision \?\? null/);
});
