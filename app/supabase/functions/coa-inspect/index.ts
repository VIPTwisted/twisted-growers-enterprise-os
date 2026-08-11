// coa-inspect - READ ONLY. Returns the text a stored certificate actually
// extracts to, so a parser can be written against reality instead of against an
// assumption about reality.
//
// Built 10 Aug 2026. The reason it exists: parse-documents has written
// metrc_batch_id, metrc_sample_id and metrc_source_id as NULL on all 983
// certificates, using regexes anchored on `METRC Batch ID:\s*(.+?)\s*$` with the
// /m flag. That pattern assumes layout-preserved two-column text. Whether unpdf
// produces that has never been checked - so the five dead fields may be a broken
// regex, or may be a text shape nobody has looked at. This tells us which.
//
// K1 question 1: run the comparison on ONE KNOWN-GOOD ROW FIRST. Certificate
// 2267739 is the worked example in CLAUDE.md - Green Analytics, Greater Goods
// LLC, and it is documented as printing `METRC Batch ID:`. If the pattern cannot
// match on that one, it cannot match anywhere.
//
// WRITES NOTHING. Admin-gated exactly like parse-documents v4: key read from
// integration_secrets, constant-time compare, fail closed.
//
// ---------------------------------------------------------------------------
// RECOVERED INTO THE REPOSITORY 11 Aug 2026 by Agent I, verbatim from the
// deployed function (version 1, sha e7db5360). It had been running since 10 Aug
// with NO SOURCE ANYWHERE IN THE REPO - the same failure the standard's rule 6
// was written about: "three edge functions ran for days with no source anywhere,
// including the one every assistant answer passes through."
// Found by diffing the 27 live functions against the 26 in app/supabase/functions.
// A guard for exactly this is being built (see tools/checks/migration-drift.mjs
// and edge-function-drift.mjs) because prose did not prevent it happening again.
// ---------------------------------------------------------------------------

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const BUCKET = "metrc-documents";

function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: secretRow } = await sb.from("integration_secrets")
    .select("value").eq("name", "TG_ADMIN_KEY").maybeSingle();
  const expected = (secretRow?.value ?? "").trim();
  if (!expected)
    return new Response(JSON.stringify({ error: "admin key not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } });
  if (!sameKey(req.headers.get("x-admin-key") ?? "", expected))
    return new Response(JSON.stringify({ error: "unauthorised" }),
      { status: 401, headers: { "Content-Type": "application/json" } });

  const u = new URL(req.url);
  const id = u.searchParams.get("id");
  const chars = Math.min(Number(u.searchParams.get("chars") ?? 3000), 40000);
  if (!id)
    return new Response(JSON.stringify({ error: "pass ?id=<metrc_documents.metrc_id>" }),
      { status: 400, headers: { "Content-Type": "application/json" } });

  const { data: doc } = await sb.from("metrc_documents")
    .select("metrc_id,storage_path,doc_type").eq("metrc_id", id).maybeSingle();
  if (!doc?.storage_path)
    return new Response(JSON.stringify({ error: "no stored document for that id" }),
      { status: 404, headers: { "Content-Type": "application/json" } });

  const { data: blob, error } = await sb.storage.from(BUCKET).download(doc.storage_path);
  if (error || !blob)
    return new Response(JSON.stringify({ error: "download failed: " + (error?.message ?? "empty") }),
      { status: 502, headers: { "Content-Type": "application/json" } });

  const pdf = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const t = text as string;
  const lines = t.split("\n");

  /* The diagnosis, computed here rather than left for a human to eyeball:
     does the label even appear, and if so is it followed by its value on the
     SAME line (which the regex needs) or on a different one? */
  const probe = (label: string) => {
    const i = lines.findIndex((l) => l.includes(label));
    if (i < 0) return { label, found: false };
    return {
      label, found: true, line_no: i,
      line: lines[i].slice(0, 200),
      next_line: (lines[i + 1] ?? "").slice(0, 200),
      value_on_same_line: lines[i].split(label)[1]?.trim().length > 0,
    };
  };

  return new Response(JSON.stringify({
    metrc_id: doc.metrc_id, doc_type: doc.doc_type, pages: totalPages,
    total_chars: t.length, total_lines: lines.length,
    // how wide are the lines? layout-preserved text has long lines with runs of
    // spaces; reading-order text has short ones and almost no double spaces.
    max_line_len: Math.max(...lines.map((l) => l.length)),
    avg_line_len: Math.round(t.length / Math.max(lines.length, 1)),
    lines_with_double_space: lines.filter((l) => /\s{2,}/.test(l)).length,
    probes: ["METRC Batch ID", "METRC Sample ID", "METRC Source ID",
             "Metrc Manifest", "Client Info", "License", "Total THC",
             "Terpene", "Report"].map(probe),
    head: t.slice(0, chars),
  }, null, 1), { headers: { "Content-Type": "application/json" } });
});
