// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 2 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG Enterprise OS - ClickUp workspace sync v2 (adds internal admin-key trigger so the
// build assistant can run syncs server-side; token itself never leaves integration_secrets)
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

async function callerIsExecutive(req: Request): Promise<boolean> {
  if (req.headers.get("x-admin-key") === ADMIN_KEY) return true;
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return false;
  const { data } = await service.auth.getUser(token);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: row } = await service.from("app_users").select("role").eq("user_id", uid).single();
  return row?.role === "owner" || row?.role === "executive";
}

async function cu(path: string, token: string) {
  const r = await fetch(`${CU}${path}`, { headers: { Authorization: token } });
  if (!r.ok) throw new Error(`ClickUp ${r.status} on ${path}: ${(await r.text()).slice(0, 180)}`);
  return r.json();
}

const ms = (v: unknown) => (v ? new Date(Number(v)).toISOString() : null);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await callerIsExecutive(req))) return json({ ok: false, error: "Executive access required." }, 403);
  const { data: sec } = await service.from("integration_secrets").select("value").eq("name", "CLICKUP_TOKEN").maybeSingle();
  const token = sec?.value;
  if (!token) return json({ ok: false, error: "No ClickUp token stored. Integrations > paste your pk_ API token first." }, 400);
  const results: Record<string, unknown> = {};
  try {
    const teams = (await cu("/team", token)).teams ?? [];
    results["workspaces"] = teams.map((t: { name: string }) => t.name).join(", ") || "none visible to this token";
    let nSpaces = 0, nLists = 0, nTasks = 0;
    for (const team of teams) {
      const spaces = (await cu(`/team/${team.id}/space?archived=false`, token)).spaces ?? [];
      for (const s of spaces) {
        await service.from("clickup_spaces").upsert({ id: String(s.id), name: s.name, archived: !!s.archived, payload: s, synced_at: new Date().toISOString() });
        nSpaces++;
        const lists: unknown[] = [];
        const folders = (await cu(`/space/${s.id}/folder?archived=false`, token)).folders ?? [];
        for (const f of folders) for (const l of f.lists ?? []) lists.push({ ...l, _folder: f });
        for (const l of (await cu(`/space/${s.id}/list?archived=false`, token)).lists ?? []) lists.push(l);
        for (const l of lists as Record<string, unknown>[]) {
          const folder = l._folder as Record<string, unknown> | undefined;
          await service.from("clickup_lists").upsert({
            id: String(l.id), name: l.name, space_id: String(s.id),
            folder_id: folder ? String(folder.id) : null, folder_name: folder ? String(folder.name) : null,
            task_count: Number(l.task_count ?? 0), archived: !!l.archived, payload: l, synced_at: new Date().toISOString(),
          });
          nLists++;
          for (let page = 0; ; page++) {
            const tr = await cu(`/list/${l.id}/task?page=${page}&include_closed=true&subtasks=true`, token);
            const tasks = tr.tasks ?? [];
            for (const t of tasks) {
              await service.from("clickup_tasks").upsert({
                id: String(t.id), name: t.name, status: t.status?.status ?? null,
                list_id: String(l.id), list_name: String(l.name), space_id: String(s.id),
                assignees: (t.assignees ?? []).map((a: { username?: string }) => a.username).join(", ") || null,
                tags: (t.tags ?? []).map((g: { name?: string }) => g.name).join(", ") || null,
                priority: t.priority?.priority ?? null,
                due_date: ms(t.due_date), date_created: ms(t.date_created), date_closed: ms(t.date_closed),
                url: t.url ?? null, custom_fields: t.custom_fields ?? [], payload: t, synced_at: new Date().toISOString(),
              });
              nTasks++;
            }
            if (tr.last_page !== false || tasks.length === 0) break;
          }
        }
      }
    }
    const { count: totTasks } = await service.from("clickup_tasks").select("*", { count: "exact", head: true });
    results["spaces"] = `${nSpaces} synced`;
    results["lists"] = `${nLists} synced`;
    results["tasks"] = `${nTasks} synced · ${totTasks ?? nTasks} total in OS`;
    await service.from("metrc_sync_runs").insert({ license: "clickup", endpoint: "clickup_workspace", records: nTasks });
    return json({ ok: true, results });
  } catch (e) {
    results["error"] = `ERROR: ${String(e).slice(0, 300)}`;
    return json({ ok: true, results });
  }
});
