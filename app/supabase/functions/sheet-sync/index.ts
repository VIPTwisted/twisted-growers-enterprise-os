// RECOVERED FROM LIVE SUPABASE 2026-08-07 — deployed version 1 is the source of record.
// Do not edit and redeploy without diffing against the live version first.
// TG Enterprise OS — finished-goods Google Sheet sync (push-button, whole team)
// The crew keeps working in the live Google Sheet; any executive presses Sync and the
// platform mirrors every product tab + 3rd-party material exactly. verify_jwt disabled at
// the gateway (CORS preflight); real auth below — owner/executive JWT required.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SHEET_ID = "1GBTlv8kfAQeaFacrKZXj9Sxm3mKjW-ncw5lOwEwGnR0";
const TABS: Array<[string, string, number]> = [
  ["Solventless", "solventless", 2],
  ["Hydrocarbon", "hydrocarbon", 1],
  ["Infused PreRolls", "infused_preroll", 1],
  ["1.0g Raw PreRolls", "raw_preroll_1g", 1],
  ["0.5g Raw PreRolls", "raw_preroll_05g", 1],
  ["1.0g Economy Raw ", "economy_raw_1g", 1],
  ["Economy Infused", "economy_infused", 1],
  ["0.5g Economy Raw", "economy_raw_05g", 1],
  ["Vaporizers", "vaporizer", 1],
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function callerIsExecutive(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return false;
  const { data } = await service.auth.getUser(token);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: row } = await service.from("app_users").select("role").eq("user_id", uid).single();
  return row?.role === "owner" || row?.role === "executive";
}

// Quote-aware CSV parser
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function mapField(h: string): string | null {
  const n = (h ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!n) return null;
  if (n.includes("current status")) return "current_status";
  if (n.includes("projected avail")) return "projected_avail";
  if (n.includes("holding metrc") || n.includes("prefill") || n.includes("pre-fill")) return "prefill_metrc_tag";
  if (n.includes("bulk metrc")) return "bulk_metrc_tag";
  if (n.includes("metrc")) return "final_metrc_tag";
  if (n.includes("batch")) return "production_batch";
  if (n.includes("strain") || n.includes("flavor")) return "strain_flavor";
  if (n.includes("description")) return "product_description";
  if (n.startsWith("size")) return "size_g";
  if (n.includes("gram equivalent")) return "total_gram_equivalent";
  if (n.includes("total bulk") || n === "bulk available") return "total_bulk";
  if (n.includes("filled")) return "total_filled";
  if (n.includes("packaged")) return "total_packaged";
  if (n.includes("total units")) return "total_units";
  if (n.includes("case size")) return "case_size";
  if (n.includes("cases available")) return "cases_available";
  if (n.includes("creation")) return "creation_date";
  if (n.includes("expiration")) return "expiration_date";
  if (n.includes("thca")) return "thca_pct";
  if (n.includes("tac")) return "tac_pct";
  if (n.includes("terpene")) return "terpene_pct";
  return null;
}

const NUM = new Set(["total_bulk","total_filled","total_units","total_gram_equivalent","total_packaged","case_size","cases_available","tac_pct","terpene_pct","thca_pct"]);
const DATE = new Set(["creation_date","expiration_date"]);

function toNum(v: string): number | null {
  const s = (v ?? "").replace(/[,%]/g, "").trim();
  if (!s || ["N/A","NA","ON HOLD","TBD"].includes(s.toUpperCase())) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
function toDate(v: string): string | null {
  const s = (v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

async function fetchTab(tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`Sheet tab "${tab}" fetch failed: HTTP ${r.status}`);
  const text = await r.text();
  if (text.trimStart().startsWith("<")) throw new Error(`Sheet tab "${tab}" is not public - set sharing to Anyone with the link (Viewer).`);
  return parseCsv(text);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  if (!(await callerIsExecutive(req))) return json({ ok: false, error: "Executive access required." }, 403);

  const started = new Date().toISOString();
  const results: Record<string, number> = {};
  try {
    const allRows: Record<string, unknown>[] = [];
    for (const [tab, category, hdrRow] of TABS) {
      const grid = await fetchTab(tab);
      const hdr = grid[hdrRow - 1] ?? [];
      const cols: Record<number, string> = {};
      const seen = new Set<string>();
      hdr.forEach((h, i) => { const f = mapField(h); if (f && !seen.has(f)) { cols[i] = f; seen.add(f); } });
      let n = 0;
      for (let r = hdrRow; r < grid.length; r++) {
        const rec: Record<string, unknown> = {};
        const raw: Record<string, string> = {};
        for (const [iStr, f] of Object.entries(cols)) {
          const v = (grid[r][Number(iStr)] ?? "").trim();
          if (!v) continue;
          raw[f] = v.slice(0, 200);
          if (NUM.has(f)) rec[f] = toNum(v);
          else if (DATE.has(f)) rec[f] = toDate(v);
          else rec[f] = v.slice(0, 160);
        }
        if (!["production_batch","strain_flavor","bulk_metrc_tag","final_metrc_tag"].some(k => rec[k])) continue;
        allRows.push({ ...rec, category, source_sheet: tab.trim(), source_row: r + 1, raw, synced_at: new Date().toISOString() });
        n++;
      }
      results[tab.trim()] = n;
    }

    // 3rd Party Material
    const tp = await fetchTab("3rd Party Material");
    const tpRows: Record<string, unknown>[] = [];
    for (let r = 1; r < tp.length; r++) {
      const [company, tag, strain, product, wg, wl, loc, chk, notes] = tp[r].map((c) => (c ?? "").trim());
      if (!company && !tag && !product) continue;
      tpRows.push({
        company: company || null, metrc_tag: tag || null,
        strain: strain && strain.toUpperCase() !== "N/A" ? strain : null,
        product: product || null, weight_g: toNum(wg), weight_lbs: toNum(wl),
        location: loc || null, inventory_check: chk ? chk.replace(/\s+/g, " ") : null,
        notes: notes || null, source_row: r + 1, synced_at: new Date().toISOString(),
      });
    }
    results["3rd Party Material"] = tpRows.length;

    // Replace atomically-enough: only clear once every tab fetched clean
    const del1 = await service.from("product_inventory").delete().not("id", "is", null);
    if (del1.error) throw new Error(del1.error.message);
    for (let i = 0; i < allRows.length; i += 200) {
      const { error } = await service.from("product_inventory").insert(allRows.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
    const del2 = await service.from("third_party_material").delete().not("id", "is", null);
    if (del2.error) throw new Error(del2.error.message);
    if (tpRows.length) {
      const { error } = await service.from("third_party_material").insert(tpRows);
      if (error) throw new Error(error.message);
    }

    await service.from("metrc_sync_runs").insert({
      endpoint: "google_sheet_fg", license: "-", started_at: started,
      finished_at: new Date().toISOString(), status: "ok",
      records: allRows.length + tpRows.length, error: null,
    });
    return json({ ok: true, results, total: allRows.length + tpRows.length });
  } catch (e) {
    await service.from("metrc_sync_runs").insert({
      endpoint: "google_sheet_fg", license: "-", started_at: started,
      finished_at: new Date().toISOString(), status: "error", records: 0,
      error: String(e).slice(0, 500),
    });
    return json({ ok: false, error: String(e) }, 500);
  }
});
