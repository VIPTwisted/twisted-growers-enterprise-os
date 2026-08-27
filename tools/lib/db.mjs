/* tools/lib/db.mjs — ONE definition of "can this gate see the database".
 *
 * WHY THIS EXISTS. Seven gates each resolved a connection their own way, and each answered
 * PASS (DEGRADED) or SKIPPED when it found none:
 *
 *     migration-drift · report-contract · page-architecture · docs-vs-database
 *     schema-baseline · apex-registry-vs-spec · no-duplicate-rows
 *
 * Seven copies of the same twelve lines, and seven copies of the same hole. CI never set
 * PGURL — the workflow's only database variable was MONEY_TEST_PGURL, the throwaway service
 * container money-grain builds its own fixture in — so all seven resolved nothing, printed
 * their honest DEGRADED line, and exited zero. Every build. Since each was written.
 *
 * WHAT THAT COST, MEASURED 26 AUG 2026. migration-drift carries a `missing: 0` ratchet set by
 * hand on 11 Aug, with a note explaining that blessing a transient is how a ratchet becomes a
 * rubber stamp. It was the right ratchet. It never ran. In the fortnight since: six migrations
 * reached production with no file in this repository under any name, eight more were filed
 * under a hand-picked version that does not match the ledger, and eight files describe tables
 * production has never had. The gate that existed to catch exactly this reported green
 * throughout, because a gate that cannot reach the database cannot catch anything.
 *
 * THE RULE. No database, no verdict. Not a degraded verdict — no verdict. A gate that cannot
 * run refuses, non-zero, and says which variable would let it run. There is deliberately no
 * ALLOW_DEGRADED escape hatch: the owner ruled on 26 Aug that an env var which turns a gate
 * back into a rubber stamp is the same hole with a nicer name.
 *
 * SSL IS NORMALISED ON BOTH PATHS, NOT ONE. Every gate rewrote .mcp.json's sslmode and left a
 * literal PGURL alone, so the same database reached through two routes arrived with two
 * different SSL strings. .mcp.json carries `sslmode=no-verify`, which is a psql spelling libpq
 * does not know. Normalising both here means PGURL can be pasted in raw, exactly as the local
 * file holds it, and behave identically.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/* The one form every consumer here wants. `uselibpqcompat=true` keeps node-postgres reading
   libpq's spelling of the parameter rather than its own, so a string that works in psql works
   here too — the difference having previously been diagnosed as a firewall. */
export function normalise(url) {
  if (!url) return null;
  const want = "uselibpqcompat=true&sslmode=require";
  if (/sslmode=/.test(url)) {
    return url.replace(/(?:uselibpqcompat=true&)?sslmode=[a-z-]+/, want);
  }
  return url + (url.includes("?") ? "&" : "?") + want;
}

/* Returns { conn, source } on success, { conn: null, why } on failure. It never throws and
   never exits: deciding what a missing connection MEANS belongs to the caller, because
   openClient() must refuse while a test must be able to observe the refusal reason. */
export function resolveConnection(ROOT) {
  if (process.env.PGURL) {
    return { conn: normalise(process.env.PGURL), source: "the PGURL environment variable" };
  }
  const p = join(ROOT, ".mcp.json");
  if (!existsSync(p)) {
    return { conn: null, why: "PGURL is not set and there is no .mcp.json in the repository root." };
  }
  try {
    const url = JSON.parse(readFileSync(p, "utf8"))
      ?.mcpServers?.["twisted-growers"]?.args?.[0];
    if (!url) {
      return { conn: null, why: ".mcp.json exists but carries no twisted-growers connection string." };
    }
    return { conn: normalise(url), source: ".mcp.json" };
  } catch (e) {
    return { conn: null, why: `.mcp.json could not be parsed: ${e.message.trim()}` };
  }
}

/* WHAT THE CONNECTION IS POINTED AT, WITH THE CREDENTIAL REMOVED.
 *
 * On 27 Aug 2026 the Gates workflow failed with:
 *
 *     the connection from the PGURL environment variable failed: getaddrinfo EAI_AGAIN base
 *
 * "base" is the tail of "supabase". The secret had been truncated inside the hostname. That
 * took an hour to establish, because the refusal named the VARIABLE but never the TARGET, and
 * the value is masked in CI logs — so the one fact that identifies a malformed connection
 * string was the one fact nobody could see.
 *
 * The host and port are not the secret; the password is. Printing host:port/database turns a
 * mangled secret into a self-evident failure, and printing anything from the userinfo would
 * put a credential in a build log that thousands of runs keep forever. Hence the explicit
 * blanking of username and password below rather than a substring of the URL. */
export function describeTarget(conn) {
  try {
    const u = new URL(conn);
    u.username = "";
    u.password = "";
    const db = u.pathname.replace(/^\//, "") || "(no database in the string)";
    return `${u.hostname || "(no host)"}:${u.port || "(no port)"}/${db}`;
  } catch {
    return "(the connection string is not a parseable URL)";
  }
}

/* THE REFUSAL IS THE PRODUCT. It must name the gate, say plainly that nothing was verified,
   and give the one instruction that fixes it — a red build whose reason nobody can read is
   the failure mode run-gates.mjs was built to end, and this must not reintroduce it. */
export function refuse(gate, why) {
  console.error(`${gate}: FAIL — this gate reads the database and could not reach it.`);
  console.error(`      ${why}`);
  console.error("");
  console.error("      NOTHING WAS VERIFIED. This is not a pass with a caveat. Until 26 Aug 2026");
  console.error("      this gate answered PASS (DEGRADED) here and exited zero, and fourteen");
  console.error("      migrations drifted into production underneath the green build that gave.");
  console.error("");
  console.error("      GitHub Actions : set the TG_GATES_PGURL repository secret.");
  console.error("      Netlify        : set the PGURL build environment variable.");
  console.error("      Locally        : a gitignored .mcp.json supplies it, or export PGURL.");
  console.error("");
  console.error("      Use the aws-0-<region>.pooler.supabase.com string on a read-only role.");
  console.error("      The direct db.<ref>.supabase.co host is IPv6-only and CI runners are not.");
  console.error("");
  process.exit(1);
}

/* Resolve, import the driver, connect — refusing at whichever step fails. Callers get a live
   client or never get control back, so there is no path on which a gate proceeds believing it
   has a database when it does not. */
export async function openClient(gate, ROOT, { statement_timeout = 30000 } = {}) {
  const { conn, why, source } = resolveConnection(ROOT);
  if (!conn) refuse(gate, why);

  let pg;
  try {
    pg = (await import("pg")).default;
  } catch {
    refuse(gate, "the pg driver is not installed here — run `npm install` at the repository root.");
  }

  const client = new pg.Client({
    connectionString: conn, ssl: { rejectUnauthorized: false }, statement_timeout,
  });
  try {
    await client.connect();
  } catch (e) {
    await client.end().catch(() => {});
    refuse(gate,
      `the connection from ${source} failed: ${e.message.trim()}\n`
      + `      it was pointed at ${describeTarget(conn)} (credential removed)\n`
      + "      if that host is not the one you expect, the value is malformed — a secret\n"
      + "      truncated inside its own hostname reads exactly like a DNS outage.");
  }
  return client;
}
