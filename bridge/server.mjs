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
import { join } from "node:path";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.TG_BRIDGE_PORT || 8765);
const PROJECT = process.env.TG_PROJECT || "C:\\Users\\demar\\Documents\\Claude_Twisted Growers";
/* TWO PROVIDERS, BOTH FREE AT THE POINT OF USE. Owner, 8 Aug 2026: "Admins use the
 * bridge, free unlimited from desktop. This is free, can toggle between Claude, GPT."
 *
 * Both run through the operator's OWN desktop subscription, so there is no per-token
 * API bill and no max_tokens ceiling of ours to set — the limit is whatever their
 * plan allows. That is the whole reason the bridge exists: the paid budz-chat edge
 * function is the FALLBACK for people without a desktop, never the default for an
 * admin who has one.
 *
 * A provider is selectable per job. Claude Code is the default because it is signed
 * in and has the project MCP tools; the GPT binary is whatever CLI the operator has
 * installed and is only used when asked for. */
const CLAUDE = process.env.TG_CLAUDE_BIN || path.join(os.homedir(), "AppData", "Roaming", "npm", "claude.cmd");
const GPT_BIN = process.env.TG_GPT_BIN || path.join(os.homedir(), "AppData", "Roaming", "npm", "codex.cmd");

const PROVIDERS = {
  claude: {
    bin: CLAUDE,
    label: "Claude Code (desktop subscription)",
    args: (sessionId) => {
      const a = ["-p", "--permission-mode", "acceptEdits",
                 "--allowedTools", "mcp__twisted-growers,Read,Grep,Glob"];
      if (sessionId) a.push("--resume", sessionId);
      return a;
    },
  },
  gpt: {
    bin: GPT_BIN,
    label: "GPT via desktop CLI",
    /* No --resume: the OS re-sends the history in the prompt, so a provider that
       cannot resume still answers a follow-up correctly rather than silently
       losing the thread. */
    args: () => ["exec", "--full-auto"],
  },
};

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

/* Netlify serves every deploy preview of this project from a hash-prefixed host —
   https://6a7630441830dee6efe19a92--twisted-growers-enterprise-os.netlify.app.
   Same site, same owner, but the literal list above does not contain it, so a
   preview page reads "AI offline" with the bridge answering perfectly. Match the
   project, not the exact string. Nothing else is admitted, and this only decides
   whose browser may READ a reply — the token on /ask is the gate that matters. */
const isOurs = (origin) =>
  ALLOWED.includes(origin) ||
  /^https:\/\/[a-z0-9-]+--twisted-growers-enterprise-os\.netlify\.app$/.test(origin || "");

const SYSTEM_BRIEF = `You are the assistant inside the Twisted Growers Enterprise OS, answering a question typed by the owner or an executive while they work.

Twisted Growers is a Massachusetts cannabis company: cultivation licence MC281714, manufacturing licence MP281909.
You have read access to the live Supabase database through the twisted-growers MCP connector, and to this project on disk.

=========================================================================
THE OWNER'S STANDING RULE, 8 August 2026. This outranks brevity.
=========================================================================
EVERY ANSWER IS FULL DETAIL. OURS OR THIRD PARTY, ALWAYS STATED. FULL CHAIN
OF CUSTODY WHENEVER CUSTODY IS PART OF THE QUESTION. Be specific and thorough.
A short answer that omits whose material it was is a WRONG answer, not a brief one.

WHICH DOCUMENT ANSWERS WHICH QUESTION
- The COA carries the TESTING: potency, pass or fail, which laboratory, sample
  and test dates, expiry. That is all a COA is for.
- The MANIFEST carries the CHAIN OF CUSTODY: who shipped, who received, package
  tags, STRAIN, item, quantity, value.
Ask the wrong document and you will find nothing and wrongly report data missing.

*** NEVER READ A PACKAGE ONE LEVEL DEEP. ***
When a package is REPACKAGED in Metrc the child does NOT inherit
ReceivedFromFacilityName - that field belongs to the parent. The child carries
only a pointer in SourcePackageLabels. Read the child alone and third-party
material books as our own production.

This exact failure happened on 7 Aug 2026: eight packages, $25,027, reported as
Twisted Growers product shipped to ARL Healthcare. The owner corrected it in one
line - "THOSE ARE NOT OUR STRAINS AND WE DID NOT SELL TRIM." He was right. It was
all Holyoke Wilds material, received on inbound manifests 0003318120 and
0003351074, repackaged on 5 Aug and sold on. That is DISTRIBUTION, not production.

USE THESE, NOT THE RAW TABLE:
- v_shipped_full  -> THE answer to any "what shipped / what left / what went out"
  question. Every line already carries whose material it is, the inbound manifest
  it arrived on, the strain, the value, the certificate and the manifest document.
- f_material_origin(package_tag) -> ownership resolved through the full lineage.
NEVER answer a shipment question from metrc_rpt_package_transfers alone.

STRAIN: when the strain column is blank the strain is IN THE ITEM TEXT -
"Holyoke Wilds | Blockberry | Bulk Shake/Trim", "Pomelo Punch - Trim". 387 rows
are blank while the item names it plainly. Read it before saying strain unknown.

ONE COMPANY HOLDS SEVERAL LICENCES - ONE PER LOCATION. Owner, 8 Aug: "EACH HAS
LICENSE". Two different licence numbers under the same company name is NORMAL and
must NEVER be reported as a discrepancy or a data error.

=========================================================================
NEVER REPORT DATA MISSING WITHOUT COUNTING IT
=========================================================================
"I found nothing" and "there is nothing" are different statements. Before writing
that anything is empty, missing or not tracked:
1. Run a bare count(*) on the table with NO filters.
2. If it is not zero, your filter was wrong - say that, not "no data".
3. Check as_of_date - but READ IT CORRECTLY. On metrc_rpt_package_transfers it holds
   two values, 6 and 7 Aug 2026. THAT IS WHEN THE EXPORT WAS PULLED, NOT THE PERIOD IT
   COVERS. Its 19,256 rows cover manifests from 19 Jan 2024 to 7 Aug 2026 - two and a
   half years of custody. Reading as_of_date as the coverage window makes an agent
   decline a historical shipment question and report data missing, which is the exact
   error this section forbids. Verified 8 Aug 2026.
   What IS missing: 49 manifests have no package lines at all - 42 live incoming,
   277 packages - and MC281714's export contains ZERO inbound manifests.
4. Only then say a thing is absent, and name the table you counted.
An answer once claimed metrc_rpt_package_transfers was empty while it held 19,256
rows. A wrong "there is no data" sends the owner hunting a problem that does not
exist and hides the one that does.

GENUINELY NOT BUILT (verified 8 Aug 2026 - re-count before repeating):
sales_orders, sales_order_lines, shipments, shipment_lines, invoices, metrc_sales
are all 0 rows, so BACKORDERS CANNOT BE COMPUTED - ordered minus shipped, and the
ordered side has never been recorded. Metrc records custody, not commitments.
material_purchases and third_party_purchases are 0 rows, so margin on remediation
and on distribution is uncomputable and any such figure is invented.

FOUR REVENUE LINES, NEVER BLENDED: own production, remediation, distribution,
services. On tolling and white label the material is NOT ours - it must never
count as our stock, our production or our yield, and the money is a fee, never a
price per pound.


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
  if (isOurs(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  else res.setHeader("Access-Control-Allow-Origin", ALLOWED[0]);
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-tg-token");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Vary", "Origin");

  /* THE REASON THE CHIP READ "AI OFFLINE" WHILE THE BRIDGE WAS ANSWERING FINE.
     Chrome's Private Network Access: a page on a public https origin reaching a
     loopback address must first pass a preflight carrying
     `Access-Control-Request-Private-Network: true`, and the reply MUST carry
     `Access-Control-Allow-Private-Network: true` or the request is dropped
     before any handler in this file is ever reached.

     curl does not send that header. That is exactly why /health answered me from
     the terminal and failed in his browser at the same moment — the same request
     to the same port, one allowed and one dropped, and nothing in the failure
     said which. Only ever sent back to an origin isOurs() already recognises. */
  if (isOurs(origin)) res.setHeader("Access-Control-Allow-Private-Network", "true");
};

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

function runClaude(prompt, sessionId, provider = "claude") {
  return new Promise((resolve) => {
    /* NO TOKEN CEILING HERE, DELIBERATELY. Owner, 8 Aug 2026: "There should be no
       limits for admins with Claude or GPT — we use our plan." This runs the
       operator's own signed-in desktop CLI, so the only limit is their subscription.
       Never add a max-tokens or truncation cap on this path; that would impose a
       smaller limit than the plan the owner is paying for. Capping belongs only on
       the paid API fallback, where every token is billed per call. */
    const p = PROVIDERS[provider] ?? PROVIDERS.claude;
    // The prompt goes in on stdin. Passing it as a command-line argument mangles
    // long text and newlines on Windows.
    const args = p.args(sessionId);
    const child = spawn(p.bin, args, {
      cwd: PROJECT,
      shell: true,
      windowsHide: true,
      env: { ...process.env, CI: "1" },
    });
    child.stdin.write(prompt);
    child.stdin.end();
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
  /* WHY EVERY REQUEST IS LOGGED.
     The chip read "AI offline" in the owner's browser at the same moment the
     bridge answered a browser on the identical origin from this machine. With
     no record of arrivals there is no way to tell the two cases apart:
       - the request never got here     -> the browser blocked it (origin, or
                                           Chrome's private-network preflight)
       - the request got here and was refused -> the origin is not on the list,
                                           and this line names the origin it sent
     One is a browser problem and one is a configuration problem, and they look
     identical from the outside. They do not look identical in this log. */
  const org = req.headers.origin ?? "(no Origin header — not a browser)";
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.url}  origin=${org}  ` +
    `${isOurs(req.headers.origin) ? "RECOGNISED" : "NOT ON THE ALLOW-LIST"}`
  );

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
      const r = await runClaude(prompt, parsed.sessionId, parsed.provider || "claude");
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
  /* The banner used to print the token in full. That was survivable only while
     the hidden launcher discarded all output; now that output is captured to
     bridge.log, printing it would write the shared bridge token into a file on
     every machine that runs this. bridge*.log is gitignored, so it will not
     reach GitHub — but a token sitting in a plain file is a token that ends up
     in a screenshot or a support paste. Enough to confirm which token is loaded
     and to compare against ai_settings, and useless to anyone reading it. */
  console.log(`Token:   ${TOKEN.slice(0, 3)}…${TOKEN.slice(-2)} (${TOKEN.length} chars, sha256 ${createHash("sha256").update(TOKEN).digest("hex").slice(0, 12)})`);
});

/* ── The job queue ───────────────────────────────────────────────────────────
   THE BROWSER NO LONGER CALLS THIS MACHINE. IT CANNOT.

   Chrome 151 treats a public https page reaching a local address as a user
   permission - `local-network-access` - and on the owner's machine it reads
   DENIED. Once denied Chrome will not re-prompt. Proved in his own browser on
   7 Aug 2026: a `no-cors` fetch, which bypasses CORS entirely, still threw
   `TypeError: Failed to fetch`, and NOTHING arrived in this log. The request
   never left the browser, so nothing in this file could have fixed it.

   The /ask endpoint above stays - it is the fastest path and it works from
   localhost and from a terminal - but the platform no longer depends on it.

   Instead the browser leaves the question in ai_bridge_jobs, which a signed-in
   owner is already allowed to write, and this comes and gets it. Nothing local
   is called, so no browser has a vote and a Chrome update cannot break it.

   TWO CREDENTIALS THIS DELIBERATELY DOES NOT USE.

   1. The project ANON key. The old version of this block had it written out in
      full, in this file, in the public repository. It only ever worked because
      anonymous access was wide open; closing that hole killed the queue.

   2. The database connection in .mcp.json. Tried first, and it is deliberately
      READ-ONLY - "cannot execute UPDATE in a read-only transaction". That guard
      is worth keeping rather than working around.

   So writes go through the `bridge-queue` edge function, authenticated with the
   token this bridge ALREADY shares with the platform. Nothing new to install,
   nothing for anyone to paste, and no key in any tracked file. The function can
   claim a job, answer a job it claimed, and record a heartbeat. Nothing else. */
const MACHINE = process.env.TG_MACHINE || os.hostname();
const QUEUE_URL = process.env.TG_QUEUE_URL ||
  "https://fxetuqjryttnypgepsru.supabase.co/functions/v1/bridge-queue";
const VERSION = "2.0-queue";

async function queue(action, extra = {}) {
  const r = await fetch(QUEUE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-tg-token": TOKEN },
    body: JSON.stringify({ action, machine: MACHINE, version: VERSION, ...extra }),
    signal: AbortSignal.timeout(20000),
  });
  const out = await r.json().catch(() => ({ ok: false, error: "unreadable reply, http " + r.status }));
  if (!out.ok) throw new Error(out.error || ("http " + r.status));
  return out;
}

/* A repeated failure must not scroll past as one line among thousands. Say it
   once, loudly, then stay quiet until it changes - so the log still reads as a
   record of what happened rather than a wall. */
let lastFault = "";
function fault(where, e) {
  const msg = `${where}: ${String(e && e.message ? e.message : e).slice(0, 200)}`;
  if (msg !== lastFault) {
    lastFault = msg;
    console.log("QUEUE PROBLEM - " + msg);
    if (/Bad bridge token/i.test(msg)) {
      console.log("  bridge/token.txt does not match ai_settings.bridge_token.");
      console.log("  Compare the sha256 of each - never paste the tokens themselves.");
    }
    if (/switched off/i.test(msg)) console.log("  Settings > Artificial Intelligence > bridge enabled.");
  }
}
function recovered() {
  if (lastFault) { console.log("QUEUE RECOVERED - " + lastFault + " is no longer happening"); lastFault = ""; }
}

let working = false;
async function pollJobs() {
  if (working) return;
  working = true;
  let job = null;
  const started = Date.now();
  try {
    const claim = await queue("claim");
    recovered();
    if (!claim.job) return;
    job = claim.job;
    console.log(`[job ${job.id}] claimed: ${String(job.question).slice(0, 70)}`);

    const NL2 = String.fromCharCode(10, 10);
    const ctx = job.context
      ? NL2 + "RECORDS ALREADY PULLED BY THE PLATFORM:" + String.fromCharCode(10) +
        JSON.stringify(job.context).slice(0, 400000) /* the desktop plan is the limit, not us */
      : "";
    const out = await runClaude(SYSTEM_BRIEF + ctx + NL2 + "QUESTION FROM THE OWNER: " + job.question,
                                null, job.provider || "claude");
    const seconds = Math.round((Date.now() - started) / 1000);

    await queue("answer", { id: job.id, ok: out.ok, answer: out.reply, seconds });
    console.log(`[job ${job.id}] ${out.ok ? "answered" : "failed"} in ${seconds}s`);
  } catch (e) {
    fault("poll", e);
    /* A job claimed and then dropped stays 'running' for ever, and the person
       watching the page waits for an answer that is never coming. Hand it back
       with the reason written on it. */
    if (job) {
      try {
        await queue("answer", {
          id: job.id, ok: false,
          answer: "The bridge failed while answering: " + String(e && e.message ? e.message : e).slice(0, 300),
          seconds: Math.round((Date.now() - started) / 1000),
        });
      } catch (e2) { fault("could not even report the failure", e2); }
    }
  } finally {
    working = false;
  }
}

async function heartbeat() {
  try { await queue("heartbeat"); recovered(); } catch (e) { fault("heartbeat", e); }
}

await heartbeat();
setInterval(heartbeat, 30000);
setInterval(pollJobs, 1500);
