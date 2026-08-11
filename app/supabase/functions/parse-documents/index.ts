// Read stored COAs and manifests. Scheduled, so the gap cannot re-open.
//
// WHY: the fetcher downloads documents and nothing READ them. 983 certificates sat
// on disk with the cultivator named on every one. A document downloaded and not
// parsed is WORSE than one not downloaded - it looks like coverage.
//
// v3, after measuring three real failures rather than guessing:
//   1. PostgREST caps a select at 1,000 ROWS. v2 fetched every document and removed
//      the parsed ones in memory, so it only ever saw the first 1,000 and every
//      slice past ~889 returned "considered: 0" - 2,574 outstanding documents
//      looked like none. Now it selects from v_manifest_unparsed / v_coa_unparsed,
//      which contain only what is left.
//   2. WORKER_RESOURCE_LIMIT. 300 documents at 10-way concurrency exceeded the
//      function's compute budget and three invocations died outright. POOL is now 4
//      and the default batch is 40 - small enough to finish, large enough to matter.
//   3. pg_net gives up after 5 SECONDS. The function keeps running server-side, so
//      the caller cannot learn the outcome from the response. Poll the tables, or
//      read the run_log row this writes at the end.
//
// FAILURE POLICY: an unreadable layout ANNOUNCES ITSELF in watchdog_findings and is
// never skipped quietly. MCR Labs was a sixth certificate layout nobody knew about
// and it failed silently - that is the whole reason this policy exists.
//
// ---------------------------------------------------------------------------
// v4, 10 Aug 2026 - THE KEY IS NO LONGER IN THIS FILE. AUTH CHANGE ONLY.
//
// It was `const ADMIN_KEY = "tg-seed-..."`. The same literal sat in sixteen
// deployed functions, so the repository could not hold real source and production
// was the only record of what was running. This is the SECOND of the sixteen to
// move, after metrc-probe v4.
//
// It now reads TG_ADMIN_KEY from integration_secrets, readable only by postgres
// and service_role. THIS IS A NO-OP FOR EVERY CALLER, verified before deploying:
// both cron jobs call through tg_call_function, which reads its x-admin-key from
// that same row, and the stored value was confirmed equal to the literal this
// version replaces. After this change both sides read the SAME row, so they
// cannot silently diverge again.
//
// NOTHING ELSE CHANGED. The parser is byte-identical to v3 and verify_jwt stays
// false. One change at a time - bundling the parser rewrite in here would make a
// failure impossible to attribute.
//
// Verified after deploying, the same three cases metrc-probe v4 passed:
//   correct key -> 200   wrong key -> 401   no key -> 401
//
// KNOWN DEBT, deliberately NOT fixed in this deploy (rule G2): OURS below is a
// hardcoded licence pair. It belongs in company_licenses. That is a separate
// change and gets its own deploy.
// ---------------------------------------------------------------------------

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const BUCKET = "metrc-documents";
const PARSER_VERSION = "2026-08-08.3";
const POOL = 4;
const MAX_BATCH = 80;

const CLIENT_LIC = /\b((?:MC|MP|MB|MR|MD)\d{6}|RMD\d{3,4}(?:-[A-Z])?)\b/;
const ANY_LIC_S = "\\b((?:MC|MP|MB|MR|MT|MD|MX|IL)\\d{6}|RMD\\d{3,4}(?:-[A-Z])?)\\b";
const LAB_LINE = /(laborator|accredit|lab licen|iso\/iec|independent testing)/i;
const NOT_A_NAME = /(\.com|\.net|\.org|https?:|@|^\d+\s+\w|,\s*[A-Z]{2},?\s*\d{5}|^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|^(suite|ste\.?|unit|floor|po box)\b)/i;
const OURS = ["MC281714", "MP281909"];

/* Constant time. A plain !== leaks the key one character at a time to anyone
   patient enough to measure the difference. Same guard as metrc-probe v4. */
function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const cells = (l: string) => l.trim().split(/\s{2,}/).filter(Boolean);
// The VALUE beside a label is the SECOND column, never the last: a manifest line
// carries three columns and the last is the departure TIME, not the destination.
const valueCell = (l: string) => { const p = cells(l); return p.length > 1 ? p[1] : ""; };
const leftCell = (l: string) => { const p = cells(l); return p.length ? p[0] : ""; };
const clean = (s: string) => s.replace(/\s*(?:METRC|Metrc)\s+\w+\s*(?:ID)?\s*:.*$/, "").replace(/\s{2,}.*$/, "").replace(/^[\s.,]+|[\s.,]+$/g, "");

function parseCoa(text: string) {
  const head = text.split("\n").slice(0, 40); const headTxt = head.join("\n");
  const out: Record<string, unknown> = { client_name: null, client_license: null };
  const grab = (re: RegExp) => { const m = text.match(re); return m ? m[1].trim() : null; };
  out.lab_report_id   = grab(/Report ID:\s*(\S+)/) ?? grab(/Report #:\s*(\S+)/) ?? grab(/Sample ID:\s*(\S+)/);
  out.metrc_batch_id  = grab(/METRC Batch ID:\s*(.+?)\s*$/m) ?? grab(/BATCH NO\.:\s*(.+?)\s*$/m);
  out.metrc_sample_id = grab(/METRC Sample ID:\s*(\S+)/) ?? grab(/TEST PKG:\s*(\S+)/);
  out.metrc_source_id = grab(/METRC Source ID:\s*(\S+)/) ?? grab(/SRC PKG:\s*(\S+)/);
  for (const ln of head) { if (LAB_LINE.test(ln)) continue; const m = ln.match(CLIENT_LIC); if (m) { out.client_license = m[1]; break; } }
  const afterMarker = (marker: string, exact = false) => {
    for (let i = 0; i < head.length; i++) {
      const hit = exact ? leftCell(head[i]).trim().toUpperCase() === marker : head[i].toUpperCase().includes(marker);
      if (!hit) continue;
      const got: string[] = [];
      for (let j = i + 1; j < Math.min(i + 6, head.length); j++) {
        const c = clean(leftCell(head[j])); if (!c) continue;
        if (/^(LICENSE|License|Lic\.|Metrc|METRC|Date|Sample|Batch)/.test(c)) break;
        got.push(c); if (got.length >= 2) break;
      }
      return got;
    }
    return [];
  };
  let body: string[] = [];
  const role = ["CULTIVATOR", "MANUFACTURER", "PROCESSOR", "DISTRIBUTOR"].find(r => headTxt.toUpperCase().includes(r + " INFO"));
  if (/^\s*Client:/m.test(headTxt) && !headTxt.includes("Client Info")) {
    for (let i = 0; i < head.length; i++) {                 // MCR Labs prints NO licence
      if (!/^\s*Client:/.test(head[i])) continue;
      const got: string[] = [];
      for (let j = i + 1; j < Math.min(i + 6, head.length); j++) {
        const c = clean(leftCell(head[j])); if (!c) continue;
        if (NOT_A_NAME.test(c)) break; got.push(c);
      }
      if (got.length) body = [got.join(" ")]; break;
    }
  } else if (role) {
    body = afterMarker(role, true); if (!body.length) body = afterMarker(role + " INFO");
  } else if (headTxt.includes("Client Info")) {
    body = afterMarker("CLIENT INFO");
  } else if (/Lic\.\s*#/.test(headTxt)) {
    for (let i = 0; i < head.length; i++) {
      if (leftCell(head[i]).trim().toLowerCase() !== "client") continue;
      for (let j = i + 1; j < Math.min(i + 5, head.length); j++) {
        const c = cells(head[j]); if (!c.length) continue;
        const cand = clean(c[c.length - 1]);
        if (cand && !/^(Lic\.|Expiration|Batch|Completed)/.test(cand)) { body = [cand]; break; }
      }
      break;
    }
  } else {
    let licI = -1;
    for (let i = 0; i < head.length; i++) {
      if (LAB_LINE.test(head[i])) continue;
      if (/Licen[sc]e\s*#?\s*:/.test(head[i]) && CLIENT_LIC.test(head[i])) { licI = i; break; }
    }
    if (licI >= 0) for (let j = licI - 1; j >= Math.max(licI - 7, 0); j--) {
      const c = clean(leftCell(head[j]));
      if (!c || /^(Certificate|CERTIFICATE|Page|Pages)/.test(c)) continue;
      if (NOT_A_NAME.test(c)) continue;                     // walk past the address block
      body = [c]; break;
    }
    if (!body.length) for (const ln of head) {
      const c = clean(leftCell(ln));
      if (c && c.length > 2 && !/^(Certificate|CERTIFICATE|REGULATORY)/.test(c)) { body = [c]; break; }
    }
  }
  if (body.length) out.client_name = body[0];
  return out;
}

function parseManifest(text: string) {
  const head = text.split("\n").slice(0, 70);
  const out: Record<string, unknown> = {};
  const grab = (re: RegExp) => { const m = text.match(re); return m ? m[1].trim() : null; };
  out.origin_name  = grab(/Originating Entity\s{2,}(.+?)\s{2,}/);
  out.date_created = grab(/Date Created\s+([\d/]+\s+[\d:]+\s*[AP]M)/);
  out.departure    = grab(/Time of Departure\s+([\d/]+\s+[\d:]+\s*[AP]M)/);
  out.arrival      = grab(/Time of Arrival\s+([\d/]+\s+[\d:]+\s*[AP]M)/);
  for (const ln of head) {
    if (/^\s*\d*\.?\s*Destination\b/.test(ln) && !ln.includes("License") && !ln.includes("Phone")) {
      const v = valueCell(ln); if (v && !new RegExp(ANY_LIC_S).test(v)) out.destination_name = v.trim(); break;
    }
  }
  for (const ln of head) {
    if ((/Outbound Transporter/.test(ln) || /^\s*\d*\.?\s*Transporter\b/.test(ln)) && !ln.includes("License")) {
      const v = valueCell(ln); if (v && !new RegExp(ANY_LIC_S).test(v)) out.transporter_name = v.trim(); break;
    }
  }
  const lics: string[] = [];
  for (const ln of head) for (const m of ln.matchAll(new RegExp(ANY_LIC_S, "g"))) if (!lics.includes(m[1])) lics.push(m[1]);
  out.origin_license      = lics.find(l => OURS.includes(l)) ?? null;
  out.transporter_license = lics.find(l => /^MX\d{6}$/.test(l)) ?? null;
  out.destination_license = lics.find(l => !OURS.includes(l) && !/^MX\d{6}$/.test(l)) ?? null;
  out.is_lab_run = !!(out.destination_license && /^IL\d{6}$/.test(out.destination_license as string));
  if (!out.destination_license && !out.destination_name) out.parse_note = "NO DESTINATION FOUND";
  return out;
}

async function pooled<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) { const k = i++; if (k >= items.length) return; await fn(items[k]); }
  }));
}

Deno.serve(async (req) => {
  /* v4: the service-role client is created FIRST, because the admin key now
     comes out of the database rather than out of this file. SUPABASE_URL and
     SUPABASE_SERVICE_ROLE_KEY are injected by the platform - neither is a secret
     anybody has to configure. */
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: secretRow } = await sb.from("integration_secrets")
    .select("value").eq("name", "TG_ADMIN_KEY").maybeSingle();
  const expected = (secretRow?.value ?? "").trim();

  /* FAIL CLOSED. An unset or empty key must refuse everything, never admit
     everything - an empty string compared against an absent header would
     otherwise open the door. 503 not 401: the caller is not unauthorised, the
     service is unconfigured, and those need to be told apart in the logs. */
  if (!expected)
    return new Response(JSON.stringify({ error: "admin key not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } });

  if (!sameKey(req.headers.get("x-admin-key") ?? "", expected))
    return new Response(JSON.stringify({ error: "unauthorised" }),
      { status: 401, headers: { "Content-Type": "application/json" } });

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "both";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 40), MAX_BATCH);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  const report: Record<string, unknown> = { parser_version: PARSER_VERSION, offset, limit };

  const readPdf = async (path: string) => {
    const { data, error } = await sb.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error("download: " + (error?.message ?? "empty"));
    const pdf = await getDocumentProxy(new Uint8Array(await data.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    return text as string;
  };

  const flag = async (k: string, n: number, sample: string) => {
    await sb.from("watchdog_findings").insert({
      fingerprint: "documents:unreadable-layout:" + k, severity: "elevated",
      what: `${n} ${k} document(s) could not be parsed - possible new layout`,
      where_it_is: "metrc_documents / parse-documents edge function",
      who_is_accountable: "whoever owns document parsing",
      why_it_matters: `Every certificate names its client and every manifest names its destination, so a miss means a layout the parser has never seen. A document downloaded and not parsed is WORSE than one not downloaded, because it looks like coverage. Documents: ${sample}`,
      how_it_was_detected: "parse-documents read the stored PDF and found no client/destination.",
      what_to_do: "Open one of the listed PDFs, find how that form labels the client or destination, and add the layout.",
      record_count: n, drill: `select * from metrc_documents where doc_type = '${k}'`,
    });
  };

  if (kind === "manifest" || kind === "both") {
    const { data: todo } = await sb.from("v_manifest_unparsed")
      .select("metrc_id,storage_path,manifest_number").range(offset, offset + limit - 1);
    const good: Record<string, unknown>[] = []; const bad: string[] = [];
    await pooled(todo ?? [], POOL, async (d: { metrc_id: number; storage_path: string; manifest_number: string }) => {
      try {
        const r = parseManifest(await readPdf(d.storage_path));
        if (!r.destination_license && !r.destination_name) { bad.push(d.manifest_number); return; }
        good.push({ manifest_number: d.manifest_number, document_id: String(d.metrc_id),
          origin_name: r.origin_name, origin_license: r.origin_license,
          destination_name: r.destination_name, destination_license: r.destination_license,
          transporter_name: r.transporter_name, transporter_license: r.transporter_license,
          date_created: r.date_created, departure: r.departure, arrival: r.arrival,
          is_lab_run: r.is_lab_run, parse_note: r.parse_note, parser_version: PARSER_VERSION });
      } catch (_e) { bad.push(d.manifest_number); }
    });
    if (good.length) await sb.from("manifest_extract").upsert(good, { onConflict: "manifest_number" });
    report.manifest = { considered: (todo ?? []).length, parsed: good.length, unreadable: bad.length };
    if (bad.length) await flag("manifest", bad.length, bad.slice(0, 8).join(", "));
  }

  if (kind === "coa" || kind === "both") {
    const { data: todo } = await sb.from("v_coa_unparsed")
      .select("metrc_id,storage_path").range(offset, offset + limit - 1);
    const bad: string[] = []; let ok = 0;
    await pooled(todo ?? [], POOL, async (d: { metrc_id: number; storage_path: string }) => {
      try {
        const r = parseCoa(await readPdf(d.storage_path));
        if (!r.client_license && !r.client_name) { bad.push(String(d.metrc_id)); return; }
        await sb.from("coa_extract").update({
          client_name: r.client_name, client_license: r.client_license,
          lab_report_id: r.lab_report_id, metrc_batch_id: r.metrc_batch_id,
          metrc_sample_id: r.metrc_sample_id, metrc_source_id: r.metrc_source_id,
          client_parsed_at: new Date().toISOString(),
        }).eq("document_id", String(d.metrc_id));
        ok++;
      } catch (_e) { bad.push(String(d.metrc_id)); }
    });
    report.coa = { considered: (todo ?? []).length, parsed: ok, unreadable: bad.length };
    if (bad.length) await flag("coa", bad.length, bad.slice(0, 8).join(", "));
  }

  return new Response(JSON.stringify(report), { headers: { "Content-Type": "application/json" } });
});
