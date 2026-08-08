#!/usr/bin/env node
/* gen-handoff.mjs — rewrite the measured-state block of HANDOFF.md from the live system.
 *
 * HANDOFF.md is the single source of truth for STATE, and hand-written state has been
 * wrong in the way that matters: on 7 Aug 2026 its security section claimed anonymous
 * access was closed while 30 relations were returning real customer, manifest and money
 * data to anyone holding the publishable key. The document now carries its own warning
 * — "treat every count in this file as indicative, not current" — which is a document of
 * record admitting its record cannot be trusted.
 *
 * platform_state's comment already said the fix: generate the handoff from its latest
 * row. Numbers come from the system; the judgement paragraphs stay human and are never
 * touched by this script — it only replaces what sits between the GENERATED markers.
 *
 * Deliberately in tools/ and NOT tools/checks/: it needs a live credential, which CI
 * does not hold, so it is an operator tool rather than a gate. all-checks-wired.mjs
 * only scans tools/checks, so this correctly does not need wiring.
 *
 * Credential: read from .mcp.json, which is gitignored and already holds the read-only
 * tg_desktop_reader connection string. No new secret is introduced.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HANDOFF = join(ROOT, "HANDOFF.md");
const START = "<!-- GENERATED: tg_handoff_state_md(). Do not hand-edit between these markers. -->";
const END = "<!-- END GENERATED -->";

function connectionString() {
  if (process.env.TG_DATABASE_URL) return process.env.TG_DATABASE_URL;
  try {
    const mcp = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
    for (const server of Object.values(mcp.mcpServers ?? {})) {
      const found = (server.args ?? []).find((a) => /^postgres(ql)?:\/\//.test(a));
      if (found) return found;
    }
  } catch { /* fall through to the explicit error below */ }
  return null;
}

const conn = connectionString();
if (!conn) {
  console.error("gen-handoff: no database connection available.");
  console.error("  Set TG_DATABASE_URL, or keep the connection string in .mcp.json (gitignored).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const { rows } = await client.query("select tg_handoff_state_md() as md");
  const block = rows[0]?.md;
  if (!block) throw new Error("tg_handoff_state_md() returned nothing");

  const before = readFileSync(HANDOFF, "utf8");
  let after;

  const s = before.indexOf(START);
  const e = before.indexOf(END);
  if (s !== -1 && e !== -1 && e > s) {
    after = before.slice(0, s) + block + before.slice(e + END.length);
  } else {
    /* First run: insert the block immediately after the title so it is the first thing
       read, rather than appending it where nobody looks. */
    const nl = before.indexOf("\n");
    after = before.slice(0, nl + 1) + "\n" + block + "\n" + before.slice(nl + 1);
    console.log("gen-handoff: markers not found — inserted the generated block after the title.");
  }

  if (after === before) {
    console.log("gen-handoff: no change — HANDOFF.md already matches the live system.");
  } else {
    writeFileSync(HANDOFF, after, "utf8");
    console.log(`gen-handoff: HANDOFF.md updated (${block.split("\n").length} generated lines).`);
  }
  console.log("\n--- what was written ---\n");
  console.log(block);
} catch (err) {
  console.error(`gen-handoff: FAILED — ${err.message}`);
  console.error("  Nothing was written. HANDOFF.md is unchanged.");
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
