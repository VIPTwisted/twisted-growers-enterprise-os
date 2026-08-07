// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 3 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG - report ingest for files that are not CSV.
//
// Detection and mapping happen in the database (tg_import_report_do) - there is
// exactly one mapper. This carries rows plus the count the file states for
// itself, so the database can refuse to report success on a mismatch.
//
//   POST { rows, licence, as_of, file_name, stated_total, mode }  -> import
//   POST { verify: { imports, stated, stored } }                  -> check a chunked
//         file once every chunk has landed, because a chunk compared against the
//         whole file's count would always look short.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ADMIN_KEY = "<REDACTED — lives in Supabase function secrets>";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

  const body = await req.json().catch(() => null) as {
    rows?: unknown[]; licence?: string; as_of?: string; file_name?: string;
    stated_total?: number | null; mode?: string;
    verify?: { imports: string[]; stated: number; stored: number };
  } | null;

  if (body?.verify) {
    const { data, error } = await supa.rpc("tg_verify_import_group", {
      p_imports: body.verify.imports,
      p_stated: body.verify.stated,
      p_stored: body.verify.stored,
    });
    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: (data as Record<string, unknown>)?.ok !== false, result: data });
  }

  if (!body?.rows?.length) return json({ ok: false, error: "No rows supplied." }, 400);

  const { data, error } = await supa.rpc("tg_import_report_do", {
    p_rows: body.rows,
    p_licence: body.licence ?? null,
    p_as_of: body.as_of ?? null,
    p_file_name: body.file_name ?? null,
    p_mode: body.mode ?? "update",
    p_stated_total: body.stated_total ?? null,
  });
  if (error) return json({ ok: false, error: error.message }, 400);

  const result = data as Record<string, unknown>;
  if (result?.import_id && body.as_of) {
    await supa.from("metrc_report_imports")
      .update({ as_of_date: body.as_of, as_of_source: "read from the report banner" })
      .eq("id", result.import_id);
    const target = String(result.target_table ?? "");
    if (/^metrc_rpt_[a-z0-9_]+$/.test(target)) {
      await supa.from(target).update({ as_of_date: body.as_of }).eq("import_id", result.import_id);
    }
  }
  return json({ ok: result?.ok !== false, result });
});
