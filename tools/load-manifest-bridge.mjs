/* load-manifest-bridge.mjs — Manifest Bridge clone, phase 1 loader.
 *
 * Reads source/manifest-bridge/data/ (verbatim vendor caches, never edited) and loads them
 * into bridge_manifest, bridge_manifest_package and bridge_manual_link.
 *
 * WHY A REPO SCRIPT AND NOT A ONE-OFF: loading a table is not delivering the data. The load
 * has to be repeatable, re-runnable after a fresh export, and readable by whoever inherits it.
 *
 * Idempotent: every write is an upsert keyed on the natural key, so re-running after a newer
 * export updates in place rather than duplicating.
 *
 *   node tools/load-manifest-bridge.mjs          # load
 *   node tools/load-manifest-bridge.mjs --dry    # count only, write nothing
 */
import { openClient } from "./lib/db.mjs";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "source", "manifest-bridge", "data");
const DRY = process.argv.includes("--dry");

const readJson = (name) => {
  const p = join(DATA, name);
  if (!existsSync(p)) { console.error(`  MISSING ${name} — skipped`); return null; }
  return JSON.parse(readFileSync(p, "utf8"));
};

const client = await openClient("load-manifest-bridge", ROOT);
let manifests = 0, packages = 0, links = 0;

try {
  /* ── manifests and their packages ───────────────────────────────────────── */
  const pkg = readJson("apex_bridge_pkgcache.json");
  if (pkg) {
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
        if (!tag) continue;                    /* no tag means no identity — rule D4, the tag IS identity */
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
  }

  /* ── the hand-made links. Small, and the only irreplaceable thing here. ──── */
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

  const ml = readJson("apex_manifest_links.json");
  for (const [orderId, v] of Object.entries(ml?.links ?? {})) {
    await putLink("order_manifest", orderId, v.manifest_id, v.mode, v.by, v.at);
  }
  for (const [k, v] of Object.entries(readJson("metrc_linked_tags.json") ?? {})) {
    await putLink("order_tag", k, v, "linked", null, null);
  }
  for (const [k, v] of Object.entries(readJson("metrc_posted_tags.json") ?? {})) {
    await putLink("posted_tag", k, v, "posted", null, null);
  }

  console.log(`${DRY ? "DRY RUN — nothing written" : "loaded"}: ` +
              `${manifests} manifests, ${packages} manifest-package rows, ${links} manual links`);

  if (!DRY) {
    /* Prove the load landed, and prove it against Metrc rather than against itself. */
    const { rows: [v] } = await client.query(`
      select (select count(*) from bridge_manifest)                       as manifests,
             (select count(*) from bridge_manifest_package)               as packages,
             (select count(distinct package_tag) from bridge_manifest_package) as tags,
             (select count(*) from bridge_manual_link)                    as manual_links,
             (select count(*) from bridge_manifest_package bp
               where not exists (select 1 from metrc_packages p where p.tag = bp.package_tag))
                                                                          as tags_not_in_metrc,
             (select count(distinct bm.manifest_number) from bridge_manifest bm
                join v_manifest_ledger ml using (manifest_number)
               where ml.is_customer_sale)                                 as customer_sale_manifests`);
    console.log("verified in database:", v);
    if (Number(v.tags_not_in_metrc) > 0) {
      console.error(`  WARNING: ${v.tags_not_in_metrc} tag(s) are not in metrc_packages. ` +
                    `Investigate before any figure from this table is reported.`);
    }
  }
} finally {
  await client.end();
}
