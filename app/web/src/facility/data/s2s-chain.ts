/** Forensic seed-to-sale chain. Metrc is custody SoR. CERTIFIED only on dual MATCH. Empty rooms stay on the board. */

import { OPEN_CLOCK } from "@/data/weight";
import { S2S_AS_OF, S2S_LAW, S2S_ROOMS, type S2SRoom } from "@/data/s2s-rooms";
import { namesHit, sameMetrc } from "@/data/room-alias";
import { LIC_MC, LIC_MP } from "@/data/licences";

export { S2S_AS_OF, S2S_LAW, S2S_ROOMS };
export type { S2SRoom };

export type ChainStage =
  | "CLONE"
  | "VEG"
  | "FLOWER"
  | "DRY"
  | "CURE"
  | "PACKAGE"
  | "PROCESS"
  | "TRANSFER"
  | "SOLD";

export type Grain = "CERTIFIED" | "PARTIAL" | "ISSUE" | "EMPTY";

export type Hop = {
  id: string;
  lot: string;
  at: string;
  licence: S2SRoom["licence"];
  room: string;
  stage: ChainStage;
  action: string;
  qty: string;
  source: "METRC" | "OS";
  status: Grain;
  note: string;
};

export type Lot = {
  id: string;
  name: string;
  strain: string;
  licence: S2SRoom["licence"];
  now_room: string;
  now_stage: ChainStage;
  plants: number;
  wet_lb: number;
  pkg_g: number;
  status: Grain;
  identity: string;
};

export const STAGES: { id: ChainStage; label: string; law: string }[] = [
  { id: "CLONE", label: "Clone", law: "Untagged batches. Not dual MATCH." },
  { id: "VEG", label: "Veg", law: "Mothers tagged. Veg batches untagged." },
  { id: "FLOWER", label: "Flower", law: "F1–F4 dual MATCH 9 Sep." },
  { id: "DRY", label: "Dry", law: "Wet still on the rack until packaged." },
  { id: "CURE", label: "Cure", law: "Open harvest names CERTIFIED." },
  { id: "PACKAGE", label: "Package", law: "OS qty until retire-pass MATCH." },
  { id: "PROCESS", label: "Process", law: "MP conversions. Item+UOM gate." },
  { id: "TRANSFER", label: "Transfer", law: "Manifest in Metrc. Apex is money." },
  { id: "SOLD", label: "Sold", law: "Apex invoice SoR. Tag MATCH named." },
];

export const STAGE_OF: Record<S2SRoom["stage"], ChainStage> = {
  CANOPY: "FLOWER",
  BATCH: "CLONE",
  DRYING: "DRY",
  PACKAGED: "PACKAGE",
  EMPTY: "PACKAGE",
};

export const PIPELINE: { stage: ChainStage; rooms: string[]; licence: S2SRoom["licence"] }[] = [
  { stage: "CLONE", rooms: ["Clone Room"], licence: LIC_MC },
  { stage: "VEG", rooms: ["Vegetation Room", "Mother Room"], licence: LIC_MC },
  { stage: "FLOWER", rooms: ["Flower Room #1", "Flower Room #2", "Flower Room #3", "Flower Room #4"], licence: LIC_MC },
  { stage: "DRY", rooms: ["Dry Room #1", "Dry Room #2"], licence: LIC_MC },
  { stage: "CURE", rooms: ["Cure Vault", "Fulfillment Vault"], licence: LIC_MC },
  { stage: "PACKAGE", rooms: ["Finish Vault", "Pre Trim Storage Room", "Trim Room", "Packaging Room"], licence: LIC_MC },
  { stage: "PROCESS", rooms: ["Hydrocarbon", "Solventless", "Biomass Prep", "Production Room"], licence: LIC_MP },
  { stage: "TRANSFER", rooms: ["Shipping & Receiving"], licence: LIC_MP },
  { stage: "SOLD", rooms: ["Sold · Apex"], licence: LIC_MP },
];

export const LOTS: Lot[] = [
  {
    id: "GM-F1-0831",
    name: "TG Gush Mintz - 20260831 F1",
    strain: "TG Gush Mintz",
    licence: LIC_MC,
    now_room: "Dry Room #2",
    now_stage: "DRY",
    plants: 380,
    wet_lb: 465.6,
    pkg_g: 0,
    status: "CERTIFIED",
    identity: "wet 465.6 = waste 0 + packaged 0 + moisture residual 465.6 still on the rack. Names CERTIFIED.",
  },
  {
    id: "LD-F1-0831",
    name: "TG Lemon Drop - 20260831 F1",
    strain: "TG Lemon Drop",
    licence: LIC_MC,
    now_room: "Dry Room #2",
    now_stage: "DRY",
    plants: 380,
    wet_lb: 393.3,
    pkg_g: 0,
    status: "CERTIFIED",
    identity: "wet 393.3 on rack. Dry due 10 Sep. REMINDER, not late.",
  },
  {
    id: "CH-F1-0831",
    name: "TG Chimera - 20260831 F1",
    strain: "TG Chimera",
    licence: LIC_MC,
    now_room: "Dry Room #2",
    now_stage: "DRY",
    plants: 190,
    wet_lb: 166.4,
    pkg_g: 0,
    status: "CERTIFIED",
    identity: "wet 166.4 on rack. 190 plants from F1 pull 31 Aug.",
  },
  {
    id: "XJ-F1-0831",
    name: "TG XJ-13 - 20260831 F1",
    strain: "TG XJ-13",
    licence: LIC_MC,
    now_room: "Dry Room #2",
    now_stage: "DRY",
    plants: 190,
    wet_lb: 180.5,
    pkg_g: 0,
    status: "CERTIFIED",
    identity: "wet 180.5 on rack. Completes Dry Room #2 4-harvest book.",
  },
  {
    id: "SB-F4-0810",
    name: "TG Super Boof - 20260810 f4",
    strain: "TG Super Boof",
    licence: LIC_MC,
    now_room: "Fulfillment Vault",
    now_stage: "CURE",
    plants: 182,
    wet_lb: 154.1,
    pkg_g: 6804,
    status: "PARTIAL",
    identity: "wet 154.1 = waste + 15 lb packaged + residual 126.1. 1 Metrc package OPEN, not MATCH. EXEC late 13 biz days.",
  },
  {
    id: "AF-F4-0811",
    name: "TG Apple Fritter - 20260811 f4",
    strain: "TG Apple Fritter",
    licence: LIC_MC,
    now_room: "Fulfillment Vault",
    now_stage: "CURE",
    plants: 210,
    wet_lb: 275.1,
    pkg_g: 0,
    status: "PARTIAL",
    identity: "wet 275.1, packaged 0, residual 261.7. EXEC late 12 biz days. No Metrc package.",
  },
  {
    id: "AF-F3-0727",
    name: "TG Apple Fritter - 20260727 F3",
    strain: "TG Apple Fritter",
    licence: LIC_MC,
    now_room: "Cure Vault",
    now_stage: "CURE",
    plants: 380,
    wet_lb: 392.3,
    pkg_g: 3402,
    status: "PARTIAL",
    identity: "wet 392.3, packaged 7.5 lb, residual 367.5. EXEC late 23 biz days.",
  },
  {
    id: "GM-F1-LIVE",
    name: "F1 live · TG Gush Mintz 190",
    strain: "TG Gush Mintz",
    licence: LIC_MC,
    now_room: "Flower Room #1",
    now_stage: "FLOWER",
    plants: 190,
    wet_lb: 0,
    pkg_g: 0,
    status: "CERTIFIED",
    identity: "Current F1 cohort planted 2026-08-04. Dual MATCH tag|strain|room|planted. Not a harvest.",
  },
  {
    id: "MOTHER-30",
    name: "Mother stock · 30 strains",
    strain: "30 mothers",
    licence: LIC_MC,
    now_room: "Mother Room",
    now_stage: "VEG",
    plants: 30,
    wet_lb: 0,
    pkg_g: 0,
    status: "CERTIFIED",
    identity: "30 tagged vegetative. Planted 2026-07-21. Not the 1,430 untagged veg batches.",
  },
  {
    id: "CLONE-50",
    name: "Clone Room · 50 untagged batches",
    strain: "mixed",
    licence: LIC_MC,
    now_room: "Clone Room",
    now_stage: "CLONE",
    plants: 4470,
    wet_lb: 0,
    pkg_g: 0,
    status: "PARTIAL",
    identity: "Untagged immature. 9 Sep PlantBatchesActive in vault. Not dual MATCH.",
  },
  {
    id: "VEG-25",
    name: "Vegetation Room · 25 untagged batches",
    strain: "mixed",
    licence: LIC_MC,
    now_room: "Vegetation Room",
    now_stage: "VEG",
    plants: 1430,
    wet_lb: 0,
    pkg_g: 0,
    status: "PARTIAL",
    identity: "Untagged vegetative batches. Not the 30 tagged mothers.",
  },
  {
    id: "SOLD-WORCESTER",
    name: "1A40A030000E5B1000005716",
    strain: "sold flower",
    licence: LIC_MP,
    now_room: "Sold · Apex",
    now_stage: "SOLD",
    plants: 0,
    wet_lb: 0,
    pkg_g: 168,
    status: "PARTIAL",
    identity: "168 g. Manifest 0003347439. Apex 1557/1584/1585 slash invoices named. COA on file. Buyer Cannabis of Worcester LLC.",
  },
  {
    id: "MP-HYDRO",
    name: "Hydrocarbon · 80 packages",
    strain: "extract",
    licence: LIC_MP,
    now_room: "Hydrocarbon",
    now_stage: "PROCESS",
    plants: 0,
    wet_lb: 0,
    pkg_g: 64924,
    status: "ISSUE",
    identity: "OS active packages. Qty not dual MATCH. Convert in Metrc.",
  },
  {
    id: "MP-FREEZER",
    name: "Freezer / biomass · 28 packages",
    strain: "fresh frozen",
    licence: LIC_MP,
    now_room: "Freezer/Biomass Storage",
    now_stage: "PACKAGE",
    plants: 0,
    wet_lb: 0,
    pkg_g: 200282.5,
    status: "ISSUE",
    identity: "Fresh frozen + biomass. OS qty. Not certified until retire-pass.",
  },
  {
    id: "STALE-FINISH",
    name: "Finish Vault MC · 10 stale actives",
    strain: "mixed",
    licence: LIC_MC,
    now_room: "Finish Vault",
    now_stage: "PACKAGE",
    plants: 0,
    wet_lb: 0,
    pkg_g: 1260,
    status: "ISSUE",
    identity: "10 stale active tags / 1,260 g OS asserts. Metrc Active grid does not. 73 MP orphans / 369.7 lb live elsewhere.",
  },
];

function hop(
  id: string,
  lot: string,
  at: string,
  licence: S2SRoom["licence"],
  room: string,
  stage: ChainStage,
  action: string,
  qty: string,
  source: Hop["source"],
  status: Grain,
  note: string,
): Hop {
  return { id, lot, at, licence, room, stage, action, qty, source, status, note };
}

export const MOVEMENT_HOPS: Hop[] = [
  hop("H01", "GM-F1-LIVE", "2026-07-21", LIC_MC, "Clone Room", "CLONE", "Cut from mother", "190 immature", "METRC", "PARTIAL", "Untagged batch. Source mother in Mother Room."),
  hop("H02", "GM-F1-LIVE", "2026-07-28", LIC_MC, "Vegetation Room", "VEG", "Moved to veg", "190 untagged", "METRC", "PARTIAL", "Still untagged. Convert in Metrc."),
  hop("H03", "GM-F1-LIVE", "2026-08-04", LIC_MC, "Flower Room #1", "FLOWER", "Tagged + flowered", "190 tagged", "METRC", "CERTIFIED", "Dual MATCH tag|strain|room|planted 4 Aug."),
  hop("H04", "GM-F1-0831", "2026-06-08", LIC_MC, "Clone Room", "CLONE", "Cut from mother", "380 immature", "METRC", "PARTIAL", "Prior F1 cycle."),
  hop("H05", "GM-F1-0831", "2026-06-15", LIC_MC, "Vegetation Room", "VEG", "Moved to veg", "380", "METRC", "PARTIAL", "Prior cycle veg."),
  hop("H06", "GM-F1-0831", "2026-06-29", LIC_MC, "Flower Room #1", "FLOWER", "Flowered prior cycle", "380 tagged", "METRC", "CERTIFIED", "Pulled 31 Aug. Room refilled 4 Aug."),
  hop("H07", "GM-F1-0831", "2026-08-31", LIC_MC, "Dry Room #2", "DRY", "Harvested wet", "465.6 lb wet", "METRC", "CERTIFIED", "Harvest name CERTIFIED. Residual still on rack."),
  hop("H08", "LD-F1-0831", "2026-08-31", LIC_MC, "Dry Room #2", "DRY", "Harvested wet", "393.3 lb wet", "METRC", "CERTIFIED", "Same F1 pull. Dry due 10 Sep."),
  hop("H09", "CH-F1-0831", "2026-08-31", LIC_MC, "Dry Room #2", "DRY", "Harvested wet", "166.4 lb wet", "METRC", "CERTIFIED", "190 plants. Chimera."),
  hop("H10", "XJ-F1-0831", "2026-08-31", LIC_MC, "Dry Room #2", "DRY", "Harvested wet", "180.5 lb wet", "METRC", "CERTIFIED", "Closes Dry Room #2 4-harvest book."),
  hop("H11", "SB-F4-0810", "2026-06-01", LIC_MC, "Clone Room", "CLONE", "Cut", "182 immature", "METRC", "PARTIAL", "F4 Super Boof cycle."),
  hop("H12", "SB-F4-0810", "2026-06-10", LIC_MC, "Vegetation Room", "VEG", "Veg", "182", "METRC", "PARTIAL", "Untagged then tagged at flower."),
  hop("H13", "SB-F4-0810", "2026-06-17", LIC_MC, "Flower Room #4", "FLOWER", "Flowered", "182 tagged", "METRC", "CERTIFIED", "SMALL room. Pulled 10 Aug."),
  hop("H14", "SB-F4-0810", "2026-08-10", LIC_MC, "Dry Room #1", "DRY", "Harvested", "154.1 lb wet", "METRC", "PARTIAL", "Dry #1 now empty of live harvests — this lot moved on."),
  hop("H15", "SB-F4-0810", "2026-08-20", LIC_MC, "Fulfillment Vault", "CURE", "On rack + 1 package", "15 lb tagged · 126.1 residual", "METRC", "PARTIAL", "1 Metrc package. Item+UOM not MATCH. EXEC late."),
  hop("H16", "AF-F4-0811", "2026-08-11", LIC_MC, "Fulfillment Vault", "CURE", "Harvested F4 → vault", "275.1 lb wet", "METRC", "PARTIAL", "No package yet. EXEC late 12."),
  hop("H17", "AF-F3-0727", "2026-07-27", LIC_MC, "Cure Vault", "CURE", "F3 pull onto cure", "392.3 lb wet", "METRC", "PARTIAL", "7.5 lb packaged. Residual 367.5. EXEC late 23."),
  hop("H18", "MOTHER-30", "2026-07-21", LIC_MC, "Mother Room", "VEG", "Mothers planted", "30 tagged veg", "METRC", "CERTIFIED", "30 strains. Dual MATCH."),
  hop("H19", "CLONE-50", "2026-09-09", LIC_MC, "Clone Room", "CLONE", "Census · untagged batches", "4,470 in 50 batches", "OS", "PARTIAL", "PlantBatchesActive 9 Sep in vault. Not MATCH."),
  hop("H20", "VEG-25", "2026-09-09", LIC_MC, "Vegetation Room", "VEG", "Census · untagged batches", "1,430 in 25 batches", "OS", "PARTIAL", "Not the 30 tagged mothers."),
  hop("H21", "SOLD-WORCESTER", "2026-03-12", LIC_MC, "Flower Room #2", "FLOWER", "Flowered (history)", "sold lot origin", "METRC", "PARTIAL", "History. Do not add to live canopy."),
  hop("H22", "SOLD-WORCESTER", "2026-05-04", LIC_MC, "Dry Room #2", "DRY", "Harvested", "history", "METRC", "PARTIAL", "Closed harvest. Moisture written off in Metrc."),
  hop("H23", "SOLD-WORCESTER", "2026-05-18", LIC_MP, "Finish Vault", "PACKAGE", "Packaged 168 g", "168 g", "METRC", "PARTIAL", "Tag 1A40A030000E5B1000005716."),
  hop("H24", "SOLD-WORCESTER", "2026-05-22", LIC_MP, "Shipping & Receiving", "TRANSFER", "Manifested", "0003347439", "METRC", "PARTIAL", "Licensed transfer outgoing."),
  hop("H25", "SOLD-WORCESTER", "2026-05-22", LIC_MP, "Sold · Apex", "SOLD", "Invoiced", "1557/1584/1585", "OS", "PARTIAL", "Slash invoices named. Apex is money SoR. COA true."),
  hop("H26", "MP-HYDRO", "2026-09-09", LIC_MP, "Hydrocarbon", "PROCESS", "Census · 80 pkg", "64,924 g OS", "OS", "ISSUE", "On-hand not certified."),
  hop("H27", "MP-FREEZER", "2026-09-09", LIC_MP, "Freezer/Biomass Storage", "PACKAGE", "Census · 28 pkg", "200,282.5 g OS", "OS", "ISSUE", "Fresh frozen. Not certified."),
  hop("H28", "STALE-FINISH", "2026-09-09", LIC_MC, "Finish Vault", "PACKAGE", "Stale actives", "10 tags / 1,260 g", "OS", "ISSUE", "Metrc Active grid does not show these. Retire-pass required."),
  hop("H29", "GM-F1-LIVE", "2026-09-09", LIC_MC, "Flower Room #1", "FLOWER", "Census · still flowering", "190 tagged", "METRC", "CERTIFIED", "F1 1,140 / 1,140 LARGE. 6 strains × 190."),
];

export const CENSUS_HOPS: Hop[] = S2S_ROOMS.map((r) => {
  const qty =
    r.tagged_flowering || r.tagged_veg
      ? `${(r.tagged_flowering + r.tagged_veg).toLocaleString()} tagged`
      : r.batch_plants
        ? `${r.batch_plants.toLocaleString()} in ${r.batch_n} batches`
        : r.harvests_open
          ? `${r.harvests_open} harvests · ${r.harvest_wet_lb.toLocaleString()} lb wet`
          : r.pkg_n
            ? `${r.pkg_n} pkg · ${r.pkg_qty_g.toLocaleString()} g OS`
            : "empty";
  const stage: ChainStage =
    r.room === "Clone Room"
      ? "CLONE"
      : r.room === "Mother Room" || r.room === "Vegetation Room"
        ? "VEG"
        : r.room.startsWith("Flower")
          ? "FLOWER"
          : r.room.startsWith("Dry")
            ? "DRY"
            : r.room === "Cure Vault" || r.room === "Fulfillment Vault"
              ? r.licence === LIC_MP
                ? "PACKAGE"
                : "CURE"
              : r.room === "Hydrocarbon" || r.room === "Solventless" || r.room === "Biomass Prep" || r.room === "Production Room"
                ? "PROCESS"
                : r.room === "Shipping & Receiving"
                  ? "TRANSFER"
                  : "PACKAGE";
  return hop(
    `C-${r.licence}-${r.room}`,
    "CENSUS-9SEP",
    "2026-09-09",
    r.licence,
    r.room,
    stage,
    "Room census",
    qty,
    r.status === "CERTIFIED" ? "METRC" : "OS",
    r.status,
    r.note,
  );
});

export const HOPS: Hop[] = [...MOVEMENT_HOPS, ...CENSUS_HOPS].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id.localeCompare(b.id)));

const DRY2 = ["TG Lemon Drop - 20260831 F1", "TG Gush Mintz - 20260831 F1", "TG Chimera - 20260831 F1", "TG XJ-13 - 20260831 F1"];
const FULFILL = [
  "TG Spec Ops - 20260810 f4",
  "TG Super Boof - 20260810 f4",
  "TG Shake Shack - 20260810 f4",
  "TG Jet Fuel Gelato - 20260810 f",
  "TG Apple Fritter - 20260811 f4",
  "TG Orange Cream - 20260608 f4",
  "TG Gastro Pop - 20260608 f4",
];

export const ROOM_HARVESTS = OPEN_CLOCK.map((h) => {
  const room = DRY2.includes(h.harvest)
    ? "Dry Room #2"
    : FULFILL.includes(h.harvest)
      ? "Fulfillment Vault"
      : "Cure Vault";
  return { ...h, room, licence: LIC_MC as const };
});

export const ISSUES = [
  {
    id: "ORPHAN-73",
    title: "73 MP orphans · 369.7 lb",
    detail: "OS still shows 73 active packages the Metrc Active grid does not. Finish/Fulfillment/Pre-Trim. Retire-pass required. Do not total as on-hand.",
    status: "ISSUE" as Grain,
    rooms: ["Finish Vault", "Fulfillment Vault", "Pre-Trim Storage"],
  },
  {
    id: "STALE-10",
    title: "Finish Vault MC · 10 stale actives / 1,260 g",
    detail: "OS asserts 10 live tags. Metrc Active does not. Named ISSUE. Not canopy.",
    status: "ISSUE" as Grain,
    rooms: ["Finish Vault"],
  },
  {
    id: "UNTAGGED",
    title: "Clone + Vegetation untagged",
    detail: "4,470 clone + 1,430 veg plants in batches. Not dual MATCH. Mothers (30) are tagged and CERTIFIED.",
    status: "PARTIAL" as Grain,
    rooms: ["Clone Room", "Vegetation Room"],
  },
  {
    id: "PKG-QTY",
    title: "Package rooms overstate until MATCH",
    detail: "MP Hydrocarbon / Solventless / Production / Freezer / Pre-Trim qty is OS-stated. Metrc grid is SoR.",
    status: "ISSUE" as Grain,
    rooms: ["Hydrocarbon", "Solventless", "Production Room", "Freezer/Biomass Storage", "Pre-Trim Storage"],
  },
  {
    id: "DRY-CLOCK",
    title: "Open harvests on the rack",
    detail: "21 unfinished harvests in Dry #2 / Cure / Fulfillment (names CERTIFIED). Clock shows 22 because Super Boof has both residual and a package. Several EXEC late vs 10-day dry.",
    status: "PARTIAL" as Grain,
    rooms: ["Dry Room #2", "Cure Vault", "Fulfillment Vault"],
  },
  {
    id: "EMPTY-ON-PURPOSE",
    title: "Empty rooms stay listed",
    detail: "Dry #1, Grind, QA, Quarantine, Trim, Packaging, Warehouse, BDA on MC — empty of live plants. Listed so custody cannot hide a room.",
    status: "EMPTY" as Grain,
    rooms: ["Dry Room #1", "Grind Room", "QA Room", "Quarantine", "Trim Room", "Packaging Room"],
  },
];

export const MASS = {
  law: "Metrc identity: wet = waste + packaged tags + moisture residual. On OPEN harvests residual is still on the rack. On CLOSED, Metrc writes it off as moisture. Destroyed plants are a count, never harvest lb.",
  harvests: 389,
  open_n: 21,
  clock_n: 22,
  wet_lb: 47670.7,
  packaged_lb: 12020.2,
  remaining_lb: 27314.2,
  waste_lb: 4015.2,
  sold_tags: 2072,
  flowering: 4380,
  mothers: 30,
  clone_plants: 4470,
  veg_batches: 1430,
};

export function hopsForRoom(room: string, licence?: S2SRoom["licence"]) {
  return HOPS.filter((h) => sameMetrc(h.room, room) && (!licence || h.licence === licence));
}

export function hopsForLot(lot: string) {
  return HOPS.filter((h) => h.lot === lot && h.lot !== "CENSUS-9SEP").sort((a, b) => a.at.localeCompare(b.at));
}

export function searchChain(q: string) {
  const n = q.trim().toLowerCase();
  if (!n) return { lots: LOTS, hops: [] as Hop[], rooms: S2S_ROOMS };
  const lots = LOTS.filter((l) => namesHit(l.id + l.name + l.strain + l.now_room, n));
  const hops = HOPS.filter((h) => namesHit(h.id + h.lot + h.room + h.action + h.qty + h.note + h.licence, n));
  const rooms = S2S_ROOMS.filter((r) => namesHit(r.room + r.role + r.licence + r.note, n));
  return { lots, hops, rooms };
}

export function occupancyHead(r: S2SRoom) {
  if (r.tagged_flowering || r.tagged_veg) return `${(r.tagged_flowering + r.tagged_veg).toLocaleString()} tagged`;
  if (r.batch_plants) return `${r.batch_plants.toLocaleString()} in ${r.batch_n} batches`;
  if (r.harvests_open) return `${r.harvests_open} harvests · ${r.harvest_wet_lb.toLocaleString()} lb wet`;
  if (r.pkg_n) return `${r.pkg_n.toLocaleString()} pkg`;
  return "empty";
}
