/** Forensic seed-to-sale occupancy. Tagged canopy CERTIFIED 9 Sep. Batches and packages are OS-stated until dual MATCH. */
import { LIC_MC, LIC_MP } from "@/data/licences";

export const S2S_AS_OF = "9 Sep 2026";
export const S2S_LAW =
  "Metrc is SoR. Tagged flowering/veg rooms MATCH the 9 Sep grids. Clone and Vegetation hold untagged batches, not tagged plants. Package rooms overstate until the sync retires 73 orphans (369.7 lb). Empty rooms are listed on purpose.";

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
