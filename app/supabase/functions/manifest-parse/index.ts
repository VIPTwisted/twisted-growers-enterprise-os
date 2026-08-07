// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 1 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG - parse stored manifest PDFs for customer contact details.
// Metrc carries no email addresses in its API, but the printed manifest may show
// the recipient's contact block. This extracts the text and pulls out any email
// and phone found, so the customer address book is built from evidence rather
// than typed guesses (rule A1 - never invent a value).
// ?limit=N  ?apply=1 (write findings to customers)  ?debug=1 (return text sample)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_KEY = "<REDACTED — lives in Supabase function secrets>";
const BUCKET = "metrc-documents";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function inflate(bytes: Uint8Array): Promise<string> {
  for (const fmt of ["deflate", "deflate-raw"] as const) {
    try {
      const ds = new DecompressionStream(fmt);
      const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(ds);
      const buf = new Uint8Array(await new Response(stream).arrayBuffer());
      return new TextDecoder("latin1").decode(buf);
    } catch { /* try next */ }
  }
  return "";
}

// Pull readable text out of a PDF: inflate every stream, then take the strings
// inside parentheses, which is where PDF text operators keep their content.
async function pdfText(pdf: Uint8Array): Promise<string> {
  const latin = new TextDecoder("latin1").decode(pdf);
  let out = "";
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin)) !== null) {
    const start = m.index + m[0].length;
    const end = latin.indexOf("endstream", start);
    if (end < 0) continue;
    const chunk = pdf.subarray(start, end);
    const text = await inflate(chunk);
    if (text) out += text + " ";
  }
  if (!out) out = latin; // uncompressed fallback
  const parts = out.match(/\((?:\\.|[^()\\])*\)/g) ?? [];
  let s = parts.map((p) => p.slice(1, -1)).join("");
  s = s.replace(/\\[0-9]{3}/g, "").replace(/\\/g, "");
  return s.replace(/\s+/g, " ");
}

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-admin-key") !== ADMIN_KEY) return json({ ok: false, error: "forbidden" }, 403);
  const p = new URL(req.url).searchParams;
  const limit = Math.min(Number(p.get("limit") ?? 5), 200);
  const apply = p.get("apply") === "1";
  const debug = p.get("debug") === "1";

  const { data: docs } = await supa.from("metrc_documents")
    .select("metrc_id, manifest_number, storage_path")
    .eq("doc_type", "manifest").not("storage_path", "is", null).limit(limit);

  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const PHONE = /\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/g;
  const results: Record<string, unknown>[] = [];
  let updated = 0;

  for (const d of docs ?? []) {
    try {
      const { data: blob, error } = await supa.storage.from(BUCKET).download(d.storage_path as string);
      if (error || !blob) { results.push({ manifest: d.manifest_number, error: error?.message ?? "no blob" }); continue; }
      const text = await pdfText(new Uint8Array(await blob.arrayBuffer()));
      const emails = [...new Set(text.match(EMAIL) ?? [])];
      const phones = [...new Set(text.match(PHONE) ?? [])];

      const { data: tr } = await supa.from("metrc_transfers")
        .select("recipient").eq("manifest_number", d.manifest_number).limit(1);
      const recipient = tr?.[0]?.recipient ?? null;

      if (apply && recipient && emails.length) {
        const { error: uErr } = await supa.from("customers")
          .update({ email: emails[0], phone: phones[0] ?? null, updated_at: new Date().toISOString() })
          .eq("metrc_facility_name", recipient).is("email", null);
        if (!uErr) updated++;
      }
      results.push({
        manifest: d.manifest_number, recipient,
        text_chars: text.length,
        emails_found: emails.length ? emails : "none",
        phones_found: phones.length ? phones.slice(0, 3) : "none",
        ...(debug ? { sample: text.slice(0, 700) } : {}),
      });
    } catch (e) {
      results.push({ manifest: d.manifest_number, error: String(e).slice(0, 140) });
    }
  }
  return json({ ok: true, examined: results.length, customers_updated: updated, results });
});
