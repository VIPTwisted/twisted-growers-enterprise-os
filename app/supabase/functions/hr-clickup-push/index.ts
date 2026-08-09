/* hr-clickup-push — turns approved Human Resources items into real ClickUp tasks.
 *
 * WHY AN OUTBOX AND NOT A DIRECT WRITE.
 *
 * clickup_tasks is a MIRROR. clickup-sync pulls FROM ClickUp and writes it, so a
 * row inserted there by us would exist only in our copy and vanish on the next
 * sync - looking, to anyone reading the table, exactly as though ClickUp had
 * deleted the task. So hr_external_task holds REQUESTS, and this drains them:
 * the thing holding the credential comes and gets the work, which is the same
 * shape as the desktop bridge and for the same reason.
 *
 * WHAT IT WILL NOT DO.
 *
 * approved_by is NOT NULL on hr_external_task, and this function additionally
 * refuses any row where it is missing. Owner ruling, 9 August 2026: "ALL HR
 * REQUIRES HUMAN". ClickUp is an external system and a task appearing in a
 * shared workspace is visible to the whole company - that is a publication, not
 * a note to self. Nothing reaches it without a person having said yes.
 *
 * It does not decide WHICH list, either. list_hint is resolved against the lists
 * already mirrored in clickup_lists, and an unresolvable hint FAILS the row with
 * the reason on it rather than guessing - a write-up filed into "Genetics &
 * Mothers" because the name nearly matched is worse than one not filed at all.
 *
 * RETRIES ARE CAPPED. A row that fails three times stops and says so. An
 * uncapped retry loop looks like a working integration while achieving nothing,
 * which is the failure the bridge queue hit on 8 August and the reason its lease
 * gives up after three attempts too.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CU = "https://api.clickup.com/api/v2";
const MAX_ATTEMPTS = 3;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { data: sec } = await sb.from("integration_secrets")
    .select("value").eq("name", "CLICKUP_TOKEN").maybeSingle();
  const token = String(sec?.value ?? "").trim();
  if (!token) {
    return j({ ok: false, error: "No CLICKUP_TOKEN in integration_secrets, so nothing can be pushed. Nothing was marked as failed - the rows are still waiting." }, 503);
  }

  /* Only rows a person approved, oldest first, still under the retry cap. */
  const { data: pending, error: readErr } = await sb
    .from("hr_external_task")
    .select("id, title, body, due_on, list_hint, attempts, approved_by")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(25);
  if (readErr) return j({ ok: false, error: readErr.message }, 500);
  if (!pending?.length) return j({ ok: true, pushed: 0, note: "Nothing waiting." });

  const { data: lists } = await sb.from("clickup_lists").select("id, name").eq("archived", false);
  const byName = new Map((lists ?? []).map((l: { id: string; name: string }) => [String(l.name).toLowerCase(), l.id]));

  let pushed = 0;
  const failures: Record<string, string> = {};

  for (const row of pending) {
    /* Belt and braces. The column is NOT NULL, but a function that puts things
       in front of the whole company should check the thing it depends on rather
       than trust a constraint it did not write. */
    if (!row.approved_by) {
      await sb.from("hr_external_task").update({
        status: "failed", attempts: (row.attempts ?? 0) + 1,
        error: "No approver recorded. Human Resources items never reach an outside system without a person.",
      }).eq("id", row.id);
      failures[row.id] = "no approver";
      continue;
    }

    const listId = row.list_hint
      ? (byName.get(String(row.list_hint).toLowerCase()) ?? null)
      : null;

    if (!listId) {
      /* Named, not guessed. A near-match would file an employment record in the
         wrong place and nobody would find it again. */
      await sb.from("hr_external_task").update({
        status: "failed", attempts: (row.attempts ?? 0) + 1,
        error: row.list_hint
          ? `No ClickUp list called "${row.list_hint}". Set list_hint to an exact list name - it is not guessed, because a write-up filed into the wrong list is worse than one not filed.`
          : "No list_hint set, and this function will not choose a list on your behalf.",
      }).eq("id", row.id);
      failures[row.id] = "list not resolved";
      continue;
    }

    try {
      const r = await fetch(`${CU}/list/${listId}/task`, {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: row.title,
          description: row.body ?? "",
          due_date: row.due_on ? Date.parse(row.due_on + "T17:00:00Z") : undefined,
        }),
      });
      const out = await r.json().catch(() => null);
      if (!r.ok || !out?.id) {
        throw new Error(`ClickUp returned ${r.status}: ${JSON.stringify(out).slice(0, 300)}`);
      }
      await sb.from("hr_external_task").update({
        status: "pushed", external_id: out.id, external_url: out.url ?? null,
        pushed_at: new Date().toISOString(), error: null,
        attempts: (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
      pushed++;
    } catch (e) {
      const attempts = (row.attempts ?? 0) + 1;
      await sb.from("hr_external_task").update({
        /* Stays pending while retries remain, so a transient outage recovers on
           its own; fails permanently at the cap so it stops looking busy. */
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts,
        error: String(e instanceof Error ? e.message : e).slice(0, 1000),
      }).eq("id", row.id);
      failures[row.id] = String(e instanceof Error ? e.message : e).slice(0, 200);
    }
  }

  return j({
    ok: true,
    considered: pending.length,
    pushed,
    failed: Object.keys(failures).length,
    failures,
    note: "Failures are on the rows themselves, in hr_external_task.error, and visible in v_hr_delivery_backlog. Nothing is retried past three attempts.",
  });
});
