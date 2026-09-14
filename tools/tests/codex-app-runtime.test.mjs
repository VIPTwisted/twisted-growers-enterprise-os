import assert from "node:assert/strict";
import test from "node:test";
import { codexAppArgs } from "../../bridge/codex-app-runtime.mjs";

test("app-server is pinned to ChatGPT/OpenAI with supported stdio and live search", () => {
  const args = codexAppArgs();
  assert.deepEqual(args, [
    "--strict-config",
    "-c", 'forced_login_method="chatgpt"',
    "-c", 'model_provider="openai"',
    "--search",
    "app-server", "--stdio",
  ]);
  assert.ok(!args.includes("--full-auto"));
  assert.ok(!args.includes("--dangerously-bypass-approvals-and-sandbox"));
});
