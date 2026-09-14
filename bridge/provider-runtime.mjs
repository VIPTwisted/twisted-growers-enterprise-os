import { existsSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const API_ENV_NAMES = new Set([
  "ANTHROPIC_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "CODEX_ACCESS_TOKEN",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENAI_API_BASE",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
]);

export function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (["gpt", "openai", "codex"].includes(provider)) return "gpt";
  if (["claude", "anthropic"].includes(provider)) return "claude";
  return null;
}

export function sanitizeRunnerEnv(source = process.env) {
  const clean = {};
  for (const [name, value] of Object.entries(source)) {
    if (!API_ENV_NAMES.has(name.toUpperCase())) clean[name] = value;
  }
  return clean;
}

export function usableCodexModel(value) {
  const model = String(value || "").trim();
  if (!model || /^(current|default|gpt-current|chatgpt-current)$/i.test(model)) return "";
  const aliases = {
    "gpt-5": "gpt-5",
    "gpt-5 thinking": "gpt-5",
    "gpt-4o": "gpt-4o",
    "o3": "o3",
  };
  return aliases[model.toLowerCase()] || model;
}

export function codexArgs(model) {
  const args = [
    "--ask-for-approval", "never",
    "--strict-config",
    "-c", 'forced_login_method="chatgpt"',
    "-c", 'model_provider="openai"',
    "--search",
    "exec",
    "--json",
    "--sandbox", "read-only",
  ];
  const selected = usableCodexModel(model);
  if (selected) args.push("--model", selected);
  args.push("-");
  return args;
}

export function findCodexBinary(env = process.env, home = os.homedir()) {
  if (env.TG_CODEX_BIN) return env.TG_CODEX_BIN;

  const local = env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const binRoot = path.join(local, "OpenAI", "Codex", "bin");
  if (existsSync(binRoot)) {
    const candidates = [];
    for (const entry of readdirSync(binRoot)) {
      const candidate = path.join(binRoot, entry, "codex.exe");
      if (!existsSync(candidate)) continue;
      let changed = 0;
      try { changed = statSync(candidate).mtimeMs; } catch { /* use zero */ }
      candidates.push({ candidate, changed });
    }
    candidates.sort((a, b) => b.changed - a.changed);
    if (candidates.length) return candidates[0].candidate;
  }

  const appData = env.APPDATA || path.join(home, "AppData", "Roaming");
  const npmShim = path.join(appData, "npm", "codex.cmd");
  return existsSync(npmShim) ? npmShim : "codex.exe";
}

export function parseProviderOutput(provider, stdout) {
  const text = String(stdout || "").trim();
  if (!text) return { reply: "", threadId: null, error: "" };

  if (provider === "claude") {
    try {
      const envelope = JSON.parse(text);
      const reply = envelope?.result ?? envelope?.text ?? envelope?.reply ?? text;
      return {
        reply: typeof reply === "string" ? reply.trim() : text,
        threadId: envelope?.session_id || null,
        error: envelope?.is_error ? String(reply || "Claude returned an error.") : "",
      };
    } catch {
      return { reply: text, threadId: null, error: "" };
    }
  }

  if (provider !== "gpt") {
    return { reply: "", threadId: null, error: `Unsupported desktop provider: ${provider || "(missing)"}.` };
  }

  let reply = "";
  let threadId = null;
  let error = "";
  let sawJson = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      sawJson = true;
      if (event.type === "thread.started" && event.thread_id) threadId = String(event.thread_id);
      if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item?.text) {
        reply = String(event.item.text).trim();
      }
      if (/error|failed/.test(String(event.type || "")) && !error) {
        error = String(event.error?.message || event.message || event.error || "Codex returned an error.");
      }
    } catch { /* stderr never belongs here; ignore a non-JSON stdout line */ }
  }
  if (!sawJson) return { reply: text, threadId: null, error: "" };
  return { reply, threadId, error };
}
