// TG - Metrc raw probe (admin-key gated). Returns status plus either a slice of the
// body or, with ?keys=1, the full field list of the first record - so an endpoint's
// real shape can be checked without guessing from a truncated sample.
// v3 added ?qs= so Metrc's own query parameters (lastModifiedStart, pageSize, and so
// on) can be passed through, which is how the harvest and manifest gaps were found.
//
// v4, 10 Aug 2026 - THE KEY IS NO LONGER IN THIS FILE.
//
// It was a literal: `const ADMIN_KEY = "..."`. The same literal sat in sixteen
// deployed functions and in two committed documents, so the repository could not
// hold real source - the recovered copy had to carry a placeholder, which meant
// production was the only record of what was running and this function could not
// be rebuilt from git.
//
// It now reads TG_ADMIN_KEY from integration_secrets, which is readable only by
// postgres and service_role. THIS IS A NO-OP FOR EVERY CALLER: tg_call_function
// and tg_metrc_fire already read that same row, so the value they send is the
// value now checked. Verified before deploying.
//
// The read costs nothing extra - this function already queried integration_secrets
// for the Metrc vendor and user keys, four lines below where the check used to be.
// The check simply moved to where the data already was.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const basic = (a: string, b: string) => "Basic " + btoa(`${a}:${b}`);

/* Constant time. A plain !== leaks the key one character at a time to anyone
   patient enough to measure the difference, and this key gates a Metrc probe. */
function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const { data } = await supa.from("integration_secrets").select("name, value");
  const cfg: Record<string, string> = {};
  for (const r of data ?? []) cfg[r.name] = r.value;

  /* FAIL CLOSED. An unset or empty TG_ADMIN_KEY must refuse everything, never
     admit everything - an empty string compared against an absent header would
     otherwise open the door. */
  const expected = (cfg.TG_ADMIN_KEY ?? "").trim();
  if (!expected) return new Response("admin key not configured", { status: 503 });
  if (!sameKey(req.headers.get("x-admin-key") ?? "", expected)) {
    return new Response("forbidden", { status: 403 });
  }

  const path = u.searchParams.get("path") ?? "/items/v2/active";
  const license = u.searchParams.get("license") ?? "MC281714";
  const paged = u.searchParams.get("paged") !== "0";
  const extra = u.searchParams.get("qs") ?? "";
  const wantKeys = u.searchParams.get("keys") === "1";
  const chars = Math.min(Number(u.searchParams.get("chars") ?? 600), 20000);
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
