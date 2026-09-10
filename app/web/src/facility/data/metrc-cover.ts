/** What Metrc is vs what the twin map and room cards actually hold. Named gaps stay named. */

import { FAC_ROOMS } from "@/data/facility";
import { floorIdFromName } from "@/data/room-alias";
import { S2S_AS_OF, S2S_ROOMS } from "@/data/s2s-rooms";
import { WEIGHT_KPI } from "@/data/weight";

export type CoverGrain = "ON CARD" | "ON MAP" | "GAP" | "CLUSTER";

export type CoverRow = {
  object: string;
  grain: CoverGrain;
  where: string;
  note: string;
};

export const METRC_COVER: CoverRow[] = [
  { object: "Locations (rooms)", grain: "ON MAP", where: "Every occupancy name on Phase I", note: "Mother Room and Clone Room share the Vegetation box — one physical room, three Metrc locations." },
  { object: "Plants · flowering tagged", grain: "ON CARD", where: "F1–F4", note: "Dual MATCH 9 Sep. 4,380." },
  { object: "Plants · veg tagged", grain: "ON CARD", where: "Vegetation · Mother", note: "30 mothers CERTIFIED." },
  { object: "Plant batches (untagged)", grain: "ON CARD", where: "Clone · Vegetation", note: "PARTIAL. Not dual MATCH." },
  { object: "Plants · inactive / destroyed", grain: "GAP", where: "Not per room", note: `${WEIGHT_KPI.plants_destroyed.toLocaleString()} destroyed cumulative. Metrc will not serve >730 days. Inactive catch-up is a report, not this pin.` },
  { object: "Harvests · open", grain: "ON CARD", where: "Dry / Cure / Fulfillment", note: "Wet, waste, water, packaged tags." },
  { object: "Harvests · closed book", grain: "ON CARD", where: "CFO allocation + monthly", note: "389 harvests day-one → 8 Sep. Per-room closed list is the monthly book, not a tag grid." },
  { object: "Harvest moisture residual", grain: "ON CARD", where: "Water / moisture tile", note: "wet − waste − packaged. Cultivation still must weigh water on the grade card." },
  { object: "Packages · active", grain: "ON CARD", where: "Every package room", note: "OS qty until retire-pass. ISSUE where OS overstates the Metrc Active grid." },
  { object: "Packages · in transit", grain: "ON CARD", where: "Shipping & Receiving", note: "MP 5 packages / 8.7 lb OS. Not certified." },
  { object: "Packages · inactive", grain: "GAP", where: "History", note: "Not on this freeze. Lands when the inactive package report is certified." },
  { object: "Lab tests / COA", grain: "ON CARD", where: "Every licensed room", note: "Card is GAP until a package from that room is tested. Not invented." },
  { object: "Transfers / manifests", grain: "ON CARD", where: "Every licensed room + Shipping", note: "Card is GAP until a transfer leaves. Manifests happen in Metrc." },
  { object: "Incoming transfers", grain: "GAP", where: "Shipping", note: "No inbound transfer book on this freeze." },
  { object: "Items / categories / UOM", grain: "GAP", where: "Admin", note: "Item catalog is not occupancy. Not on the floor map." },
  { object: "Strains", grain: "ON CARD", where: "Flower / veg cards", note: "Canopy strains CERTIFIED. Processing strains follow the package." },
  { object: "Waste · harvest", grain: "ON CARD", where: "Cultivation cards", note: "Metrc identity waste." },
  { object: "Waste · plant", grain: "GAP", where: "Not per room", note: "Destroyed plant count is cumulative, not zoned." },
  { object: "Employees", grain: "GAP", where: "Admin", note: "Metrc employee file not certified. Floor roster is 4 named + 23 unnamed seats." },
  { object: "Tags (available / used)", grain: "GAP", where: "Admin", note: "Tag pools are not occupancy." },
  { object: "Sales receipts", grain: "GAP", where: "Apex is SoR for money", note: "Metrc receipt is not the invoice. Apex invoice is on Shipping cards." },
];

export function roomsOnMap() {
  const names = new Set(S2S_ROOMS.map((r) => r.room));
  return [...names].map((name) => {
    const id = floorIdFromName(name);
    const floor = id ? FAC_ROOMS.find((r) => r.id === id) : undefined;
    return {
      name,
      floorId: id ?? null,
      floorName: floor?.name ?? null,
      grain: id ? (floor?.metrc === name ? "ON MAP" : "CLUSTER") : "GAP",
    };
  });
}

export const METRC_COVER_AS_OF = S2S_AS_OF;
