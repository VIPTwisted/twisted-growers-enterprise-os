import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { GptAppClient } from "./gpt-app-client.mjs";
import { sanitizeRunnerEnv, usableCodexModel } from "./provider-runtime.mjs";
import { readOnlySql } from "./read-only-sql.mjs";

export function codexAppArgs() {
  return [
    "--strict-config",
    "-c", 'forced_login_method="chatgpt"',
    "-c", 'model_provider="openai"',
    "--search",
    "app-server", "--stdio",
  ];
}

export class CodexAppRuntime extends EventEmitter {
  constructor({ bin, cwd, env = process.env, timeoutMs = 5 * 60 * 1000 }) {
    super();
    this.bin = bin;
    this.cwd = cwd;
    this.env = env;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.client = null;
    this.starting = null;
    this.threads = new Map();
    this.active = new Map();
    this.authentication = null;
  }

  async start() {
    if (this.client?.ready) return this.authentication;
    if (this.starting) return this.starting;
    this.starting = this.#start();
    try { return await this.starting; }
    finally { this.starting = null; }
  }

  async #start() {
    const env = {
      ...sanitizeRunnerEnv(this.env),
      CI: "1",
      TG_PROJECT: this.cwd,
    };
    const child = spawn(this.bin, codexAppArgs(), {
      cwd: this.cwd,
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    const client = new GptAppClient({
      input: child.stdin,
      output: child.stdout,
      timeoutMs: 30000,
      approveMcp: (params) =>
        params?.serverName === "twisted-growers" &&
        params?._meta?.codex_approval_kind === "mcp_tool_call" &&
        params?._meta?.tool_title === "Query TG OS (read only)" &&
        readOnlySql(params?._meta?.tool_params?.sql),
    });
    this.client = client;
    client.on("notification", (message) => this.emit("notification", message));
    client.on("approvalUnavailable", (request) => this.emit("approvalUnavailable", request));
    client.on("mcpApproved", (request) => this.emit("mcpApproved", request));
    client.on("disconnected", ({ message }) => {
      this.emit("disconnected", { message });
      if (this.client === client) {
        this.child = null;
        this.client = null;
        this.authentication = null;
        this.threads.clear();
        this.active.clear();
      }
      if (!child.killed) child.kill();
    });
    child.once("close", (code) => {
      if (!client.closed) client.close(new Error(`Codex app-server exited ${code}. ${stderr.slice(-600)}`));
      if (this.child === child) {
        this.child = null;
        this.client = null;
        this.authentication = null;
        this.threads.clear();
        this.active.clear();
      }
    });
    child.once("error", (error) => client.close(error));

    const authentication = await client.initialize();
    if (authentication.authentication !== "chatgpt") {
      this.stop();
      throw new Error("Codex app-server did not verify ChatGPT subscription authentication");
    }
    this.authentication = authentication;
    return authentication;
  }

  async run({ prompt, conversationId, model, threadId: durableThreadId = null }) {
    await this.start();
    const key = String(conversationId || "tg-os-default");
    let threadId = this.threads.get(key);
    if (!threadId) {
      threadId = await this.client.openThread({
        threadId: durableThreadId || undefined,
        cwd: this.cwd,
        model: usableCodexModel(model) || undefined,
      });
      this.threads.set(key, threadId);
    }

    const accepted = await this.client.startTurn(threadId, prompt, usableCodexModel(model) || undefined);
    const turnId = accepted?.turn?.id;
    if (!turnId) throw new Error("Codex did not return a turn receipt");
    this.active.set(key, { threadId, turnId });
    try {
      const complete = await this.client.waitForTurn(threadId, turnId, this.timeoutMs);
      return { ok: true, reply: complete.reply, threadId, turnId, authentication: "chatgpt" };
    } finally {
      this.active.delete(key);
    }
  }

  async interrupt(conversationId) {
    const key = String(conversationId || "tg-os-default");
    const turn = this.active.get(key);
    if (!turn || !this.client?.ready) return { ok: false, reason: "no-active-turn" };
    await this.client.interruptTurn(turn.threadId, turn.turnId);
    return { ok: true, ...turn };
  }

  stop() {
    const child = this.child;
    if (this.client && !this.client.closed) this.client.close(new Error("Codex app-server stopped"));
    if (child && !child.killed) child.kill();
    this.child = null;
    this.client = null;
    this.authentication = null;
    this.threads.clear();
    this.active.clear();
  }
}
