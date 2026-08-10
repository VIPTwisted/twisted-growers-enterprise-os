// TG - Apex raw probe (admin-key gated). READ-ONLY, GET only.
//
// WHY THIS EXISTS. On 10 Aug 2026 two REQUIRED Apex entities were found holding
// zero rows while apex_sync_run reported status=ok:
//
//   deal-docs         the Apex-side COAs and manifests. Full pull, 217ms, 0 rows.
//   receiving-orders  the inbound purchase record.       Delta pull, 200ms, 0 rows.
//
// shipping-orders took 69 SECONDS to return 1,739 rows over the same window. A
// 200ms empty answer from an account that demonstrably has purchases and documents
// is not "the entity is empty" - it is an endpoint being asked the wrong question.
// The owner states plainly that every Apex order carries a manifest and a COA.
//
// The sync cannot tell those two cases apart, and neither can anybody reading it,
// because both render as an empty array behind HTTP 200. Guessing which parameter
// is missing and redeploying apex-sync to test each guess is expensive and slow.
// This probe asks the question directly and shows the ANSWER - status, the root
// keys actually present, the pagination meta, and the first record's field list.
//
// Modelled on metrc-probe, which found the harvest and manifest gaps the same way.
// Same gating, same shape, same reason: you cannot fix an integration you cannot
// see.
//
//   ?path=/v1/deal-docs                 what does it return with no filter
//   ?path=/v1/deal-docs&qs=order_id=123 does it need a parent id
//   ?path=/v1/receiving-orders&qs=updated_at_from=2023-11-30T00:00:00Z
//   ?keys=1                             field list of the first record
//
// GET ONLY, ALWAYS. The Apex key carries create:shipping-orders, which can raise a
// real commercial order against a real licensed buyer. This function issues nothing
// but GET and has no code path that could issue anything else.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DEFAULT_BASE = "https://app.apextrading.com/api";

/* Constant time. A plain !== leaks the key one character at a time to anyone
   patient enough to measure the difference. */
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

  /* FAIL CLOSED. An unset admin key must refuse everything, never admit
     everything - an empty string compared against an absent header would
     otherwise open the door. */
  const expected = (cfg.TG_ADMIN_KEY ?? "").trim();
  if (!expected) return new Response("admin key not configured", { status: 503 });
  if (!sameKey(req.headers.get("x-admin-key") ?? "", expected)) {
    return new Response("forbidden", { status: 403 });
  }

  const key = (cfg.APEX_API_KEY ?? "").trim();
  if (!key) return new Response("no Apex API key stored", { status: 400 });
  const base = (cfg.APEX_API_BASE ?? DEFAULT_BASE).replace(/\/+$/, "");

  const path = u.searchParams.get("path") ?? "/v1/welcome";
  const extra = u.searchParams.get("qs") ?? "";
  const wantKeys = u.searchParams.get("keys") === "1";
  const chars = Math.min(Number(u.searchParams.get("chars") ?? 1200), 20000);

  const url = new URL(base + path);
  if (extra) {
    for (const pair of extra.split("&")) {
      const i = pair.indexOf("=");
      if (i > 0) url.searchParams.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${key}`,
        /* REQUIRED by Apex. Omitting it does not fail loudly - it can return HTML,
           which then parses as "no rows". That is exactly the failure mode being
           investigated, so it must not be reproduced by the probe itself. */
        Accept: "application/json",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ fetch_error: String(e), url: url.toString() }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  const elapsed_ms = Date.now() - started;
  const body = await res.text();

  const out: Record<string, unknown> = {
    url: url.toString(),
    status: res.status,
    elapsed_ms,
    content_type: res.headers.get("content-type"),
  };

  try {
    const j = JSON.parse(body);
    out.root_keys = j && typeof j === "object" && !Array.isArray(j) ? Object.keys(j) : null;
    out.meta = (j as Record<string, unknown>)?.meta ?? null;

    /* Find the array the payload actually carries, rather than assuming the root key
       the registry claims. A registry that is wrong about root_key is one of the two
       explanations for an empty result, and this distinguishes it from the other. */
    let arr: unknown[] | null = null;
    let arrKey: string | null = null;
    if (Array.isArray(j)) { arr = j; arrKey = "(root is an array)"; }
    else if (j && typeof j === "object") {
      for (const [k, v] of Object.entries(j)) {
        if (Array.isArray(v)) { arr = v; arrKey = k; break; }
      }
    }
    out.array_key = arrKey;
    out.record_count = arr?.length ?? null;

    const rec = arr?.[0] ?? null;
    if (wantKeys) {
      out.fields = rec && typeof rec === "object" ? Object.keys(rec).sort() : null;
      out.sample = rec;
    } else {
      out.body = body.slice(0, chars);
    }
  } catch {
    out.parse_error = true;
    out.body = body.slice(0, chars);
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
