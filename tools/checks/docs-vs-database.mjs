#!/usr/bin/env node
/* CHECK: a document may not state a licence the database does not have.
 *
 * WHY THIS EXISTS — a real, dated failure that every other guard was blind to.
 *
 * On 7 Aug 2026 the owner settled, with a screenshot of the Metrc facility switcher as evidence,
 * which of the two licences is cultivation and which is manufacturing, and that the six-digit
 * number he had been shown as a third one is his Metrc USER ID — not a licence at all. It belongs
 * to the user key and is never associated with a facility. The live systems were fixed the same
 * day: integration_secrets, the licences table, the registers, memory. Cultivation then flowed.
 *
 * Two days later `docs/09_METRC_API_ACCESS.md` still named that USER ID as the cultivation
 * licence, in the body of an email addressed to api-info@metrc.com.
 *
 * (The codes themselves are deliberately NOT written here. Rule G2 applies to this file too, and
 *  writing them would make this gate break `literal-licences` — which is exactly what happened
 *  on its first day: ten of them, in the comments of the check built to forbid them.)
 *
 * That is the body of an email addressed to api-info@metrc.com. It would have gone to the
 * REGULATOR naming a user ID as a licence. brain/CONTRADICTIONS.md §4 had even flagged it
 * verbatim — "must be corrected before the API application is submitted" — and nothing acted.
 *
 * NOT ONE of the 29 guards could have caught it, because NONE OF THEM READ PROSE. The whole
 * class was unguarded: a document can carry a load-bearing, regulator-facing fact and be
 * wrong forever. That is the meta-trap in _charter_common.md — a decision recorded is not a
 * decision implemented.
 *
 * Neither Google nor Microsoft gates documentation against production data. This does.
 *
 * TWO RULES, both verified against the database, both deliberately narrow so the gate stays
 * quiet enough to survive:
 *
 *   RULE 1 · Every licence-shaped code in a LIVE document must exist in `company_licenses`.
 *   RULE 2 · Where a document names a licence AND its kind on the same line, the kind must
 *            match `company_licenses.kind`. Catches a swapped cultivation/manufacturing pair,
 *            which reads perfectly and is completely wrong.
 *
 * ARCHIVES ARE EXEMPT, and that is not laziness. Transcripts, ingested sources, the
 * contradictions queue and the decisions log RECORD what happened — including the wrong value
 * and its correction. Rewriting them would destroy the audit trail and would be a worse error
 * than the one being fixed. History is allowed to contain the mistake; live documents are not.
 *
 *   node tools/checks/docs-vs-database.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Paths whose JOB is to record history, including errors that were later corrected. */
const ARCHIVE = [
  /^docs\/handoff\/SESSION_TRANSCRIPT\./,
  /^brain\/sources\//,
  /^brain\/inbox\//,
  /^brain\/CONTRADICTIONS\.md$/,   // the arbitration queue quotes both sides by design
  /^brain\/DECISIONS\.md$/,        // records the ruling, therefore the wrong value too
  /^brain\/LESSONS\.md$/,          // "what it taught" requires stating the mistake
  /^docs\/gap_register\//,         // chronological record of what was asked and what landed
];

/* A line that explains a wrong value is self-documenting and must not be flagged. */
const EXPLAINS_ITSELF =
  /(not a licen[cs]e|user id|userid|user-id|was wrong|is wrong|CORRECTED|incorrect|do not use|stale|superseded|historical)/i;

/* OURS ONLY. company_licenses holds Twisted Growers' licences and nothing else, so a
   third-party code can never be verified against it and must not be flagged. Its first run
   proved the point: it reported five IL-prefixed codes (independent TESTING LABORATORIES) and two
   MT-prefixed codes (other operators) as "not real". They are real; they simply belong to other
   companies. MX is a transporter. Restricting to MC and MP loses nothing, because the failure
   this gate exists for is a user ID typed with an MC prefix -- which is still caught. */
const OUR_LICENCE = /\bM[CP]\d{6}\b/g;
const KINDS = ["cultivation", "manufactur", "retail", "transport", "laborator", "research"];

/* ── WRONG POPULATION, found 12 Aug 2026 by Agent W. ──────────────────────────────
 *
 * The narrowing above stopped at the STATE PREFIX and not at the question. IL and MT codes
 * were excluded because they belong to other companies — but a Massachusetts CUSTOMER carries
 * an MC or MP code too, so every third-party licence in-state still fell through and was
 * reported as "not real".
 *
 * It failed the build on five of them, all genuine, every one attested by Metrc's own transfer
 * records: two Flower Power Growers licences (54 and 11 transfers), Bud's Goods & Service
 * (150), Northeast Alternatives (1) and Coastal Cultivars (5). An audit document that lists
 * who we shipped to CANNOT be written without naming their licences, so the gate made a
 * correct document unpublishable.
 *
 * The five codes are deliberately NOT written here. Rule G2 says licence numbers do not belong
 * in executable code, and this file is executable code; they are recorded in the check_defect
 * row for 'docs-vs-database' along with the SQL that re-derives them.
 *
 * THE FIX IS NOT A TOLERANCE. The question this gate asks is "does this licence exist?" and it
 * was putting that question to an authority that structurally cannot hold half the right
 * answers. company_licenses is OURS BY DEFINITION. So the authority widens to every licence the
 * database can attest — ours, plus any code Metrc's transfer records show as a real
 * counterparty — and the verdict does not move an inch: a code in NEITHER set is still a hard
 * fail. The founding failure is still caught, because a Metrc USER ID typed with an MC prefix
 * appears in no company_licenses row and on no manifest.
 *
 * RULE 2 (kind matching) deliberately still consults OUR licences only. We know our own kinds;
 * we do not hold a counterparty's, and guessing one would be the same mistake again.
 */
export function licenceVerdict(code, ours, attested) {
  if (ours.has(code)) return "ours";
  if (attested.has(code)) return "counterparty";
  return "unknown";
}

/* BOTH HALVES, or it does not ship. The positive half proves it still fires; the negative half
   is the one that would have prevented this defect, and it is the half that keeps getting
   skipped. */
function selfTest() {
  /* SHAPED, NOT REAL. Rule G2 keeps licence numbers out of executable code, and a fixture is
     executable code. These are built from a prefix and a counter so the file holds no licence
     literal at all — which also makes the test independent of production, so renewing a real
     licence can never break it. The verdict function is pure and takes both sets as
     arguments, so shape is the only thing under test. */
  const shaped = (prefix, n) => prefix + String(n).padStart(6, "0");
  const ourCult = shaped("MC", 1), ourMfg = shaped("MP", 2);
  const cpA = shaped("MC", 3), cpB = shaped("MP", 4);
  const ours = new Set([ourCult, ourMfg]);
  const attested = new Set([cpA, cpB]);
  const cases = [
    // POSITIVE — must still fail. These are the failures the gate exists for.
    [shaped("MC", 999999), "unknown", "fabricated code in neither set"],
    [shaped("MP", 123456), "unknown", "a Metrc USER ID typed with a licence prefix — the founding defect"],
    [shaped("MC", 4), "unknown", "right shape, wrong prefix for an attested MP code — a typo must not pass"],
    // NEGATIVE — must stay quiet. This half is what the 12 Aug 2026 false alarm needed.
    [ourCult, "ours", "our cultivation licence"],
    [ourMfg, "ours", "our manufacturing licence"],
    [cpA, "counterparty", "a customer attested by its own manifests"],
    [cpB, "counterparty", "a second customer, different prefix"],
  ];
  const bad = cases.filter(([code, want]) => licenceVerdict(code, ours, attested) !== want);
  if (bad.length) {
    console.error("docs-vs-database: SELF-TEST FAILED — refusing to run.");
    for (const [code, want, why] of bad) {
      console.error(`      ${code} expected ${want} (${why}), got ` +
                    `${licenceVerdict(code, ours, attested)}`);
    }
    process.exit(1);
  }
  console.log(`docs-vs-database: verdict self-test PASSED (${cases.length} cases, ` +
              "4 of them negative — the half that stops a wrong label).");
}

const git = (...a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const files = git("ls-files", "*.md").stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const live = files.filter((f) => !ARCHIVE.some((re) => re.test(f)));

/* ── the database is the authority ───────────────────────────────────────────── */
async function licencesFromDatabase() {
  let conn = process.env.PGURL || null;
  if (!conn && existsSync(join(ROOT, ".mcp.json"))) {
    try {
      const url = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"))
        ?.mcpServers?.["twisted-growers"]?.args?.[0];
      if (url) conn = url.replace(/sslmode=[a-z-]+/, "uselibpqcompat=true&sslmode=require");
    } catch { /* fall through */ }
  }
  if (!conn) return null;

  let pg;
  try { pg = (await import("pg")).default; } catch { return null; }

  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false },
                                 statement_timeout: 30000 });
  try {
    await client.connect();
    const { rows } = await client.query(
      "select license, kind, active from company_licenses");
    /* Counterparty licences the database can ATTEST — each one carries real Metrc transfer
       rows behind it, so this is evidence, not an allow-list somebody can type into. */
    const { rows: cp } = await client.query(`
      select destination_licence as license, count(*)::int as transfers,
             max(destination_facility) as facility
        from metrc_rpt_package_transfers
       where destination_licence ~ '^M[CP][0-9]{6}$'
       group by 1`);
    return { ours: rows, counterparties: cp };
  } catch { return null; }
  finally { await client.end().catch(() => {}); }
}

selfTest();
if (process.argv.includes("--selftest")) process.exit(0);

const db = await licencesFromDatabase();
const rows = db?.ours ?? null;

if (!rows) {
  /* Never a bare PASS on a check that did not run. That is how a vacuous gate survives — the
     schema baseline gate read a clock for a full day while production drifted 16 tables. */
  console.log("docs-vs-database: PASS (DEGRADED) — no database connection available here.");
  console.log(`  ${live.length} live documents were NOT verified against company_licenses.`);
  console.log("  This check is only meaningful with a connection. Drift would not be caught.");
  process.exit(0);
}

const known = new Map(rows.map((r) => [r.license, r]));
/* Attested counterparties. Keyed by licence, valued by the evidence, so the output can say
   WHY a code was accepted rather than merely that it was. */
const attested = new Map((db.counterparties ?? []).map((r) => [r.license, r]));
for (const k of known.keys()) attested.delete(k);   // ours are ours, never "counterparty"
if (known.size === 0) {
  console.error("docs-vs-database: FAIL — company_licenses is EMPTY.");
  console.error("  Every licence in every document would be unverifiable. Refusing to pass.");
  process.exit(1);
}

let failed = false;
const unknown = [];
const mismatched = [];

for (const f of live) {
  const text = readFileSync(join(ROOT, f), "utf8");
  text.split(/\r?\n/).forEach((line, i) => {
    const hits = line.match(OUR_LICENCE);
    if (!hits) return;
    if (EXPLAINS_ITSELF.test(line)) return;

    const codes = [...new Set(hits)];

    for (const code of codes) {
      if (licenceVerdict(code, known, attested) === "unknown") {
        unknown.push(`${f}:${i + 1}  ${code}  — in neither company_licenses nor any manifest`);
      }
    }

    /* RULE 2 — ONLY when the line names exactly ONE of our licences.
     *
     * Its first run reported 8 "wrong kind" failures and every one was this bug: the correct
     * and normal way to write it is "<cultivation code> cultivation, <manufacturing code> manufacturing" — two codes
     * and two kinds on one line. Taking the first kind word and applying it to every code
     * guarantees a mismatch on the second. Pairing words to codes reliably needs a real parser,
     * so the ambiguous case is SKIPPED rather than guessed. A single-licence line — where the
     * pairing is unambiguous — is still checked, which is where a genuine swap would appear. */
    if (codes.length !== 1) return;
    const row = known.get(codes[0]);
    if (!row) return;

    /* Pair the code with the NEAREST kind word, not the first one on the line.
     *
     * Third false positive of this gate's own making, and the subtlest: prose WRAPS. Line 74 of
     * brain/HARDCODED_REGISTER.md reads "cultivation and <the manufacturing code> manufacturing, and a licence
     * change would today" — the word "cultivation" belongs to the OTHER code on the line ABOVE. Taking
     * any kind word on the line flagged a document that was entirely correct. Nearest-word
     * pairing reads it the way a person does. */
    const lower = line.toLowerCase();
    const at = lower.indexOf(codes[0].toLowerCase());
    let nearest = null, best = Infinity;
    for (const k of KINDS) {
      let from = 0, idx;
      while ((idx = lower.indexOf(k, from)) !== -1) {
        const d = Math.abs(idx - at);
        if (d < best) { best = d; nearest = k; }
        from = idx + 1;
      }
    }
    if (nearest && !row.kind.toLowerCase().startsWith(nearest.slice(0, 8))) {
      mismatched.push(`${f}:${i + 1}  ${codes[0]} is ${row.kind}, document says "${nearest}"`);
    }
  });
}

if (unknown.length) {
  failed = true;
  console.error(`docs-vs-database: FAIL — ${unknown.length} licence(s) in live documents are not real:`);
  unknown.forEach((x) => console.error(`    ${x}`));
  console.error("");
  console.error("These are in NEITHER company_licenses NOR any Metrc transfer record, so the");
  console.error("database cannot attest them as ours or as anybody's. That leaves a typo, a user");
  console.error("ID mistaken for a licence (this happened: a USER ID was typed as one and reached a");
  console.error("template addressed to api-info@metrc.com), or a real licence nobody recorded.");
  console.error("All three are worth failing a build over.");
  console.error("");
  console.error("A CUSTOMER's licence is fine and is NOT what this is reporting — those are");
  console.error("accepted on the evidence of their own manifests. If one of these is a genuine");
  console.error("counterparty we have simply never shipped to, add it to company_licenses or");
  console.error("wait for its first manifest. Do not add it to a list in this file.");
  console.error("");
  console.error("If the line legitimately records a PAST error, say so on the line — words like");
  console.error('"not a licence", "was wrong", "CORRECTED", "historical" are recognised — or move');
  console.error("the document into an archive path. Do not delete the history.");
}

if (mismatched.length) {
  failed = true;
  console.error(`docs-vs-database: FAIL — ${mismatched.length} licence(s) described with the WRONG KIND:`);
  mismatched.forEach((x) => console.error(`    ${x}`));
  console.error("");
  console.error("A swapped cultivation/manufacturing pair reads perfectly and is completely wrong.");
  console.error("company_licenses is the authority: it holds the kind and a note for each.");
}

if (failed) {
  console.error("docs-vs-database: FAIL");
  process.exit(1);
}

const list = [...known.values()].map((r) => `${r.license}=${r.kind}`).join(", ");
console.log(`docs-vs-database: PASS (VERIFIED against company_licenses) — ${list}.`);
console.log(`  ${live.length} live documents checked, ${files.length - live.length} archives exempt.`);
console.log(`  ${attested.size} counterparty licence(s) additionally attested by Metrc transfer`);
console.log("  records, so a document may name who we shipped to. A code in neither set fails.");
