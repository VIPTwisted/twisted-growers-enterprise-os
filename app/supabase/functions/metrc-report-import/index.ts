// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 1 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG - Metrc Report Import: lands rows from Metrc report/grid CSV exports.
// Exec JWT or internal admin key. Generic rows always stored; items/strains/locations
// additionally mapped into their metrc_* tables so the API blindspot is bypassed.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ADMIN_KEY = "<REDACTED — lives in Supabase function secrets>";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function callerAllowed(req: Request): Promise<string | null> {
  if (req.headers.get("x-admin-key") === ADMIN_KEY) return "admin-key";
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return null;
  const { data } = await supa.auth.getUser(token);
  const uid = data?.user?.id;
  if (!uid) return null;
  const { data: row } = await supa.from("app_users").select("role").eq("user_id", uid).single();
  return row?.role === "owner" || row?.role === "executive" ? (data?.user?.email ?? uid) : null;
}

const pick = (r: Record<string, unknown>, ...names: string[]) => {
  for (const n of names) {
    const k = Object.keys(r).find((x) => x.toLowerCase().replace(/[^a-z0-9]/g, "") === n.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (k && r[k] !== "" && r[k] != null) return r[k];
  }
  return null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const who = await callerAllowed(req);
  if (!who) return json({ ok: false, error: "Executive access required." }, 403);
  let body: { report_type?: string; license?: string; file_name?: string; rows?: Record<string, unknown>[] };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
  const rows = body.rows ?? [];
  if (!rows.length) return json({ ok: false, error: "No rows." }, 400);
  if (rows.length > 20000) return json({ ok: false, error: "Too many rows in one call (max 20000)." }, 400);
  const rt = (body.report_type ?? "other").toLowerCase();
  const license = body.license ?? null;
  const now = new Date().toISOString();
  let mappedTo: string | null = null;
  let mapped = 0;
  const mapErrs: string[] = [];
  if (["items", "strains", "locations"].includes(rt) && license) {
    mappedTo = `metrc_${rt}`;
    for (const r of rows) {
      try {
        if (rt === "items") {
          const name = pick(r, "Name", "ItemName", "Item");
          if (!name) continue;
          await supa.from("metrc_items").upsert({
            license, metrc_id: Number(pick(r, "Id", "ItemId")) || Math.abs(hash(String(name))),
            name, category: pick(r, "Category", "ProductCategoryName", "ItemCategory"),
            unit_of_measure: pick(r, "UnitOfMeasureName", "UnitOfMeasure", "UoM", "Unit"),
            strain: pick(r, "Strain", "StrainName"), raw: r, synced_at: now,
          }, { onConflict: "license,metrc_id" });
          mapped++;
        } else if (rt === "strains") {
          const name = pick(r, "Name", "StrainName", "Strain");
          if (!name) continue;
          await supa.from("metrc_strains").upsert({
            license, metrc_id: Number(pick(r, "Id", "StrainId")) || Math.abs(hash(String(name))),
            name, testing_status: pick(r, "TestingStatus"),
            thc_level: Number(pick(r, "ThcLevel", "THC")) || null, cbd_level: Number(pick(r, "CbdLevel", "CBD")) || null,
            raw: r, synced_at: now,
          }, { onConflict: "license,metrc_id" });
          mapped++;
        } else {
          const name = pick(r, "Name", "LocationName", "Location");
          if (!name) continue;
          await supa.from("metrc_locations").upsert({
            license, metrc_id: Number(pick(r, "Id", "LocationId")) || Math.abs(hash(String(name))),
            name, location_type: pick(r, "LocationTypeName", "LocationType", "Type"),
            raw: r, synced_at: now,
          }, { onConflict: "license,metrc_id" });
          mapped++;
        }
      } catch (e) { mapErrs.push(String(e).slice(0, 90)); }
    }
  }
  const { data: imp, error: impErr } = await supa.from("metrc_report_imports").insert({
    report_type: rt, license, file_name: body.file_name ?? null, row_count: rows.length,
    mapped_to: mappedTo, imported_by: String(who),
  }).select("id").single();
  if (impErr) return json({ ok: false, error: impErr.message }, 500);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r, j) => ({
      import_id: imp!.id, report_type: rt, license, row_no: i + j + 1, row: r,
    }));
    const { error } = await supa.from("metrc_report_rows").insert(chunk);
    if (error) return json({ ok: false, error: `rows chunk: ${error.message}` }, 500);
  }
  return json({ ok: true, results: {
    stored: `${rows.length} rows stored`,
    mapped: mappedTo ? `${mapped} mapped into ${mappedTo}` : "generic storage (no direct table mapping for this report type)",
    map_errors: mapErrs.slice(0, 5),
  } });
});

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}
