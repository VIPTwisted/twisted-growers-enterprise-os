// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 2 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG - Metrc catalogue sync: items, strains and locations.
//
// Two Metrc quirks defeated this before, both now proven by probe on 6 Aug 2026:
//
//  1. These endpoints return TotalRecords: 0 when called without an explicit
//     lastModified window, even though the facility holds hundreds of each. That
//     is why metrc_items / metrc_strains / metrc_locations sat empty while Metrc's
//     own Facility Metrics reported 1,177 / 209 / 38. Same defect that hid 227
//     harvests and 1,104 manifests.
//  2. pageSize is capped at 20 - anything larger returns HTTP 400
//     ("pageSize must be a positive number between 1 and 20").
//
// With a window and pageSize 20, MC281714 returns items 492, strains 102,
// locations 21 - matching the scorecard exactly.
//
// Every row is stored against its own licence, so cultivation and manufacturing
// stay separable; the combined picture is a view over both rather than a merge
// that loses which licence a record belongs to.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const ADMIN_KEY = "<REDACTED — lives in Supabase function secrets>";
const PAGE_SIZE = 20;        // Metrc's hard cap on these endpoints
const MAX_PAGES = 120;       // 2,400 records per licence per endpoint - ample
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const basic = (a: string, b: string) => "Basic " + btoa(`${a}:${b}`);
type Row = Record<string, unknown>;

async function allowed(req: Request): Promise<boolean> {
  if (req.headers.get("x-admin-key") === ADMIN_KEY) return true;
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return false;
  const { data } = await supa.auth.getUser(token);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: row } = await supa.from("app_users").select("role").eq("user_id", uid).single();
  return row?.role === "owner" || row?.role === "executive";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await allowed(req))) return json({ ok: false, error: "Executive access required." }, 403);

  const { data: secs } = await supa.from("integration_secrets").select("name, value");
  const cfg: Record<string, string> = {};
  for (const s of secs ?? []) cfg[s.name] = s.value;
  const V = (cfg.METRC_VENDOR_KEYS ?? cfg.METRC_VENDOR_KEY ?? "").split(",")[0].trim();
  const U = (cfg.METRC_USER_KEYS ?? cfg.METRC_USER_KEY ?? "").split(",")[0].trim();
  if (!V || !U) return json({ ok: false, error: "Metrc keys are not stored." }, 400);
  const auth = basic(V, U);
  const BASE = `https://api-${cfg.METRC_STATE ?? "ma"}.metrc.com`;
  const LIC = (cfg.METRC_LICENSES ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const p = new URL(req.url).searchParams;
  const from = p.get("from") ?? "2023-01-01T00:00:00Z";
  const to = p.get("to") ?? new Date().toISOString().slice(0, 19) + "Z";
  const onlyLic = p.get("license");
  const licences = onlyLic ? [onlyLic] : LIC;
  const results: Record<string, unknown> = {};
  let calls = 0;

  const page = async (path: string, lic: string) => {
    const out: Row[] = [];
    for (let n = 1; n <= MAX_PAGES; n++) {
      const url = `${BASE}${path}?licenseNumber=${encodeURIComponent(lic)}`
        + `&lastModifiedStart=${encodeURIComponent(from)}&lastModifiedEnd=${encodeURIComponent(to)}`
        + `&pageNumber=${n}&pageSize=${PAGE_SIZE}`;
      const r = await fetch(url, { headers: { Authorization: auth } });
      calls++;
      if (!r.ok) throw new Error(`HTTP ${r.status} on page ${n}: ${(await r.text()).slice(0, 120)}`);
      const b = await r.json();
      const rows = (Array.isArray(b) ? b : (b?.Data ?? [])) as Row[];
      out.push(...rows);
      if (rows.length === 0) break;
      const totalPages = Array.isArray(b) ? 1 : Number(b?.TotalPages ?? 1);
      if (n >= totalPages) break;
      await sleep(140);
    }
    return out;
  };

  const SPECS: Array<[string, string, string, (r: Row, lic: string) => Row]> = [
    ["items", "/items/v2/active", "metrc_items", (r, lic) => ({
      license: lic, metrc_id: r.Id, name: String(r.Name ?? ""),
      category: r.ProductCategoryName ?? null, unit_of_measure: r.UnitOfMeasureName ?? null,
      strain: r.StrainName ?? null, raw: r })],
    ["strains", "/strains/v2/active", "metrc_strains", (r, lic) => ({
      license: lic, metrc_id: r.Id, name: String(r.Name ?? ""),
      testing_status: r.TestingStatus ?? null,
      thc_level: typeof r.ThcLevel === "number" ? r.ThcLevel : null,
      cbd_level: typeof r.CbdLevel === "number" ? r.CbdLevel : null, raw: r })],
    ["locations", "/locations/v2/active", "metrc_locations", (r, lic) => ({
      license: lic, metrc_id: r.Id, name: String(r.Name ?? ""),
      location_type: r.LocationTypeName ?? null, raw: r })],
  ];

  for (const lic of licences) {
    for (const [key, path, table, map] of SPECS) {
      try {
        const rows = await page(path, lic);
        let ok = 0;
        const errs: string[] = [];
        for (let i = 0; i < rows.length; i += 200) {
          const batch = rows.slice(i, i + 200).map((r) => ({
            ...map(r, lic), synced_at: new Date().toISOString(),
          }));
          const { error } = await supa.from(table).upsert(batch, { onConflict: "license,metrc_id" });
          if (error) { if (errs.length < 2) errs.push(error.message.slice(0, 140)); }
          else ok += batch.length;
        }
        results[`${lic}:${key}`] = errs.length
          ? `${ok} of ${rows.length} stored - ${errs.join(" | ")}`
          : `${ok} of ${rows.length} stored`;
        await supa.from("metrc_sync_runs").insert({
          license: lic, endpoint: key, records: ok, status: errs.length ? "partial" : "ok",
          finished_at: new Date().toISOString(), note: `windowed ${from} to ${to}`,
        });
      } catch (e) {
        results[`${lic}:${key}`] = `ERROR: ${String(e).slice(0, 180)}`;
        await supa.from("metrc_sync_runs").insert({
          license: lic, endpoint: key, records: 0, status: "error",
          finished_at: new Date().toISOString(), error: String(e).slice(0, 300),
        });
      }
      await sleep(200);
    }
  }

  return json({ ok: true, window: { from, to }, metrc_calls: calls, results });
});
