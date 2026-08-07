// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 1 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// One-shot template seeder: reads seeds/templates_seed.json from storage, inserts, deletes the file.
// Gated by a single-use key; safe to leave deployed (file is consumed on first success).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const KEY = "<REDACTED — lives in Supabase function secrets>";
Deno.serve(async (req: Request) => {
  if (req.headers.get("x-seed-key") !== KEY) return new Response("forbidden", { status: 403 });
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await svc.storage.from("seeds").download("templates_seed.json");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const rows = JSON.parse(await data.text());
  let inserted = 0, skipped = 0;
  const errors: string[] = [];
  for (const r of rows) {
    const { error: e } = await svc.from("templates").insert(r);
    if (e) { skipped++; if (!e.message.includes("duplicate")) errors.push(`${r.name}: ${e.message}`.slice(0, 120)); }
    else inserted++;
  }
  await svc.storage.from("seeds").remove(["templates_seed.json"]);
  return Response.json({ ok: true, inserted, skipped, total: rows.length, errors: errors.slice(0, 5) });
});
