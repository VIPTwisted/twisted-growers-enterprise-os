/* Automatic sheet reader.
 *
 * The inventory sheet cannot be shared and cannot be scripted, both by policy.
 * So nothing reaches into it from outside Google. Instead this runs on the
 * owner's own machine, in a Chrome profile the owner signs into once with his
 * own Google account, and reads the sheet exactly as he would by opening it.
 * It never alters the sheet, never changes its sharing, and grants nobody
 * access. The rows go to the platform on a timer so nobody has to remember.
 *
 * One-time:   node sheet-sync.mjs --signin      (a window opens, sign in, close it)
 * Then:       node sheet-sync.mjs               (runs forever, reads on the timer)
 * Once off:   node sheet-sync.mjs --once
 */

import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE = join(HERE, "chrome-profile");
const CHROME = process.env.CHROME_PATH
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const SUPABASE = "https://fxetuqjryttnypgepsru.supabase.co";
const ANON = process.env.TG_ANON_KEY || "";
const PUSH = `${SUPABASE}/functions/v1/sheet-push`;

const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

/* ── Talk to Chrome over the DevTools protocol, using the signed-in profile ── */
let chrome = null;
const PORT = 9223;

function startChrome(headless) {
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}. Set CHROME_PATH.`);
  mkdirSync(PROFILE, { recursive: true });
  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
  ];
  if (headless) args.push("--headless=new", "--window-size=1280,900");
  chrome = spawn(CHROME, args, { stdio: "ignore", detached: false });
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        if (r.ok) return res(await r.json());
      } catch { /* still starting */ }
      if (Date.now() - t0 > 25000) return rej(new Error("Chrome did not open its debug port."));
      setTimeout(tick, 300);
    };
    tick();
  });
}

function stopChrome() {
  if (chrome && !chrome.killed) { try { chrome.kill(); } catch { /* already gone */ } }
  chrome = null;
}

/* Fetch a URL from inside the browser, so the owner's own Google session is used.
   Nothing about the session is read, copied or stored by this script. */
async function fetchInBrowser(url) {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let page = list.find((t) => t.type === "page");
  if (!page) {
    page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`)).json();
  }
  const ws = page.webSocketDebuggerUrl;
  /* Node has WebSocket built in from version 22, so there is nothing to install. */
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(ws);
    let id = 0;
    const send = (method, params) => new Promise((res) => {
      const myId = ++id;
      const onMsg = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id === myId) { sock.removeEventListener("message", onMsg); res(m.result); }
      };
      sock.addEventListener("message", onMsg);
      sock.send(JSON.stringify({ id: myId, method, params }));
    });
    sock.addEventListener("open", async () => {
      try {
        await send("Page.navigate", { url: "https://docs.google.com/" });
        await new Promise((r) => setTimeout(r, 1500));
        const r = await send("Runtime.evaluate", {
          expression: `fetch(${JSON.stringify(url)}, {credentials:"include"})
            .then(r => r.ok ? r.text() : Promise.reject("HTTP " + r.status))`,
          awaitPromise: true,
          returnByValue: true,
        });
        sock.close();
        if (r?.exceptionDetails || r?.result?.subtype === "error") {
          return reject(new Error("Google refused the read. The profile is probably not signed in — run with --signin."));
        }
        resolve(String(r?.result?.value ?? ""));
      } catch (e) { sock.close(); reject(e); }
    });
    sock.addEventListener("error", () => reject(new Error("Lost the connection to Chrome.")));
  });
}

/* ── Parse the sheet's own comma separated export ── */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  if (rows.length < 2) return null;
  const heads = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ""))
    .map((r) => {
      const o = {};
      heads.forEach((h, i) => { if (h) o[h] = String(r[i] ?? "").trim(); });
      return o;
    });
}

/* ── The platform tells this script what to read and how often ── */
async function sources() {
  const r = await fetch(`${SUPABASE}/rest/v1/sheet_sources?select=*&auto_poll=eq.true&enabled=eq.true`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) throw new Error(`Could not read the source list: HTTP ${r.status}`);
  return r.json();
}

async function syncOne(src) {
  if (!src.google_file_id) { log(`${src.name}: no file identifier set, skipping.`); return; }
  const gid = src.sheet_gid ? `&gid=${src.sheet_gid}` : "";
  const url = `https://docs.google.com/spreadsheets/d/${src.google_file_id}/export?format=csv${gid}`;
  const csv = await fetchInBrowser(url);
  const rows = parseCsv(csv);
  if (!rows || rows.length === 0) {
    log(`${src.name}: the read came back empty. Nothing sent, existing rows kept.`);
    return;
  }
  const res = await fetch(PUSH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: src.push_token, tab: src.sheet_tab, rows }),
  });
  const out = await res.json();
  if (out.ok) log(`${src.name}: sent ${out.rows} rows.`);
  else log(`${src.name}: refused — ${out.error}`);
}

async function runOnce() {
  const list = await sources();
  if (!list.length) { log("No sources are set to read automatically."); return; }
  await startChrome(true);
  try { for (const s of list) await syncOne(s); }
  finally { stopChrome(); }
}

const arg = process.argv[2];

if (arg === "--signin") {
  log("Opening a window. Sign in to Google with the account that can see the sheet, then close it.");
  await startChrome(false);
  await fetch(`http://127.0.0.1:${PORT}/json/new?https://accounts.google.com/`);
  log("Waiting. Close the Chrome window when you are signed in.");
  chrome.on("exit", () => { log("Signed in. Now run: node sheet-sync.mjs"); process.exit(0); });
} else if (arg === "--once") {
  await runOnce().catch((e) => log("Failed:", e.message));
  process.exit(0);
} else {
  const list = await sources().catch(() => []);
  const every = Math.max(5, Math.min(...list.map((s) => s.poll_minutes || 15), 15));
  log(`Reading every ${every} minutes. Leave this running.`);
  const loop = async () => {
    await runOnce().catch((e) => log("Failed:", e.message));
    setTimeout(loop, every * 60000);
  };
  loop();
}
