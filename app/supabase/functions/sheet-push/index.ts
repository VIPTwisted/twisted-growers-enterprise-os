// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 1 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* Receives a push from a Google Apps Script bound to a restricted sheet.
   The sheet stays private. Authentication is a per-source token issued by this
   platform, not a Google credential — so no Google access is held here at all.
   JWT verification is off by design: Apps Script cannot hold a Supabase session.
   The push token is the sole credential and is checked on every request. */

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Send a POST." }, 405);

  let payload: { token?: string; rows?: Record<string, unknown>[]; tab?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  const token = (payload.token ?? "").trim();
  if (!token) return json({ error: "No push token supplied." }, 401);

  const { data: src } = await db
    .from("sheet_sources")
    .select("id, name, enabled")
    .eq("push_token", token)
    .maybeSingle();

  if (!src) return json({ error: "That push token does not match any source." }, 401);
  if (!src.enabled) return json({ error: `Source ${src.name} is switched off.` }, 403);

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (rows.length === 0) {
    /* An empty push is almost always a broken script or an emptied tab, never a
       real state. Refuse it rather than silently wiping what we already hold. */
    await db.from("sheet_push_log").insert({
      source_id: src.id,
      rows_received: 0,
      ok: false,
      message: "Refused: the push contained no rows. Existing rows were kept.",
    });
    return json({ error: "No rows in the push. Nothing was changed." }, 400);
  }

  /* Replace the snapshot in one go — the sheet is the authority for its own tab. */
  const del = await db.from("sheet_rows").delete().eq("source_id", src.id);
  if (del.error) return json({ error: del.error.message }, 500);

  const batch = rows.map((data, i) => ({
    source_id: src.id,
    row_number: i + 1,
    data,
  }));

  for (let i = 0; i < batch.length; i += 500) {
    const ins = await db.from("sheet_rows").insert(batch.slice(i, i + 500));
    if (ins.error) {
      await db.from("sheet_push_log").insert({
        source_id: src.id,
        rows_received: rows.length,
        ok: false,
        message: ins.error.message,
      });
      return json({ error: ins.error.message }, 500);
    }
  }

  await db
    .from("sheet_sources")
    .update({ last_pushed_at: new Date().toISOString(), last_row_count: rows.length })
    .eq("id", src.id);

  await db.from("sheet_push_log").insert({
    source_id: src.id,
    rows_received: rows.length,
    ok: true,
    message: `Received ${rows.length} rows from ${payload.tab ?? "the sheet"}.`,
  });

  return json({ ok: true, source: src.name, rows: rows.length });
});
