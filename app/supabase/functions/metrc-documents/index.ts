// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 3 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG - Metrc document library.
// HARD RULE (owner-set 6 Aug 2026): anything that has ever had, or will ever have,
// a manifest or a certificate of analysis must carry a link sitewide, and that link
// must download, print and be shareable. Metrc's own URLs need a Metrc login, so
// they do not satisfy the rule. We fetch the documents, store them, and hand back
// a signed link that opens the real PDF in one click.
//
// v3: the pending lists come from tg_pending_coa / tg_pending_manifest. The old
// code read the first 4,000 lab-result rows and deduplicated those, which found
// 23 of 983 certificates once the lab backfill grew the table to 101,608 rows.
//
// ?mode=coa|manifest|both|urls   ?limit=N
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ADMIN_KEY = "<REDACTED — lives in Supabase function secrets>";
const BUCKET = "metrc-documents";
const URL_TTL = 60 * 60 * 24 * 30; // 30 days, refreshed nightly
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const basic = (a: string, b: string) => "Basic " + btoa(a + ":" + b);

async function sha256(buf: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signed(path: string, filename: string): Promise<string | null> {
  const { data } = await supa.storage.from(BUCKET)
    .createSignedUrl(path, URL_TTL, { download: filename });
  return data?.signedUrl ?? null;
}

async function allowed(req: Request): Promise<boolean> {
  if (req.headers.get("x-admin-key") === ADMIN_KEY) return true;
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return false;
  const { data } = await supa.auth.getUser(token);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: row } = await supa.from("app_users").select("role").eq("user_id", uid).single();
  return ["owner", "executive", "cfo"].includes(String(row?.role));
}

async function store(path: string, bytes: Uint8Array): Promise<string | null> {
  const { error } = await supa.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf", upsert: true,
  });
  return error ? error.message.slice(0, 150) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await allowed(req))) return json({ ok: false, error: "Administrator or CFO access required." }, 403);

  const p = new URL(req.url).searchParams;
  const mode = p.get("mode") ?? "both";
  const limit = Math.min(Number(p.get("limit") ?? 100), 600);
  const out: Record<string, unknown> = {};

  // ---------- refresh signed links ----------
  if (mode === "urls") {
    const { data: docs } = await supa.from("metrc_documents")
      .select("id, doc_type, metrc_id, manifest_number, package_tag, storage_path")
      .not("storage_path", "is", null).limit(20000);
    let n = 0;
    for (const d of docs ?? []) {
      const nice = d.doc_type === "manifest"
        ? "Manifest " + (d.manifest_number ?? d.metrc_id) + ".pdf"
        : "Certificate of Analysis " + (d.package_tag ?? d.metrc_id) + ".pdf";
      const url = await signed(d.storage_path as string, nice);
      if (url) {
        await supa.from("metrc_documents").update({
          download_url: url,
          url_expires_at: new Date(Date.now() + URL_TTL * 1000).toISOString(),
        }).eq("id", d.id);
        n++;
      }
    }
    return json({ ok: true, results: { links_refreshed: n } });
  }

  const { data: secs } = await supa.from("integration_secrets").select("name, value");
  const cfg: Record<string, string> = {};
  for (const s of secs ?? []) cfg[s.name] = s.value;
  const V = (cfg.METRC_VENDOR_KEYS ?? cfg.METRC_VENDOR_KEY ?? "").split(",")[0].trim();
  const U = (cfg.METRC_USER_KEYS ?? cfg.METRC_USER_KEY ?? "").split(",")[0].trim();
  if (!V || !U) return json({ ok: false, error: "Metrc keys are not stored." }, 400);
  const auth = basic(V, U);
  const BASE = "https://api-" + (cfg.METRC_STATE ?? "ma") + ".metrc.com";
  const LIC = (cfg.METRC_LICENSES ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  // ---------- certificates of analysis ----------
  if (mode === "coa" || mode === "both") {
    const { data: todo } = await supa.rpc("tg_pending_coa", { p_limit: limit });
    let ok = 0; const errs: string[] = [];
    for (const d of (todo ?? []) as Array<Record<string, string>>) {
      const id = d.document_file_id, tag = d.package_tag;
      const order = [d.license, ...LIC.filter((l) => l !== d.license)];
      let saved = false; let lastErr = "";
      for (const lic of order) {
        try {
          const res = await fetch(BASE + "/labtests/v2/labtestdocument/" + id +
            "?licenseNumber=" + encodeURIComponent(lic), { headers: { Authorization: auth } });
          if (!res.ok) { lastErr = "HTTP " + res.status; await sleep(120); continue; }
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.length < 100) { lastErr = "empty document"; continue; }
          const path = "coa/" + id + ".pdf";
          const sErr = await store(path, bytes);
          if (sErr) { lastErr = sErr; continue; }
          const url = await signed(path, "Certificate of Analysis " + tag + ".pdf");
          await supa.from("metrc_documents").upsert({
            doc_type: "coa", metrc_id: id, license: lic, package_tag: tag,
            storage_path: path, file_hash: await sha256(bytes), byte_size: bytes.length,
            source_url: "/labtests/v2/labtestdocument/" + id,
            download_url: url,
            url_expires_at: new Date(Date.now() + URL_TTL * 1000).toISOString(),
            fetched_at: new Date().toISOString(), fetch_error: null,
          }, { onConflict: "doc_type,metrc_id" });
          ok++; saved = true; break;
        } catch (e) { lastErr = String(e).slice(0, 90); }
      }
      if (!saved) {
        if (errs.length < 5) errs.push(id + ": " + lastErr);
        await supa.from("metrc_documents").upsert({
          doc_type: "coa", metrc_id: id, license: d.license, package_tag: tag,
          source_url: "/labtests/v2/labtestdocument/" + id,
          fetch_error: lastErr || "unknown", fetched_at: new Date().toISOString(),
        }, { onConflict: "doc_type,metrc_id" });
      }
      await sleep(140);
    }
    const { count } = await supa.from("metrc_documents")
      .select("*", { count: "exact", head: true }).eq("doc_type", "coa").not("storage_path", "is", null);
    const { data: left } = await supa.rpc("tg_pending_coa", { p_limit: 5000 });
    out.certificates = { attempted: (todo ?? []).length, stored: ok, total_held: count ?? 0,
      remaining: (left ?? []).length, errors: errs.length ? errs : "none" };
  }

  // ---------- manifests ----------
  if (mode === "manifest" || mode === "both") {
    const { data: todo } = await supa.rpc("tg_pending_manifest", { p_limit: limit });
    let ok = 0; const errs: string[] = [];
    for (const d of (todo ?? []) as Array<Record<string, string>>) {
      const id = d.metrc_id, mn = d.manifest_number;
      const order = [d.license, ...LIC.filter((l) => l !== d.license)];
      let saved = false; let lastErr = "";
      for (const lic of order) {
        try {
          const res = await fetch(BASE + "/transfers/v2/manifest/" + id +
            "/pdf?licenseNumber=" + encodeURIComponent(lic), { headers: { Authorization: auth } });
          if (!res.ok) { lastErr = "HTTP " + res.status; await sleep(120); continue; }
          const txt = await res.text();
          let bytes: Uint8Array;
          if (txt.startsWith("%PDF")) {
            bytes = new TextEncoder().encode(txt);
          } else {
            const b64 = (JSON.parse(txt) as Record<string, string>).FileContents;
            if (!b64) { lastErr = "no FileContents in response"; continue; }
            const bin = atob(b64);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          }
          if (bytes.length < 100) { lastErr = "empty document"; continue; }
          const path = "manifest/" + mn + ".pdf";
          const sErr = await store(path, bytes);
          if (sErr) { lastErr = sErr; continue; }
          const url = await signed(path, "Manifest " + mn + ".pdf");
          await supa.from("metrc_documents").upsert({
            doc_type: "manifest", metrc_id: id, license: lic, manifest_number: mn,
            storage_path: path, file_hash: await sha256(bytes), byte_size: bytes.length,
            source_url: "/transfers/v2/manifest/" + id + "/pdf",
            download_url: url,
            url_expires_at: new Date(Date.now() + URL_TTL * 1000).toISOString(),
            fetched_at: new Date().toISOString(), fetch_error: null,
          }, { onConflict: "doc_type,metrc_id" });
          ok++; saved = true; break;
        } catch (e) { lastErr = String(e).slice(0, 90); }
      }
      if (!saved) {
        if (errs.length < 5) errs.push(mn + ": " + lastErr);
        await supa.from("metrc_documents").upsert({
          doc_type: "manifest", metrc_id: id, license: d.license, manifest_number: mn,
          source_url: "/transfers/v2/manifest/" + id + "/pdf",
          fetch_error: lastErr || "unknown", fetched_at: new Date().toISOString(),
        }, { onConflict: "doc_type,metrc_id" });
      }
      await sleep(140);
    }
    const { count } = await supa.from("metrc_documents")
      .select("*", { count: "exact", head: true }).eq("doc_type", "manifest").not("storage_path", "is", null);
    const { data: left } = await supa.rpc("tg_pending_manifest", { p_limit: 9000 });
    out.manifests = { attempted: (todo ?? []).length, stored: ok, total_held: count ?? 0,
      remaining: (left ?? []).length, errors: errs.length ? errs : "none" };
  }

  await supa.from("metrc_sync_runs").insert({
    license: "both", endpoint: "documents (" + mode + ")",
    records: Number((out.certificates as Record<string, number>)?.stored ?? 0) +
             Number((out.manifests as Record<string, number>)?.stored ?? 0),
    status: "ok", finished_at: new Date().toISOString(),
  });
  return json({ ok: true, results: out });
});
