// TG Enterprise OS — Metrc sync worker v22.
//
// v22, 28 August 2026: one change and nothing else. Rows are upserted in BATCHES
// of 500 instead of one awaited round trip per row, and the soft deadline is
// checked between batches. Full reasoning and the measurements sit on writeRows
// below; the short version is that the per-row write loop ran at ~16 rows/sec,
// the plants delta needs 2,156 rows, and 2,156 at 16/sec cannot fit inside a
// 110-second deadline - so the cursor was correctly held and the same 1,054 rows
// came back 22 times in a row. Cursor discipline is UNCHANGED. Paging, the page
// size, the deadline value, capability filtering and the auth path are all
// untouched.
//
// v21, 14 August 2026: one change and nothing else. PAGE_SIZE_MAX drops from 500 to
// 20, because 20 is Metrc's actual ceiling, measured rather than assumed - a request
// for 250 returned HTTP 400 "pageSize must be a positive number between 1 and 20."
// on all four plant sub-states (run 3148). The clamp now cannot admit a value that
// breaks every plant sync. See note 2 below: the 20 that was hardcoded for so long
// was never a lazy default, and no amount of paging wider will speed a full sweep.
//
// v20 = v19 plus exactly three changes, 14 August 2026. Everything v19 proved stays
// exactly as it was: the soft deadline, the beforeunload backstop, metrc_history_start
// from config, the "(full sweep)" run labels and _elapsed_ms are all untouched.
//
//   1. THE ADMIN KEY IS NO LONGER IN SOURCE, AND THAT IS THE POINT OF THIS RELEASE.
//      v19 compared the x-admin-key header against a literal baked into this file.
//      That made the key impossible to rotate: tg_call_function sends the copy held
//      in integration_secrets, so changing that row would have stopped every
//      scheduled sync within minutes while this function went on comparing against
//      the stale literal. The comparison now reads integration_secrets.TG_ADMIN_KEY
//      at call time, so a rotation is one row edit and no redeploy. It fails CLOSED:
//      a missing or empty row rejects every caller rather than admitting them.
//
//   2. PAGE SIZE IS A CONFIG ROW, READ ONCE PER REQUEST AND PASSED AS A PARAMETER.
//      20 is why a full sweep cannot finish: 55,000 plant records at 20 a page with a
//      200ms pause is over nine minutes of deliberate sleeping before a single byte
//      of network time, against a platform that kills us far sooner. Metrc v2 accepts
//      more. The real ceiling is MEASURED by moving configurations.metrc_page_size and
//      watching a run - it is not guessed here, and the default stays at the value
//      that demonstrably works. Deliberately NOT module state: an isolate is reused
//      between invocations, so a mutated module-level binding would survive into the
//      next request and leave a deleted or invalid config row still running at the
//      last raised value instead of falling back.
//
//   3. THE CURSOR ONLY MOVES ON A GENUINELY COMPLETE RUN. v19 advanced on !ranOut
//      alone, so a sub-state that ERRORED still moved the watermark past its records.
//      A delta returns what changed SINCE the cursor, and those records changed
//      before it - not late, gone. Truncation lost data the same way. Advancing now
//      requires every sub-state answered AND nothing capped AND the deadline not hit.
//      Re-asking for a window costs one API call. Skipping one costs the data.
//
// ---- v19 history, unchanged and still true ----
//
// v19 = v17 restored, byte-for-byte in logic.
//
// v18 was ROLLED BACK on 8 August 2026 and v19 is v17 put back unchanged.
//   v18 added a resume cursor so a stopped sweep would continue from the page it
//   reached. It was deployed and NOT verified before being reported as working.
//   The first run then stayed open 183 seconds against a 110-second deadline with
//   records = 0 and no progress saved: both the soft deadline AND the beforeunload
//   backstop failed, the two defences v17 had proven. No data was harmed - packages
//   held steady at 4,259 and the mirror guard stayed green - but a change that
//   leaves runs open is worse than the honest limitation it replaced.
//   The cause is unproven. Suspected: the deadline can only be checked BETWEEN
//   pages, so it cannot interrupt an in-flight request, and v18 added an async
//   write inside runSpec that may not survive being killed. Not confirmed.
//
//   KNOWN LIMITATION, stated honestly rather than papered over: a partial sweep
//   does NOT resume. Each run re-walks from page 1. "Run again to continue" makes
//   progress only because later runs get further before the deadline. Fixing that
//   properly is a tracked task, not an untested edit.
//
// v17: a run always closes its own record. Measured: a full sweep of the cultivation
//   licence finished in 105s while the manufacturing licence sat "running" at 1,255s
//   with 677 packages
//   already written - the work succeeded, the record never closed, because the
//   platform killed the function mid-loop. A run stuck in "running" is invisible to
//   every "did it fail?" check. Two defences, both observed working: a soft deadline
//   that stops and closes as "partial" (fired at 138s), and a beforeunload backstop
//   for when we are killed anyway (fired at 111s).
//
// v16: a FULL sweep states its own window. Sending no lastModified range does NOT
//   mean everything - Metrc applies a narrow recent default, so /packages/v2/active
//   returned 60 records across both licences while a 2024-to-now window returned
//   553. Closing that recovered 677 packages.
//   NOTE: /packages/v2/{label} fetches one package by tag and is proven to work.
//   That is the fallback for any gap, whatever its cause, and needs no window.
//
// v15: ?license= is honoured, and every licence/endpoint pair is checked against
//   metrc_endpoint_capability before a request is made.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const csv = (v: string | undefined | null) => (v ?? "").split(",").map(s => s.trim()).filter(Boolean);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FALLBACK_PAGE_SIZE = 20;
const PAGE_SIZE_MIN = 20;
/* v21, 14 Aug 2026: MEASURED, not assumed. Metrc v2 answers a request for more than
   20 with HTTP 400 "pageSize must be a positive number between 1 and 20." - observed
   on all four plant sub-states in run 3148. v20 clamped to 500, which let an operator
   set a value that instantly broke every plant sync with only a comment warning them
   off. A warning does not survive contact with a hurried operator; the clamp does. */
const PAGE_SIZE_MAX = 20;
const MAX_PAGES = 750;
const PAGE_PAUSE_MS = 200;
const MAX_429_RETRIES = 3;
const FALLBACK_HISTORY_START = "2023-01-01T00:00:00Z";
const FALLBACK_DEADLINE_MS = 110000;

type Row = Record<string, unknown>;
const d = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);
const now = () => new Date().toISOString();
const basic = (a: string, b: string) => "Basic " + btoa(`${a}:${b}`);

// The run currently open, so the backstop can close it if we are killed.
let OPEN_RUN: { id: number; records: number } | null = null;

addEventListener("beforeunload", () => {
  if (!OPEN_RUN) return;
  supa.from("metrc_sync_runs").update({
    status: "partial", records: OPEN_RUN.records, finished_at: new Date().toISOString(),
    error: "Stopped by the platform before finishing. Rows already written were kept. "
         + "Run again to continue - this is not a data fault.",
  }).eq("id", OPEN_RUN.id).then(() => {});
});

async function loadCfg(): Promise<Record<string, string>> {
  const cfg: Record<string, string> = {};
  const { data } = await supa.from("integration_secrets").select("name, value");
  for (const r of data ?? []) cfg[r.name] = r.value;
  for (const k of ["METRC_STATE", "METRC_ENV", "METRC_LICENSES", "METRC_USER_KEY", "METRC_USER_KEYS", "METRC_VENDOR_KEY", "METRC_VENDOR_KEYS"]) {
    if (!cfg[k] && Deno.env.get(k)) cfg[k] = Deno.env.get(k)!;
  }
  return cfg;
}

async function numberSetting(key: string, fallback: number): Promise<number> {
  const { data } = await supa.from("configurations").select("value").eq("key", key).maybeSingle();
  const v = (data?.value as Record<string, unknown> | undefined);
  const n = Number(v?.ms ?? v?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function historyStart(): Promise<string> {
  const { data } = await supa.from("configurations").select("value").eq("key", "metrc_history_start").maybeSingle();
  const iso = (data?.value as Record<string, unknown> | undefined)?.iso;
  return typeof iso === "string" && iso ? iso : FALLBACK_HISTORY_START;
}

/* v20: read once per request, returned as a value. Accepts either a bare JSON number
   or an object carrying { size } / { pageSize }, so the row can also hold a "why" the
   way metrc_history_start and metrc_sync_soft_deadline_ms already do. Anything absent,
   non-numeric or out of range falls back to the proven default rather than to whatever
   the previous request happened to use. */
async function resolvePageSize(): Promise<number> {
  const { data } = await supa.from("configurations").select("value").eq("key", "metrc_page_size").maybeSingle();
  const v = data?.value as Record<string, unknown> | number | string | undefined | null;
  if (v === undefined || v === null) return FALLBACK_PAGE_SIZE;
  const raw = (typeof v === "object")
    ? ((v as Record<string, unknown>).size ?? (v as Record<string, unknown>).pageSize)
    : v;
  const want = Number(raw);
  if (!Number.isFinite(want)) return FALLBACK_PAGE_SIZE;
  return Math.min(PAGE_SIZE_MAX, Math.max(PAGE_SIZE_MIN, Math.floor(want)));
}

async function loadCapability(): Promise<Record<string, boolean>> {
  const cap: Record<string, boolean> = {};
  const { data } = await supa.from("metrc_endpoint_capability").select("licence, endpoint, allowed");
  for (const r of data ?? []) cap[`${r.licence}:${r.endpoint}`] = r.allowed as boolean;
  return cap;
}
async function loadDenialReasons(): Promise<Record<string, string>> {
  const why: Record<string, string> = {};
  const { data } = await supa.from("metrc_endpoint_capability")
    .select("licence, endpoint, why").eq("allowed", false);
  for (const r of data ?? []) why[`${r.licence}:${r.endpoint}`] = r.why as string;
  return why;
}

async function callerIsExecutive(req: Request): Promise<boolean> {
  /* v20: the admin key is looked up, never baked in. Fails CLOSED - an empty header
     is rejected before the lookup, and a missing or empty row leaves `real` empty so
     the comparison can never succeed. A vanished secret locks the door, it does not
     open it. This is what makes the key rotatable without a redeploy. */
  const presented = req.headers.get("x-admin-key");
  if (presented) {
    const { data: k } = await supa.from("integration_secrets")
      .select("value").eq("name", "TG_ADMIN_KEY").maybeSingle();
    const real = (k?.value as string | undefined) ?? "";
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

async function getCursors(): Promise<Record<string, string>> {
  const { data } = await supa.from("configurations").select("value").eq("key", "metrc_sync_cursors").maybeSingle();
  return (data?.value as Record<string, string>) ?? {};
}
async function saveCursors(c: Record<string, string>): Promise<void> {
  await supa.from("configurations").upsert({ key: "metrc_sync_cursors", value: c, updated_at: now() });
}

async function resolveAuth(base: string, cfg: Record<string, string>):
  Promise<{ auth: string; label: string } | { fail: string[] }> {
  const V = csv(cfg.METRC_VENDOR_KEYS)[0] ?? cfg.METRC_VENDOR_KEY ?? "";
  const U = csv(cfg.METRC_USER_KEYS)[0] ?? cfg.METRC_USER_KEY ?? "";
  const candidates: Array<[string, string]> = [];
  if (V && U && V !== U) candidates.push(["vendor:user", basic(V, U)], ["user:vendor (swapped)", basic(U, V)]);
  if (U) candidates.push(["user alone (username)", basic(U, "")], ["user alone (password)", basic("", U)], ["user doubled", basic(U, U)]);
  if (V && V !== U) candidates.push(["vendor alone (username)", basic(V, "")], ["vendor alone (password)", basic("", V)], ["vendor doubled", basic(V, V)]);
  if (!candidates.length) return { fail: ["no keys stored"] };
  const { data: saved } = await supa.from("configurations").select("value").eq("key", "metrc_auth_arrangement").maybeSingle();
  const savedLabel = (saved?.value as Record<string, unknown>)?.label as string | undefined;
  if (savedLabel) candidates.sort((a, b) => (a[0] === savedLabel ? -1 : b[0] === savedLabel ? 1 : 0));
  const tried: string[] = [];
  for (const [label, header] of candidates) {
    try {
      const res = await fetch(`${base}/unitsofmeasure/v2/active`, { headers: { Authorization: header } });
      if (res.ok) {
        await supa.from("configurations").upsert({ key: "metrc_auth_arrangement", value: { label }, updated_at: now() });
        return { auth: header, label };
      }
      tried.push(`${label} → HTTP ${res.status}`);
      await sleep(120);
    } catch (e) { tried.push(`${label} → ${String(e).slice(0, 80)}`); }
  }
  return { fail: tried };
}

async function politeFetch(url: string, auth: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (res.status !== 429 || attempt >= MAX_429_RETRIES) return res;
    const retryAfter = Math.min(Number(res.headers.get("Retry-After") ?? 5) || 5, 60);
    await res.body?.cancel();
    await sleep(retryAfter * 1000);
  }
}

async function metrcGet(base: string, path: string, license: string, auth: string,
  window: { start: string; end: string } | undefined,
  outOfTime: () => boolean, pageSize: number): Promise<{ rows: Row[]; truncated: boolean; ranOut: boolean }> {
  const out: Row[] = [];
  let page = 1; let truncated = false; let ranOut = false;
  const win = window ? `&lastModifiedStart=${encodeURIComponent(window.start)}&lastModifiedEnd=${encodeURIComponent(window.end)}` : "";
  for (;;) {
    if (outOfTime()) { ranOut = true; break; }
    const res = await politeFetch(`${base}${path}?licenseNumber=${encodeURIComponent(license)}&pageNumber=${page}&pageSize=${pageSize}${win}`, auth);
    if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const rows: Row[] = Array.isArray(body) ? body : (body?.Data ?? []);
    out.push(...rows);
    if (rows.length < pageSize) break;
    if (page >= MAX_PAGES) { truncated = true; break; }
    page++;
    await sleep(PAGE_PAUSE_MS);
  }
  return { rows: out, truncated, ranOut };
}

type Spec = {
  key: string; paths: Array<{ path: string; state: string }>;
  table: string; conflict: string; delta: boolean;
  map: (r: Row, license: string, state: string) => Row;
};
const SPECS: Spec[] = [
  {
    key: "packages", delta: true, table: "metrc_packages", conflict: "license,tag",
    paths: ["active", "onhold", "inactive", "intransit"].map((s) => ({ path: `/packages/v2/${s}`, state: s })),
    map: (r, license, state) => ({
      license, tag: r.Label, item_name: (r.Item as Row)?.Name ?? r.ProductName,
      quantity: r.Quantity, uom: r.UnitOfMeasureAbbreviation ?? r.UnitOfMeasureName,
      location: r.LocationName, packaged_on: d(r.PackagedDate),
      lab_testing_state: r.LabTestingState, finished: r.IsFinished ?? false,
      source_state: state, raw: r, synced_at: now(),
    }),
  },
  {
    key: "harvests", delta: true, table: "metrc_harvests", conflict: "license,metrc_id",
    paths: ["active", "onhold", "inactive"].map((s) => ({ path: `/harvests/v2/${s}`, state: s })),
    map: (r, license, state) => ({
      license, metrc_id: r.Id, name: r.Name, harvest_start: d(r.HarvestStartDate),
      wet_weight: r.TotalWetWeight ?? r.CurrentWeight, waste_weight: r.TotalWasteWeight,
      package_count: r.PackageCount, source_state: state, raw: r, synced_at: now(),
    }),
  },
  {
    key: "plants", delta: true, table: "metrc_plants", conflict: "license,tag",
    paths: [
      { path: "/plants/v2/vegetative", state: "vegetative" },
      { path: "/plants/v2/flowering", state: "flowering" },
      { path: "/plants/v2/onhold", state: "onhold" },
      { path: "/plants/v2/inactive", state: "inactive" },
    ],
    map: (r, license, state) => ({
      license, tag: r.Label, strain: r.StrainName,
      phase: r.GrowthPhase ?? state, room: r.LocationName,
      planted_on: d(r.PlantedDate), source_state: state, raw: r, synced_at: now(),
    }),
  },
  {
    key: "plantbatches", delta: true, table: "metrc_plant_batches", conflict: "license,name",
    paths: ["active", "inactive"].map((s) => ({ path: `/plantbatches/v2/${s}`, state: s })),
    map: (r, license, state) => ({
      license, name: r.Name, strain: r.StrainName, count: r.UntrackedCount ?? r.Count,
      batch_type: r.Type, planted_on: d(r.PlantedDate), source_state: state, raw: r, synced_at: now(),
    }),
  },
  {
    key: "transfers", delta: true, table: "metrc_transfers", conflict: "license,manifest_number,direction",
    paths: ["incoming", "outgoing", "rejected"].map((s) => ({ path: `/transfers/v2/${s}`, state: s })),
    map: (r, license, state) => ({
      license, manifest_number: r.ManifestNumber ?? String(r.Id), direction: state,
      shipper: r.ShipperFacilityName, recipient: r.RecipientFacilityName ?? r.DeliveryFacilities,
      created_on: d(r.CreatedDateTime), raw: r, synced_at: now(),
    }),
  },
  {
    key: "items", delta: false, table: "metrc_items", conflict: "license,metrc_id",
    paths: [{ path: "/items/v2/active", state: "active" }],
    map: (r, license) => ({
      license, metrc_id: r.Id, name: r.Name, category: r.ProductCategoryName,
      unit_of_measure: r.UnitOfMeasureName, strain: r.StrainName, raw: r, synced_at: now(),
    }),
  },
  {
    key: "strains", delta: false, table: "metrc_strains", conflict: "license,metrc_id",
    paths: [{ path: "/strains/v2/active", state: "active" }],
    map: (r, license) => ({
      license, metrc_id: r.Id, name: r.Name, testing_status: r.TestingStatus,
      thc_level: r.ThcLevel, cbd_level: r.CbdLevel, raw: r, synced_at: now(),
    }),
  },
  {
    key: "locations", delta: false, table: "metrc_locations", conflict: "license,metrc_id",
    paths: [{ path: "/locations/v2/active", state: "active" }],
    map: (r, license) => ({
      license, metrc_id: r.Id, name: r.Name, location_type: r.LocationTypeName, raw: r, synced_at: now(),
    }),
  },
  {
    key: "sales", delta: false, table: "metrc_sales", conflict: "license,receipt_number",
    paths: [{ path: "/sales/v2/receipts/active", state: "active" }],
    map: (r, license) => ({
      license, receipt_number: String(r.ReceiptNumber ?? r.Id), sales_date: d(r.SalesDateTime),
      customer_type: r.SalesCustomerType, total: r.TotalPrice, package_count: r.TotalPackages,
      raw: r, synced_at: now(),
    }),
  },
];

/* ── v22: ROWS ARE WRITTEN IN BATCHES, NOT ONE ROUND TRIP EACH ──────────────
   This is the whole fix, and it is a throughput fix, not a logic fix.

   MEASURED from metrc_sync_runs rather than assumed:

     run 3047   937 rows   60s        run 3149   937 rows   57s
     run 3391  1054 rows  140s        22 further runs, 1054 rows every time

   A steady ~16 rows per second. At pageSize 20 - Metrc's measured ceiling, see
   the v21 note - 937 rows is 47 pages, so paging accounts for roughly 9s of that
   minute. The other ~48s was 937 separately awaited PostgREST round trips, one
   per row, at about 50ms each. The old loop was:

       for (const r of got.rows) { await supa.from(...).upsert(oneRow); n++; }

   The plants delta has to carry 2,156 changed records - every vegetative and
   every flowering plant, all modified in Metrc on 17 Aug 2026 between 12:53 and
   15:06. At 16 rows/sec that is ~135 seconds of writing against a 110-second
   deadline, so the run can NEVER finish, the cursor is correctly held, and the
   next run re-asks for the identical window and dies in the identical place.
   That is why 1,054 came back twenty-two times running: not a flaky sync, a
   deterministic loop. One batched call carries 500 rows, so those 2,156 records
   cost 5 round trips instead of 2,156 and the write stops being the constraint.

   NOTHING ABOUT CURSOR DISCIPLINE CHANGES. v20's rule stands exactly as written -
   the watermark moves only on a genuinely complete run. This does not relax the
   rule; it lets the run satisfy it.

   DEDUPED ON THE CONFLICT KEY FIRST. Postgres refuses ON CONFLICT DO UPDATE when
   one statement touches the same row twice - "cannot affect row a second time" -
   and that would fail a whole batch where the per-row loop silently applied the
   last write. The batch keeps the LAST occurrence, which is what the row-at-a-time
   loop effectively did, so behaviour is unchanged and only the round trips differ.

   THE DEADLINE IS NOW CHECKED BETWEEN BATCHES, WHICH IT NEVER WAS BETWEEN ROWS.
   The old write loop had no time check at all: once fetching finished it wrote
   until done or until the platform killed it mid-loop, leaving the run row open at
   "running" forever. That is runs 3042, 3048, 3058, 3150, 3371 and the 21:09 run
   on 28 Aug - six hangs, every one closed half an hour later by
   tg_close_stuck_sync_runs instead of by the worker itself. Rows already written
   are kept and counted; the run closes itself as partial and holds its cursor. */
/* A batch is capped by BYTES as well as by rows, because these tables carry the
   whole Metrc record in `raw` and the widest one is not the most numerous.
   Measured on production, length(raw::text): plants average 1,098 bytes and peak
   1,173; harvests 879/904; packages 1,888 but peaking at 5,998. A flat 500-row
   batch is therefore ~0.6 MB of plants and up to ~3 MB of packages, and the row
   count alone gives no warning of that. Whichever limit is reached first closes
   the batch, so the request stays about a megabyte whatever the endpoint. */
const WRITE_BATCH_ROWS = 500;
const WRITE_BATCH_BYTES = 1_000_000;

async function writeRows(spec: Spec, rows: Row[], license: string, state: string,
  outOfTime: () => boolean, alreadyWritten: number): Promise<{ written: number; ranOut: boolean }> {
  const cols = csv(spec.conflict);
  const byKey = new Map<string, Row>();
  for (const r of rows) {
    const mapped = spec.map(r, license, state);
    byKey.set(JSON.stringify(cols.map((c) => mapped[c] ?? null)), mapped);
  }
  const rowsToWrite = [...byKey.values()];
  let written = 0;
  let batch: Row[] = [];
  let bytes = 0;

  const flush = async (): Promise<void> => {
    if (!batch.length) return;
    const { error } = await supa.from(spec.table).upsert(batch, { onConflict: spec.conflict });
    if (error) throw new Error(`upsert ${spec.table} x${batch.length}: ${error.message}`);
    written += batch.length;
    /* Cumulative across sub-states: the beforeunload backstop reads this to close
       the run if we are killed, and a per-sub-state count would under-report what
       actually landed. */
    if (OPEN_RUN) OPEN_RUN.records = alreadyWritten + written;
    batch = [];
    bytes = 0;
  };

  for (const row of rowsToWrite) {
    const size = JSON.stringify(row).length;
    if (batch.length && (batch.length >= WRITE_BATCH_ROWS || bytes + size > WRITE_BATCH_BYTES)) {
      if (outOfTime()) return { written, ranOut: true };
      await flush();
    }
    batch.push(row);
    bytes += size;
  }
  if (batch.length) {
    if (outOfTime()) return { written, ranOut: true };
    await flush();
  }
  return { written, ranOut: false };
}

async function runSpec(base: string, license: string, auth: string, spec: Spec,
  window: { start: string; end: string } | undefined, label: string | undefined,
  outOfTime: () => boolean, pageSize: number): Promise<{ summary: string; ranOut: boolean; complete: boolean }> {
  const runLabel = label ?? (window ? `${spec.key} (delta)` : spec.key);
  const { data: run } = await supa.from("metrc_sync_runs").insert({ endpoint: runLabel, license }).select("id").single();
  OPEN_RUN = { id: run!.id as number, records: 0 };
  try {
    let n = 0; let anyTrunc = false; let ranOut = false; const subErrors: string[] = [];
    for (const p of spec.paths) {
      if (outOfTime()) { ranOut = true; break; }
      try {
        const got = await metrcGet(base, p.path, license, auth, spec.delta ? window : undefined, outOfTime, pageSize);
        if (got.truncated) anyTrunc = true;
        if (got.ranOut) ranOut = true;
        const w = await writeRows(spec, got.rows, license, p.state, outOfTime, n);
        n += w.written;
        if (w.ranOut) ranOut = true;
        if (OPEN_RUN) OPEN_RUN.records = n;
      } catch (e) {
        subErrors.push(`${p.state}: ${String(e).slice(0, 90)}`);
      }
      await sleep(PAGE_PAUSE_MS);
    }
    /* v20: COMPLETE MEANS EVERY SUB-STATE ANSWERED, NOTHING CAPPED, AND TIME LEFT OVER.
       Anything less holds the cursor. See the header note 3. */
    const failedEverything = subErrors.length >= spec.paths.length;
    const complete = subErrors.length === 0 && !anyTrunc && !ranOut;
    const status = failedEverything ? "error" : (complete ? "ok" : "partial");
    await supa.from("metrc_sync_runs").update({
      status, records: n,
      error: subErrors.length ? subErrors.join(" · ").slice(0, 480) : null,
      note: complete ? null
        : ranOut
          ? `Stopped at the soft deadline with ${n} rows written. Not a fault. Cursor NOT advanced; the next run re-asks for this window.`
          : anyTrunc
            ? `CAPPED at ${MAX_PAGES} pages of ${pageSize}. Cursor NOT advanced; the next run re-asks for this window.`
            : `${subErrors.length} of ${spec.paths.length} sub-states failed. Cursor NOT advanced; the next run re-asks for this window.`,
      finished_at: now(),
    }).eq("id", run!.id);
    OPEN_RUN = null;
    return {
      summary: `${n} new${anyTrunc ? " ⚠️ capped" : ""}`
        + `${ranOut ? " ⏱ stopped at deadline, run again to continue" : ""}`
        + `${subErrors.length ? ` (${subErrors.length} sub-state errors)` : ""}`,
      ranOut, complete,
    };
  } catch (e) {
    await supa.from("metrc_sync_runs").update({ status: "error", error: String(e).slice(0, 480), finished_at: now() }).eq("id", run!.id);
    OPEN_RUN = null;
    throw e;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await callerIsExecutive(req))) return json({ ok: false, error: "Executive access required." }, 403);

  const startedAt = Date.now();
  const cfg = await loadCfg();
  const env = (cfg.METRC_ENV ?? "production").toLowerCase();
  const state = cfg.METRC_STATE ?? "ma";
  const BASE = env === "sandbox" ? `https://sandbox-api-${state}.metrc.com` : `https://api-${state}.metrc.com`;

  const params = new URL(req.url).searchParams;
  const configured = csv(cfg.METRC_LICENSES);
  if (!configured.length) return json({ ok: false, error: "No licenses configured. Add METRC_LICENSES on the Integrations screen." }, 400);

  const onlyLicence = params.get("license");
  const LIC = onlyLicence ? configured.filter((l) => l === onlyLicence) : configured;
  if (onlyLicence && !LIC.length) {
    return json({ ok: false, error: `Licence ${onlyLicence} is not configured. Known: ${configured.join(", ")}` }, 400);
  }

  const resolved = await resolveAuth(BASE, cfg);
  if ("fail" in resolved) {
    return json({ ok: false, error: `[${env}] All auth arrangements rejected: ` + resolved.fail.join(" · ") }, 400);
  }

  const capability = await loadCapability();
  const denialReason = await loadDenialReasons();
  const HISTORY_START = await historyStart();
  const DEADLINE_MS = await numberSetting("metrc_sync_soft_deadline_ms", FALLBACK_DEADLINE_MS);
  const PAGE_SIZE = await resolvePageSize();
  const outOfTime = () => (Date.now() - startedAt) > DEADLINE_MS;

  let facApi: string[] = [];
  try {
    const fres = await politeFetch(`${BASE}/facilities/v2`, resolved.auth);
    if (fres.ok) {
      const fb = await fres.json();
      const rows: Row[] = Array.isArray(fb) ? fb : (fb?.Data ?? []);
      facApi = rows.map((f) => String((f.License as Row)?.Number ?? "")).filter(Boolean);
    }
  } catch { /* informational */ }

  const wantedKeys = params.get("endpoints")?.split(",").map((s) => s.trim());
  const specs = wantedKeys ? SPECS.filter((s) => wantedKeys.includes(s.key)) : SPECS;
  const full = params.get("full") === "1";
  const winStart = params.get("winStart");
  const winEnd = params.get("winEnd");
  const explicitWindow = winStart && winEnd ? { start: winStart, end: winEnd } : null;
  const cursors = await getCursors();
  const runStart = now();
  let skippedByCapability = 0;
  let stoppedEarly = false;
  let heldCursors = 0;
  const results: Record<string, unknown> = {
    _env: env,
    _auth_arrangement: resolved.label,
    _facilities_visible: facApi.length,
    _licences_run: LIC.join(", "),
    _soft_deadline_ms: DEADLINE_MS,
    _page_size: PAGE_SIZE,
    _window: explicitWindow ? `${winStart} → ${winEnd}`
      : (full ? `full: ${HISTORY_START} → now (stated, not Metrc's default)` : "delta since cursor"),
    _licenses_matched: LIC.map((l) => `${l}:${facApi.includes(l) ? "visible" : "NOT VISIBLE — add this user to that facility in Metrc, then re-run"}`),
  };
  for (const license of LIC) {
    const skipData = facApi.length > 0 && !facApi.includes(license);
    for (const spec of specs) {
      const ck = `${license}:${spec.key}`;
      if (skipData) { results[ck] = "skipped — license not visible to this user key yet"; continue; }
      if (capability[ck] === false) {
        results[ck] = `not requested — ${denialReason[ck] ?? "this licence is not licensed for it"}`;
        skippedByCapability++;
        continue;
      }
      if (outOfTime()) {
        results[ck] = "not reached — the soft deadline was hit first. Run again to continue.";
        stoppedEarly = true;
        continue;
      }

      let window: { start: string; end: string } | undefined = undefined;
      let runLabel: string | undefined = undefined;
      if (explicitWindow && spec.delta) {
        window = explicitWindow;
      } else if (full && spec.delta) {
        window = { start: HISTORY_START, end: runStart };
        runLabel = `${spec.key} (full sweep)`;
      } else {
        const since = spec.delta ? cursors[ck] : undefined;
        window = since ? { start: since, end: runStart } : undefined;
      }
      try {
        const r = await runSpec(BASE, license, resolved.auth, spec, window, runLabel, outOfTime, PAGE_SIZE);
        if (r.ranOut) stoppedEarly = true;
        const { count } = await supa.from(spec.table).select("*", { count: "exact", head: true }).eq("license", license);
        results[ck] = `${r.summary}${window ? " (windowed)" : ""} · ${count ?? 0} total in OS${r.complete ? "" : " · CURSOR HELD"}`;
        /* v20: only a COMPLETE run moves the watermark. See runSpec. */
        if (spec.delta && !explicitWindow) {
          if (r.complete) { cursors[ck] = runStart; await saveCursors(cursors); }
          else heldCursors++;
        }
      } catch (e) {
        results[ck] = `ERROR: ${String(e).slice(0, 160)}`;
      }
      await sleep(PAGE_PAUSE_MS);
    }
  }
  results._calls_not_made = `${skippedByCapability} licence/endpoint pairs skipped because that licence cannot answer them`;
  results._cursors_held = `${heldCursors} delta cursors NOT advanced because the run was not complete`;
  results._elapsed_ms = Date.now() - startedAt;
  if (stoppedEarly) {
    results._incomplete = "This run stopped at its soft deadline. Rows written were kept and every "
      + "run row was closed. NOTE: a partial sweep does NOT resume - the next call "
      + "re-walks from the beginning and gets further before the deadline. A real "
      + "resume cursor is a tracked task; v18 attempted it, was not verified, and was "
      + "rolled back after leaving a run open for 183 seconds."
  }
  return json({ ok: true, complete: !stoppedEarly, state, results });
});
