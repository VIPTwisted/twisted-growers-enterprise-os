#!/usr/bin/env node
/* tools/ci/record-run.mjs — CI records its own verdict per commit (Bible §16.3, BP-16-3).
 *
 * Owner, 14 Sep 2026: "we have been using these all along — I'm not providing again." Right:
 * the deploy watch needs no new token. CI already holds the gates' database connection
 * (PGURL), so at the end of every Gates run it writes one row into deploy_state:
 * source 'ci', the commit, the branch, success | failure | cancelled. The database sweep
 * (f_deploy_watch, every 2 min) compares that with what the published site actually
 * serves (build stamp) — a main commit that passed here but is not served 15 minutes later
 * is a stuck or failed production build, and a failed main run is a finding at once.
 *
 * Runs with `if: always()` so a red run is recorded too. Never fails the build itself:
 * a recorder that breaks the thing it records is worse than none — it prints why instead.
 */
import { openClient, resolveConnection } from "../lib/db.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = process.env.GITHUB_SHA || "";
const branch = (process.env.GITHUB_REF_NAME || process.env.GITHUB_HEAD_REF || "").replace(/^refs\/heads\//, "");
const runId = process.env.GITHUB_RUN_ID || String(Date.now());
const verdict = (process.env.TG_CI_VERDICT || "unknown").toLowerCase(); // success | failure | cancelled
const title = process.env.TG_CI_TITLE || "Gates";

const { conn } = resolveConnection(ROOT);
if (!conn) { console.log("record-run: no database connection here — verdict not recorded (this is not a gate)."); process.exit(0); }
if (!sha) { console.log("record-run: no GITHUB_SHA — not in CI; nothing recorded."); process.exit(0); }
try {
  const client = await openClient("record-run", ROOT);
  try {
    await client.query(
      `insert into public.deploy_state (deploy_id, source, site, branch, commit_ref, state, title, created_at, published_at)
       values ($1, 'ci', 'twisted-growers-enterprise-os', $2, $3, $4, $5, now(), now())
       on conflict (deploy_id) do update set state = excluded.state, last_seen_at = now()`,
      [`ci-${runId}`, branch || null, sha, verdict, `${title} ${verdict} for ${sha.slice(0, 7)}`]);
    console.log(`record-run: recorded ci-${runId} ${branch}@${sha.slice(0, 7)} = ${verdict}`);
  } finally { await client.end(); }
} catch (e) {
  console.log(`record-run: could not record (${e.message.trim()}) — the sweep will notice a missing verdict; the build is not failed by its own recorder.`);
}
