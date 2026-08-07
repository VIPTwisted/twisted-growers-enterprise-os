// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 3 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG - Metrc raw probe (admin-key gated). Returns status plus either a slice of the
// body or, with ?keys=1, the full field list of the first record - so an endpoint's
// real shape can be checked without guessing from a truncated sample.
// v3 adds ?qs= so Metrc's own query parameters (lastModifiedStart, pageSize, and so
// on) can be passed through, which is how the harvest and manifest gaps were found.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const ADMIN_KEY = "<REDACTED — lives in Supabase function secrets>";
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const basic = (a: string, b: string) => "Basic " + btoa(`${a}:${b}`);
Deno.serve(async (req) => {
  if (req.headers.get("x-admin-key") !== ADMIN_KEY) return new Response("forbidden", { status: 403 });
  const u = new URL(req.url);
  const path = u.searchParams.get("path") ?? "/items/v2/active";
  const license = u.searchParams.get("license") ?? "MC281714";
  const paged = u.searchParams.get("paged") !== "0";
  const extra = u.searchParams.get("qs") ?? "";
  const wantKeys = u.searchParams.get("keys") === "1";
  const chars = Math.min(Number(u.searchParams.get("chars") ?? 600), 20000);
  const { data } = await supa.from("integration_secrets").select("name, value");
  const cfg: Record<string, string> = {};
  for (const r of data ?? []) cfg[r.name] = r.value;
  const V = (cfg.METRC_VENDOR_KEYS ?? cfg.METRC_VENDOR_KEY ?? "").split(",")[0].trim();
  const U = (cfg.METRC_USER_KEYS ?? cfg.METRC_USER_KEY ?? "").split(",")[0].trim();
  const url = `https://api-ma.metrc.com${path}?licenseNumber=${encodeURIComponent(license)}`
    + (paged ? "&pageNumber=1&pageSize=20" : "")
    + (extra ? "&" + extra : "");
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: basic(V, U) } });
  } catch (e) {
    return new Response(JSON.stringify({ fetch_error: String(e) }), { status: 200,
      headers: { "Content-Type": "application/json" } });
  }
  const body = await res.text();
  const safeUrl = url.replace(/licenseNumber=[^&]+/, "licenseNumber=***");
  if (wantKeys) {
    try {
      const j = JSON.parse(body);
      const rec = (Array.isArray(j) ? j[0] : (j?.Data?.[0] ?? j));
      return new Response(JSON.stringify({
        url: safeUrl, status: res.status,
        record_count: Array.isArray(j) ? j.length : (j?.Data?.length ?? null),
        total_records: (j && !Array.isArray(j)) ? (j.TotalRecords ?? null) : null,
        fields: rec && typeof rec === "object" ? Object.keys(rec).sort() : null,
        sample: rec ?? null,
      }), { headers: { "Content-Type": "application/json" } });
    } catch {
      return new Response(JSON.stringify({ url: safeUrl, status: res.status, parse_error: true, body: body.slice(0, chars) }),
        { headers: { "Content-Type": "application/json" } });
    }
  }
  return new Response(JSON.stringify({ url: safeUrl, status: res.status, body: body.slice(0, chars) }),
    { headers: { "Content-Type": "application/json" } });
});
