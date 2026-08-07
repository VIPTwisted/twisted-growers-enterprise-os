// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 1 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG - certificate extraction endpoint.
//
// A Certificate of Analysis IS the testing. Metrc's structured lab results are
// thin - 835 packages hold a certificate while Metrc returned no terpene figure -
// but the number is printed on the document. This endpoint hands out the
// certificates still to be read and takes back what was read off them.
//
// Parsing itself runs outside Deno because no dependable PDF text extractor is
// available in the edge runtime. The reader downloads each document through its
// signed link, so no storage credential ever leaves the platform.
//
//   GET  ?pending=200   -> certificates not yet read
//   POST { rows: [...] } -> store what was read
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

  if (req.method === "GET") {
    const p = new URL(req.url).searchParams;
    const limit = Math.min(Number(p.get("pending") ?? 200), 1000);
    const { data: done } = await supa.from("coa_extract").select("document_id").limit(20000);
    const have = new Set((done ?? []).map((d) => d.document_id));
    const { data: docs } = await supa.from("metrc_documents")
      .select("metrc_id, package_tag, download_url")
      .eq("doc_type", "coa").not("storage_path", "is", null)
      .not("download_url", "is", null).limit(20000);
    const todo = (docs ?? []).filter((d) => !have.has(d.metrc_id)).slice(0, limit);
    return json({ ok: true, already_read: have.size, pending_total: (docs ?? []).length - have.size,
      documents: todo });
  }

  const body = await req.json().catch(() => null) as { rows?: Record<string, unknown>[] } | null;
  if (!body?.rows?.length) return json({ ok: false, error: "No rows supplied." }, 400);
  const { error } = await supa.from("coa_extract").upsert(body.rows, { onConflict: "document_id" });
  if (error) return json({ ok: false, error: error.message }, 400);

  const { count } = await supa.from("coa_extract").select("*", { count: "exact", head: true });
  return json({ ok: true, stored: body.rows.length, total_read: count ?? 0 });
});
