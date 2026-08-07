// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 4 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG Enterprise OS - ClickUp customization v4: OWNER-APPROVED SCOPE ONLY
// Scope: STRUCTURE (space/list names) + real roster cards. Accepts {extra_lists:{spaceName:[listName,...]}}
// so background agents can push additional STRUCTURE by name only. No other data ever leaves the OS.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ADMIN_KEY = "<REDACTED — lives in Supabase function secrets>";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CU = "https://api.clickup.com/api/v2";

async function callerAllowed(req: Request): Promise<boolean> {
  if (req.headers.get("x-admin-key") === ADMIN_KEY) return true;
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return false;
  const { data } = await service.auth.getUser(token);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: row } = await service.from("app_users").select("role").eq("user_id", uid).single();
  return row?.role === "owner" || row?.role === "executive";
}
async function cu(method: string, path: string, token: string, body?: unknown) {
  const r = await fetch(`${CU}${path}`, {
    method, headers: { Authorization: token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`ClickUp ${r.status} ${method} ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await callerAllowed(req))) return json({ ok: false, error: "Executive access required." }, 403);
  const { data: sec } = await service.from("integration_secrets").select("value").eq("name", "CLICKUP_TOKEN").maybeSingle();
  const token = sec?.value;
  if (!token) return json({ ok: false, error: "No ClickUp token stored." }, 400);
  let body: { extra_lists?: Record<string, string[]> } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const results: string[] = [];
  try {
    const teams = (await cu("GET", "/team", token)).teams ?? [];
    const teamId = teams[0]?.id;
    if (!teamId) return json({ ok: false, error: "Token sees no workspaces." }, 400);
    const spaces = (await cu("GET", `/team/${teamId}/space?archived=false`, token)).spaces ?? [];
    const spaceByName: Record<string, string> = {};
    for (const s of spaces) spaceByName[s.name] = s.id;
    for (const [spaceName, listNames] of Object.entries(body.extra_lists ?? {})) {
      const sid = spaceByName[spaceName];
      if (!sid) { results.push(`space not found: ${spaceName}`); continue; }
      const lists = (await cu("GET", `/space/${sid}/list?archived=false`, token)).lists ?? [];
      const have = new Set(lists.map((l: { name: string }) => l.name));
      for (const name of (listNames ?? []).slice(0, 30)) {
        if (typeof name !== "string" || !name.trim()) continue;
        if (have.has(name)) { results.push(`list exists: ${name}`); continue; }
        await cu("POST", `/space/${sid}/list`, token, { name: name.trim().slice(0, 80) });
        results.push(`list created: ${spaceName} / ${name}`);
      }
    }
    return json({ ok: true, results });
  } catch (e) {
    results.push(`ERROR: ${String(e).slice(0, 300)}`);
    return json({ ok: true, results });
  }
});
