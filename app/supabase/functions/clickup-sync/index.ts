// TG Enterprise OS — ClickUp workspace sync.
//
// v3, 13 September 2026. Every run since 5 September ended the same way: "Never finished.
// Marked failed after 30 minutes still open" at 63 records. v2 walked every space, folder,
// list and task with one awaited upsert per row and no deadline; ClickUp allows 100
// requests a minute and the platform kills a function long before a workspace of any size
// is done. Four changes, nothing else:
//
//   1. THE ADMIN KEY IS LOOKED UP, NEVER BAKED IN. v2 compared x-admin-key against a
//      literal in this file, so the key tg_call_function sends from integration_secrets
//      never matched and every machine call fell through to a 403. Same fix metrc-sync
//      made in v20. Fails CLOSED when the row is missing.
//   2. THE RUN ROW IS OPENED FIRST AND ALWAYS CLOSED. v2 inserted its run row at the very
//      end, so a killed run left nothing but the stuck row the closer marks failed. Now a
//      running row exists before the first request, a beforeunload backstop closes it if
//      the platform stops us, and the normal path closes it ok / partial / error.
//   3. A SOFT DEADLINE (configurations.clickup_sync_soft_deadline_ms, default 100 s) is
//      checked between lists and between task pages. Stopping early is "partial", never
//      a hang, and the rows already written are kept.
//   4. A LIST CURSOR. The id of the last list completed is saved in configurations
//      (clickup_sync_cursor); the next run skips lists already done in this cycle and
//      clears the cursor when the workspace is finished. Run again to continue.
//
// Writes are batched (100 rows, deduped on id) rather than one round trip per task.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CU = "https://api.clickup.com/api/v2";
const FALLBACK_DEADLINE_MS = 100_000;
const BATCH = 100;
const now = () => new Date().toISOString();

type Row = Record<string, unknown>;
let OPEN_RUN: { id: number; records: number } | null = null;

addEventListener("beforeunload", () => {
  if (!OPEN_RUN) return;
  service.from("metrc_sync_runs").update({
    status: "partial", records: OPEN_RUN.records, finished_at: now(),
    error: "Stopped by the platform before finishing. Rows already written were kept. Run again to continue - this is not a data fault.",
  }).eq("id", OPEN_RUN.id).eq("status", "running").then(() => {});
});

async function callerIsExecutive(req: Request): Promise<boolean> {
  const presented = req.headers.get("x-admin-key");
  if (presented) {
    const { data: k } = await service.from("integration_secrets").select("value").eq("name", "TG_ADMIN_KEY").maybeSingle();
    const real = (k?.value as string | undefined) ?? "";
    if (real && presented === real) return true;
  }
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return false;
  const { data } = await service.auth.getUser(token);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: row } = await service.from("app_users").select("role").eq("user_id", uid).single();
  return row?.role === "owner" || row?.role === "executive";
}

async function numberSetting(key: string, fallback: number): Promise<number> {
  const { data } = await service.from("configurations").select("value").eq("key", key).maybeSingle();
  const v = data?.value as Record<string, unknown> | undefined;
  const n = Number(v?.ms ?? v?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
async function readCursor(): Promise<string | null> {
  const { data } = await service.from("configurations").select("value").eq("key", "clickup_sync_cursor").maybeSingle();
  const v = (data?.value as Record<string, unknown> | undefined)?.last_list_id;
  return typeof v === "string" && v ? v : null;
}
async function writeCursor(lastListId: string | null): Promise<void> {
  await service.from("configurations").upsert({ key: "clickup_sync_cursor", value: { last_list_id: lastListId, at: now() }, updated_at: now() });
}

async function cu(path: string, token: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${CU}${path}`, { headers: { Authorization: token } });
    if (r.status === 429 && attempt < 3) {
      const wait = Math.min(Number(r.headers.get("Retry-After") ?? 5) || 5, 30);
      await r.body?.cancel();
      await new Promise((res) => setTimeout(res, wait * 1000));
      continue;
    }
    if (!r.ok) throw new Error(`ClickUp ${r.status} on ${path}: ${(await r.text()).slice(0, 180)}`);
    return r.json();
  }
}

const ms = (v: unknown) => (v ? new Date(Number(v)).toISOString() : null);

async function flushTasks(batch: Row[]): Promise<number> {
  if (!batch.length) return 0;
  const byId = new Map<string, Row>();
  for (const t of batch) byId.set(String(t.id), t);
  const rows = [...byId.values()];
  const { error } = await service.from("clickup_tasks").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`upsert clickup_tasks x${rows.length}: ${error.message}`);
  return rows.length;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await callerIsExecutive(req))) return json({ ok: false, error: "Executive access required." }, 403);

  const { data: sec } = await service.from("integration_secrets").select("value").eq("name", "CLICKUP_TOKEN").maybeSingle();
  const token = sec?.value as string | undefined;
  if (!token) return json({ ok: false, error: "No ClickUp token stored. Sync & Connections > CLICKUP_TOKEN first." }, 400);

  const startedAt = Date.now();
  const DEADLINE_MS = await numberSetting("clickup_sync_soft_deadline_ms", FALLBACK_DEADLINE_MS);
  const outOfTime = () => Date.now() - startedAt > DEADLINE_MS;
  const resumeAfter = await readCursor();

  const { data: run, error: runErr } = await service.from("metrc_sync_runs")
    .insert({ license: "clickup", endpoint: "clickup_workspace", status: "running" }).select("id").single();
  if (runErr || !run) return json({ ok: false, error: `Could not open a run row: ${runErr?.message}` }, 500);
  OPEN_RUN = { id: run.id as number, records: 0 };

  const results: Record<string, unknown> = { _soft_deadline_ms: DEADLINE_MS, _resumed_after_list: resumeAfter };
  let nSpaces = 0, nLists = 0, nTasks = 0, skippedLists = 0;
  let ranOut = false;
  let lastListDone: string | null = resumeAfter;
  let seenResume = resumeAfter === null;

  try {
    const teams = ((await cu("/team", token)).teams as Row[] | undefined) ?? [];
    results["workspaces"] = teams.map((t) => t.name).join(", ") || "none visible to this token";
    outer: for (const team of teams) {
      const spaces = ((await cu(`/team/${team.id}/space?archived=false`, token)).spaces as Row[] | undefined) ?? [];
      for (const s of spaces) {
        await service.from("clickup_spaces").upsert({ id: String(s.id), name: s.name, archived: !!s.archived, payload: s, synced_at: now() });
        nSpaces++;
        const lists: Row[] = [];
        const folders = ((await cu(`/space/${s.id}/folder?archived=false`, token)).folders as Row[] | undefined) ?? [];
        for (const f of folders) for (const l of (f.lists as Row[] | undefined) ?? []) lists.push({ ...l, _folder: f });
        for (const l of ((await cu(`/space/${s.id}/list?archived=false`, token)).lists as Row[] | undefined) ?? []) lists.push(l);
        for (const l of lists) {
          const listId = String(l.id);
          /* Resume: skip everything up to and including the last list completed. */
          if (!seenResume) { skippedLists++; if (listId === resumeAfter) seenResume = true; continue; }
          if (outOfTime()) { ranOut = true; break outer; }
          const folder = l._folder as Row | undefined;
          await service.from("clickup_lists").upsert({
            id: listId, name: l.name, space_id: String(s.id),
            folder_id: folder ? String(folder.id) : null, folder_name: folder ? String(folder.name) : null,
            task_count: Number(l.task_count ?? 0), archived: !!l.archived, payload: l, synced_at: now(),
          });
          nLists++;
          let batch: Row[] = [];
          for (let page = 0; ; page++) {
            if (outOfTime()) { ranOut = true; break; }
            const tr = await cu(`/list/${listId}/task?page=${page}&include_closed=true&subtasks=true`, token);
            const tasks = (tr.tasks as Row[] | undefined) ?? [];
            for (const t of tasks) {
              batch.push({
                id: String(t.id), name: t.name, status: (t.status as Row | undefined)?.status ?? null,
                list_id: listId, list_name: String(l.name), space_id: String(s.id),
                assignees: ((t.assignees as Row[] | undefined) ?? []).map((a) => a.username).join(", ") || null,
                tags: ((t.tags as Row[] | undefined) ?? []).map((g) => g.name).join(", ") || null,
                priority: (t.priority as Row | undefined)?.priority ?? null,
                due_date: ms(t.due_date), date_created: ms(t.date_created), date_closed: ms(t.date_closed),
                url: t.url ?? null, custom_fields: t.custom_fields ?? [], payload: t, synced_at: now(),
              });
              if (batch.length >= BATCH) { nTasks += await flushTasks(batch); batch = []; OPEN_RUN.records = nTasks; }
            }
            if (tr.last_page !== false || tasks.length === 0) break;
          }
          nTasks += await flushTasks(batch); OPEN_RUN.records = nTasks;
          if (ranOut) break outer;           // the list's pages were cut short: do not mark it done
          lastListDone = listId;
          await writeCursor(lastListDone);
        }
      }
    }
    if (!ranOut) { await writeCursor(null); lastListDone = null; }

    const { count: totTasks } = await service.from("clickup_tasks").select("*", { count: "exact", head: true });
    results["spaces"] = `${nSpaces} seen`;
    results["lists"] = `${nLists} synced${skippedLists ? ` (${skippedLists} skipped — done earlier this cycle)` : ""}`;
    results["tasks"] = `${nTasks} synced · ${totTasks ?? nTasks} total in OS`;
    results["_elapsed_ms"] = Date.now() - startedAt;
    if (ranOut) results["_incomplete"] = `Stopped at the soft deadline after list ${lastListDone ?? "(none)"}. Rows written were kept. Run again to continue from the next list.`;

    await service.from("metrc_sync_runs").update({
      status: ranOut ? "partial" : "ok", records: nTasks, finished_at: now(),
      note: ranOut ? `Soft deadline; cursor after list ${lastListDone}. Run again to continue.` : null,
    }).eq("id", run.id);
    OPEN_RUN = null;
    return json({ ok: true, complete: !ranOut, results });
  } catch (e) {
    await service.from("metrc_sync_runs").update({ status: "error", records: nTasks, error: String(e).slice(0, 480), finished_at: now() }).eq("id", run.id).eq("status", "running");
    OPEN_RUN = null;
    results["error"] = `ERROR: ${String(e).slice(0, 300)}`;
    return json({ ok: false, results }, 500);
  }
});
