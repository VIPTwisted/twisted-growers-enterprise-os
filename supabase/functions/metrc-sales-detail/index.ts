import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* Metrc sales detail — PREPARED, NOT DEPLOYED, NOT CALLED.
 *
 * Written 6 August 2026 at the owner's request so it is ready when the team
 * decides. It has never been run against Metrc.
 *
 * WHAT IT DOES
 * We already hold 2,548 outgoing transfer HEADERS going back to January 2024.
 * They carry the manifest number, dates, package count and driver — but no
 * recipient and no line items, because the sync only ever called the list
 * endpoint. This fetches the delivery detail for each manifest: who received
 * it, and which packages with what quantities.
 *
 * SAFETY — READ BEFORE RUNNING
 * Defaults to DRY RUN. It will not call Metrc and will not write anything
 * unless the caller passes {"confirm": true}. A dry run reports exactly how
 * many manifests would be fetched and what it would do.
 *
 * Start with {"probe": true}. That calls Metrc for ONE manifest, writes
 * nothing, and returns the raw payload so we can see what Massachusetts
 * actually gives a sender after transfer. Some states restrict this. Do not
 * run the backfill until the probe has been read by a person.
 *
 * ENDPOINTS — UNVERIFIED
 * Metrc's transfer detail is a two-step call and the exact paths vary by
 * state and API version. These are the documented v1 shapes:
 *   GET /transfers/v1/{manifestNumber}/deliveries
 *   GET /transfers/v1/delivery/{deliveryId}/packages
 * The probe exists precisely to confirm these before anything is trusted.
 *
 * RATE LIMIT
 * Metrc throttles. The backfill processes in batches with a pause between
 * calls and can be resumed — it skips manifests already detailed. Expect the
 * 2,548 backfill to take hours, not minutes. Ongoing it is a handful a day.
 */

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const METRC_BASE = Deno.env.get("METRC_BASE_URL") ?? "https://api-ma.metrc.com";
const VENDOR_KEY = Deno.env.get("METRC_VENDOR_KEY") ?? "";
const USER_KEY = Deno.env.get("METRC_USER_KEY") ?? "";
const LICENSE = Deno.env.get("METRC_LICENSE") ?? "MC281714";

const PAUSE_MS = 400;        // between Metrc calls, to stay inside the throttle
const BATCH_DEFAULT = 25;    // manifests per invocation unless told otherwise

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const auth = () =>
  "Basic " + btoa(`${VENDOR_KEY}:${USER_KEY}`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function metrcGet(path: string) {
  const url = `${METRC_BASE}${path}${path.includes("?") ? "&" : "?"}licenseNumber=${LICENSE}`;
  const res = await fetch(url, { headers: { Authorization: auth() } });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep raw text */ }
  return { ok: res.ok, status: res.status, url, body };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({
      error: "Send a POST.",
      usage: {
        dryRun: "{} — reports what would happen. Calls nothing.",
        probe: '{"probe": true} — ONE manifest, writes nothing, returns the raw payload.',
        backfill: '{"confirm": true, "batch": 25} — fetches and writes. Resumable.',
      },
    }, 405);
  }

  let p: { confirm?: boolean; probe?: boolean; batch?: number; manifest?: string } = {};
  try { p = await req.json(); } catch { /* empty body means dry run */ }

  if (!VENDOR_KEY || !USER_KEY) {
    return json({
      error: "Metrc credentials are not set.",
      needed: ["METRC_VENDOR_KEY", "METRC_USER_KEY"],
      note: "Set these as Supabase function secrets. They are never returned to a browser.",
    }, 400);
  }

  /* Which manifests still have no detail. */
  const { data: pending, error: qErr } = await db
    .from("metrc_transfers")
    .select("id, raw")
    .eq("direction", "outgoing")
    .is("recipient_name", null)
    .limit(p.batch ?? BATCH_DEFAULT);

  if (qErr) {
    return json({
      error: qErr.message,
      hint: "metrc_transfers may not have a recipient_name column yet. The migration in " +
            "this folder's README adds it. Nothing has been changed.",
    }, 500);
  }

  const outstanding = pending?.length ?? 0;

  /* ---------- DRY RUN — the default. Calls nothing, writes nothing. ---------- */
  if (!p.confirm && !p.probe) {
    return json({
      mode: "DRY RUN — nothing was called and nothing was written",
      manifests_in_this_batch: outstanding,
      would_call: `${METRC_BASE}/transfers/v1/{manifest}/deliveries then /delivery/{id}/packages`,
      would_write: ["metrc_transfers.recipient_name", "metrc_transfers.recipient_license",
                    "metrc_transfers.received_on", "metrc_transfer_packages (new rows)"],
      estimated_calls: outstanding * 2,
      estimated_seconds: Math.round((outstanding * 2 * PAUSE_MS) / 1000),
      next_step: 'Run {"probe": true} first. Read the payload before any backfill.',
    });
  }

  /* ---------- PROBE — one manifest, read only, writes nothing ---------- */
  if (p.probe) {
    const first = p.manifest ?? pending?.[0]?.raw?.ManifestNumber;
    if (!first) return json({ error: "No outgoing manifest available to probe." }, 404);

    const deliveries = await metrcGet(`/transfers/v1/${first}/deliveries`);
    let packages: unknown = null;
    const dId = Array.isArray(deliveries.body) ? (deliveries.body[0] as any)?.Id : null;
    if (deliveries.ok && dId) {
      await sleep(PAUSE_MS);
      packages = (await metrcGet(`/transfers/v1/delivery/${dId}/packages`)).body;
    }

    return json({
      mode: "PROBE — one manifest, NOTHING written",
      manifest: first,
      deliveries_call: { ok: deliveries.ok, status: deliveries.status, url: deliveries.url },
      deliveries_payload: deliveries.body,
      packages_payload: packages,
      read_this: "Confirm the recipient name and the package line items are present. " +
                 "If Massachusetts withholds them from the sender, stop here — the backfill " +
                 "will not produce sales history and should not be run.",
    });
  }

  /* ---------- BACKFILL — only with explicit confirm ---------- */
  const results: unknown[] = [];
  let written = 0, failed = 0;

  for (const row of pending ?? []) {
    const manifest = (row.raw as any)?.ManifestNumber;
    if (!manifest) continue;

    const del = await metrcGet(`/transfers/v1/${manifest}/deliveries`);
    await sleep(PAUSE_MS);

    if (!del.ok || !Array.isArray(del.body) || del.body.length === 0) {
      failed++;
      results.push({ manifest, ok: false, status: del.status });
      continue;
    }

    const d = del.body[0] as any;
    const pkgs = await metrcGet(`/transfers/v1/delivery/${d.Id}/packages`);
    await sleep(PAUSE_MS);

    const upd = await db.from("metrc_transfers").update({
      recipient_name: d.RecipientFacilityName ?? null,
      recipient_license: d.RecipientFacilityLicenseNumber ?? null,
      received_on: d.ReceivedDateTime ?? null,
      delivery_raw: d,
    }).eq("id", row.id);

    if (upd.error) { failed++; results.push({ manifest, ok: false, error: upd.error.message }); continue; }

    if (pkgs.ok && Array.isArray(pkgs.body)) {
      const lines = (pkgs.body as any[]).map((x) => ({
        manifest_number: manifest,
        delivery_id: d.Id,
        package_tag: x.PackageLabel ?? x.PackageId,
        product_name: x.ProductName ?? null,
        product_category: x.ProductCategoryName ?? null,
        shipped_quantity: x.ShippedQuantity ?? null,
        shipped_uom: x.ShippedUnitOfMeasureName ?? null,
        received_quantity: x.ReceivedQuantity ?? null,
        received_uom: x.ReceivedUnitOfMeasureName ?? null,
        raw: x,
      }));
      if (lines.length) {
        const ins = await db.from("metrc_transfer_packages")
          .upsert(lines, { onConflict: "manifest_number,package_tag" });
        if (ins.error) { failed++; results.push({ manifest, ok: false, error: ins.error.message }); continue; }
      }
    }

    written++;
    results.push({ manifest, ok: true, recipient: d.RecipientFacilityName, lines: (pkgs.body as any[])?.length ?? 0 });
  }

  return json({
    mode: "BACKFILL",
    manifests_processed: (pending ?? []).length,
    written, failed,
    remaining_hint: "Call again with the same body to continue. It skips anything already detailed.",
    results,
  });
});
