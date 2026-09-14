import assert from "node:assert/strict";
import test from "node:test";

import {
  codexArgs,
  normalizeProvider,
  parseProviderOutput,
  sanitizeRunnerEnv,
  usableCodexModel,
} from "../../bridge/provider-runtime.mjs";

test("provider aliases resolve explicitly and unknown providers never fall through", () => {
  assert.equal(normalizeProvider("openai"), "gpt");
  assert.equal(normalizeProvider("codex"), "gpt");
  assert.equal(normalizeProvider("anthropic"), "claude");
  assert.equal(normalizeProvider("grok"), null);
});

test("Codex is forced onto ChatGPT auth in a read-only non-interactive run", () => {
  const args = codexArgs("gpt-current");
  assert.deepEqual(args.slice(0, 10), [
    "--ask-for-approval", "never", "--strict-config",
    "-c", 'forced_login_method="chatgpt"',
    "-c", 'model_provider="openai"',
    "--search", "exec", "--json",
  ]);
  assert.ok(args.includes("--json"));
  assert.ok(args.includes("--search"));
  assert.deepEqual(args.slice(-3), ["--sandbox", "read-only", "-"]);
  assert.ok(!args.includes("--full-auto"));
  assert.ok(!args.includes("--model"));
  assert.equal(usableCodexModel("gpt-current"), "");
});

test("API and alternate-provider credentials are removed from the child environment", () => {
  const clean = sanitizeRunnerEnv({
    Path: "ok",
    OPENAI_API_KEY: "must-not-travel",
    CODEX_ACCESS_TOKEN: "must-not-travel",
    ANTHROPIC_API_KEY: "must-not-travel",
    OPENAI_BASE_URL: "must-not-travel",
  });
  assert.deepEqual(clean, { Path: "ok" });
});

test("Codex JSONL yields the final assistant message and thread receipt", () => {
  const parsed = parseProviderOutput("gpt", [
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "first" } }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "final answer" } }),
    JSON.stringify({ type: "turn.completed" }),
  ].join("\n"));
  assert.deepEqual(parsed, { reply: "final answer", threadId: "thread-1", error: "" });
});

test("Claude JSON remains supported", () => {
  const parsed = parseProviderOutput("claude", JSON.stringify({ session_id: "c-1", result: "Claude answer" }));
  assert.deepEqual(parsed, { reply: "Claude answer", threadId: "c-1", error: "" });
});
