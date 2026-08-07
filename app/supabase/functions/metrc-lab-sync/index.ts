// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 1 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG Enterprise OS - Metrc laboratory results and Certificate of Analysis sync.
// Metrc exposes results per package, so this walks packages that have been tested
// and records every individual test plus the Certificate of Analysis document link.
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
  const state = cfg.METRC_STATE ?? "ma";
  const BASE = `https://api-${state}.metrc.com`;
  const params = new URL(req.url).searchParams;
  const limit = Math.min(Number(params.get("limit") ?? 150), 400);

  // Packages that have a testing state worth pulling results for, oldest first,
  // skipping ones already recorded so repeated runs walk the whole book.
  const { data: pkgs } = await supa.from("metrc_packages")
    .select("license, tag, raw, lab_testing_state")
    .in("lab_testing_state", ["TestPassed", "TestFailed", "RetestPassed", "RetestFailed", "TestingInProgress"])
    .limit(1200);
  const { data: have } = await supa.from("metrc_lab_results").select("package_tag").limit(20000);
  const done = new Set((have ?? []).map((h) => h.package_tag));
  const todo = (pkgs ?? []).filter((p) => !done.has(p.tag)).slice(0, limit);

  let tests = 0, pkgsDone = 0, coas = 0;
  const errors: string[] = [];
  for (const p of todo) {
    const pid = (p.raw as Row)?.Id;
    if (!pid) continue;
    try {
      const res = await fetch(`${BASE}/labtests/v2/results?licenseNumber=${encodeURIComponent(p.license)}&packageId=${pid}`,
        { headers: { Authorization: auth } });
      if (!res.ok) { if (errors.length < 4) errors.push(`${p.tag}: HTTP ${res.status}`); await sleep(150); continue; }
      const body = await res.json();
      const rows: Row[] = Array.isArray(body) ? body : (body?.Data ?? []);
      for (const r of rows) {
        const fileId = r.LabTestResultDocumentFileId ?? r.ResultReleaseDocumentFileId ?? null;
        const { error } = await supa.from("metrc_lab_results").upsert({
          license: p.license, package_tag: p.tag, package_id: String(pid),
          test_type: r.TestTypeName ?? r.TestType ?? null,
          test_name: r.TestTypeName ?? r.TestName ?? null,
          result: typeof r.TestResultLevel === "number" ? r.TestResultLevel : null,
          units: r.TestUnitOfMeasureAbbreviation ?? null,
          passed: typeof r.TestPassed === "boolean" ? r.TestPassed : null,
          notes: r.TestComment ?? null,
          result_date: r.TestPerformedDate ? String(r.TestPerformedDate).slice(0, 10) : null,
          lab_facility: r.LabFacilityName ?? null,
          document_file_id: fileId ? String(fileId) : null,
          coa_link: fileId ? `https://ma.metrc.com/reports/labtests/${fileId}/document` : null,
          raw: r, synced_at: new Date().toISOString(),
        }, { onConflict: "license,package_tag,test_name" });
        if (error) { if (errors.length < 4) errors.push(`${p.tag}: ${error.message.slice(0, 70)}`); }
        else { tests++; if (fileId) coas++; }
      }
      pkgsDone++;
    } catch (e) { if (errors.length < 4) errors.push(`${p.tag}: ${String(e).slice(0, 70)}`); }
    await sleep(170);
  }
  const { count: total } = await supa.from("metrc_lab_results").select("*", { count: "exact", head: true });
  await supa.from("metrc_sync_runs").insert({
    license: "both", endpoint: "lab results", records: tests,
    status: errors.length && tests === 0 ? "error" : "ok",
    error: errors.length ? errors.join(" | ").slice(0, 400) : null,
    finished_at: new Date().toISOString(),
  });
  return json({ ok: true, results: {
    packages_examined: `${pkgsDone} of ${todo.length} queued (${(pkgs ?? []).length} tested packages known)`,
    tests_recorded: `${tests} new · ${total ?? 0} total in the operating system`,
    certificates_linked: coas,
    errors: errors.length ? errors : "none",
    note: todo.length === limit ? "More packages remain - run again to continue walking the book." : "All known tested packages have been walked.",
  } });
});
