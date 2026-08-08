// Permanent document server. Owner ruling, 7 Aug 2026: "I do not want expiry at
// all on our OS. These records are kept and can be sent years later."
//
// VERSIONED 8 Aug 2026. Deployed a day earlier with no source in this
// repository - recovered verbatim from the live deployment (version 1, sha256
// ef257477cbc042d6b2855aaf050d4b512b0a65c4cc1e1f2c81e1e98978025a54) rather than
// rewritten, so what is committed is exactly what is running. No behaviour
// changed; only this note was added.
//
// WHY THIS EXISTS. Documents were served as pre-signed storage URLs. Supabase's
// createSignedUrl(path, expiresIn) REQUIRES an expiry - there is no "never" - so
// the fetcher passed 30 days because the API forces a number. Nobody chose it.
// All 3,666 links were signed together and expire 5-6 Sep 2026: one day on which
// every print and download button in the platform dies at once. The FILES are
// never lost - only the pre-cut keys go stale.
//
// A signed URL is the right tool for handing a file to a stranger. It is the wrong
// tool for showing a document to a logged-in employee. There, the platform should
// fetch the file with its own credentials at the moment of the click.
//
// So: this URL is PERMANENT and carries NO TOKEN.
//     /functions/v1/document?path=coa/2267739.pdf
// The bucket stays PRIVATE. verify_jwt is on, so the caller must be a signed-in
// user; the function then reads the file with the service role and streams it.
// Permanence and privacy - not a trade-off.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "metrc-documents";
// Only these prefixes may be served. Without this, a crafted path could reach any
// object in the bucket.
const ALLOWED = /^(coa|manifest)\/[A-Za-z0-9._-]+\.pdf$/;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  // Accept ?path=coa/123.pdf or the trailing path form /document/coa/123.pdf
  let path = url.searchParams.get("path") ?? "";
  if (!path) {
    const m = url.pathname.match(/\/document\/(.+)$/);
    if (m) path = decodeURIComponent(m[1]);
  }

  if (!ALLOWED.test(path)) {
    return new Response(
      JSON.stringify({ error: "path must be coa/<file>.pdf or manifest/<file>.pdf", got: path }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    return new Response(
      JSON.stringify({ error: "not found", path, detail: error?.message ?? null }),
      { status: 404, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  // inline lets the browser print it; ?download=1 forces save-as.
  const name = path.split("/").pop()!;
  const disposition = url.searchParams.get("download") ? "attachment" : "inline";

  return new Response(data, {
    headers: {
      ...cors,
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${name}"`,
      // Safe to cache hard: a stored document is immutable once written.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
