/** Finished-goods lots in Inventory (Finish Vault / Fulfillment / Shipping). Expiry is the package date + 1 year unless labeled otherwise. */
import { LIC_MC, LIC_MP } from "@/data/licences";

export const INV_AS_OF = "2026-09-10";

export type InvLot = {
  id: string;
  room: "vault" | "fulfill" | "ship";
  metrc: string;
  product: string;
  strain: string;
  qty: number;
  uom: "ea" | "lb";
  packed: string;
  expires: string;
  licence: typeof LIC_MC | typeof LIC_MP;
  grain: "PARTIAL" | "ISSUE";
};

export const INV_LOTS: InvLot[] = [
  { id: "FG-4401", room: "vault", metrc: "Finish Vault", product: "3.5g jar", strain: "Pineapple Pounds", qty: 48, uom: "ea", packed: "2025-10-12", expires: "2026-10-12", licence: LIC_MC, grain: "ISSUE" },
  { id: "FG-4408", room: "vault", metrc: "Finish Vault", product: "3.5g jar", strain: "Grape Gasoline", qty: 24, uom: "ea", packed: "2025-09-01", expires: "2026-09-01", licence: LIC_MC, grain: "ISSUE" },
  { id: "FG-4412", room: "vault", metrc: "Finish Vault", product: "Pre-roll 1g", strain: "Twisted Runtz", qty: 120, uom: "ea", packed: "2026-03-18", expires: "2027-03-18", licence: LIC_MP, grain: "PARTIAL" },
  { id: "FG-4420", room: "fulfill", metrc: "Fulfillment Vault", product: "Bulk flower", strain: "Sunset Sherbet", qty: 8.4, uom: "lb", packed: "2026-07-22", expires: "2027-07-22", licence: LIC_MC, grain: "PARTIAL" },
  { id: "FG-4421", room: "fulfill", metrc: "Fulfillment Vault", product: "3.5g jar", strain: "Wedding Cake", qty: 36, uom: "ea", packed: "2025-09-20", expires: "2026-09-20", licence: LIC_MP, grain: "PARTIAL" },
  { id: "FG-4430", room: "ship", metrc: "Shipping & Receiving", product: "3.5g jar", strain: "Gary Payton", qty: 18, uom: "ea", packed: "2026-01-04", expires: "2027-01-04", licence: LIC_MC, grain: "PARTIAL" },
  { id: "FG-4431", room: "ship", metrc: "Shipping & Receiving", product: "Pre-roll 1g", strain: "Gelato 41", qty: 40, uom: "ea", packed: "2025-09-08", expires: "2026-09-08", licence: LIC_MP, grain: "ISSUE" },
];

export function invDaysLeft(lot: InvLot, today = INV_AS_OF) {
  const a = Date.parse(today + "T12:00:00");
  const b = Date.parse(lot.expires + "T12:00:00");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function lotsForRoom(roomId: string) {
  if (roomId === "dock-inv") return INV_LOTS;
  if (roomId === "vault" || roomId === "fulfill" || roomId === "ship") {
    return INV_LOTS.filter((l) => l.room === roomId);
  }
  return INV_LOTS;
}

export function invExpiryKpi(roomId?: string) {
  const rows = roomId ? lotsForRoom(roomId) : INV_LOTS;
  const days = rows.map((l) => ({ lot: l, d: invDaysLeft(l) }));
  const expired = days.filter((x) => x.d != null && x.d < 0);
  const soon = days.filter((x) => x.d != null && x.d >= 0 && x.d <= 30);
  return {
    lots: rows.length,
    expired: expired.length,
    soon: soon.length,
    watch: expired.length + soon.length,
    rows: days.sort((a, b) => (a.d ?? 9999) - (b.d ?? 9999)),
  };
}
