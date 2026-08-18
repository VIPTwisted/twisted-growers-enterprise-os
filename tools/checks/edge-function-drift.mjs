#!/usr/bin/env node
/* edge-function-drift.mjs — a source that changed must be deployed, or say why not.
 *
 * THE DEFECT THIS CLOSES.
 *
 * `edge-functions-versioned` reports PASS. It checks that every deployed function
 * HAS a source file in the repository. It does not check that the source MATCHES
 * what is running — and on 9 Aug 2026 it passed while 20 of 25 local sources
 * differed from production.
 *
 * Among them was apex-sync, whose four fixes — the required updated_at_from that
 * was returning 422 on shipping-orders, the rate-limit versus spending-cap split,
 * the completeness check, and the per-entity credit measurement — sat committed
 * and undeployed for 4 hours 38 minutes. Nothing detected it. A human read the
 * timestamps by hand.
 *
 * A guard that cannot fail on the thing it guards is decoration, and this
 * repository has now produced that shape three times: the room-capacity check
 * measured against its own maximum, the manifest-shipper check that stayed green
 * as its denominator shrank, and this.
 *
 * WHY A MANIFEST RATHER THAN A LIVE COMPARISON. Comparing against production
 * needs credentials CI does not hold, and a check that cannot run in CI is not a
 * gate — that is the same reasoning schema-baseline-fresh records. So the repo
 * pins the SHA-256 of each source at the moment it was last known to match, and
 * this fails when a source moves without the deploy being recorded.
 *
 * TWO CLASSES, AND CONFLATING THEM WOULD BE DANGEROUS.
 *
 *   redacted:false — real source. If the hash changes, deploy it.
 *
 *   redacted:true  — RECOVERED FROM PRODUCTION with the shared admin key replaced
 *                    by a placeholder. Sixteen functions are in this state.
 *                    Production is the source of record for them and DEPLOYING
 *                    THE LOCAL COPY WOULD BREAK THEM — every Metrc importer,
 *                    metrc-sync, the document backfill. This check still pins
 *                    their hash so a silent edit is caught, but it must never
 *                    tell anyone to deploy one.
 *
 * The exit from that split is written up in RECOVERY_MANIFEST.md: move the shared
 * key into a Supabase function secret read through Deno.env.get, and the
 * redaction becomes unnecessary. It is also the fix for the underlying problem —
 * one static key currently bypasses executive auth on sixteen deployed functions.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const FN_DIR = join(root, "app/supabase/functions");
const MANIFEST = join(here, "edge-function-manifest.json");

/* --committed: judge the COMMITTED tree (HEAD), not the working tree.
 *
 * WHY TWO MODES EXIST. On 18 Aug 2026 a commit changed budz-chat's source without
 * the deploy being recorded. This gate caught it — in CI and inside the Netlify
 * build, AFTER the push — so every one of the next eight site builds died and the
 * live site froze for five hours while the owner refreshed and saw nothing.
 *
 * The pre-push hook (tools/githooks/pre-push) runs this mode BEFORE the push
 * leaves the machine, so the poison commit is rejected while it is one keystroke
 * to fix instead of a frozen production site. It must judge HEAD, not the working
 * tree: agents keep in-progress edits in the tree that are not being pushed, and
 * blocking a push over work that is not in it would teach everyone to bypass the
 * hook. Default mode (working tree) stays for CI and Netlify, where tree == commit. */
const COMMITTED = process.argv.includes("--committed");
const gitShow = (p) => {
  try {
    return execFileSync("git", ["show", `HEAD:${p}`], { cwd: root, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8");
  } catch { return null; }
};

/* In committed mode the manifest comes from HEAD too — judging HEAD's sources
   against a working-tree manifest would let an uncommitted pin edit skew the verdict
   in either direction. */
const manifestRaw = COMMITTED
  ? gitShow("tools/checks/edge-function-manifest.json")
  : (existsSync(MANIFEST) ? readFileSync(MANIFEST, "utf8") : null);

if (manifestRaw === null) {
  console.error("edge-function-drift: FAIL — no manifest.");
  console.error("      tools/checks/edge-function-manifest.json pins each function's source hash.");
  console.error("      Without it nothing can tell a deployed function from a stale one.\n");
  process.exit(1);
}

const manifest = JSON.parse(manifestRaw);
const pinned = manifest.functions ?? {};

/* HASH THE CONTENT, NOT THE LINE ENDINGS.
 *
 * This repo has core.autocrlf=true and no .gitattributes, so a checkout on Windows
 * writes CRLF and a checkout on Linux writes LF - the SAME commit, two different byte
 * streams, two different sha256s. Netlify builds on Linux; agents work on Windows.
 *
 * Hashing raw bytes therefore made this gate answer differently depending on WHO RAN IT.
 * On 11 Aug 2026 it reported parse-documents as drifted (ae1f4fe -> 0dca802b) on a
 * Windows tree while the identical commit hashed ae1f4fe on Netlify and matched the
 * manifest exactly. A gate whose verdict depends on the machine is worse than no gate:
 * it burns time chasing a difference that does not exist, and - the dangerous direction -
 * it would equally report a REAL drift as clean if the line endings happened to cancel out.
 *
 * Normalising CRLF to LF makes the answer identical everywhere. It changes no pinned
 * value: every hash already in the manifest was recorded from an LF checkout. */
const shaOf = (content) =>
  createHash("sha256")
    .update(Buffer.from(content.replace(/\r\n/g, "\n"), "utf8"))
    .digest("hex");

/* In committed mode the source of truth is HEAD; in default mode it is the tree. */
const readSource = (slug) => {
  if (COMMITTED) return gitShow(`app/supabase/functions/${slug}/index.ts`);
  const p = join(FN_DIR, slug, "index.ts");
  return existsSync(p) ? readFileSync(p).toString("utf8") : null;
};

const drifted = [];
const untracked = [];
const missing = [];
let redactedCount = 0;
let matched = 0;

for (const [slug, rec] of Object.entries(pinned)) {
  const body = readSource(slug);
  if (body === null) {
    missing.push(slug);
    continue;
  }
  const now = shaOf(body);
  if (rec.redacted) redactedCount++;
  if (rec.sha256 && now !== rec.sha256) {
    drifted.push({ slug, redacted: !!rec.redacted, was: rec.sha256.slice(0, 12), now: now.slice(0, 12) });
  } else {
    matched++;
  }
}

/* A function added to the repo but never pinned is invisible to this check, which
   is how the previous gate stayed green. Catch it — in the same tree being judged. */
if (COMMITTED) {
  let names = [];
  try {
    /* trailing slash = list the directory's CHILDREN, not the directory itself */
    names = execFileSync("git", ["ls-tree", "-d", "--name-only", "HEAD", "app/supabase/functions/"], { cwd: root })
      .toString("utf8").split("\n").filter(Boolean).map((l) => l.split("/").pop());
  } catch { /* no functions dir in HEAD — nothing to scan */ }
  for (const name of names) {
    if (gitShow(`app/supabase/functions/${name}/index.ts`) === null) continue;
    if (!pinned[name]) untracked.push(name);
  }
} else {
  for (const d of readdirSync(FN_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    if (!existsSync(join(FN_DIR, d.name, "index.ts"))) continue;
    if (!pinned[d.name]) untracked.push(d.name);
  }
}

console.log(`edge-function-drift: ${COMMITTED ? "judging COMMITTED tree (HEAD) · " : ""}${Object.keys(pinned).length} pinned · ${matched} unchanged · ${redactedCount} redacted recovery copies`);

if (missing.length) {
  console.error(`\nedge-function-drift: FAIL — ${missing.length} pinned function(s) have no source file:\n`);
  for (const s of missing) console.error(`  ✗ ${s} — deployed, and the repo no longer holds it.`);
  process.exit(1);
}

if (untracked.length) {
  console.error(`\nedge-function-drift: FAIL — ${untracked.length} function(s) in the repo are not pinned:\n`);
  for (const s of untracked) console.error(`  ✗ ${s}`);
  console.error(`\nAn unpinned function is invisible to this check, which is exactly how the`);
  console.error(`previous gate stayed green while twenty sources differed from production.`);
  console.error(`Add it to tools/checks/edge-function-manifest.json with its hash.\n`);
  process.exit(1);
}

if (drifted.length) {
  const real = drifted.filter((d) => !d.redacted);
  const red = drifted.filter((d) => d.redacted);

  console.error(`\nedge-function-drift: FAIL — ${drifted.length} source(s) changed since the recorded deploy:\n`);

  for (const d of real) {
    console.error(`  ✗ ${d.slug}  ${d.was}… → ${d.now}…`);
    console.error(`      Real source. DEPLOY IT, then update the hash in the manifest.`);
    console.error(`      Committed-but-undeployed is how apex-sync ran four fixes behind production.\n`);
  }
  for (const d of red) {
    console.error(`  ✗ ${d.slug}  ${d.was}… → ${d.now}…   [REDACTED RECOVERY COPY]`);
    console.error(`      DO NOT DEPLOY THIS. Its admin key is a placeholder and deploying it`);
    console.error(`      would break the function in production. Something edited a file that is`);
    console.error(`      only a record of what is running. Revert it, or if the edit is`);
    console.error(`      deliberate, re-pin the hash and say why in the manifest note.\n`);
  }
  process.exit(1);
}

console.log(`edge-function-drift: PASS — every source matches its recorded deploy.`);
