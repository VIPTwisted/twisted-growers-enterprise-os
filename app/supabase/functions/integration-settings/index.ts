// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 3 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG Enterprise OS — integration settings endpoint
// verify_jwt disabled at the gateway because it blocks CORS preflight; REAL auth happens
// below — every request must carry a valid user JWT AND that user must be owner/executive.
//
// v4, 9 Aug 2026: APEX_ added. Apex is the sales platform, and its credentials had
// nowhere to live - the owner asked for somewhere to put them and the prefix filter
// would have silently DROPPED anything pasted under that name. Silently is the word
// that matters: the endpoint returns "No valid secrets provided" only when NOTHING
// matched, so pasting an Apex key alongside a Metrc one would have stored the Metrc
// key, reported success, and thrown the Apex key away.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ALLOWED_PREFIXES = ["METRC_", "MONDAY_", "LAB_", "ACCOUNTING_", "CLICKUP_", "QUICKBOOKS_", "SHEETS_", "APEX_"];

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

    const supplied = Object.entries(body.secrets ?? {})
      .filter(([, v]) => typeof v === "string" && v.trim() !== "");
    const entries = supplied.filter(([k]) =>
      ALLOWED_PREFIXES.some(p => k.toUpperCase().startsWith(p)));

    /* NAME WHAT WAS REJECTED. The old version filtered silently, so a key with an
       unrecognised prefix vanished and the caller was told the others stored fine.
       A credential that disappears without a word is the worst kind of quiet
       failure: the person believes it is set and finds out when a sync fails. */
    const rejected = supplied.filter(([k]) =>
      !ALLOWED_PREFIXES.some(p => k.toUpperCase().startsWith(p))).map(([k]) => k.toUpperCase());

    if (!entries.length) {
      return json({ ok: false,
        error: rejected.length
          ? `None of these are recognised: ${rejected.join(", ")}. Names must start with one of ${ALLOWED_PREFIXES.join(", ")}.`
          : "No valid secrets provided." }, 400);
    }

    for (const [name, value] of entries) {
      const { error } = await service.from("integration_secrets")
        .upsert({ name: name.toUpperCase(), value: value.trim(), updated_at: new Date().toISOString() });
      if (error) return json({ ok: false, error: `Failed on ${name}: ${error.message}` }, 500);
    }
    return json({ ok: true, stored: entries.map(([k]) => k.toUpperCase()), rejected });
  }

  return json({ ok: false, error: "Method not allowed." }, 405);
});
