// Read stored COAs and manifests. Scheduled, so the gap cannot re-open.
//
// v3: PostgREST 1,000-row cap, WORKER_RESOURCE_LIMIT, pg_net's 5s give-up.
// v4: the shared admin key left this file (integration_secrets, constant time).
// v5: identity parser - label-terminator extraction; v_coa_unparsed re-queued.
//
// ---------------------------------------------------------------------------
// v6, 10 Aug 2026 - REGRESSION FIX. v5 DESTROYED DATA AND THIS IS THE STOP.
//
// v5 upserted every identity field on every certificate it read. On the first
// batch of five, the client-name branch returned null - it splits on newlines and
// unpdf emits ONE line - so the upsert wrote NULL over client_name and
// client_license that were already correct. Measured immediately after:
//     client_name null   2 -> 7
//     client_license null 11 -> 17
// Five certificates lost their cultivator of record. Had the backfill cron fired
// at 80 a batch before this was noticed, it would have erased the field that
// rule C0 calls the ONLY independent source of who grew the material.
//
// THE RULE THIS BREAKS, and it is not a subtle one: a parser that cannot read a
// field must say nothing about it. It must never assert absence. "I did not find
// it" and "it is not there" are different claims, and only the second one is
// destructive.
//
// THE FIX: build the update from the fields actually FOUND. A field that came
// back null is omitted from the payload entirely, so the stored value survives.
// identity_parser_version is always written, because "this parser has now looked
// and found nothing" is itself a fact worth recording (K1 question 5).
// ---------------------------------------------------------------------------
//
// ---------------------------------------------------------------------------
// v7, 11 Aug 2026, Agent I - rule G2, and a MERGE that had to be done carefully.
//
// PLANNED: literal-licences went 57 -> 59 and failed the build. `OURS` was a
// hardcoded licence pair carrying a comment that read "KNOWN DEBT, deliberately
// NOT fixed in this deploy (rule G2) ... that is a separate change and gets its
// own deploy." This is that separate change. OURS now loads from
// company_licenses and FAILS CLOSED: an unreadable or empty table returns 503
// rather than parsing, because an empty list makes every origin unmatched and
// every destination matched - so every manifest would record US as the
// counterparty. That is worse than not parsing at all.
//
// UNPLANNED: THE REPOSITORY WAS BEHIND PRODUCTION. The repo held a v4/v5-era
// file with no identity parser and no v6 regression fix, while production ran
// v6. The edge-function-drift gate compares the repo against its own PIN, not
// against production, so it said "deploy it" - and deploying would have SHIPPED
// THE v5 DATA-DESTRUCTION BUG BACK INTO PRODUCTION.
//
// Caught by reading production before deploying over it. Neither side was a
// superset - the same shape as apex-sync on 10 Aug. So production v6 is the base
// here and the G2 change is applied on top. Nothing from v6 is removed.
//
// THE GENERAL FORM: a drift gate that compares the repo to a stored hash tells
// you the repo CHANGED. It cannot tell you which side is ahead. Always read
// production before deploying over it.
// ---------------------------------------------------------------------------

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const BUCKET = "metrc-documents";
const PARSER_VERSION = "2026-08-08.3";
const IDENTITY_VERSION = "2026-08-10.identity-1";   // must match v_coa_unparsed
const POOL = 4;
const MAX_BATCH = 80;
const MAX_VALUE = 120;

const CLIENT_LIC = /\b((?:MC|MP|MB|MR|MD)\d{6}|RMD\d{3,4}(?:-[A-Z])?)\b/;
const ANY_LIC_S = "\\b((?:MC|MP|MB|MR|MT|MD|MX|IL)\\d{6}|RMD\\d{3,4}(?:-[A-Z])?)\\b";
const LAB_LINE = /(laborator|accredit|lab licen|iso\/iec|independent testing)/i;

/* Rule G2: licences come from company_licenses, never a literal. A licence frozen
   into code is wrong the day one is renewed, added or transferred - and "is this
   ours?" is the hinge of the whole ownership chain. Loaded once per invocation,
   before any document is parsed. See the v7 note above for why it fails closed. */
let OURS: string[] = [];

async function loadOurLicences(sb: ReturnType<typeof createClient>): Promise<void> {
  const { data, error } = await sb.from("company_licenses").select("license").eq("active", true);
  if (error) throw new Error("company_licenses unreadable: " + error.message);
  const found = (data ?? []).map((r: { license: string }) => r.license).filter(Boolean);
  if (!found.length) {
    throw new Error(
      "company_licenses returned no active licences. Refusing to parse - every origin " +
      "would be misclassified as a destination and every manifest would name us as the " +
      "counterparty.");
  }
  OURS = found;
}

const LABELS = [
  "METRC Batch ID:", "METRC Sample ID:", "METRC Source ID:", "ME Batch ID:",
  "Metrc Manifest:", "METRC Manifest:", "Metrc Sample:", "License:",
  "Date Received:", "QBench Order ID:", "Sample Weight", "Production Stage:",
  "Product Class:", "Retail Name:", "GAMA Report ID:", "Report ID:",
  "Report #:", "Report Submitted:", "Date Released:", "Date Collected:",
  "Client Info", "Client:", "Sample Identification", "Sample Properties",
  "Product Characterization", "Results for Requested Analyses", "Authorization",
  "Lic. #", "License #", "CULTIVATOR", "MANUFACTURER", "PROCESSOR",
  "BATCH NO.:", "Batch #:", "Batch ID:", "TEST PKG:", "SRC PKG:", "PRODUCED:",
];
const NOT_A_VALUE = /^(n\/a|na|none|null|-|--)$/i;

function labelled(text: string, label: string): { value: string | null; overlong: boolean } {
  const i = text.indexOf(label);
  if (i < 0) return { value: null, overlong: false };
  const start = i + label.length;
  let end = text.length;
  for (const L of LABELS) {
    if (L === label) continue;
    const j = text.indexOf(L, start);
    if (j >= 0 && j < end) end = j;
  }
  const v = text.slice(start, end).replace(/^[\s:;,]+|[\s:;,.]+$/g, "");
  if (!v || NOT_A_VALUE.test(v)) return { value: null, overlong: false };
  if (v.length > MAX_VALUE) return { value: null, overlong: true };
  return { value: v, overlong: false };
}

const cells = (l: string) => l.trim().split(/\s{2,}/).filter(Boolean);
const valueCell = (l: string) => { const p = cells(l); return p.length > 1 ? p[1] : ""; };

function parseCoa(text: string) {
  const out: Record<string, unknown> = {};
  let overlong = 0;
  const take = (...labels: string[]) => {
    for (const l of labels) {
      const r = labelled(text, l);
      if (r.overlong) overlong++;
      if (r.value) return r.value;
    }
    return null;
  };

  out.metrc_batch_id  = take("METRC Batch ID:", "BATCH NO.:", "Batch #:");
  out.metrc_sample_id = take("METRC Sample ID:", "Metrc Sample:", "TEST PKG:");
  out.metrc_source_id = take("METRC Source ID:", "SRC PKG:");
  out.manifest_on_coa = take("Metrc Manifest:", "METRC Manifest:");
  out.lab_report_id   = take("GAMA Report ID:", "Report ID:", "Report #:");
  /* RAW ONLY. Live values include 2026-05-06, 04/06/2026 and 4/9/2026, and
     04/06 versus 4/9 cannot be told apart as day-month or month-day without
     knowing the laboratory. A guessed date would be an invented fact (A1). */
  out.report_date     = take("Report Submitted:", "Date Released:", "PRODUCED:", "Date Collected:");

  for (const k of ["metrc_sample_id", "metrc_source_id"]) {
    const v = out[k] as string | null;
    if (v && !/^1A4[0-9A-Z]{21}$/.test(v)) out[k] = null;
  }

  /* Client licence works on one-line text because it is a pattern match, not a
     line walk. The client NAME branch is a line walk and returns null on
     single-line output - which is exactly what caused the v5 regression. It is
     left as-is here and simply never overwrites. */
  let clientLicence: string | null = null;
  for (const ln of text.split("\n").slice(0, 40)) {
    if (LAB_LINE.test(ln)) continue;
    const m = ln.match(CLIENT_LIC);
    if (m) { clientLicence = m[1]; break; }
  }
  out.client_license = clientLicence;
  out.identity_overlong = overlong;
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

function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  /* Rule G2. Before anything is parsed, and before the key check, because a
     misconfigured licence table is a refusal rather than a bad parse. */
  try {
    await loadOurLicences(sb);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }),
      { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { data: secretRow } = await sb.from("integration_secrets")
    .select("value").eq("name", "TG_ADMIN_KEY").maybeSingle();
  const expected = (secretRow?.value ?? "").trim();
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

  const report: Record<string, unknown> = {
    parser_version: PARSER_VERSION, identity_version: IDENTITY_VERSION, offset, limit };

  const readPdf = async (path: string) => {
    const { data, error } = await sb.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error("download: " + (error?.message ?? "empty"));
    const pdf = await getDocumentProxy(new Uint8Array(await data.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    return text as string;
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
  }

  if (kind === "coa" || kind === "both") {
    const { data: todo } = await sb.from("v_coa_unparsed")
      .select("metrc_id,storage_path").range(offset, offset + limit - 1);
    const bad: string[] = [];
    const got: Record<string, number> = { metrc_batch_id: 0, metrc_sample_id: 0,
      metrc_source_id: 0, manifest_on_coa: 0, lab_report_id: 0, report_date: 0,
      client_license: 0 };
    let ok = 0, overlong = 0;

    await pooled(todo ?? [], POOL, async (d: { metrc_id: number; storage_path: string }) => {
      try {
        const r = parseCoa(await readPdf(d.storage_path));
        overlong += (r.identity_overlong as number) ?? 0;

        /* ONLY WHAT WAS FOUND. A null is omitted, never sent - it is the
           difference between "I did not find it" and "it is not there", and
           only the second one destroys a stored value. This is the v5 fix. */
        const patch: Record<string, unknown> = { document_id: String(d.metrc_id) };
        for (const k of Object.keys(got)) {
          const v = r[k];
          if (v !== null && v !== undefined && v !== "") { patch[k] = v; got[k]++; }
        }
        patch.identity_parser_version = IDENTITY_VERSION;
        patch.client_parsed_at = new Date().toISOString();

        await sb.from("coa_extract").upsert(patch, { onConflict: "document_id" });
        ok++;
      } catch (_e) { bad.push(String(d.metrc_id)); }
    });

    report.coa = { considered: (todo ?? []).length, parsed: ok,
                   unreadable: bad.length, got, refused_overlong: overlong };
  }

  return new Response(JSON.stringify(report), { headers: { "Content-Type": "application/json" } });
});
