// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 1 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG - lab result backfill, one package at a time.
//
// Metrc has no "all lab results" endpoint. /labtests/v2/results requires a
// packageId, which is why metrc_lab_results covered 3 packages out of 3,548 -
// somebody had run it three times by hand. Every tested package needs its own
// call, so this is a resumable backfill driven by metrc_lab_backfill: a package
// is pulled once and never again unless its testing state changes.
//
// This is deliberately NOT a polling job. It is a one-time catch-up plus a small
// nightly top-up for packages whose state moved.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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

  const p = new URL(req.url).searchParams;
  const limit = Math.min(Number(p.get("limit") ?? 120), 300);

  const { data: todo } = await supa.from("metrc_lab_backfill")
    .select("license, metrc_package_id, package_tag")
    .is("fetched_at", null).limit(limit);

  let packages = 0, results = 0, withDoc = 0, failed = 0, calls = 0;
  const errs: string[] = [];

  for (const t of todo ?? []) {
    packages++;
    try {
      const url = `${BASE}/labtests/v2/results?licenseNumber=${encodeURIComponent(t.license)}`
        + `&packageId=${t.metrc_package_id}`;
      const r = await fetch(url, { headers: { Authorization: auth } });
      calls++;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const b = await r.json();
      const rows = (Array.isArray(b) ? b : (b?.Data ?? [])) as Row[];

      const docIds = [...new Set(rows.map((x) => x.LabTestResultDocumentFileId)
        .filter((x) => x !== null && x !== undefined))] as number[];

      if (rows.length) {
        const mapped = rows.map((x) => ({
          license: t.license,
          package_tag: t.package_tag,
          package_id: t.metrc_package_id,
          test_name: x.TestTypeName ?? null,
          test_type: x.TestTypeName ?? null,
          result: x.TestResultLevel ?? null,
          passed: x.TestPassed ?? x.OverallPassed ?? null,
          units: x.TestTypeUnitOfMeasureAbbreviation ?? null,
          result_date: x.ResultReleaseDateTime ?? x.TestPerformedDate ?? null,
          lab_facility: x.LabFacilityName ?? null,
          document_file_id: x.LabTestResultDocumentFileId ?? null,
          notes: x.ProductName ?? null,
          raw: x,
          synced_at: new Date().toISOString(),
        }));
        for (let i = 0; i < mapped.length; i += 200) {
          const { error } = await supa.from("metrc_lab_results").insert(mapped.slice(i, i + 200));
          if (error && errs.length < 3) errs.push(error.message.slice(0, 130));
        }
        results += rows.length;
        if (docIds.length) withDoc++;
      }

      await supa.from("metrc_lab_backfill").update({
        fetched_at: new Date().toISOString(), results: rows.length,
        document_file_ids: docIds.length ? docIds : null, error: null,
      }).eq("license", t.license).eq("metrc_package_id", t.metrc_package_id);
    } catch (e) {
      failed++;
      if (errs.length < 3) errs.push(`${t.package_tag}: ${String(e).slice(0, 90)}`);
      await supa.from("metrc_lab_backfill").update({
        fetched_at: new Date().toISOString(), results: 0, error: String(e).slice(0, 200),
      }).eq("license", t.license).eq("metrc_package_id", t.metrc_package_id);
    }
    await sleep(120);
  }

  const { count: remaining } = await supa.from("metrc_lab_backfill")
    .select("*", { count: "exact", head: true }).is("fetched_at", null);

  await supa.from("metrc_sync_runs").insert({
    license: "both", endpoint: "lab results backfill", records: results,
    status: failed ? "partial" : "ok", finished_at: new Date().toISOString(),
    note: `${packages} packages, ${results} results, ${remaining ?? 0} still queued`,
  });

  return json({
    ok: true, packages_done: packages, results_stored: results,
    packages_with_a_coa_document: withDoc, failed, metrc_calls: calls,
    remaining: remaining ?? 0, errors: errs.length ? errs : undefined,
  });
});
