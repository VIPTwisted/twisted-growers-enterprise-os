// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 3 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG Enterprise OS — integration settings endpoint (v3: ClickUp/QuickBooks/Sheets prefixes)
// verify_jwt disabled at the gateway because it blocks CORS preflight; REAL auth happens
// below — every request must carry a valid user JWT AND that user must be owner/executive.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ALLOWED_PREFIXES = ["METRC_", "MONDAY_", "LAB_", "ACCOUNTING_", "CLICKUP_", "QUICKBOOKS_", "SHEETS_"];

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function callerIsExecutive(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return false;
  const { data } = await service.auth.getUser(token);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: row } = await service.from("app_users").select("role").eq("user_id", uid).single();
  return row?.role === "owner" || row?.role === "executive";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await callerIsExecutive(req))) return json({ ok: false, error: "Executive access required." }, 403);

  if (req.method === "GET") {
    const { data } = await service.from("integration_secrets").select("name, updated_at").order("name");
    return json({ ok: true, secrets: data ?? [] });
  }

  if (req.method === "POST") {
    let body: { secrets?: Record<string, string> };
    try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
    const entries = Object.entries(body.secrets ?? {}).filter(([k, v]) =>
      typeof v === "string" && v.trim() !== "" && ALLOWED_PREFIXES.some(p => k.toUpperCase().startsWith(p)));
    if (!entries.length) return json({ ok: false, error: "No valid secrets provided." }, 400);
    for (const [name, value] of entries) {
      const { error } = await service.from("integration_secrets")
        .upsert({ name: name.toUpperCase(), value: value.trim(), updated_at: new Date().toISOString() });
      if (error) return json({ ok: false, error: `Failed on ${name}: ${error.message}` }, 500);
    }
    return json({ ok: true, stored: entries.map(([k]) => k.toUpperCase()) });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
});
