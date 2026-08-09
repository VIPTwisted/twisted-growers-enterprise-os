// TG Enterprise OS — Apex Trading sync. READ-ONLY.
//
// Owner, 9 Aug 2026: "watch for apex sync ensure all data imports and is handled
// 100% accurately", "we need button to manually only sync Apex too", "DO NOT ABUSE
// CALLS - ALWAYS SETUP FOR FEWEST CALLS SO WE CAN HANDLE THE CHEAPEST WAY
// POSSIBLE", "ALL API MUST BE SECURE ON OUR SITE".
//
// SECURITY. Executive-only, checked against app_users on every request. The key is
// read by service_role and never returned, never logged, and never placed in a URL
// (query strings land in access logs; the Authorization header does not). Raw
// payloads land in apex_raw, which no browser role can read.
//
// READ-ONLY, DELIBERATELY. The key carries create:shipping-orders, which can create
// a real commercial order against a real licensed buyer. Nothing here issues
// anything but GET. Writes arrive later behind f_ai_may, approved by a person each
// time, never as a side effect of a sync.
//
// COST. Apex bills by credit, and /v1/usage counts top_level_resources_returned AND
// billable_nested_resource_count - so the bill is driven by ROWS RETURNED, not by
// request count. Re-pulling 4,000 unchanged orders costs the same as pulling them
// the first time. That makes deltas the whole game. Four controls, all DATA in
// apex_entity rather than code, because a cost control that needs a deploy to tune
// never gets tuned:
//   min_interval_minutes  do not re-pull inside the window (taxonomy weekly)
//   nesting               opt-in per entity; every nested resource is billable
//   supports_delta        updated_at_from, from Apex's own spec
//   required              reference data excluded from a normal run
// Plus a budget guard that refuses to run past 90% of the monthly credit limit.
//
// RAW FIRST. Payloads are stored exactly as returned. We have never seen Apex's real
// traffic, and a mapping written before you have silently discards every field you
// failed to anticipate - which is precisely what integration-settings did to
// unrecognised secret names until this morning. Re-mapping from apex_raw is free;
// re-pulling costs money.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/* Verified from Apex's own OpenAPI document, committed at
   docs/apex/apex-openapi-3.1.json. A DEFAULT rather than a constant so a moved host
   needs no deploy - but it no longer has to be typed in before the first sync can
   run, which is where the owner got stuck. */
const DEFAULT_BASE = "https://app.apextrading.com/api";

/* No published rate limit in the spec, so this is gentle rather than tuned: a pause
   between calls and a hard stop on the first 429. Guessing a limit and hammering it
   is how an integration gets its key revoked. */
const PAUSE_MS = 250;
const PER_PAGE = 200;
const MAX_PAGES = 60;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callerIsExecutive(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return false;
  const { data } = await supa.auth.getUser(token);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: row } = await supa.from("app_users").select("role").eq("user_id", uid).single();
  return row?.role === "owner" || row?.role === "executive";
}

async function secret(name: string): Promise<string | null> {
  const { data } = await supa.from("integration_secrets").select("value").eq("name", name).maybeSingle();
  const v = (data?.value ?? "").trim();
  return v === "" ? null : v;
}

type Entity = {
  entity: string; endpoint: string; api_version: string; root_key: string | null;
  kind: string; required: boolean; supports_delta: boolean; supports_paging: boolean;
  min_interval_minutes: number; nesting: Record<string, string> | null;
};

async function apexGet(base: string, key: string, path: string, params: Record<string, string>) {
  const url = new URL(base.replace(/\/+$/, "") + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${key}`,
      /* REQUIRED by Apex on every request. Omitting it does not fail loudly - it can
         return HTML, which then parses as "no rows". */
      Accept: "application/json",
    },
  });
}

/* Pull one entity. Records a row in apex_sync_run either way, because a failure that
   leaves no trace is how a source goes quiet for seven hours while every dashboard
   stays green. */
async function pullEntity(base: string, key: string, e: Entity, runId: string): Promise<string> {
  const started = new Date().toISOString();
  const { data: wmRow } = await supa.from("apex_watermark").select("*").eq("entity", e.entity).maybeSingle();
  const watermarkBefore: string | null = wmRow?.updated_at_from ?? null;

  const logRun = async (patch: Record<string, unknown>) => {
    await supa.from("apex_sync_run").insert({
      run_id: runId, entity: e.entity, started_at: started, finished_at: new Date().toISOString(),
      watermark_before: watermarkBefore, ...patch,
    });
  };

  const path = `/${e.api_version}${e.endpoint}`;
  const rows: Record<string, unknown>[] = [];
  let page = 1;
  let httpStatus = 0;

  try {
    for (;;) {
      const params: Record<string, string> = { ...(e.nesting ?? {}) };
      if (e.supports_paging) { params.per_page = String(PER_PAGE); params.page = String(page); }
      /* FIRST RUN PULLS EVERYTHING. Apex's guidance is to start from the date the
         company joined; we have no such date, so an absent watermark means no
         updated_at_from at all - a full pull, once, deliberately. */
      if (e.supports_delta && watermarkBefore) params.updated_at_from = watermarkBefore;

      const r = await apexGet(base, key, path, params);
      httpStatus = r.status;

      if (r.status === 429) {
        await logRun({ status: "throttled", http_status: 429, rows_seen: rows.length, rows_written: 0,
          error: "Apex returned 429. Stopped this entity rather than retrying into a rate limit." });
        return `THROTTLED after ${rows.length} row(s) — stopped deliberately`;
      }
      if (!r.ok) {
        const body = (await r.text()).slice(0, 300);
        await logRun({ status: "error", http_status: r.status, rows_seen: rows.length, rows_written: 0,
          error: `HTTP ${r.status}: ${body}` });
        /* 403 means the SCOPE is missing, not that the data is absent. Absence and
           no-access are not the same thing, and conflating them invented a blind
           spot on this platform once already. */
        return r.status === 403
          ? `ERROR 403 — the key lacks the scope for this entity. That is NOT the same as "no data".`
          : `ERROR ${r.status}: ${body.slice(0, 120)}`;
      }

      const body = await r.json();
      const rk = e.root_key ?? "data";
      const chunk = body?.[rk];
      if (chunk === undefined) {
        await logRun({ status: "error", http_status: r.status, rows_seen: rows.length, rows_written: 0,
          error: `Root key "${rk}" absent. Keys present: ${Object.keys(body ?? {}).join(", ")}` });
        return `ERROR — expected root key "${rk}", got [${Object.keys(body ?? {}).join(", ")}]. The registry is wrong, not the data.`;
      }
      const list = Array.isArray(chunk) ? chunk : [chunk];
      rows.push(...(list as Record<string, unknown>[]));

      if (!e.supports_paging || list.length < PER_PAGE || page >= MAX_PAGES) break;
      page++;
      await sleep(PAUSE_MS);
    }

    /* DEDUPE BY CONTENT, computed by POSTGRES. A delta pull returns a row because
       its updated_at moved, which is not the same as its content changing.
       payload_hash is md5(payload::text) generated in the table, and Postgres
       renders jsonb with its own key ordering, so a hash computed here would never
       match. The unique index on (entity, apex_id, payload_hash) does the comparison
       instead: an unchanged payload is dropped, a genuinely changed one lands as a
       new row, and apex_raw keeps full history without duplicating noise.

       Blocks of 500 because a single 12,000-row insert is one failure away from
       losing the entity; a block loses one block and says which. */
    let written = 0;
    const BLOCK = 500;
    for (let i = 0; i < rows.length; i += BLOCK) {
      const slice = rows.slice(i, i + BLOCK).map((o) => ({
        entity: e.entity, apex_id: o?.id != null ? String(o.id) : null, payload: o, run_id: runId,
      }));
      const { data: ins, error } = await supa.from("apex_raw")
        .upsert(slice, { onConflict: "entity,apex_id,payload_hash", ignoreDuplicates: true })
        .select("id");
      if (error) {
        await logRun({ status: "error", http_status: httpStatus, rows_seen: rows.length, rows_written: written,
          error: `Insert failed at row ${i}: ${error.message}` });
        return `ERROR — fetched ${rows.length} but only stored ${written}: ${error.message.slice(0, 120)}`;
      }
      written += (ins ?? []).length;
    }

    /* THE WATERMARK ADVANCES ONLY HERE, ON SUCCESS. Advancing it on a failed pull
       leaves a hole no later run will ever revisit and nothing downstream can see. */
    const now = new Date().toISOString();
    await supa.from("apex_watermark").upsert({
      entity: e.entity,
      updated_at_from: e.supports_delta ? now : null,
      last_success_at: now, last_attempt_at: now, consecutive_errors: 0,
    });
    await logRun({ status: "ok", http_status: httpStatus, rows_seen: rows.length,
      rows_written: written, watermark_after: e.supports_delta ? now : null });

    if (rows.length === 0) {
      return watermarkBefore
        ? "0 new (delta — nothing changed since the last successful pull)"
        : "0 rows — and this was a FULL pull, so the entity is genuinely empty at Apex";
    }
    return written === rows.length
      ? `${written} row(s) over ${page} page(s)`
      : `${written} new of ${rows.length} returned (${rows.length - written} unchanged since last pull)`;
  } catch (err) {
    await supa.from("apex_watermark").upsert({
      entity: e.entity, last_attempt_at: new Date().toISOString(),
      consecutive_errors: (wmRow?.consecutive_errors ?? 0) + 1,
    });
    await logRun({ status: "error", http_status: httpStatus, rows_seen: rows.length, rows_written: 0,
      error: String(err).slice(0, 400) });
    return `ERROR ${String(err).slice(0, 140)}`;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await callerIsExecutive(req))) return json({ ok: false, error: "Executive access required." }, 403);

  const key = await secret("APEX_API_KEY");
  if (!key) {
    return json({ ok: false,
      error: "No Apex API key stored. Integrations → Apex → API key, then run this again." }, 400);
  }
  const base = (await secret("APEX_API_BASE")) ?? DEFAULT_BASE;

  /* /v1/welcome FIRST, ALWAYS. It proves the key works and reports what it may reach
     without touching a single record - one call, and the cheapest possible way to
     tell a bad key from an empty account. Reporting an entity as empty when the key
     was simply rejected is the exact mistake this platform already made once, on a
     table holding 3,675 rows. */
  const w = await apexGet(base, key, "/v1/welcome", {});
  if (!w.ok) {
    const body = (await w.text()).slice(0, 300);
    return json({ ok: false, base,
      error: w.status === 401
        ? "Apex rejected the key (401). It is stored, but it is not valid for this base URL."
        : `Apex /welcome returned ${w.status}: ${body}` }, 200);
  }
  const welcome = await w.json();

  const results: Record<string, string> = {
    _welcome: `${welcome?.name ?? "?"} · api ${welcome?.["api-version"] ?? "?"} · access: ${welcome?.access ?? "?"}`,
    _base: base,
  };

  let creditsBefore: number | null = null;
  let usageLimit: number | null = null;
  try {
    const u = await apexGet(base, key, "/v1/usage", {});
    if (u.ok) {
      const d = (await u.json())?.data ?? {};
      creditsBefore = d.credits_used ?? null;
      usageLimit = d.monthly_credit_limit ?? null;
    }
  } catch { /* usage is diagnostics; never let it stop a sync */ }

  const url = new URL(req.url);
  const only = url.searchParams.get("entity");
  const force = url.searchParams.get("force") === "1";

  /* BUDGET GUARD. At 90% of the monthly limit this refuses to run. A sync that
     quietly takes the account past its ceiling is worse than one that stops and says
     so. Overridable with force=1 - by a person making a decision, never by a
     schedule. */
  if (creditsBefore != null && usageLimit && !force) {
    const pct = creditsBefore / usageLimit;
    if (pct >= 0.9) {
      return json({ ok: false, base, results,
        error: `STOPPED: ${creditsBefore} of ${usageLimit} monthly Apex credits already used (${Math.round(pct * 100)}%). `
             + `Nothing was pulled. Re-run with force=1 only if spending past the ceiling is a deliberate decision.` }, 200);
    }
  }

  let q = supa.from("apex_entity").select("*").order("kind").order("entity");
  if (only) q = q.eq("entity", only);
  else q = q.eq("required", true);
  const { data: entities } = await q;

  const runId = crypto.randomUUID();
  let total = 0;
  let skipped = 0;

  /* One query for every watermark rather than one per entity inside the loop. Not an
     Apex cost, but the same bad habit, and it is what made the desktop bridge slow. */
  const { data: wms } = await supa.from("apex_watermark").select("entity, last_success_at");
  const lastSuccess = new Map((wms ?? []).map((x) => [x.entity, x.last_success_at]));

  for (const e of (entities ?? []) as Entity[]) {
    if (e.entity === "usage") continue;              // read separately, above and below

    /* SKIP IF FRESH - the main cost control, and it must be VISIBLE. A run that
       silently skips reads exactly like a run that found nothing, which is the shape
       of every silent failure this platform has been bitten by. */
    const last = lastSuccess.get(e.entity);
    if (!force && last) {
      const ageMin = (Date.now() - new Date(last as string).getTime()) / 60000;
      if (ageMin < e.min_interval_minutes) {
        results[e.entity] = `skipped — pulled ${Math.round(ageMin)} min ago, interval is ${e.min_interval_minutes} min (no credits spent)`;
        skipped++;
        continue;
      }
    }

    const out = await pullEntity(base, key, e, runId);
    results[e.entity] = out;
    const m = out.match(/^(\d+) /);
    if (m) total += Number(m[1]);
    await sleep(PAUSE_MS);
  }
  if (skipped) results._skipped = `${skipped} entit${skipped === 1 ? "y" : "ies"} still inside its refresh window — deliberately not called.`;

  try {
    const u = await apexGet(base, key, "/v1/usage", {});
    if (u.ok) {
      const d = (await u.json())?.data ?? {};
      const spent = creditsBefore != null && d.credits_used != null ? d.credits_used - creditsBefore : null;
      results._credits = `${d.credits_used ?? "?"} of ${d.monthly_credit_limit ?? "?"} credits used this month`
        + (spent != null ? ` · this run cost ${spent}` : "")
        + (d.throttled_request_count ? ` · ${d.throttled_request_count} throttled` : "");
    }
  } catch { /* diagnostics only */ }

  const failed = Object.entries(results).filter(([k, v]) => !k.startsWith("_") && /^ERROR|^THROTTLED/.test(v));
  return json({ ok: failed.length === 0, run_id: runId, total, results });
});
