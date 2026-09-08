/* load-manifest-bridge.mjs — Manifest Bridge phase 1 loader.
 *
 * READS FROM OBJECT STORAGE, NOT FROM DISK. Grok's ruling, 8 Sep 2026.
 *
 *   The first version of this script read source/manifest-bridge/data/. That folder is 44 MB
 *   and is deliberately NOT in the repository, so a fresh clone could not run it: the script
 *   in git was a museum label, a promise the repo could not keep. The four files it needs now
 *   live in the PRIVATE Supabase Storage bucket `bridge-data`, and this script fetches them
 *   over HTTPS. No 44 MB blob in git, and no credential in git either.
 *
 * THE LOAD HAS ALREADY HAPPENED, via the Supabase MCP on 7-8 Sep 2026:
 *   bridge_manifest 196 · bridge_manifest_package 2,138 (2,120 tags) · bridge_manual_link 116
 *   DO NOT RE-RUN IT. This script REFUSES to touch a table that already has rows unless you
 *   pass --force, precisely so an idle re-run cannot disturb a certified load.
 *
 * WHAT IT IS FOR: re-loading after a fresh vendor export, or standing the tables up in a new
 * environment. Every write is an upsert on the natural key, so a re-run after a newer export
 * updates in place rather than duplicating.
 *
 * TRUST BOUNDARY: these are third-party caches loaded as EVIDENCE. Metrc remains the legal
 * record for custody and Apex the source of record for sales. Nothing here is promoted into
 * v_package_manifest, and no figure from these tables should be reported without deriving it
 * a second way.
 *
 * ENVIRONMENT
 *   BRIDGE_DATA_URL    required. Base URL of the four files in the bucket, no trailing slash.
 *                      Either a signed-URL prefix, or the plain storage base
 *                      https://<project>.supabase.co/storage/v1/object/bridge-data
 *                      with BRIDGE_DATA_TOKEN supplying the bearer.
 *   BRIDGE_DATA_TOKEN  optional. Service-role key or a signed token. NEVER commit it.
 *   SUPABASE_DB_URL    a connection that can WRITE. The local PGURL from .mcp.json is a
 *                      read-only role by design and will fail with a permission error - that
 *                      is the role behaving correctly, not a bug in this script.
 *
 * USAGE
 *   node tools/load-manifest-bridge.mjs --dry     # fetch, count, write nothing
 *   node tools/load-manifest-bridge.mjs           # load, refusing non-empty tables
 *   node tools/load-manifest-bridge.mjs --force   # load over existing rows, deliberately
 */
import pg from "pg";

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");

const BASE = (process.env.BRIDGE_DATA_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.BRIDGE_DATA_TOKEN || "";

if (!BASE) {
  console.error("load-manifest-bridge: BRIDGE_DATA_URL is not set, so there is nothing to read.");
  console.error("  The source data is NOT in this repository - it is 44 MB of third-party cache");
  console.error("  and lives in the private Supabase Storage bucket `bridge-data`.");
  console.error("");
  console.error("  Set it to the bucket base, no trailing slash:");
  console.error("    BRIDGE_DATA_URL=https://<project>.supabase.co/storage/v1/object/bridge-data");
  console.error("    BRIDGE_DATA_TOKEN=<service-role key or signed token>   # never commit this");
  console.error("");
  console.error("  Refusing to guess a local path: a path that exists on one laptop is exactly");
  console.error("  the failure this rewrite removed.");
  process.exit(1);
}

/* The four files this loader needs. The other 38 in the bucket are reference caches that
 * nothing here reads yet; listing them explicitly keeps the contract visible. */
const FILES = {
  packages: "apex_bridge_pkgcache.json",
  links:    "apex_manifest_links.json",
  linked:   "metrc_linked_tags.json",
  posted:   "metrc_posted_tags.json",
};

async function fetchJson(name) {
  const url = `${BASE}/${name}`;
  const res = await fetch(url, TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : undefined);
  if (!res.ok) {
    /* A 400/404 on a PRIVATE bucket usually means no token, not a missing file. Say so,
       because "not found" sends people looking for the wrong problem. */
    const hint = (res.status === 400 || res.status === 404) && !TOKEN
      ? "  The bucket is private. Without BRIDGE_DATA_TOKEN this looks identical to a missing file."
      : "";
    throw new Error(`GET ${name} -> ${res.status} ${res.statusText}\n${hint}`);
  }
  return res.json();
}

const dbUrl = process.env.SUPABASE_DB_URL || process.env.PGURL;
if (!dbUrl) {
  console.error("load-manifest-bridge: SUPABASE_DB_URL is not set. It must be a role that can WRITE.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

let manifests = 0, packages = 0, links = 0;
try {
  /* GUARD: the load already happened and was certified. An accidental re-run is a real risk
     now that this script is in git and looks runnable. Refuse, and say what to pass. */
  const { rows: [existing] } = await client.query(
    `select (select count(*) from bridge_manifest)         as m,
            (select count(*) from bridge_manifest_package) as p,
            (select count(*) from bridge_manual_link)      as l`);
  const populated = Number(existing.m) + Number(existing.p) + Number(existing.l) > 0;
  if (populated && !FORCE && !DRY) {
    console.error("load-manifest-bridge: REFUSING - the tables already hold data.");
    console.error(`  bridge_manifest ${existing.m} · bridge_manifest_package ${existing.p} · bridge_manual_link ${existing.l}`);
    console.error("  That load was verified against live Postgres and independently re-checked.");
    console.error("  Pass --force only if you mean to load over it, or --dry to count first.");
    process.exit(1);
  }

  const pkg = await fetchJson(FILES.packages);
  for (const [manifestId, v] of Object.entries(pkg)) {
    const mn = String(v.manifest_number ?? "").trim();
    if (!mn) continue;                       /* a cache entry with no manifest number is not a manifest */
    if (!DRY) {
      await client.query(
        `insert into bridge_manifest
           (manifest_id, manifest_number, apex_invoice, recipient, recipient_license,
            last_modified, saved_at, raw)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (manifest_id) do update set
           manifest_number   = excluded.manifest_number,
           apex_invoice      = excluded.apex_invoice,
           recipient         = excluded.recipient,
           recipient_license = excluded.recipient_license,
           last_modified     = excluded.last_modified,
           saved_at          = excluded.saved_at,
           raw               = excluded.raw,
           imported_at       = now()`,
        [String(manifestId), mn,
         v.invoice != null ? String(v.invoice) : null,
         v.recipient ?? null, v.recipient_license ?? null,
         v.last_modified ?? null, v.saved_at ?? null,
         v.raw ? JSON.stringify(v.raw) : null]);
    }
    manifests++;

    for (const p of (v.mpkgs ?? [])) {
      const tag = p.package_tag;
      if (!tag) continue;                    /* no tag means no identity - the tag IS identity */
      if (!DRY) {
        await client.query(
          `insert into bridge_manifest_package
             (manifest_id, package_tag, package_number, batch_name, item_name, quantity, unit, raw)
           values ($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (manifest_id, package_tag) do update set
             package_number = excluded.package_number,
             batch_name     = excluded.batch_name,
             item_name      = excluded.item_name,
             quantity       = excluded.quantity,
             unit           = excluded.unit,
             raw            = excluded.raw,
             imported_at    = now()`,
          [String(manifestId), tag,
           p.package_number != null ? String(p.package_number) : null,
           p.batch_name ?? null, p.item_name ?? null,
           p.quantity ?? null, p.unit ?? null,
           p.raw ? JSON.stringify(p.raw) : null]);
      }
      packages++;
    }
  }

  /* The hand-made links. Small, and the only irreplaceable thing in the whole import:
     a person looked at an order and a manifest and said these two are the same thing. */
  const putLink = async (kind, left, right, mode, by, at) => {
    if (!left || !right) return;
    if (!DRY) {
      await client.query(
        `insert into bridge_manual_link (link_kind, left_key, right_value, mode, linked_by, linked_at)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (link_kind, left_key) do update set
           right_value = excluded.right_value, mode = excluded.mode,
           linked_by = excluded.linked_by, linked_at = excluded.linked_at,
           imported_at = now()`,
        [kind, String(left), String(right), mode ?? null, by || null, at ?? null]);
    }
    links++;
  };

  const ml = await fetchJson(FILES.links);
  for (const [orderId, v] of Object.entries(ml?.links ?? {})) {
    await putLink("order_manifest", orderId, v.manifest_id, v.mode, v.by, v.at);
  }
  for (const [k, v] of Object.entries(await fetchJson(FILES.linked))) {
    await putLink("order_tag", k, v, "linked", null, null);
  }
  for (const [k, v] of Object.entries(await fetchJson(FILES.posted))) {
    await putLink("posted_tag", k, v, "posted", null, null);
  }

  console.log(`${DRY ? "DRY RUN - nothing written" : "loaded"}: ` +
              `${manifests} manifests, ${packages} manifest-package rows, ${links} manual links`);

  if (!DRY) {
    /* Prove the load landed, and prove it against Metrc rather than against itself. */
    const { rows: [v] } = await client.query(`
      select (select count(*) from bridge_manifest)                            as manifests,
             (select count(*) from bridge_manifest_package)                    as packages,
             (select count(distinct package_tag) from bridge_manifest_package) as tags,
             (select count(*) from bridge_manual_link)                         as manual_links,
             (select count(*) from bridge_manifest_package bp
               where not exists (select 1 from metrc_packages p where p.tag = bp.package_tag))
                                                                               as tags_not_in_metrc,
             (select count(distinct bm.manifest_number) from bridge_manifest bm
                join v_manifest_ledger ml using (manifest_number)
               where ml.is_customer_sale)                                      as customer_sale_manifests`);
    console.log("verified in database:", v);
    if (Number(v.tags_not_in_metrc) > 0) {
      console.error(`  WARNING: ${v.tags_not_in_metrc} tag(s) are not in metrc_packages. ` +
                    `Investigate before any figure from this table is reported.`);
    }
  }
} finally {
  await client.end();
}
