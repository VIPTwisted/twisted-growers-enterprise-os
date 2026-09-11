/** Forensic seed-to-sale occupancy.
 * Seed below is the 9 Sep 2026 book — the fail-closed fallback.
 * After login, hydrateS2S overlays live v_facility_s2s_rooms onto this array in
 * place so every existing consumer picks up Metrc occupancy without a rewrite.
 * If the view does not answer, the book stays labelled 9 Sep 2026. Never dressed as today.
 */
import { LIC_MC, LIC_MP } from "@/data/licences";
import { supabase } from "../../lib/supabase.js";

export let S2S_AS_OF = "9 Sep 2026";
export let S2S_TICK = 0;
export const S2S_LAW =
  "Metrc is SoR. Tagged flowering/veg, untagged plant batches, active unfinished packages, and open harvests hydrate from v_facility_s2s_rooms. Batches are LocationName (Clone Room, Vegetation Room). Harvests sit on DryingLocationName (current room), never flower_room (origin). harvest_wet_lb is f_to_pounds of Metrc Grams — the one column posted 10 Sep as raw grams aliased lb, not a blanket convert. Empty rooms are listed on purpose. Fail closed: if the live view does not answer, this book stays labelled 9 Sep 2026.";

export type S2SRoom = {
  licence: typeof LIC_MC | typeof LIC_MP;
  room: string;
  role: string;
  stage: "CANOPY" | "BATCH" | "DRYING" | "PACKAGED" | "EMPTY";
  tagged_flowering: number;
  tagged_veg: number;
  batch_n: number;
  batch_plants: number;
  harvests_open: number;
  harvest_plants: number;
  harvest_wet_lb: number;
  pkg_n: number;
  pkg_qty_g: number;
  pkg_stale_n: number;
  status: "CERTIFIED" | "PARTIAL" | "ISSUE" | "EMPTY";
  note: string;
};

type LiveRow = {
  licence: string;
  room: string;
  tagged_flowering: number;
  tagged_veg: number;
  pkg_n: number;
  pkg_qty_g: number;
  pkg_stale_n: number;
  harvests_open: number;
  harvest_wet_lb: number;
  harvest_plants: number;
  batch_n: number;
  batch_plants: number;
  packages_as_of: string | null;
  plants_as_of: string | null;
  batches_as_of: string | null;
  harvests_as_of: string | null;
  status: S2SRoom["status"];
};

function fmtAsOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  if (!day || !month || !year) return null;
  return `${day} ${month} ${year} ${hour}:${minute} ET`;
}

function overlayLive(live: LiveRow[]) {
  const byKey = new Map(live.map((r) => [`${r.licence}|${r.room}`, r]));
  for (const row of S2S_ROOMS) {
    const key = `${row.licence}|${row.room}`;
    const hit = byKey.get(key);
    if (!hit) {
      row.tagged_flowering = 0;
      row.tagged_veg = 0;
      row.pkg_n = 0;
      row.pkg_qty_g = 0;
      row.pkg_stale_n = 0;
      row.harvests_open = 0;
      row.harvest_wet_lb = 0;
      row.harvest_plants = 0;
      row.batch_n = 0;
      row.batch_plants = 0;
      row.status = "EMPTY";
      continue;
    }
    row.tagged_flowering = Number(hit.tagged_flowering) || 0;
    row.tagged_veg = Number(hit.tagged_veg) || 0;
    row.pkg_n = Number(hit.pkg_n) || 0;
    row.pkg_qty_g = Number(hit.pkg_qty_g) || 0;
    row.pkg_stale_n = Number(hit.pkg_stale_n) || 0;
    row.harvests_open = Number(hit.harvests_open) || 0;
    row.harvest_wet_lb = Number(hit.harvest_wet_lb) || 0;
    row.harvest_plants = Number(hit.harvest_plants) || 0;
    row.batch_n = Number(hit.batch_n) || 0;
    row.batch_plants = Number(hit.batch_plants) || 0;
    row.status = hit.status;
  }
}

export async function hydrateS2S(): Promise<{ ok: boolean; asOf: string }> {
  try {
    const { data, error } = await supabase
      .from("v_facility_s2s_rooms")
      .select(
        "licence,room,tagged_flowering,tagged_veg,pkg_n,pkg_qty_g,pkg_stale_n,harvests_open,harvest_wet_lb,harvest_plants,batch_n,batch_plants,packages_as_of,plants_as_of,batches_as_of,harvests_as_of,status",
      );
    if (error || !data) return { ok: false, asOf: S2S_AS_OF };
    overlayLive(data as LiveRow[]);
    const stamps = (data as LiveRow[])
      .flatMap((r) => [r.packages_as_of, r.plants_as_of, r.batches_as_of, r.harvests_as_of])
      .filter((x): x is string => !!x)
      .sort();
    const asOf = fmtAsOf(stamps[stamps.length - 1]);
    if (asOf) S2S_AS_OF = asOf;
    S2S_TICK += 1;
    return { ok: true, asOf: S2S_AS_OF };
  } catch {
    return { ok: false, asOf: S2S_AS_OF };
  }
}

export const S2S_ROOMS: S2SRoom[] = [

  { licence: LIC_MC, room: "Flower Room #1", role: "Flowering", stage: "CANOPY", tagged_flowering: 1140, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "CERTIFIED", note: "6 strains × 190. Dual MATCH tag|strain|room|planted." },
  { licence: LIC_MC, room: "Flower Room #2", role: "Flowering", stage: "CANOPY", tagged_flowering: 1050, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "CERTIFIED", note: "SMALL cap 1,050. Dual MATCH." },
  { licence: LIC_MC, room: "Flower Room #3", role: "Flowering", stage: "CANOPY", tagged_flowering: 1140, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "CERTIFIED", note: "LARGE cap 1,140. Dual MATCH." },
  { licence: LIC_MC, room: "Flower Room #4", role: "Flowering", stage: "CANOPY", tagged_flowering: 1050, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "CERTIFIED", note: "SMALL cap 1,050. Dual MATCH." },
  { licence: LIC_MC, room: "Mother Room", role: "Mother stock", stage: "CANOPY", tagged_flowering: 0, tagged_veg: 30, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "CERTIFIED", note: "30 mothers, 30 strains, planted 2026-07-21." },
  { licence: LIC_MC, room: "Clone Room", role: "Clones / immature", stage: "BATCH", tagged_flowering: 0, tagged_veg: 0, batch_n: 50, batch_plants: 4470, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "PARTIAL", note: "Untagged batches. 9 Sep PlantBatchesActive in vault, not dual MATCH'd." },
  { licence: LIC_MC, room: "Vegetation Room", role: "Vegetative batches", stage: "BATCH", tagged_flowering: 0, tagged_veg: 0, batch_n: 25, batch_plants: 1430, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "PARTIAL", note: "Untagged batches. Not the 30 tagged mothers." },
  { licence: LIC_MC, room: "Dry Room #2", role: "Drying", stage: "DRYING", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 4, harvest_plants: 1140, harvest_wet_lb: 1205.8, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "CERTIFIED", note: "4 unfinished harvests. Active harvest book 21/21 CERTIFIED." },
  { licence: LIC_MC, room: "Cure Vault", role: "Curing / bulk", stage: "DRYING", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 10, harvest_plants: 2250, harvest_wet_lb: 2392.4, pkg_n: 2, pkg_qty_g: 13620, pkg_stale_n: 0, status: "PARTIAL", note: "10 unfinished harvests CERTIFIED as names. Package qty not certified." },
  { licence: LIC_MC, room: "Fulfillment Vault", role: "Bulk / outbound", stage: "DRYING", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 7, harvest_plants: 1283, harvest_wet_lb: 934.1, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "PARTIAL", note: "7 unfinished harvests. Packages on MP." },
  { licence: LIC_MC, room: "Dry Room #1", role: "Drying", stage: "EMPTY", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "No live plants, batches, or open harvests." },
  { licence: LIC_MC, room: "Finish Vault", role: "Finished goods", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 76, pkg_qty_g: 221800, pkg_stale_n: 10, status: "ISSUE", note: "10 stale active tags / 1,260 g OS asserts, Metrc Active grid does not." },
  { licence: LIC_MC, room: "BDA/Storage Room", role: "Storage", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "No live tagged plants." },
  { licence: LIC_MC, room: "Freezer/Biomass Storage", role: "Fresh frozen", stage: "EMPTY", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "No live tagged plants." },
  { licence: LIC_MC, room: "Grind Room", role: "Grinding", stage: "EMPTY", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "Listed. Empty of live plants." },
  { licence: LIC_MC, room: "Packaging Room", role: "Staged for packaging", stage: "EMPTY", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "Listed. Empty of live plants." },
  { licence: LIC_MC, room: "Pre Trim Storage Room", role: "Dried, awaiting trim", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 12, pkg_qty_g: 77900, pkg_stale_n: 0, status: "ISSUE", note: "Package on-hand not certified until retire-pass." },
  { licence: LIC_MC, room: "QA Room", role: "QA", stage: "EMPTY", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "Listed. Empty of live plants." },
  { licence: LIC_MC, room: "Quarantine", role: "Quarantine hold", stage: "EMPTY", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "Listed. Empty of live plants." },
  { licence: LIC_MC, room: "Shipping & Receiving", role: "In transit", stage: "EMPTY", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "Listed. Empty of live plants." },
  { licence: LIC_MC, room: "Trim Room", role: "Trimming", stage: "EMPTY", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "Listed. Empty of live plants." },
  { licence: LIC_MP, room: "Fulfillment Vault", role: "Bulk flower and outbound", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 179, pkg_qty_g: 337772.7, pkg_stale_n: 0, status: "ISSUE", note: "OS active packages. 63 MP orphans live elsewhere in Finish/Fulfillment/Pre-Trim." },
  { licence: LIC_MP, room: "Finish Vault", role: "Finished goods", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 57, pkg_qty_g: 0, pkg_stale_n: 0, status: "ISSUE", note: "Includes stale actives. Metrc grid is SoR." },
  { licence: LIC_MP, room: "Production Room", role: "Production / infusion", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 102, pkg_qty_g: 19033.3, pkg_stale_n: 0, status: "ISSUE", note: "Package on-hand not certified." },
  { licence: LIC_MP, room: "Hydrocarbon", role: "Extraction — hydrocarbon", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 80, pkg_qty_g: 64924, pkg_stale_n: 0, status: "ISSUE", note: "Package on-hand not certified." },
  { licence: LIC_MP, room: "Pre-Trim Storage", role: "Dried, awaiting trim", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 57, pkg_qty_g: 293249.2, pkg_stale_n: 0, status: "ISSUE", note: "Package on-hand not certified." },
  { licence: LIC_MP, room: "Solventless", role: "Extraction — solventless", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 34, pkg_qty_g: 18289.3, pkg_stale_n: 0, status: "ISSUE", note: "Package on-hand not certified." },
  { licence: LIC_MP, room: "BDA/Storage Room", role: "Storage", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 29, pkg_qty_g: 18500, pkg_stale_n: 0, status: "ISSUE", note: "Package on-hand not certified." },
  { licence: LIC_MP, room: "Freezer/Biomass Storage", role: "Fresh frozen and biomass", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 28, pkg_qty_g: 200282.5, pkg_stale_n: 0, status: "ISSUE", note: "Package on-hand not certified." },
  { licence: LIC_MP, room: "Biomass Prep", role: "Biomass preparation", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 8, pkg_qty_g: 9345, pkg_stale_n: 0, status: "ISSUE", note: "Package on-hand not certified." },
  { licence: LIC_MP, room: "Packaging Room", role: "Staged for packaging", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 6, pkg_qty_g: 19800, pkg_stale_n: 0, status: "ISSUE", note: "Package on-hand not certified." },
  { licence: LIC_MP, room: "Shipping & Receiving", role: "In transit", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 5, pkg_qty_g: 3937.4, pkg_stale_n: 0, status: "ISSUE", note: "Package on-hand not certified." },
  { licence: LIC_MP, room: "Cure Vault", role: "Curing / bulk storage", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "No open harvests on MP." },
  { licence: LIC_MP, room: "Dry Room #1", role: "Drying", stage: "EMPTY", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "Listed. Empty." },
  { licence: LIC_MP, room: "Dry Room #2", role: "Drying", stage: "EMPTY", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "Listed. Empty." },
  { licence: LIC_MP, room: "Quarantine", role: "Quarantine hold", stage: "PACKAGED", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 1, pkg_qty_g: 3, pkg_stale_n: 0, status: "ISSUE", note: "1 package, 3 g. Not certified." },
  { licence: LIC_MP, room: "Warehouse #1", role: "Warehouse", stage: "EMPTY", tagged_flowering: 0, tagged_veg: 0, batch_n: 0, batch_plants: 0, harvests_open: 0, harvest_plants: 0, harvest_wet_lb: 0, pkg_n: 0, pkg_qty_g: 0, pkg_stale_n: 0, status: "EMPTY", note: "Listed. Empty of live plants." },
];
