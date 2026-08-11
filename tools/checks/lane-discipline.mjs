#!/usr/bin/env node
/* lane-discipline.mjs — which agent owns the file you just changed.
 *
 * Owner, 11 August 2026: "WE HAVE TO GET ALL AGENTS BACK IN THEIR LANES THEY ARE
 * DRIFTING INTO ONE ANOTHERS LANES."
 *
 * WHAT THE PARSE FOUND, and it is not what the request assumed.
 *
 * brain/AGENT_ROSTER.md — which I wrote on 7 Aug — says "The four live lanes are A,
 * B, C and D". There are now NINE agents. E, F, F-fork, G and H have never had a
 * lane defined anywhere, in any file. They are not drifting OUT of their lanes;
 * they were never given one. Nobody can stay inside a boundary that was never drawn.
 *
 * The roster's own gap list already said it: "the lanes exist on paper and in the
 * hooks, not in the record." A roster in markdown binds only the people who have
 * read it recently, which here has repeatedly been nobody. So the lanes now live in
 * agent_lane, as data, and this reads them.
 *
 * WHAT IT CAN AND CANNOT DO — stated because a guard that overclaims is worse than
 * no guard at all.
 *
 * Every commit here is authored "Claude Opus 5". Git cannot tell me WHICH agent made
 * a change, so this CANNOT catch a specific agent straying unless the commit says so.
 * What it can do:
 *
 *   1. FAIL on a changed file that NO lane claims. An unowned file has no boundary
 *      and no reviewer, and that is the condition that produced this request.
 *   2. FAIL when a commit declares "Agent: X" and touches another lane's files.
 *      The only true attribution available — and only if agents declare themselves,
 *      so the run reports how many did. That number is the honest measure of
 *      whether any of this is working.
 *   3. REPORT commits spanning several lanes. Not a failure: a schema change and
 *      its screen legitimately land together, and blocking that would only train
 *      everyone to split commits artificially and lose the link between the halves.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SINCE = process.env.LANE_SINCE || "36 hours ago";
const REC = "\u0002";   // record separator between commits
const FLD = "\u0001";   // field separator within the header line

/* Files no lane needs to own: generated, vendored, or pure record. */
const UNOWNED_OK = [
  /^supabase\/migrations\//, /^docs\//, /^\.github\//, /^package(-lock)?\.json$/,
  /^README/i, /^CLAUDE\.md$/, /^\.gitignore$/, /^netlify\.toml$/, /^eslint\./,
  /^tools\/hooks\//, /^app\/web\/(vite\.config|index\.html|package)/,
];

function connString() {
  if (process.env.PGURL) return process.env.PGURL;
  const p = join(ROOT, ".mcp.json");
  if (!existsSync(p)) return null;
  try {
    const url = JSON.parse(readFileSync(p, "utf8"))?.mcpServers?.["twisted-growers"]?.args?.[0];
    return url ? url.replace(/sslmode=[a-z-]+/, "uselibpqcompat=true&sslmode=require") : null;
  } catch { return null; }
}

const conn = connString();
if (!conn) {
  console.log("lane-discipline: SKIPPED — no database connection, so the lane map could not be read.");
  console.log("               This is NOT a pass. Nothing was checked.");
  process.exit(0);
}
let pg;
try { pg = (await import("pg")).default; }
catch { console.log("lane-discipline: SKIPPED — pg not installed. Nothing was checked."); process.exit(0); }

const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, statement_timeout: 30000 });
let failed = 0;

try {
  await client.connect();
  const { rows: lanes } = await client.query(
    "select agent, display_name, owns_paths from public.agent_lane order by agent");
  if (!lanes.length) {
    console.error("lane-discipline: FAIL — agent_lane is empty. No lane is defined, so nothing can be outside one.");
    process.exit(1);
  }

  const like = (p, pat) =>
    new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$").test(p);
  const ownersOf = (f) => lanes.filter((l) => (l.owns_paths || []).some((pat) => like(f, pat))).map((l) => l.agent);

  /* %b is DELIBERATELY absent. Including the body put every line of every commit
     message into the stream, and --name-only emits one filename per line, so the
     first run reported "Co-Authored-By: Claude Opus 5" and a chunk of an ELF binary
     as files belonging to no lane. Output that is visibly nonsense gets a guard
     switched off. The trailer is read with %(trailers), which stays on one line. */
  /* THE SEPARATOR GOES AT THE FRONT, not the end. git emits the pretty format, then
     a blank line, then the filenames — so a trailing separator splits the HEADER
     from its own files rather than one commit from the next, and every subsequent
     header gets read as a filename. That is why the previous run listed
     "f60f138e…Command: audit out of Key Figures" as an unowned file. Leading
     separator, and the first (empty) chunk is dropped by the filter below. */
  const fmt = `--pretty=format:${REC}%H${FLD}%s${FLD}%(trailers:key=Agent,valueonly,separator=%x2C)`;
  const commits = git("log", `--since=${SINCE}`, "--name-only", fmt)
    .split(REC)
    .map((c) => c.replace(/^\n+|\n+$/g, ""))
    .filter(Boolean)
    .map((c) => {
      const [head, ...fileLines] = c.split("\n");
      const [hash, subject, trailer] = head.split(FLD);
      const declared = ((trailer || "").match(/\b([A-H])\b/) || [])[1] || null;
      return { hash: (hash || "").slice(0, 7), subject: subject || "", declared, files: fileLines.filter(Boolean) };
    });

  if (!commits.length) {
    console.log(`lane-discipline: PASS — no commits in the last ${SINCE}. Nothing to attribute.`);
    process.exit(0);
  }

  const unowned = new Map();
  const spans = [];
  let declaredCount = 0;

  for (const c of commits) {
    if (c.declared) declaredCount++;
    const touched = new Set();
    for (const f of c.files) {
      if (UNOWNED_OK.some((re) => re.test(f))) continue;
      const own = ownersOf(f);
      if (!own.length) { unowned.set(f, (unowned.get(f) || 0) + 1); continue; }
      own.forEach((a) => touched.add(a));
    }
    if (touched.size > 1) spans.push({ ...c, lanes: [...touched].sort() });

    if (c.declared) {
      const foreign = c.files.filter((f) => {
        if (UNOWNED_OK.some((re) => re.test(f))) return false;
        const own = ownersOf(f);
        return own.length && !own.includes(c.declared);
      });
      if (foreign.length) {
        console.error(`lane-discipline: FAIL — ${c.hash} declares Agent ${c.declared} but edits ${foreign.length} file(s) in another lane:`);
        for (const f of foreign.slice(0, 6)) console.error(`   ${f}  → owned by ${ownersOf(f).join(", ")}`);
        failed++;
      }
    }
  }

  if (unowned.size) {
    console.error(`lane-discipline: FAIL — ${unowned.size} changed file(s) belong to NO lane:`);
    for (const [f, n] of [...unowned].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.error(`   ${f}  (${n} commit${n === 1 ? "" : "s"})`);
    }
    console.error(`   An unowned file has no boundary and no reviewer. Claim it in agent_lane, or add`);
    console.error(`   it to UNOWNED_OK here if it is genuinely generated or pure record.`);
    failed++;
  }

  console.log(`lane-discipline: ${commits.length} commit(s) in ${SINCE}; ${declaredCount} declared an agent.`);
  if (spans.length) {
    console.log(`lane-discipline: note   — ${spans.length} commit(s) span more than one lane (not a failure, but this IS the shape of drift):`);
    for (const s of spans.slice(0, 8)) console.log(`   ${s.hash}  ${s.lanes.join(" + ")}  ${s.subject.slice(0, 52)}`);
  }
  if (declaredCount === 0) {
    console.log(`lane-discipline: WARN   — NOT ONE commit declared its agent. Until commits carry an`);
    console.log(`               "Agent: X" trailer this guard cannot attribute a change to anyone, and`);
    console.log(`               its cross-lane rule is dormant. A real limit, not a pass.`);
  }
} catch (e) {
  console.error(`lane-discipline: FAIL — could not complete: ${String(e).slice(0, 200)}`);
  failed++;
} finally {
  try { await client.end(); } catch { /* best effort */ }
}

if (failed) {
  console.error(`\nlane-discipline: ${failed} problem(s).`);
  console.error(`Lanes live in agent_lane. Call f_lane_for_path('the/file') BEFORE editing, and put`);
  console.error(`"Agent: X" in the commit so the next run can tell who did what.`);
  process.exit(1);
}
console.log("lane-discipline: PASS — every changed file belongs to a lane.");
