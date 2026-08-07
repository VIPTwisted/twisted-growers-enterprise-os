// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 1 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
import { createClient } from "npm:@supabase/supabase-js@2";

// One-shot generic seed loader. Gated by X-Seed-Key; reads a JSON file from the
// private 'seeds' bucket ({table: rows[]}), inserts via service role into
// allowlisted empty tables only, then deletes the file.
const SEED_KEY = "<REDACTED — lives in Supabase function secrets>";
const ALLOW = [
  "harvest_pulls", "harvest_pull_details", "harvest_sop_steps",
  "harvest_labor_calc", "harvest_calendar_original", "golive_items",
];

Deno.serve(async (req) => {
  if (req.headers.get("x-seed-key") !== SEED_KEY) {
    return new Response("forbidden", { status: 403 });
  }
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const path = new URL(req.url).searchParams.get("file") ?? "harvest_seed.json";
  const dl = await admin.storage.from("seeds").download(path);
  if (dl.error) {
    return Response.json({ ok: false, error: "download: " + dl.error.message }, { status: 400 });
  }
  const seed = JSON.parse(await dl.data.text());
  const results: Record<string, unknown> = {};
  for (const [table, rows] of Object.entries(seed)) {
    if (table.startsWith("_")) continue;
    if (!ALLOW.includes(table)) { results[table] = "skipped - not in allowlist"; continue; }
    const { count } = await admin.from(table).select("*", { count: "exact", head: true });
    if ((count ?? 0) > 0) { results[table] = `skipped - already has ${count} rows`; continue; }
    const arr = rows as Record<string, unknown>[];
    let n = 0;
    for (let i = 0; i < arr.length; i += 200) {
      const { error } = await admin.from(table).insert(arr.slice(i, i + 200));
      if (error) { results[table] = `ERROR after ${n}: ${error.message}`; break; }
      n += Math.min(200, arr.length - i);
    }
    if (!results[table]) results[table] = `${n} inserted`;
  }
  if (seed._notes) {
    const { error } = await admin.from("configurations")
      .upsert({ key: "harvest_calendar_notes", value: seed._notes }, { onConflict: "key" });
    results["configurations.harvest_calendar_notes"] = error ? "ERROR: " + error.message : "saved";
  }
  await admin.storage.from("seeds").remove([path]);
  return Response.json({ ok: true, results });
});
