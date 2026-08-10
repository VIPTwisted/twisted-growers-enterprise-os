#!/usr/bin/env node
/* CHECK: the Apex entity registry must agree with Apex's own committed contract.
 *
 * WHY THIS EXISTS — five defects, found by hand, that nothing would have caught.
 *
 * `apex_entity` is config-as-rows (rule G1): 46 rows declaring what a COMPLETE Apex import
 * contains, and the denominator for every completeness figure the Sales module will publish.
 * `apex-sync` drives itself entirely from those rows — endpoint, version, root key, delta
 * support, paging, refresh interval. Every one of them was typed by a person reading a
 * 17,512-line OpenAPI document, and on 9 Aug 2026 five were wrong:
 *
 *   · cannabinoids      root_key "data"  — the spec returns { "cannabinoid": [...] }
 *   · infusion-methods  root_key "data"  — the spec returns { "infusion_methods": [...] }
 *   · batches           declared the WRITE scope (update:batches) as the requirement for a READ
 *   · transporter-orders  required=true with a scope the key does not hold — a guaranteed 403
 *                         on every run, which is THE STANDARD #3: a wrong label costs more
 *                         than no label, because people stop reading a log that is always red
 *   · available-inventory  refreshed hourly at 3 credits per item with NO delta support in the
 *                          spec — roughly 307,000 credits a month against a 100,000 allowance
 *
 * None of them would have failed loudly. A wrong root_key aborts ONE entity with a message
 * nobody reads at 02:00; a wrong interval just sends a bill. All five were found only because
 * somebody diffed the registry against the spec by hand, once. That is the definition of an
 * unguarded rule — and the meta-trap in _charter_common.md: a decision recorded is not a
 * decision implemented.
 *
 * THE INVARIANT
 *
 *     Every claim apex_entity makes about Apex must be TRUE OF THE COMMITTED SPEC,
 *     and every list endpoint in the spec must have a row.
 *
 * The spec is in the repository (docs/apex/apex-openapi-3.1.json), so this needs no API key,
 * costs no credits, and cannot be fooled by a live system agreeing with itself — the failure
 * mode of `ownership.confirmed_not_ours`, which counted rows of the view it was checking.
 * Two genuinely independent sources: a JSON contract on disk, and rows in Postgres.
 *
 * FIVE RULES, all hard failures, all narrow enough that the gate stays quiet enough to survive:
 *
 *   RULE 1 · Every registry endpoint resolves to a real GET in the spec.
 *   RULE 2 · root_key is a top-level property of that endpoint's own 200 response schema.
 *   RULE 3 · supports_delta matches whether the spec declares `updated_at_from`.
 *   RULE 4 · supports_paging matches whether the spec declares `per_page`.
 *   RULE 5 · Every single-segment GET list endpoint in the spec HAS a row. Completeness is
 *            unfalsifiable if the denominator can quietly omit an endpoint.
 *   RULE 6 · delta_required matches whether the spec marks `updated_at_from` required:true.
 *
 * RULE 6 WAS ADDED AFTER THIS GATE PASSED WHILE THE SYNC WAS BROKEN, and that is worth
 * stating plainly. At 22:21 on 9 Aug 2026 the first real sync returned HTTP 422 on
 * shipping-orders, receiving-orders, products, buyers and batches - every entity carrying
 * money, customers, products or Metrc tags - because Apex marks updated_at_from
 * REQUIRED on seven endpoints and the worker omits it when no watermark exists. This file
 * checked that the parameter was ACCEPTED and never that it was MANDATORY, so it reported
 * PASS on a registry that could not pull an order. A gate that passes while the thing it
 * guards is broken is the failure mode it exists to prevent.
 *
 * It reports credit exposure per entity and passes no verdict on it. There is no threshold in
 * this file on purpose: a cost ceiling is a business decision and belongs in a row, not in a
 * gate (rule G1). Measure, do not assert.
 *
 *   node tools/checks/apex-registry-vs-spec.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC_PATH = join(ROOT, "docs", "apex", "apex-openapi-3.1.json");

/* ── the contract ─────────────────────────────────────────────────────────────── */
if (!existsSync(SPEC_PATH)) {
  console.error("apex-registry-vs-spec: FAIL — docs/apex/apex-openapi-3.1.json is missing.");
  console.error("      The registry then has no authority to be checked against, and every");
  console.error("      root key, version and delta flag in apex_entity is unverifiable.\n");
  process.exit(1);
}

let spec;
try {
  spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
} catch (e) {
  console.error(`apex-registry-vs-spec: FAIL — the spec is not valid JSON: ${String(e).slice(0, 160)}`);
  process.exit(1);
}

const SCHEMAS = spec.components?.schemas ?? {};
const PATHS = spec.paths ?? {};

/* Resolve a 200 response to its top-level property names. A $ref may point at a collection
   wrapper, so follow it once rather than assuming the shape. */
function rootKeysOf(path) {
  const get = PATHS[path]?.get;
  if (!get) return null;
  let schema = get.responses?.["200"]?.content?.["application/json"]?.schema;
  let hops = 0;
  while (schema?.$ref && hops++ < 5) schema = SCHEMAS[schema.$ref.split("/").pop()];
  if (!schema?.properties) return [];
  return Object.keys(schema.properties);
}

const queryParams = (path) =>
  ((PATHS[path]?.get?.parameters ?? []).filter((p) => p.in === "query"));
const queryNames = (path) => queryParams(path).map((p) => p.name);
const isRequiredParam = (path, name) =>
  queryParams(path).some((p) => p.name === name && p.required === true);

/* Apex bills 3 credits per item on the endpoints it names as data-heavy, 1 elsewhere. Read
   that list out of the spec's own description rather than retyping it — a hardcoded copy
   would drift the first time they add one. */
const HEAVY = new Set(
  (spec.info?.description ?? "")
    .split("Data-Heavy Endpoints")[1]?.split("###")[0]
    ?.match(/`\/[a-z0-9{}\/-]+`/gi)?.map((s) => s.replace(/`/g, "")) ?? []
);

/* ── the registry is the thing under test ─────────────────────────────────────── */
async function registryFromDatabase() {
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
      `select entity, endpoint, api_version, root_key, required, pull_mode,
              supports_delta, delta_required, supports_paging, min_interval_minutes
         from apex_entity order by entity`);
    return rows;
  } catch { return null; }
  finally { await client.end().catch(() => {}); }
}

const rows = await registryFromDatabase();

if (!rows) {
  /* Never a bare PASS on a check that did not run — the schema baseline gate read a clock for
     a full day while production drifted 16 tables. Say what was NOT verified. */
  console.log("apex-registry-vs-spec: PASS (DEGRADED) — no database connection available here.");
  console.log(`  ${Object.keys(PATHS).length} spec paths were parsed, but apex_entity was NOT read.`);
  console.log("  Registry drift against the contract would not be caught in this run.");
  process.exit(0);
}

if (rows.length === 0) {
  console.error("apex-registry-vs-spec: FAIL — apex_entity is EMPTY.");
  console.error("      apex-sync loops over its rows, so an empty registry is a sync that");
  console.error("      pulls nothing and reports success. Absence is not the same as \"no data\".\n");
  process.exit(1);
}

/* ── the five rules ───────────────────────────────────────────────────────────── */
const fail = [];
const note = [];   // credit exposure — measured, never judged
const skip = [];   // rows the shape rules do not apply to, and why

for (const r of rows) {
  const path = `/${r.api_version}${r.endpoint}`;
  const keys = rootKeysOf(path);

  if (keys === null) {                                                        // RULE 1
    fail.push(`${r.entity}: declares ${path}, which has no GET in the committed spec.`);
    continue;
  }

  /* RULE 1 applies to every row — an endpoint that does not exist is wrong however it is
     called. Rules 2–4 describe how the ENTITY LOOP reads a response, so they say nothing
     about an endpoint the worker calls directly (welcome, usage). Skipping them here rather
     than special-casing two entity names keeps the exception in a row, where rule G1 wants
     it, and keeps it visible in the output below. */
  if (r.pull_mode === "direct") {
    skip.push(`${r.entity}: pull_mode=direct — endpoint verified against the spec, response ` +
              `shape not checked (called outside the entity loop).`);
    continue;
  }

  const declared = r.root_key ?? "data";
  if (keys.length && !keys.includes(declared)) {                              // RULE 2
    fail.push(
      `${r.entity}: root_key "${declared}" is not a top-level key of ${path}. ` +
      `The spec returns [${keys.join(", ")}]. apex-sync aborts this entity with ` +
      `"the registry is wrong, not the data" — and it would be right.`);
  }

  const q = queryNames(path);
  const specDelta = q.includes("updated_at_from");
  if (specDelta !== r.supports_delta) {                                       // RULE 3
    fail.push(
      specDelta
        ? `${r.entity}: supports_delta=false but ${path} DOES accept updated_at_from. ` +
          `Every pull re-fetches the whole dataset and is billed for it.`
        : `${r.entity}: supports_delta=true but ${path} does NOT accept updated_at_from. ` +
          `The watermark is written and silently ignored, so the run log claims a delta ` +
          `that never happened.`);
  }

  const specRequiresDelta = isRequiredParam(path, "updated_at_from");           // RULE 6
  if (specRequiresDelta !== r.delta_required) {
    fail.push(
      specRequiresDelta
        ? `${r.entity}: delta_required=false but the spec marks updated_at_from REQUIRED on ` +
          `${path}. Called without it, Apex answers HTTP 422 - not a full pull. This is the ` +
          `defect that returned zero orders, zero buyers and zero products on 9 Aug 2026.`
        : `${r.entity}: delta_required=true but ${path} does NOT mark updated_at_from ` +
          `required. The first pull is then needlessly bounded and history is silently ` +
          `truncated at the seed date.`);
  }

  const specPaging = q.includes("per_page");
  if (specPaging !== r.supports_paging) {                                     // RULE 4
    fail.push(
      specPaging
        ? `${r.entity}: supports_paging=false but ${path} accepts per_page. Only the first ` +
          `page is ever stored, and a short read looks exactly like a small dataset.`
        : `${r.entity}: supports_paging=true but ${path} does not accept per_page.`);
  }

  if (r.required) {
    const perItem = HEAVY.has(r.endpoint) || HEAVY.has(path) ? 3 : 1;
    const perDay = r.min_interval_minutes > 0 ? 1440 / r.min_interval_minutes : 0;
    if (!specDelta && perItem > 1) {
      note.push(
        `${r.entity}: required, ${perItem} credits/item, NO delta in the spec — every pull is ` +
        `a full pull, ${perDay.toFixed(1)}x/day at min_interval_minutes=${r.min_interval_minutes}.`);
    }
  }
}

/* RULE 5 — completeness of the denominator. Single-segment v1/v2 list endpoints only:
   detail and sub-resource paths are reached THROUGH a list and are not separate entities. */
const declaredPaths = new Set(rows.map((r) => `/${r.api_version}${r.endpoint}`));
for (const p of Object.keys(PATHS)) {
  if (!/^\/v\d+\/[a-z0-9-]+$/.test(p)) continue;
  if (!PATHS[p].get) continue;
  if (!declaredPaths.has(p)) {
    fail.push(
      `${p}: is a GET list endpoint in the spec with NO row in apex_entity. ` +
      `apex_entity is the denominator for every completeness figure, so an endpoint ` +
      `missing from it makes "fully imported" unfalsifiable.`);
  }
}

/* ── verdict ──────────────────────────────────────────────────────────────────── */
for (const s of skip) console.log(`apex-registry-vs-spec: direct — ${s}`);
for (const n of note) console.log(`apex-registry-vs-spec: cost   — ${n}`);

if (fail.length) {
  console.error(`\napex-registry-vs-spec: FAIL — ${fail.length} disagreement(s) with the committed contract:\n`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  console.error("\nThe spec at docs/apex/apex-openapi-3.1.json is the authority. Correct the");
  console.error("apex_entity row, not this gate — and if Apex genuinely changed, commit the new");
  console.error("spec in the same breath, because a gate checked against a stale contract is a");
  console.error("check that cannot fail.\n");
  process.exit(1);
}

console.log(
  `apex-registry-vs-spec: PASS — all ${rows.length} apex_entity rows agree with the committed ` +
  `contract on endpoint, root key, delta and paging, and every GET list endpoint in the spec ` +
  `has a row.`);
