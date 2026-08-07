// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 1 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG - Metrc reference and delivery sync: every remaining endpoint that answers,
// including the per-transfer delivery walk that fills in customer names on manifests.
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
  const params = new URL(req.url).searchParams;
  const mode = params.get("mode") ?? "reference";
  const results: Record<string, unknown> = {};

  const get = async (path: string, license?: string) => {
    const url = `${BASE}${path}${license ? (path.includes("?") ? "&" : "?") + "licenseNumber=" + encodeURIComponent(license) : ""}`;
    const r = await fetch(url, { headers: { Authorization: auth } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const b = await r.json();
    return (Array.isArray(b) ? b : (b?.Data ?? [])) as Row[];
  };

  if (mode === "reference") {
    const SPECS: Array<[string, string, string, (r: Row, lic: string) => Row]> = [
      ["units_of_measure", "/unitsofmeasure/v2/active", "metrc_units_of_measure",
        (r, lic) => ({ license: lic, name: String(r.Name), abbreviation: r.Abbreviation, quantity_type: r.QuantityType, raw: r })],
      ["employees", "/employees/v2", "metrc_employees",
        (r, lic) => ({ license: lic, full_name: String(r.FullName), employee_license: (r.License as Row)?.Number ?? null, raw: r })],
      ["item_categories", "/items/v2/categories", "metrc_item_categories",
        (r, lic) => ({ license: lic, name: String(r.Name), category_type: r.ProductCategoryType, quantity_type: r.QuantityType, requires_strain: r.RequiresStrain ?? false, raw: r })],
      ["lab_test_types", "/labtests/v2/types", "metrc_lab_test_types",
        (r, lic) => ({ license: lic, metrc_id: r.Id, name: String(r.Name), requires_result: r.RequiresTestResult ?? false, informational: r.InformationalOnly ?? false, raw: r })],
      ["waste_types", "/harvests/v2/waste/types", "metrc_waste_types",
        (r, lic) => ({ license: lic, name: String(r.Name), raw: r })],
    ];
    for (const lic of LIC) {
      for (const [key, path, table, map] of SPECS) {
        try {
          const rows = await get(path, lic);
          let n = 0;
          for (const r of rows) {
            const { error } = await supa.from(table).upsert({ ...map(r, lic), synced_at: new Date().toISOString() },
              { onConflict: table === "metrc_lab_test_types" ? "license,metrc_id" : "license,name" });
            if (!error) n++;
          }
          results[`${lic}:${key}`] = `${n} of ${rows.length} recorded`;
        } catch (e) { results[`${lic}:${key}`] = `ERROR: ${String(e).slice(0, 90)}`; }
        await sleep(180);
      }
    }
  }

  if (mode === "deliveries") {
    // Fill in customer names: the list endpoint leaves RecipientFacilityName null,
    // the per-transfer delivery detail carries it.
    const limit = Math.min(Number(params.get("limit") ?? 60), 150);
    const { data: tx } = await supa.from("metrc_transfers")
      .select("license, manifest_number, direction, raw, recipient")
      .is("recipient", null).limit(limit);
    let fixed = 0, examined = 0;
    const errs: string[] = [];
    for (const t of tx ?? []) {
      const id = (t.raw as Row)?.Id;
      if (!id) continue;
      examined++;
      try {
        const rows = await get(`/transfers/v2/${id}/deliveries`);
        const d = rows[0];
        if (d) {
          const merged = { ...(t.raw as Row), _delivery: d };
          const { error } = await supa.from("metrc_transfers").update({
            recipient: d.RecipientFacilityName ?? d.RecipientFacilityLicenseNumber ?? null,
            raw: merged, synced_at: new Date().toISOString(),
          }).eq("license", t.license).eq("manifest_number", t.manifest_number).eq("direction", t.direction);
          if (!error && d.RecipientFacilityName) fixed++;
          else if (error && errs.length < 3) errs.push(error.message.slice(0, 80));
        }
      } catch (e) { if (errs.length < 3) errs.push(`${t.manifest_number}: ${String(e).slice(0, 70)}`); }
      await sleep(160);
    }
    const { count: remaining } = await supa.from("metrc_transfers")
      .select("*", { count: "exact", head: true }).is("recipient", null);
    results["deliveries"] = `${fixed} customer names filled from ${examined} examined · ${remaining ?? 0} manifests still missing a customer`;
    if (errs.length) results["delivery_errors"] = errs;
  }

  await supa.from("metrc_sync_runs").insert({
    license: "both", endpoint: `reference sync (${mode})`, records: Object.keys(results).length,
    status: "ok", finished_at: new Date().toISOString(), note: JSON.stringify(results).slice(0, 400),
  });
  return json({ ok: true, mode, results });
});
