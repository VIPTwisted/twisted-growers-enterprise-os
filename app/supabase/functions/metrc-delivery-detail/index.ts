// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 1 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG - fill the per-transfer delivery detail on manifests that lack it.
//
// The transfer list endpoint gives a recipient NAME but not always the recipient
// LICENCE NUMBER. The name is what Metrc users typed and drifts over time -
// "Nova Farms LLC" and "Nova Farms, LLC", "FFD Enterprises MA" and "FFD
// Enterprises MA, Inc." are the same company. The licence number does not drift,
// so it is the only safe key for a customer. This walk fetches the delivery
// detail for any manifest that has no licence number recorded either way.
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
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 100), 200);

  // Manifests with no recipient licence number from either source.
  const { data: todo } = await supa.rpc("tg_transfers_missing_licence", { p_limit: limit });

  let fixed = 0, examined = 0;
  const errs: string[] = [];
  for (const t of (todo ?? []) as Row[]) {
    const id = (t.raw as Row)?.Id;
    if (!id) continue;
    examined++;
    try {
      const r = await fetch(`${BASE}/transfers/v2/${id}/deliveries`, { headers: { Authorization: auth } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const b = await r.json();
      const d = ((Array.isArray(b) ? b : (b?.Data ?? [])) as Row[])[0];
      if (d) {
        const { error } = await supa.from("metrc_transfers").update({
          recipient: d.RecipientFacilityName ?? t.recipient,
          raw: { ...(t.raw as Row), _delivery: d },
          synced_at: new Date().toISOString(),
        }).eq("license", t.license).eq("manifest_number", t.manifest_number)
          .eq("direction", t.direction as string);
        if (!error) fixed++;
        else if (errs.length < 3) errs.push(error.message.slice(0, 100));
      }
    } catch (e) { if (errs.length < 3) errs.push(`${t.manifest_number}: ${String(e).slice(0, 80)}`); }
    await sleep(140);
  }

  const { data: left } = await supa.rpc("tg_transfers_missing_licence", { p_limit: 5000 });
  return json({ ok: true, examined, fixed, remaining: (left ?? []).length,
    errors: errs.length ? errs : undefined });
});
