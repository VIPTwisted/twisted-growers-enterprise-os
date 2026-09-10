import { CANOPY, DRY_DAYS, FLOOR, MFG, OPEN_CLOCK } from "@/data/weight";
import { hopsForRoom, LOTS, ROOM_HARVESTS } from "@/data/s2s-chain";
import { sameMetrc } from "@/data/room-alias";
import { CYCLE_DAYS, daysPlanted, FLOWER_COHORTS, FLOWER_ROOMS } from "@/data/flowering";
import { S2S_AS_OF, S2S_ROOMS } from "@/data/s2s-rooms";
import type { FacRoom, FacZone } from "@/data/facility";
import { AGENTS, liveFor } from "@/data/facility";

export const FLOWER_DAYS = CYCLE_DAYS;
export const VEG_DAYS = 21;
export const AS_OF = "2026-09-09";

/** Floor managers and operators. Owners / CEO / CFO / HR are leadership, not zoned on the floor. */
export const FLOOR_STAFF = [
  {
    name: "Jacqueline Dixon",
    seat: "Cultivation Manager",
    zones: ["flower", "canopy", "dry"] as FacZone[],
    rooms: ["f1", "f2", "f3", "f4", "veg", "dry1", "dry2", "cure"],
    covers: "Cultivation — flower, vegetation, dry and cure.",
  },
  {
    name: "Kyle Dixon",
    seat: "Pre-Rolls Manager",
    zones: ["process"] as FacZone[],
    rooms: ["office", "infused"],
    covers: "Pre-rolls — economy pre-rolls and infused pre-rolls.",
  },
  {
    name: "Bert Goode",
    seat: "Manufacturing Manager",
    zones: ["process"] as FacZone[],
    rooms: ["hydro", "solventless", "kitchen", "freezer", "biomass", "bda", "vault", "fulfill", "ship", "dock-inv", "pretrim", "quar", "wh1"],
    covers: "All manufacturing — extraction, vaults, dock, frozen and biomass.",
  },
  {
    name: "Josh",
    seat: "Machine Operator",
    zones: ["process"] as FacZone[],
    rooms: ["conf", "pack", "infused"],
    covers: "Flower packaging equipment and infused pre-rolls.",
    badge: "/staff/josh-badge.jpg",
  },
];

/** Leadership is not zoned onto the floor. */
export const LEADERSHIP = [
  { name: "Vincent DeMartino", seat: "CEO, CFO & Sales Director", covers: "Leadership. Not a facility floor employee. Not zoned." },
  { name: "Megan", seat: "Human Resources", covers: "HR. Not zoned on the floor." },
];

export const OPS_STATIONS = [
  { id: "flower-pack", label: "Flower packaging equipment", room: "conf", operator: 1, packer: 1 },
  { id: "infused", label: "Infused pre-rolls", room: "infused", operator: 1, packer: 0 },
  { id: "other", label: "Other", room: "pack", operator: 1, packer: 0 },
] as const;

export type OpsStation = (typeof OPS_STATIONS)[number]["id"];

export function stationLabel(id: string | null | undefined) {
  return OPS_STATIONS.find((s) => s.id === id)?.label ?? "Unscheduled";
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function strainFromHarvest(harvest: string) {
  return harvest.replace(/\s*-\s*\d{8}.*$/i, "").trim();
}

export type CropRow = {
  strain: string;
  name: string;
  plants: number;
  stage: "FLOWER" | "DRY" | "CURE" | "VEG" | "CLONE";
  planted: string;
  wet_lb: number;
  packaged_lb: number;
  day: number;
  left: number;
  cycle: number;
  due: string;
  status: string;
  grain: string;
};

export function cropsFor(room: FacRoom): CropRow[] {
  if (room.id === "veg") {
    return [
      ...cropsFor({ ...room, id: "mother-slice", name: "Mother Room", metrc: "Mother Room" }),
      ...cropsFor({ ...room, id: "veg-slice", name: "Vegetation Room", metrc: "Vegetation Room" }),
      ...cropsFor({ ...room, id: "clone-slice", name: "Clone Room", metrc: "Clone Room" }),
    ];
  }
  const key = room.metrc ?? room.name;

  const flower = FLOWER_COHORTS.filter((c) => c.room === key);
  if (flower.length) {
    const meta = FLOWER_ROOMS.find((r) => r.room === key);
    return flower.map((c) => {
      const day = daysPlanted(c.planted, AS_OF);
      const left = CYCLE_DAYS - day;
      const due = addDays(c.planted, CYCLE_DAYS);
      return {
        strain: c.strain,
        name: c.strain,
        plants: c.n,
        stage: "FLOWER" as const,
        planted: c.planted,
        wet_lb: 0,
        packaged_lb: 0,
        day,
        left,
        cycle: CYCLE_DAYS,
        due,
        status:
          left < 0
            ? `Overdue ${Math.abs(left)}d · planted ${c.planted}`
            : `Flowering · day ${day} of ${CYCLE_DAYS} · pull in ${left}d`,
        grain: "CERTIFIED",
      };
    });
  }

  const harvests = ROOM_HARVESTS.filter((h) => sameMetrc(h.room, key) || h.room === key);
  if (harvests.length) {
    return harvests.map((h) => {
      const left = DRY_DAYS - h.days_since_cut;
      const stage = h.room.includes("Cure") || h.room.includes("Fulfillment") ? ("CURE" as const) : ("DRY" as const);
      return {
        strain: strainFromHarvest(h.harvest),
        name: h.harvest,
        plants: h.plants,
        stage,
        planted: h.cut,
        wet_lb: h.wet,
        packaged_lb: h.packaged,
        day: h.days_since_cut,
        left,
        cycle: DRY_DAYS,
        due: h.dry_due,
        status:
          h.level === "EXEC"
            ? `EXEC · ${h.biz_late} biz days late · ${h.plants} plants · ${h.wet} lb wet`
            : `Drying · day ${h.days_since_cut} of ${DRY_DAYS} · ${h.plants} plants`,
        grain: h.level === "REMINDER" ? "CERTIFIED" : "PARTIAL",
      };
    });
  }

  if (key === "Mother Room") {
    return [
      {
        strain: "30 strains",
        name: "Mother stock",
        plants: 30,
        stage: "VEG",
        planted: "2026-07-21",
        wet_lb: 0,
        packaged_lb: 0,
        day: daysPlanted("2026-07-21", AS_OF),
        left: 0,
        cycle: 0,
        due: "standing",
        status: "30 tagged mothers · 1 per strain · CERTIFIED",
        grain: "CERTIFIED",
      },
    ];
  }
  if (key === "Vegetation Room") {
    return [
      {
        strain: "mixed batches",
        name: "25 untagged veg batches",
        plants: 1430,
        stage: "VEG",
        planted: AS_OF,
        wet_lb: 0,
        packaged_lb: 0,
        day: 0,
        left: VEG_DAYS,
        cycle: VEG_DAYS,
        due: "batch",
        status: "1,430 plants in 25 batches · PARTIAL until dual MATCH",
        grain: "PARTIAL",
      },
    ];
  }
  if (key === "Clone Room") {
    return [
      {
        strain: "mixed batches",
        name: "50 untagged clone batches",
        plants: 4470,
        stage: "CLONE",
        planted: AS_OF,
        wet_lb: 0,
        packaged_lb: 0,
        day: 0,
        left: 14,
        cycle: 14,
        due: "batch",
        status: "4,470 plants in 50 batches · PARTIAL until dual MATCH",
        grain: "PARTIAL",
      },
    ];
  }
  return [];
}

export function roomClock(room: FacRoom) {
  const crops = cropsFor(room);
  if (!crops.length) return null;
  const next = Math.min(...crops.map((c) => c.left));
  if (!Number.isFinite(next)) return null;
  const tone = next <= 0 ? "hot" : next <= 7 ? "warn" : "ok";
  const text = next < 0 ? `${Math.abs(next)}d late` : next === 0 ? "due today" : `${next}d left`;
  return { text, tone, left: next };
}

export function staffForZone(zone: FacZone) {
  return FLOOR_STAFF.filter((s) => s.zones.includes(zone) && !s.rooms?.length);
}

export function staffForRoom(room: FacRoom) {
  return FLOOR_STAFF.filter((s) => s.rooms?.includes(room.id));
}

/** Department headcount on the Phase I floor. Names are not on a shift book. */
export const ROOM_DEPT: Record<string, { dept: string; n: number; shift: string }> = {
  veg: { dept: "Cultivation", n: 4, shift: "07:00–15:30" },
  office: { dept: "Economy Pre-Rolls", n: 3, shift: "07:00–15:30" },
  kitchen: { dept: "Extraction", n: 2, shift: "07:00–15:30" },
  infused: { dept: "Flower/Infused Pre-Rolls", n: 2, shift: "07:00–15:30" },
  conf: { dept: "Flower Packaging", n: 1, shift: "07:00–15:30" },
  pack: { dept: "Packaging", n: 2, shift: "07:00–15:30" },
  ship: { dept: "Shipping/Support", n: 1, shift: "07:00–15:30" },
  "rr-m": { dept: "Trimming", n: 1, shift: "07:00–15:30" },
  f1: { dept: "Cultivation", n: 4, shift: "07:00–15:30" },
  f2: { dept: "Cultivation", n: 4, shift: "07:00–15:30" },
  f3: { dept: "Cultivation", n: 4, shift: "07:00–15:30" },
  f4: { dept: "Cultivation", n: 4, shift: "07:00–15:30" },
  dry1: { dept: "Cultivation", n: 4, shift: "07:00–15:30" },
  dry2: { dept: "Cultivation", n: 4, shift: "07:00–15:30" },
};

export type DutyRow = {
  date: string;
  label: string;
  name: string;
  role: string;
  shift: string;
  named: boolean;
  station?: string;
};

export function etYmd(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function dutiesFor(room: FacRoom, from: string, to: string, assigns: { who: string; date: string; station: string; seat?: string }[] = []): DutyRow[] {
  const leads = staffForRoom(room);
  const desk = ROOM_DEPT[room.id];
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
  const rows: DutyRow[] = [];
  for (let d = new Date(start), n = 0; d <= end && n < 31; d.setDate(d.getDate() + 1), n += 1) {
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    if (weekend) {
      rows.push({ date: iso, label, name: "—", role: "No scheduled shift", shift: "off", named: false });
      continue;
    }
    for (const lead of leads) {
      const st = lead.name === "Josh" ? assigns.find((a) => a.who === "Josh" && a.date === iso && a.seat !== "packer")?.station : undefined;
      const here = st ? OPS_STATIONS.find((s) => s.id === st)?.room === room.id : false;
      const role =
        lead.name === "Josh"
          ? st
            ? here
              ? `ON THIS STATION · ${stationLabel(st)}`
              : `On ${stationLabel(st)} — not this room`
            : "UNSCHEDULED — pick station"
          : lead.covers;
      rows.push({ date: iso, label, name: lead.name, role, shift: desk?.shift ?? "07:00–15:30", named: true, station: st });
    }
    if (desk?.n) {
      rows.push({
        date: iso,
        label,
        name: `${desk.n} on ${desk.dept}`,
        role: "Department desk · technician names are not on the shift book",
        shift: desk.shift,
        named: false,
      });
    }
    if (room.id === "conf") {
      const packer = assigns.find((a) => a.date === iso && a.seat === "packer" && a.station === "flower-pack");
      rows.push({
        date: iso,
        label,
        name: packer?.who || "Packer",
        role: packer ? "Packer · flower packaging machine" : "OPEN — flower packaging needs 1 packer",
        shift: desk?.shift ?? "07:00–15:30",
        named: !!packer,
        station: packer ? "flower-pack" : undefined,
      });
    }
  }
  return rows;
}

export function roomKpis(room: FacRoom) {
  const key = room.metrc ?? "";
  const live = liveFor(room);
  const crops = cropsFor(room);
  const harvests = ROOM_HARVESTS.filter((h) => live.some((r) => sameMetrc(r.room, h.room)) || sameMetrc(h.room, key) || h.room === key);
  const lots = LOTS.filter((l) => live.some((r) => sameMetrc(r.room, l.now_room)) || sameMetrc(l.now_room, key));
  const pkgs = live.reduce((n, r) => n + r.pkg_n, 0);
  const pkgG = live.reduce((n, r) => n + r.pkg_qty_g, 0);
  const wet = live.reduce((n, r) => n + r.harvest_wet_lb, 0) || crops.reduce((n, c) => n + c.wet_lb, 0);
  const tagged = live.reduce((n, r) => n + r.tagged_flowering + r.tagged_veg, 0) || crops.reduce((n, c) => n + c.plants, 0);
  const staff = staffForRoom(room);
  const strainN = new Set(crops.map((c) => c.strain)).size;
  const plantN = crops.reduce((n, c) => n + c.plants, 0);
  const hops = live.flatMap((r) => hopsForRoom(r.room, r.licence));
  return {
    live,
    crops,
    harvests,
    lots,
    pkgs,
    pkgG,
    wet,
    tagged,
    staff,
    mfg: room.zone === "process",
    floor: FLOOR,
    mfgK: MFG,
    asOf: S2S_AS_OF,
    agents: AGENTS,
    canopy: CANOPY,
    hops,
    strainN,
    plantN,
    flowerMeta: FLOWER_ROOMS.find((r) => r.room === key),
    openClock: OPEN_CLOCK.filter((h) => harvests.some((x) => x.harvest === h.harvest)),
  };
}
