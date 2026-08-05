/**
 * Twisted Growers — local Claude bridge
 *
 * Runs on this machine only. The OS chat box posts a question here, this runs
 * Claude Code against the real project and database, and sends the answer back.
 *
 * Costs nothing beyond the Claude subscription already being paid for.
 * Binds to 127.0.0.1, so nothing outside this computer can reach it.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.TG_BRIDGE_PORT || 8765);
const PROJECT = process.env.TG_PROJECT || "C:\\Users\\demar\\Documents\\Claude_Twisted Growers";
const CLAUDE = process.env.TG_CLAUDE_BIN || path.join(os.homedir(), "AppData", "Roaming", "npm", "claude.cmd");

// Shared secret so only the OS can drive it. Read from a file next to this script.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(HERE, "token.txt");
const TOKEN =
  process.env.TG_BRIDGE_TOKEN ||
  (existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, "utf8").trim() : "tg-bridge-local");

const ALLOWED = [
  "https://twisted-growers-enterprise-os.netlify.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

const SYSTEM_BRIEF = `You are the assistant inside the Twisted Growers Enterprise OS, answering a question typed by the owner or an executive while they work.

Twisted Growers is a Massachusetts cannabis company: cultivation licence MC281714, manufacturing licence MP281909.
You have read access to the live Supabase database through the twisted-growers MCP connector, and to this project on disk.

HOW TO ANSWER
- Query the database for the real numbers. Never guess and never invent a statistic.
- Be direct and specific: name harvests, rooms, strains, dates and numbers.
- Keep it tight unless depth is asked for. No preamble.
- If asked what something means, give the professional answer, then one short paragraph a tenth grader would follow.
- If the data cannot answer it, say exactly that and name what would be needed.

FACTS YOU MUST NOT GET WRONG
- Fresh cannabis is 75-80 percent water, so a 4:1 to 5:1 wet:dry ratio is standard. Wet-to-packaged of 20-25 percent is NORMAL, not underperformance. Above about 30 percent usually means the wet weight was recorded too low at takedown.
- Grams per plant is NOT a valid benchmark; it is set by plant density and veg time. The published benchmark is grams per square foot of canopy: about 35 start-up, 50-70 established.
- A harvest with no finished date has not finished packaging. Never include it when calculating conversion.
- The room recorded on a harvest is the DRYING location, not the grow room.
- Standard dry window is 10-14 days from cut to first package.

OWNER RULES: harvests may finish early, never late. Every material needs an approved allocation before it moves.

Useful views: v_harvest_forensic, v_harvest_issues, v_dry_room_performance, v_monthly_conversion_truth,
v_coa_register, v_inventory_locator, v_metrc_transfer_ledger, v_awaiting_allocation, v_late_violations,
v_real_loss_summary, v_goal_status, v_data_verification, v_cultivation_meeting_pack.`;

const cors = (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  else res.setHeader("Access-Control-Allow-Origin", ALLOWED[0]);
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-tg-token");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Vary", "Origin");
};

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

function runClaude(prompt, sessionId) {
  return new Promise((resolve) => {
    const args = ["-p", prompt, "--permission-mode", "acceptEdits"];
    if (sessionId) args.push("--resume", sessionId);
    const child = spawn(CLAUDE, args, {
      cwd: PROJECT,
      shell: true,
      windowsHide: true,
      env: { ...process.env, CI: "1" },
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, reply: "That took longer than five minutes and was stopped. Try a narrower question." });
    }, 5 * 60 * 1000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", () => {
      clearTimeout(timer);
      const text = out.trim();
      if (!text) {
        const e = err.trim();
        if (/not logged in|\/login/i.test(e))
          return resolve({
            ok: false,
            needsLogin: true,
            reply:
              "The bridge is running but Claude Code is not signed in yet. Open a terminal and run: claude   then /login   and sign in with the Max account. After that this works with no further setup.",
          });
        return resolve({ ok: false, reply: "No answer came back. " + e.slice(0, 400) });
      }
      resolve({ ok: true, reply: text });
    });
    child.on("error", (e) =>
      resolve({ ok: false, reply: "Could not start Claude Code: " + String(e).slice(0, 300) })
    );
  });
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.end();

  if (req.url === "/health") {
    return json(res, 200, { ok: true, service: "tg-claude-bridge", project: PROJECT, port: PORT });
  }

  if (req.method === "POST" && req.url === "/ask") {
    if ((req.headers["x-tg-token"] || "") !== TOKEN) return json(res, 401, { ok: false, reply: "Bad bridge token." });
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        return json(res, 400, { ok: false, reply: "Bad request." });
      }
      const q = String(parsed.question || "").trim();
      if (!q) return json(res, 400, { ok: false, reply: "No question supplied." });
      const ctx = parsed.context ? "\n\nRECORDS ALREADY PULLED BY THE PLATFORM:\n" + String(parsed.context).slice(0, 20000) : "";
      const prompt = SYSTEM_BRIEF + ctx + "\n\nQUESTION FROM THE OWNER: " + q;
      const started = Date.now();
      const r = await runClaude(prompt, parsed.sessionId);
      json(res, 200, { ...r, seconds: Math.round((Date.now() - started) / 1000) });
    });
    return;
  }

  json(res, 404, { ok: false, reply: "Not found." });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Twisted Growers Claude bridge listening on http://127.0.0.1:${PORT}`);
  console.log(`Project: ${PROJECT}`);
  console.log(`Claude:  ${CLAUDE}`);
  console.log(`Token:   ${TOKEN}`);
});
