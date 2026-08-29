// TG Enterprise OS — Apex Trading sync. READ-ONLY.
//
// Owner, 9 Aug 2026: "watch for apex sync ensure all data imports and is handled
// 100% accurately", "we need button to manually only sync Apex too", "DO NOT ABUSE
// CALLS - ALWAYS SETUP FOR FEWEST CALLS SO WE CAN HANDLE THE CHEAPEST WAY
// POSSIBLE", "ALL API MUST BE SECURE ON OUR SITE".
//
// v6, 29 Aug 2026: one change and nothing else. callerIsExecutive now also accepts a
// valid x-admin-key, the pattern metrc-sync has had since v20, so tg_apex_sync_now can
// drive this from the database instead of every server-side call being a 403. The key
// is looked up from integration_secrets at call time, never baked in, and it fails
// closed. Nothing else moves: not the entity list, not the cursor discipline, not the
// credit accounting, not the person path. See callerIsExecutive for the full reasoning.
//
// SECURITY. Executive-only, checked against app_users on every request - or the shared
// admin key, held only by the database dispatcher. The key is
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
/* Apex publishes 15 requests/second and sends Retry-After. Three attempts honouring their
   own header is enough to ride out a burst; more than that is not a rate limit, it is a
   queue we should not be forming. */
const MAX_RATE_RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* v6, 29 Aug 2026: THE ADMIN KEY IS ACCEPTED, SO THE DATABASE CAN DRIVE THIS.
   Pattern copied from metrc-sync, which has had it since v20.

   Until now this function authenticated a PERSON and nothing else: a bearer token
   resolved through supa.auth.getUser() to an app_users row with role owner or
   executive. That is why nothing has ever driven it from Postgres - measured, no
   function in the database mentioned apex-sync and nothing scheduled it. A dispatch
   from tg_apex_fire carries the anon key as its bearer, which satisfies the Supabase
   gateway and then resolves to NO USER here, so every server-side call was a 403.

   The key is LOOKED UP, never baked in, and it fails CLOSED: an absent header is
   rejected before the lookup, and a missing or empty secret leaves `real` empty so the
   comparison can never succeed. A vanished secret locks the door rather than opening
   it - which is also what makes the key rotatable with a row edit and no redeploy.

   This does NOT widen who may pull Apex. It adds one caller that already holds the
   shared admin secret, and tg_apex_sync_now is the only thing that sends it: that
   function carries the owner/executive/backend gate, the never-succeeded refusal, and
   the credit throttle. The person path below is untouched. */
async function callerIsExecutive(req: Request): Promise<boolean> {
  const presented = req.headers.get("x-admin-key");
  if (presented) {
    const real = await secret("TG_ADMIN_KEY");
    if (real && presented === real) return true;
  }
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
/* Apex REQUIRES updated_at_from on delta-capable endpoints. Their docs say "some API
   endpoints require an updated_at_from field to be set", and I read "require" as
   "support" - so the first run sent no cursor at all and five entities came back
   HTTP 422 "The updated at from field is required", including shipping-orders, which
   is the entire revenue picture. Ten entities succeeded, which made the failure look
   like a partial success rather than a wrong assumption.

   Their guidance is to call it from the date the company joined Apex. That date is in
   the company payload we already hold - Twisted Growers joined 2023-11-30 - so the
   seed is read from our own data rather than hard-coded. The constant below is only a
   floor for the case where company has not been pulled yet; it predates the company's
   existence, so it can never skip real history. */
const APEX_EPOCH = "2020-01-01T00:00:00Z";

async function firstRunCursor(): Promise<string> {
  const { data } = await supa.from("apex_raw").select("payload")
    .eq("entity", "company").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
  const joined = (data?.payload as Record<string, unknown> | undefined)?.created_at;
  return typeof joined === "string" && joined ? joined : APEX_EPOCH;
}

/* Has this entity EVER returned a row, on any run in its history? A zero-row answer
   from an entity that has never once produced data is not evidence the entity is
   empty -- it is equally consistent with asking the wrong question, which is exactly
   what happened to receiving-orders and deal-docs. RECOVERED FROM PRODUCTION v4. */
async function entityHasEverReturnedRows(entity: string): Promise<boolean> {
  const { count } = await supa.from("apex_raw")
    .select("id", { count: "exact", head: true }).eq("entity", entity);
  return (count ?? 0) > 0;
}

async function pullEntity(base: string, key: string, e: Entity, runId: string, seed: string): Promise<string> {
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
  let rateRetries = 0;
  let truncated = false;
  /* Apex returns its own pagination metadata. Completeness is read from THAT rather than
     inferred from a short last page - see the shortfall test below. */
  let meta: { total?: number; last_page?: number; current_page?: number } | null = null;

  try {
    for (;;) {
      const params: Record<string, string> = { ...(e.nesting ?? {}) };
      if (e.supports_paging) { params.per_page = String(PER_PAGE); params.page = String(page); }
      /* ALWAYS SEND IT ON A DELTA ENTITY. Apex REQUIRES updated_at_from here - it is
         not an optimisation. Omitting it returns 422, not a full pull. On a first run
         the cursor is the date the company joined Apex, per their own guidance. */
      if (e.supports_delta) params.updated_at_from = watermarkBefore ?? seed;

      const r = await apexGet(base, key, path, params);
      httpStatus = r.status;

      /* 429 MEANS TWO COMPLETELY DIFFERENT THINGS AND THEY NEED OPPOSITE RESPONSES.
         Apex's own documentation: 15 requests/second per token returns 429 with a
         Retry-After, and SEPARATELY "if your spending cap is $0, requests that would
         exceed your free allowance are rejected with a 429 response".

         The first clears in one second. The second does not clear until the month rolls
         over or somebody raises the cap. Reporting both as "throttled, stopped
         deliberately" tells an operator to wait when they need to go and change a
         setting - a wrong label, which costs more than no label because the next person
         waits too. Distinguish them by the body, and honour Retry-After when it is
         genuinely a rate limit. */
      if (r.status === 429) {
        const body = (await r.text()).slice(0, 300);
        const isRateLimit = /rate limit/i.test(body) || r.headers.has("retry-after");
        const retryAfter = Number(r.headers.get("retry-after") ?? 0);

        if (isRateLimit && rateRetries < MAX_RATE_RETRIES) {
          rateRetries++;
          /* Their header is in seconds and they say to respect it. A fixed guess here
             would be the same mistake as guessing the limit in the first place. */
          await sleep(Math.max(retryAfter * 1000, PAUSE_MS * 4));
          continue;                       // same page, after the wait they asked for
        }
        const spendingCap = !isRateLimit;
        await logRun({ status: "throttled", http_status: 429, rows_seen: rows.length, rows_written: 0,
          error: spendingCap
            ? `HTTP 429 with no rate-limit signal: this is the CREDIT ALLOWANCE or SPENDING CAP, `
              + `not request rate. Waiting will not clear it. Raise the spending cap in Apex `
              + `account settings or wait for the monthly allowance to reset. Body: ${body}`
            : `HTTP 429 rate limit, still refused after ${rateRetries} retries honouring `
              + `Retry-After. Body: ${body}` });
        return spendingCap
          ? `STOPPED — Apex credit allowance or spending cap reached. This does NOT clear by waiting.`
          : `THROTTLED after ${rows.length} row(s) — rate limited past ${rateRetries} retries`;
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
      meta = (body?.meta ?? null) as typeof meta;

      if (!e.supports_paging || list.length < PER_PAGE) break;

      /* A SILENT CAP READS EXACTLY LIKE A SMALL DATASET. The loop used to stop at
         MAX_PAGES and report "ok" with whatever it had - 12,000 rows presented as the
         whole entity, with nothing anywhere saying otherwise. Apex tells us how many
         records exist; refuse rather than truncate, and say what was left behind. */
      if (page >= MAX_PAGES) { truncated = true; break; }
      page++;
      await sleep(PAUSE_MS);
    }

    /* COMPLETENESS PROVED BY APEX'S OWN COUNT, not inferred from a short final page.
       "The last page was short" is an assumption; meta.total is the server's answer to
       "how many are there".

       WHEN THEY DISAGREE, STORE THE ROWS AND HOLD THE WATERMARK. My first version threw the
       rows away, which is wrong twice over: the fetch is already paid for in credits, and
       apex_raw dedupes on (entity, apex_id, payload_hash) so keeping them costs nothing and
       loses nothing. What must NOT happen is the cursor moving past records we never saw.
       Holding the watermark makes the next run re-fetch the identical window - the pull
       retries itself, and the run row says plainly that it was short. */
    const shortfall = (meta?.total != null && rows.length !== meta.total)
      ? `Apex's own meta.total says ${meta.total}, we hold ${rows.length}`
      : truncated ? `hit the ${MAX_PAGES}-page ceiling at ${rows.length} rows` : null;

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
       leaves a hole no later run will ever revisit and nothing downstream can see.

       AND IT ADVANCES TO WHEN THE PULL STARTED, NOT WHEN IT FINISHED. This was a real
       hole in the success path, the mirror of the one guarded above. Apex evaluates the
       query at the moment the first page is requested; shipping-orders then took 69.3
       seconds to page through. Setting the cursor to the FINISH time means any record
       whose updated_at fell inside that window - after Apex snapshotted, before we
       finished - is never asked for again. Not late. Gone.

       Overlapping instead is free: apex_raw dedupes on (entity, apex_id, payload_hash),
       so a row re-fetched unchanged is dropped by the unique index rather than stored
       twice. The only cost of overlap is a few credits. The cost of a gap is a missing
       order nobody can find, and nothing downstream can detect it. */
    const now = new Date().toISOString();

    /* A SHORT PULL KEEPS ITS ROWS AND LOSES ITS CURSOR. The rows are already stored above.
       Leaving updated_at_from untouched means the next run asks for the same window again,
       so the gap closes itself instead of becoming permanent. last_attempt_at still moves,
       because the attempt did happen and the sentinel needs to see it. */
    if (shortfall) {
      await supa.from("apex_watermark").upsert({
        entity: e.entity, last_attempt_at: now,
        consecutive_errors: (wmRow?.consecutive_errors ?? 0) + 1,
      });
      await logRun({ status: "error", http_status: httpStatus, rows_seen: rows.length,
        rows_written: written,
        error: `INCOMPLETE PULL — ${shortfall}. The ${written} row(s) fetched WERE stored `
             + `(apex_raw dedupes, so keeping them is free), but the watermark was deliberately `
             + `NOT advanced, so the next run re-fetches this exact window rather than skipping `
             + `past records nobody has seen.` });
      return `INCOMPLETE — ${shortfall}; ${written} stored, watermark held for retry.`;
    }

    /* A ZERO-ROW FIRST PULL IS NOT PROOF OF AN EMPTY ENTITY and must not move the
       cursor past a window it never read. receiving-orders and deal-docs returned 0
       rows in ~200ms, were logged ok, and had their cursor advanced to that moment --
       making the whole history permanently unreachable behind a green status.
       Holding on a genuinely empty entity costs one cheap repeated call; advancing
       past an unread window costs the history.

       RECOVERED FROM PRODUCTION 11 Aug 2026. This guard was deployed as apex-sync v4
       and existed ONLY in the deployment -- the repo copy still advanced the cursor
       unconditionally. Deploying the repo source would have deleted it and silently
       reintroduced the bug it fixes. */
    const provenNonEmpty = rows.length > 0 || await entityHasEverReturnedRows(e.entity);
    const holdCursor = e.supports_delta && !provenNonEmpty;
    const nextCursor = e.supports_delta ? (holdCursor ? (watermarkBefore ?? seed) : started) : null;

    await supa.from("apex_watermark").upsert({
      entity: e.entity,
      updated_at_from: nextCursor,
      last_success_at: now, last_attempt_at: now, consecutive_errors: 0,
    });
    await logRun({ status: "ok", http_status: httpStatus, rows_seen: rows.length,
      rows_written: written, watermark_after: nextCursor,
      error: holdCursor
        ? `ZERO ROWS AND THIS ENTITY HAS NEVER RETURNED ONE. Cursor deliberately HELD at `
        + `${watermarkBefore ?? seed} rather than advanced, so the next run re-asks the same `
        + `full window.`
        : null });

    if (rows.length === 0) {
      if (holdCursor) {
        return `0 rows — and this entity has NEVER returned one. Cursor HELD at ${watermarkBefore ?? seed}. `
             + `Verify with apex-probe before believing it is empty.`;
      }
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

  /* Cumulative credits used this month. Reading it between entities turns the difference
     into that entity's exact cost - measured, not modelled from the published rate card. */
  async function readCredits(): Promise<number | null> {
    try {
      const u = await apexGet(base, key, "/v1/usage", {});
      if (!u.ok) return null;
      const d = (await u.json())?.data ?? {};
      usageLimit = d.monthly_credit_limit ?? usageLimit;
      return typeof d.credits_used === "number" ? d.credits_used : null;
    } catch { return null; }   /* diagnostics must never stop a sync */
  }

  creditsBefore = await readCredits();
  let creditsCursor: number | null = creditsBefore;   // moves as each entity is billed

  const url = new URL(req.url);
  const only = url.searchParams.get("entity");
  const force = url.searchParams.get("force") === "1";

  /* ── ?probe=metrc ──────────────────────────────────────────────────────────────
     DOES APEX RETURN ITS METRC DATA, AND DOES IT DO SO FOR THIS ACCOUNT?

     The owner's position is that Apex pulls from Metrc and builds the manifests there, so
     the two cannot fail to balance. Measured against what we hold, they do not: on 1,739
     orders and 13,135 lines, metrc_package_label appears 8 times and manifest_number never.

     The reason is in the contract, not the data. ProductResource declares metrc_tags and
     metrc_lab_results, ShippingOrderResource declares metrc_transfer_template - and the KEYS
     ARE ABSENT from every payload we hold, not present-and-empty. Absent means never asked
     for: Apex omits them from list endpoints, and with_metrc exists ONLY on the singular
     /v1/products/{id}, which this connector has never called.

     So this probe asks. Two calls, roughly 8 credits, ONE record each, and it STORES NOTHING.
     Proving the field populates before spending credits on 483 products is the difference
     between a measurement and an assumption - and this whole thread has already cost the
     owner three confident wrong answers built on the second.

     It reports KEY NAMES AND COUNTS ONLY. A shipping order carries buyer contact details and
     pricing; echoing a payload into an HTTP response to satisfy curiosity is how business data
     ends up somewhere it was never meant to be. */
  if (url.searchParams.get("probe") === "metrc") {
    const probe: Record<string, unknown> = {};

    const { data: prod } = await supa.from("apex_raw").select("apex_id")
      .eq("entity", "products").not("apex_id", "is", null).limit(1).maybeSingle();
    const { data: ord } = await supa.from("apex_raw").select("apex_id")
      .eq("entity", "shipping-orders").not("apex_id", "is", null).limit(1).maybeSingle();

    /* Report the shape, never the contents. present=false and absent-from-payload are
       different findings and the caller must be able to tell them apart. */
    const shape = (o: Record<string, unknown> | null, keys: string[]) => {
      if (!o) return { reachable: false };
      const out: Record<string, unknown> = { top_level_keys: Object.keys(o).length };
      for (const k of keys) {
        const v = (o as Record<string, unknown>)[k];
        out[k] = !(k in o) ? "KEY ABSENT — not returned at all"
               : v == null ? "present but null"
               : Array.isArray(v) ? `array of ${v.length}`
               : typeof v === "object" ? `object with keys: ${Object.keys(v as object).join(", ")}`
               : "present";
      }
      return out;
    };

    if (prod?.apex_id) {
      const r = await apexGet(base, key, `/v1/products/${prod.apex_id}`, { with_metrc: "true" });
      const body = r.ok ? await r.json() : null;
      const row = body?.data ?? body?.product ?? body;
      probe["products/{id}?with_metrc=true"] = r.ok
        ? shape(row, ["metrc_tags", "metrc_lab_results", "batches", "id", "name"])
        : `HTTP ${r.status}`;
    } else probe["products/{id}?with_metrc=true"] = "no product id in apex_raw to probe with";

    if (ord?.apex_id) {
      const r = await apexGet(base, key, `/v1/shipping-orders/${ord.apex_id}`, {});
      const body = r.ok ? await r.json() : null;
      const row = body?.data ?? body?.order ?? body;
      probe["shipping-orders/{id}"] = r.ok
        ? shape(row, ["metrc_transfer_template", "manifest_number", "invoice_number", "items"])
        : `HTTP ${r.status}`;
    } else probe["shipping-orders/{id}"] = "no order id in apex_raw to probe with";

    const after = await readCredits();
    return json({ ok: true, probe, base,
      credits_spent: creditsBefore != null && after != null ? after - creditsBefore : null,
      note: "Nothing was stored. KEY ABSENT means Apex does not return the field on this "
          + "endpoint for this account; 'present but null' means it returns it and it is empty. "
          + "Those two need completely different responses and must not be confused." }, 200);
  }

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
  const seed = await firstRunCursor();     // one read, reused by every entity
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

    const out = await pullEntity(base, key, e, runId, seed);
    results[e.entity] = out;
    const m = out.match(/^(\d+) /);
    if (m) total += Number(m[1]);

    /* PER-ENTITY COST, MEASURED. apex_sync_run.credits_used has existed since the table
       was created and nothing has ever written to it, so all four cost controls -
       min_interval_minutes, nesting, supports_delta, required - have been tuned against
       no feedback at all. You cannot manage what you do not measure.

       One extra /v1/usage read per entity, and the delta from the previous reading IS
       that entity's cost. It bills ~2 credits a call against a 100,000 monthly
       allowance, which is a rounding error next to knowing that available-inventory
       costs 3 per item and net-terms costs 3 in total. */
    const after = await readCredits();
    if (creditsCursor != null && after != null) {
      await supa.from("apex_sync_run")
        .update({ credits_used: after - creditsCursor })
        .eq("run_id", runId).eq("entity", e.entity);
    }
    if (after != null) creditsCursor = after;

    await sleep(PAUSE_MS);
  }
  if (skipped) results._skipped = `${skipped} entit${skipped === 1 ? "y" : "ies"} still inside its refresh window — deliberately not called.`;

  {
    const spent = creditsBefore != null && creditsCursor != null ? creditsCursor - creditsBefore : null;
    results._credits = `${creditsCursor ?? "?"} of ${usageLimit ?? "?"} credits used this month`
      + (spent != null ? ` · this run cost ${spent}` : "")
      + ` · per-entity cost recorded on apex_sync_run.credits_used`;
  }

  /* EVERY NON-SUCCESS PREFIX MUST BE LISTED HERE. This regex decides the `ok` flag the
     caller and the run panel believe. Two new outcomes were added above - INCOMPLETE (rows
     kept, watermark held) and STOPPED (credit allowance, which waiting will not clear) - and
     an outcome that is not matched here reports ok:true while the entity is short. That is
     the precise shape of a silent failure: a real problem wearing a green badge. */
  const NOT_OK = /^(ERROR|THROTTLED|INCOMPLETE|STOPPED)\b/;
  const failed = Object.entries(results).filter(([k, v]) => !k.startsWith("_") && NOT_OK.test(v));
  return json({ ok: failed.length === 0, run_id: runId, total, results });
});
