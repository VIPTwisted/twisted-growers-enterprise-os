/** Cultivation room card — Metrc harvest identity + Vincent (CFO) allocation. Cards only. */

import type { FacRoom } from "@/data/facility";
import { ROOM_HARVESTS } from "@/data/s2s-chain";
import { CLOCK_COUNTS, GRADE_CARD, OPEN_CLOCK, VINCENT, WEIGHT_LAW, type OpenHarvest } from "@/data/weight";

export type CultHarvest = OpenHarvest & {
  room: string;
  source: string | null;
  waste: number;
  water: number;
};

export function flowerFromHarvest(name: string): string | null {
  const m = name.match(/f\s*([1-4])/i);
  return m ? `Flower Room #${m[1]}` : null;
}

function wasteOf(h: OpenHarvest) {
  const n = h.wet - h.packaged - h.remaining;
  return n > 0.05 ? Math.round(n * 10) / 10 : 0;
}

export function cultHarvests(): CultHarvest[] {
  return ROOM_HARVESTS.map((h) => ({
    ...h,
    source: flowerFromHarvest(h.harvest),
    waste: wasteOf(h),
    water: h.remaining,
  }));
}

export function cultForRoom(room: FacRoom) {
  const all = cultHarvests();
  const metrc = room.metrc ?? room.name;
  const hanging = all.filter((h) => h.room === metrc);
  const sourced = all.filter((h) => h.source === metrc);
  const rows =
    room.zone === "flower" ? sourced : hanging.length ? hanging : sourced;
  const sum = (k: "wet" | "waste" | "packaged" | "water" | "plants") =>
    rows.reduce((s, r) => s + r[k], 0);
  const wet = sum("wet");
  const waste = sum("waste");
  const packaged = sum("packaged");
  const water = sum("water");
  const plants = sum("plants");
  const filed = CLOCK_COUNTS.grades_filed;
  return {
    rows,
    hanging,
    sourced,
    wet,
    waste,
    packaged,
    water,
    plants,
    n: rows.length,
    exec: rows.filter((r) => r.level === "EXEC").length,
    filed,
    vincent: VINCENT.name,
    law: WEIGHT_LAW.alloc,
    grade: GRADE_CARD,
    identityOk: Math.abs(wet - (waste + packaged + water)) < 0.2,
  };
}

export function isCultRoom(room: FacRoom) {
  return room.zone === "flower" || room.zone === "canopy" || room.zone === "dry" || room.id === "veg" || room.id === "cure";
}
