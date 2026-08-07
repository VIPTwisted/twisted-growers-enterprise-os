// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 15 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG Enterprise OS — Metrc sync worker v15.
//
// v15 changes, 7 August 2026, after 618 guaranteed-failing calls per cycle were
// measured in metrc_sync_runs:
//
//   1. ?license= is HONOURED. v14 accepted the parameter and ignored it, looping
//      every licence in METRC_LICENSES regardless. A caller scoping a run to one
//      licence silently got both.
//   2. Every licence/endpoint pair is checked against metrc_endpoint_capability
//      before a request is made. Asking the manufacturing licence for plants is
//      not an authorisation fault to retry - manufacturing grows nothing, so the
//      401 is Metrc answering correctly. Those calls are now never sent, and the
//      reason is recorded instead of an error.
//
// v14 behaviour otherwise unchanged: explicit history windows (winStart/winEnd)
// let a driver walk complete history past Metrc's recent-window defaults, and
// explicit-window runs do NOT advance delta cursors.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ADMIN_KEY = "<REDACTED — lives in Supabase function secrets>";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const csv = (v: string | undefined | null) => (v ?? "").split(",").map(s => s.trim()).filter(Boolean);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAGE_SIZE = 20;
const MAX_PAGES = 750;
const PAGE_PAUSE_MS = 200;
const MAX_429_RETRIES = 3;

type Row = Record<string, unknown>;
const d = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);
const now = () => new Date().toISOString();
const basic = (a: string, b: string) => "Basic " + btoa(`${a}:${b}`);

async function loadCfg(): Promise<Record<string, string>> {
  const cfg: Record<string, string> = {};
  const { data } = await supa.from("integration_secrets").select("name, value");
  for (const r of data ?? []) cfg[r.name] = r.value;
  for (const k of ["METRC_STATE", "METRC_ENV", "METRC_LICENSES", "METRC_USER_KEY", "METRC_USER_KEYS", "METRC_VENDOR_KEY", "METRC_VENDOR_KEYS"]) {
    if (!cfg[k] && Deno.env.get(k)) cfg[k] = Deno.env.get(k)!;
  }
  return cfg;
}

// What each licence may be asked for. Config as rows, so a licensing change is a
// row edit and never a code change.
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
  if (req.headers.get("x-admin-key") === ADMIN_KEY) return true;
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
  window?: { start: string; end: string }): Promise<{ rows: Row[]; truncated: boolean }> {
  const out: Row[] = [];
  let page = 1; let truncated = false;
  const win = window ? `&lastModifiedStart=${encodeURIComponent(window.start)}&lastModifiedEnd=${encodeURIComponent(window.end)}` : "";
  for (;;) {
    const res = await politeFetch(`${base}${path}?licenseNumber=${encodeURIComponent(license)}&pageNumber=${page}&pageSize=${PAGE_SIZE}${win}`, auth);
    if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const rows: Row[] = Array.isArray(body) ? body : (body?.Data ?? []);
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    if (page >= MAX_PAGES) { truncated = true; break; }
    page++;
    await sleep(PAGE_PAUSE_MS);
  }
  return { rows: out, truncated };
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

async function runSpec(base: string, license: string, auth: string, spec: Spec,
  window?: { start: string; end: string }): Promise<string> {
  const label = window ? `${spec.key} (delta)` : spec.key;
  const { data: run } = await supa.from("metrc_sync_runs").insert({ endpoint: label, license }).select("id").single();
  try {
    let n = 0; let anyTrunc = false; const subErrors: string[] = [];
    for (const p of spec.paths) {
      try {
        const { rows, truncated } = await metrcGet(base, p.path, license, auth, spec.delta ? window : undefined);
        if (truncated) anyTrunc = true;
        for (const r of rows) {
          await supa.from(spec.table).upsert(spec.map(r, license, p.state), { onConflict: spec.conflict });
          n++;
        }
      } catch (e) {
        subErrors.push(`${p.state}: ${String(e).slice(0, 90)}`);
      }
      await sleep(PAGE_PAUSE_MS);
    }
    const ok = subErrors.length < spec.paths.length;
    await supa.from("metrc_sync_runs").update({
      status: ok ? "ok" : "error", records: n,
      error: subErrors.length ? subErrors.join(" · ").slice(0, 480) : null,
      finished_at: now(),
    }).eq("id", run!.id);
    return `${n} new${anyTrunc ? " ⚠️ capped, run again" : ""}${subErrors.length ? ` (${subErrors.length} sub-state errors)` : ""}`;
  } catch (e) {
    await supa.from("metrc_sync_runs").update({ status: "error", error: String(e).slice(0, 480), finished_at: now() }).eq("id", run!.id);
    throw e;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await callerIsExecutive(req))) return json({ ok: false, error: "Executive access required." }, 403);

  const cfg = await loadCfg();
  const env = (cfg.METRC_ENV ?? "production").toLowerCase();
  const state = cfg.METRC_STATE ?? "ma";
  const BASE = env === "sandbox" ? `https://sandbox-api-${state}.metrc.com` : `https://api-${state}.metrc.com`;

  const params = new URL(req.url).searchParams;
  const configured = csv(cfg.METRC_LICENSES);
  if (!configured.length) return json({ ok: false, error: "No licenses configured. Add METRC_LICENSES on the Integrations screen." }, 400);

  // v15: honour ?license=. v14 accepted this and ignored it, so a run scoped to
  // one licence silently ran both.
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
  const results: Record<string, unknown> = {
    _env: env,
    _auth_arrangement: resolved.label,
    _facilities_visible: facApi.length,
    _licences_run: LIC.join(", "),
    _window: explicitWindow ? `${winStart} → ${winEnd}` : (full ? "full (recent default window)" : "delta since cursor"),
    _licenses_matched: LIC.map((l) => `${l}:${facApi.includes(l) ? "visible" : "NOT VISIBLE — add this user to that facility in Metrc, then re-run"}`),
  };
  for (const license of LIC) {
    const skipData = facApi.length > 0 && !facApi.includes(license);
    for (const spec of specs) {
      const ck = `${license}:${spec.key}`;
      if (skipData) { results[ck] = "skipped — license not visible to this user key yet"; continue; }

      // v15: never send a request this licence cannot answer.
      if (capability[ck] === false) {
        results[ck] = `not requested — ${denialReason[ck] ?? "this licence is not licensed for it"}`;
        skippedByCapability++;
        continue;
      }

      let window: { start: string; end: string } | undefined = undefined;
      if (explicitWindow && spec.delta) {
        window = explicitWindow;
      } else {
        const since = spec.delta && !full ? cursors[ck] : undefined;
        window = since ? { start: since, end: runStart } : undefined;
      }
      try {
        const r = await runSpec(BASE, license, resolved.auth, spec, window);
        const { count } = await supa.from(spec.table).select("*", { count: "exact", head: true }).eq("license", license);
        results[ck] = `${r}${window ? " (windowed)" : ""} · ${count ?? 0} total in OS`;
        if (spec.delta && !explicitWindow) { cursors[ck] = runStart; await saveCursors(cursors); }
      } catch (e) {
        results[ck] = `ERROR: ${String(e).slice(0, 160)}`;
      }
      await sleep(PAGE_PAUSE_MS);
    }
  }
  results._calls_not_made = `${skippedByCapability} licence/endpoint pairs skipped because that licence cannot answer them`;
  return json({ ok: true, state, results });
});
