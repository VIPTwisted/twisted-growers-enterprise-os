import { S2S_AS_OF, S2S_ROOMS, type S2SRoom } from "@/data/s2s-rooms";
import { floorIdFromName, metrcNamesForFloor, sameMetrc } from "@/data/room-alias";
import { fgBook } from "@/data/finished-goods";
import { LIC_MC, LIC_MP } from "@/data/licences";

export const FACILITY = {
  name: "Twisted Growers",
  address: "415 Millennium Circle, Lakeville, MA",
  sheet: "A1.1 Floor Plan · 90% CD · 2WR 220.090",
  law: "Phase I envelope from the A1.1 you dropped. Boxes sit on the real walls. Metrc names are matched only where the plan labels agree. Unlabeled Metrc rooms stay off the floor until you place them.",
  asOf: S2S_AS_OF,
  plan: "/facility/phase1-cream.jpg",
  aspect: 590 / 363,
} as const;

export const WORLD = {
  w: 36,
  d: 29.4,
};

export type FacZone = "office" | "process" | "canopy" | "dry" | "flower" | "service";

export type FacRoom = {
  id: string;
  name: string;
  zone: FacZone;
  x: number;
  y: number;
  w: number;
  h: number;
  zh: number;
  jobs: string;
  labeled: true;
  metrc?: string;
  size?: "LARGE" | "SMALL";
  cap?: number;
  aliasNote?: string;
};

export type FacWing = "cultivation" | "manufacturing" | "packaging";

const PACKAGING_IDS = new Set(["office", "infused", "conf", "grind", "rr-m", "pack", "stage", "ship", "dock-inv", "vault", "fulfill"]);
const PACKAGING_ONLY = new Set(["office", "infused", "conf", "grind", "rr-m", "pack", "stage"]);

const MP_ROOMS = new Set(S2S_ROOMS.filter((r) => r.licence === LIC_MP).map((r) => r.room));

export function inWing(room: FacRoom, wing: FacWing) {
  if (isRestroom(room)) return false;
  if (wing === "packaging") return PACKAGING_IDS.has(room.id);
  const mp = MP_ROOMS.has(room.metrc ?? "") || MP_ROOMS.has(room.name) || room.id === "pretrim";
  if (wing === "manufacturing") return (mp || room.id === "ship" || room.id === "dock-inv" || room.id === "vault" || room.id === "fulfill") && !PACKAGING_ONLY.has(room.id);
  if (PACKAGING_ONLY.has(room.id)) return false;
  if (mp && room.zone !== "flower" && room.zone !== "canopy" && room.id !== "dry1" && room.id !== "dry2" && room.id !== "cure") {
    return false;
  }
  return room.zone === "flower" || room.zone === "canopy" || room.id === "dry1" || room.id === "dry2" || room.id === "cure";
}

export function wingOf(room: FacRoom): FacWing {
  if (inWing(room, "packaging")) return "packaging";
  if (inWing(room, "manufacturing")) return "manufacturing";
  return "cultivation";
}

export function roomToWorld(room: FacRoom) {
  const W = WORLD.w;
  const D = WORLD.d;
  return {
    x: ((room.x + room.w / 2) / 100 - 0.5) * W,
    z: ((room.y + room.h / 2) / 100 - 0.5) * D,
    w: (room.w / 100) * W,
    d: (room.h / 100) * D,
  };
}

/** Percent of the Phase I building crop. North is up on A1.1. Shared walls only — no corridors. */
export const FAC_ROOMS: FacRoom[] = [
  {
    id: "rr-m",
    name: "Trim Room",
    zone: "process",
    x: 2.2,
    y: 7.4,
    w: 11.8,
    h: 11.0,
    zh: 22,
    jobs: "Trim. Hand and machine.",
    labeled: true,
    metrc: "Trim Room",
    aliasNote: "Own room. Above Flower Packaging.",
  },
  {
    id: "break",
    name: "Break Room",
    zone: "office",
    x: 14.0,
    y: 7.4,
    w: 11.8,
    h: 11.0,
    zh: 18,
    jobs: "Unpaid break. Two waves. No Metrc location — ops room.",
    labeled: true,
  },
  {
    id: "conf",
    name: "Packaging Room",
    zone: "process",
    x: 2.2,
    y: 18.4,
    w: 11.8,
    h: 11.0,
    zh: 24,
    jobs: "Finished flower packs. 3.5 g eighths and other finished flower units.",
    labeled: true,
    metrc: "Packaging Room",
    aliasNote: "Below Trim. Metrc Packaging Room. 3.5 g flower jars and finished flower units. Not Josh — he runs Packaging, not this room.",
  },
  {
    id: "stage",
    name: "Packaging & Supplies",
    zone: "process",
    x: 14.0,
    y: 18.4,
    w: 11.8,
    h: 11.0,
    zh: 22,
    jobs: "Packaging supplies. Tubes, jars, labels. On-hand, reorder, cost, freight, suppliers.",
    labeled: true,
    aliasNote: "Was Staging. Not a Metrc location. OS packaging-supply book.",
  },
  {
    id: "office",
    name: "Pre-Rolls",
    zone: "process",
    x: 2.2,
    y: 29.4,
    w: 11.8,
    h: 11.2,
    zh: 22,
    jobs: "Flower pre-rolls. Fill, weigh, finish.",
    labeled: true,
    aliasNote: "West half of the old open office. No dedicated Metrc room yet.",
  },
  {
    id: "infused",
    name: "Infused Pre-Rolls",
    zone: "process",
    x: 14.0,
    y: 29.4,
    w: 11.8,
    h: 11.2,
    zh: 22,
    jobs: "Infused pre-rolls. Oil, finish, pack.",
    labeled: true,
    aliasNote: "East half of the old open office. No dedicated Metrc room yet.",
  },
  {
    id: "pack",
    name: "Packaging",
    zone: "process",
    x: 2.2,
    y: 40.6,
    w: 11.8,
    h: 10.4,
    zh: 24,
    jobs: "Finish pack. Pre-rolls, infused pre-rolls, vapes, and other non-flower finished goods. Not 3.5 g flower jars.",
    labeled: true,
    aliasNote: "Packaging Manager Josh. Not Metrc Packaging Room (that is flower). No dedicated Metrc location yet.",
  },
  {
    id: "vault",
    name: "Finish Vault",
    zone: "process",
    x: 14.0,
    y: 40.6,
    w: 11.8,
    h: 10.4,
    zh: 28,
    jobs: "Secured finished goods.",
    labeled: true,
    metrc: "Finish Vault",
  },
  {
    id: "kitchen",
    name: "Production Room",
    zone: "process",
    x: 2.2,
    y: 51.0,
    w: 11.8,
    h: 9.0,
    zh: 26,
    jobs: "Manufacturing line. Infusion, conversion, production runs.",
    labeled: true,
    metrc: "Production Room",
    aliasNote: "A1.1 labels Full Kitchen here. Display name is Manufacturing. Mapped to Metrc Production Room.",
  },
  {
    id: "cure",
    name: "Cure Vault",
    zone: "dry",
    x: 37.7,
    y: 42.6,
    w: 11.9,
    h: 10.5,
    zh: 26,
    jobs: "Curing / bulk. Open harvests.",
    labeled: true,
    metrc: "Cure Vault",
  },
  {
    id: "pretrim",
    name: "Pre Trim Storage Room",
    zone: "process",
    x: 2.2,
    y: 60.0,
    w: 23.6,
    h: 9.6,
    zh: 22,
    jobs: "Dried, awaiting trim.",
    labeled: true,
    metrc: "Pre Trim Storage Room",
  },
  {
    id: "dock-inv",
    name: "Inventory",
    zone: "process",
    x: 2.2,
    y: 84.6,
    w: 24.0,
    h: 10.4,
    zh: 22,
    jobs: "Finished-goods inventory. Packed product on the shelf, ready to ship.",
    labeled: true,
    metrc: "Shipping & Receiving",
    aliasNote: "West of the dock. Same Metrc location as Shipping & Receiving. This card is on-hand packages.",
  },
  {
    id: "ship",
    name: "Shipping",
    zone: "process",
    x: 26.2,
    y: 84.6,
    w: 23.4,
    h: 10.4,
    zh: 22,
    jobs: "Dock. Outbound orders, returns, manifests.",
    labeled: true,
    aliasNote: "East of Inventory. Desk and outbound. Apex invoice is SoR for the order. Manifests happen in Metrc.",
  },
  {
    id: "veg",
    name: "Vegetation Room",
    zone: "canopy",
    x: 25.8,
    y: 7.4,
    w: 23.8,
    h: 35.2,
    zh: 40,
    jobs: "Space, transplant, veg cycle.",
    labeled: true,
    metrc: "Vegetation Room",
  },
  {
    id: "dry2",
    name: "Dry Room #2",
    zone: "dry",
    x: 49.6,
    y: 84.6,
    w: 24.0,
    h: 10.4,
    zh: 32,
    jobs: "Hang, A/B/C, moisture.",
    labeled: true,
    metrc: "Dry Room #2",
  },
  {
    id: "dry1",
    name: "Dry Room #1",
    zone: "dry",
    x: 73.6,
    y: 84.6,
    w: 24.0,
    h: 10.4,
    zh: 32,
    jobs: "Hang, A/B/C, moisture.",
    labeled: true,
    metrc: "Dry Room #1",
  },
  {
    id: "f1",
    name: "Flower Room #1",
    zone: "flower",
    x: 49.6,
    y: 7.4,
    w: 24.0,
    h: 35.2,
    zh: 52,
    jobs: "Water, IPM, defol, harvest. LARGE cap 1,140.",
    labeled: true,
    metrc: "Flower Room #1",
    size: "LARGE",
    cap: 1140,
  },
  {
    id: "f2",
    name: "Flower Room #2",
    zone: "flower",
    x: 73.6,
    y: 7.4,
    w: 24.0,
    h: 35.2,
    zh: 52,
    jobs: "Water, IPM, defol, harvest. SMALL cap 1,050.",
    labeled: true,
    metrc: "Flower Room #2",
    size: "SMALL",
    cap: 1050,
  },
  {
    id: "f3",
    name: "Flower Room #3",
    zone: "flower",
    x: 49.6,
    y: 42.6,
    w: 24.0,
    h: 42.0,
    zh: 52,
    jobs: "Water, IPM, defol, harvest. LARGE cap 1,140.",
    labeled: true,
    metrc: "Flower Room #3",
    size: "LARGE",
    cap: 1140,
  },
  {
    id: "f4",
    name: "Flower Room #4",
    zone: "flower",
    x: 73.6,
    y: 42.6,
    w: 24.0,
    h: 42.0,
    zh: 52,
    jobs: "Water, IPM, defol, harvest. SMALL cap 1,050.",
    labeled: true,
    metrc: "Flower Room #4",
    size: "SMALL",
    cap: 1050,
  },
  {
    id: "hydro",
    name: "Hydrocarbon",
    zone: "process",
    x: 2.2,
    y: 69.6,
    w: 11.8,
    h: 15.0,
    zh: 26,
    jobs: "Extraction — hydrocarbon.",
    labeled: true,
    metrc: "Hydrocarbon",
    aliasNote: "Empty slab under Pre-Trim. Existing rooms not moved.",
  },
  {
    id: "solventless",
    name: "Solventless",
    zone: "process",
    x: 14.0,
    y: 69.6,
    w: 11.8,
    h: 15.0,
    zh: 26,
    jobs: "Extraction — solventless.",
    labeled: true,
    metrc: "Solventless",
    aliasNote: "Empty slab under Pre-Trim. Existing rooms not moved.",
  },
  {
    id: "fulfill",
    name: "Fulfillment Vault",
    zone: "dry",
    x: 25.8,
    y: 42.6,
    w: 11.9,
    h: 10.5,
    zh: 28,
    jobs: "Bulk / outbound. Open harvests and packages.",
    labeled: true,
    metrc: "Fulfillment Vault",
    aliasNote: "Empty slab south of Vegetation. Existing rooms not moved.",
  },
  {
    id: "freezer",
    name: "Freezer/Biomass Storage",
    zone: "process",
    x: 14.0,
    y: 51.0,
    w: 11.8,
    h: 9.0,
    zh: 26,
    jobs: "Fresh frozen and biomass.",
    labeled: true,
    metrc: "Freezer/Biomass Storage",
    aliasNote: "Empty slab south of Vegetation. Existing rooms not moved.",
  },
  {
    id: "bda",
    name: "BDA/Storage Room",
    zone: "process",
    x: 25.8,
    y: 53.1,
    w: 11.9,
    h: 10.5,
    zh: 22,
    jobs: "BDA storage.",
    labeled: true,
    metrc: "BDA/Storage Room",
    aliasNote: "Empty slab south of Vegetation. Existing rooms not moved.",
  },
  {
    id: "biomass",
    name: "Biomass Prep",
    zone: "process",
    x: 37.7,
    y: 53.1,
    w: 11.9,
    h: 10.5,
    zh: 22,
    jobs: "Biomass preparation.",
    labeled: true,
    metrc: "Biomass Prep",
    aliasNote: "Empty slab south of Vegetation. Existing rooms not moved.",
  },
  {
    id: "grind",
    name: "Grind Room",
    zone: "process",
    x: 25.8,
    y: 63.6,
    w: 11.9,
    h: 10.5,
    zh: 22,
    jobs: "Grinding.",
    labeled: true,
    metrc: "Grind Room",
    aliasNote: "Empty slab south of Vegetation. Existing rooms not moved.",
  },
  {
    id: "qa",
    name: "QA Room",
    zone: "process",
    x: 37.7,
    y: 63.6,
    w: 11.9,
    h: 10.5,
    zh: 22,
    jobs: "QA.",
    labeled: true,
    metrc: "QA Room",
    aliasNote: "Empty slab south of Vegetation. Existing rooms not moved.",
  },
  {
    id: "quar",
    name: "Quarantine",
    zone: "process",
    x: 25.8,
    y: 74.1,
    w: 11.9,
    h: 10.5,
    zh: 22,
    jobs: "Quarantine hold.",
    labeled: true,
    metrc: "Quarantine",
    aliasNote: "Empty slab south of Vegetation. Existing rooms not moved.",
  },
  {
    id: "wh1",
    name: "Warehouse #1",
    zone: "process",
    x: 37.7,
    y: 74.1,
    w: 11.9,
    h: 10.5,
    zh: 22,
    jobs: "Warehouse.",
    labeled: true,
    metrc: "Warehouse #1",
    aliasNote: "Empty slab south of Vegetation. Existing rooms not moved.",
  },
];

/* Floor SoR for unpaid-break waves. Wave 2 is 13:30-14:00.
   Owner 10 Sep 2026 17:49 ET: this file is the clock. The card loader
   (facility-api.ts) had drifted to 13:00-13:30; it now matches this. */
export const BREAK_WAVES = [
  { id: "w1", label: "Wave 1", start: "12:00", end: "12:30", note: "Unpaid break. Wave 2 remains on the floor." },
  {
    id: "w2",
    label: "Wave 2",
    start: "13:30",
    end: "14:00",
    note: "Unpaid break. Wave 1 remains on the floor.",
  },
] as const;

export const AGENTS = {
  n: 27,
  file: 32,
  excluded: ["Dominick DeMartino", "Vincent DeMartino", "Anthony DeMartino", "Marianna Terenzio"],
  source:
    "Metrc MC employees file: 32 Active rows. Owners, CEO, CFO, and Marianna are not facility employees — both Dominick rows, Vincent, Anthony, and Marianna are off this count. 27 remain. Role blank on every row.",
  faces: [
    { name: "Jacqueline Dixon", badge: "manager", seat: "Cultivation Manager" },
    { name: "Kyle Dixon", badge: "manager", seat: "Pre-Rolls Manager" },
    { name: "Bert Goode", badge: "manager", seat: "Manufacturing Manager" },
    { name: "Josh", badge: "operator", seat: "Machine Operator" },
  ],
};

export function isRestroom(room: Pick<FacRoom, "id" | "name">) {
  return room.id === "rr-w" || /^(women|restroom)$/i.test(room.name.trim());
}

export function shortName(room: FacRoom) {
  if (room.id === "f1") return "Flower #1";
  if (room.id === "f2") return "Flower #2";
  if (room.id === "f3") return "Flower #3";
  if (room.id === "f4") return "Flower #4";
  if (room.id === "rr-w") return "W";
  if (room.id === "rr-m") return "Trim";
  if (room.id === "stage") return "Packaging & Supplies";
  if (room.id === "veg") return "Vegetation";
  if (room.id === "dry1") return "Dry #1";
  if (room.id === "dry2") return "Dry #2";
  if (room.id === "kitchen") return "Production";
  if (room.id === "pack") return "Packaging";
  if (room.id === "ship") return "Shipping";
  if (room.id === "dock-inv") return "Inventory";
  if (room.id === "break") return "Break";
  if (room.id === "conf") return "Flower Pack";
  if (room.id === "pretrim") return "Pre-Trim";
  if (room.id === "cure") return "Cure Vault";
  if (room.id === "office") return "Pre-Rolls";
  if (room.id === "infused") return "Infused PR";
  if (room.id === "hydro") return "Hydrocarbon";
  if (room.id === "solventless") return "Solventless";
  if (room.id === "fulfill") return "Fulfillment";
  if (room.id === "freezer") return "Freezer";
  if (room.id === "bda") return "BDA";
  if (room.id === "biomass") return "Biomass";
  if (room.id === "grind") return "Grind";
  if (room.id === "qa") return "QA";
  if (room.id === "quar") return "Quarantine";
  if (room.id === "wh1") return "Warehouse";
  return room.name;
}

export function liveFor(room: FacRoom): S2SRoom[] {
  const names = metrcNamesForFloor(room.id);
  if (names.length) return S2S_ROOMS.filter((r) => names.some((n) => sameMetrc(n, r.room)));
  const key = room.metrc ?? room.name;
  return S2S_ROOMS.filter((r) => sameMetrc(r.room, key) || r.room === key);
}

export const VEG_CLUSTER = ["Vegetation Room", "Mother Room", "Clone Room"] as const;

export const FAC_DEPTS: {
  id: string;
  label: string;
  wing: FacWing | "facility";
  groups: { label: string; rooms: string[]; also?: { label: string; id: string }[] }[];
}[] = [
  {
    id: "cult",
    label: "Cultivation",
    wing: "cultivation",
    groups: [
      {
        label: "Flower",
        rooms: ["f1", "f2", "f3", "f4", "veg"],
        also: [
          { label: "Mother Room", id: "veg" },
          { label: "Clone Room", id: "veg" },
        ],
      },
      { label: "Dry / Cure", rooms: ["dry1", "dry2", "cure"] },
    ],
  },
  {
    id: "mfg",
    label: "Manufacturing",
    wing: "manufacturing",
    groups: [
      { label: "Extraction", rooms: ["hydro", "solventless", "kitchen"] },
      { label: "Frozen / biomass", rooms: ["freezer", "biomass", "bda"] },
      { label: "Vaults", rooms: ["vault", "fulfill"] },
      { label: "Dock / hold", rooms: ["dock-inv", "ship", "pretrim", "quar", "wh1"] },
    ],
  },
  {
    id: "pack",
    label: "Packaging",
    wing: "packaging",
    groups: [
      { label: "Flower", rooms: ["conf", "pack", "grind", "rr-m"] },
      { label: "Pre-rolls", rooms: ["office", "infused"] },
      { label: "Packaging & Supplies", rooms: ["stage"] },
    ],
  },
  {
    id: "ops",
    label: "Operations",
    wing: "facility",
    groups: [{ label: "Floor", rooms: ["break", "qa"] }],
  },
];

export function s2sPlants(name: string) {
  return S2S_ROOMS.filter((r) => r.room === name).reduce(
    (s, r) => s + r.tagged_flowering + r.tagged_veg + r.harvest_plants + r.batch_plants,
    0,
  );
}

export function roomHold(room: FacRoom) {
  if (room.id === "dock-inv") {
    const b = fgBook();
    return {
      tagged: 0,
      harvestPlants: 0,
      batchPlants: 0,
      inRoom: 0,
      cap: 0,
      pkg: b.pkg,
      grams: b.g,
      wet: 0,
      lb: b.lb,
    };
  }
  const rows = liveFor(room);
  const tagged = rows.reduce((s, r) => s + r.tagged_flowering + r.tagged_veg, 0);
  const harvestPlants = rows.reduce((s, r) => s + r.harvest_plants, 0);
  const batchPlants = rows.reduce((s, r) => s + r.batch_plants, 0);
  const inRoom = tagged || harvestPlants || batchPlants;
  const pkg = rows.reduce((s, r) => s + r.pkg_n, 0);
  const grams = rows.reduce((s, r) => s + r.pkg_qty_g, 0);
  const wet = rows.reduce((s, r) => s + r.harvest_wet_lb, 0);
  return {
    tagged,
    harvestPlants,
    batchPlants,
    inRoom,
    cap: room.cap ?? 0,
    pkg,
    grams,
    wet,
    lb: grams / 453.59237,
  };
}

export function roomMetrics(room: FacRoom): string[] {
  if (room.id === "stage") return [];
  const o = roomHold(room);
  const lines: string[] = [];
  if (o.cap) {
    lines.push(`${o.inRoom.toLocaleString()} plants`);
    lines.push(`hold ${o.cap.toLocaleString()}`);
  } else if (o.inRoom) {
    lines.push(`${o.inRoom.toLocaleString()} plants`);
  }
  if (o.wet) {
    lines.push(
      `${o.wet.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} lb wet`,
    );
  }
  const showPkg = o.pkg > 0 || o.lb > 0 || room.zone === "process";
  if (showPkg) {
    lines.push(`${o.pkg.toLocaleString()} pkg`);
    lines.push(`${o.lb.toLocaleString(undefined, { maximumFractionDigits: 1 })} lb`);
  }
  if (!lines.length) lines.push("empty");
  return lines;
}

export const UNPLACED = Array.from(new Set(S2S_ROOMS.map((r) => r.room)))
  .filter((name) => !floorIdFromName(name))
  .map((name) => {
    const rows = S2S_ROOMS.filter((r) => r.room === name);
    return { name, rows };
  });

export function facRoomById(id: string) {
  return FAC_ROOMS.find((r) => r.id === id);
}

export function taggedFlowering(): number {
  return S2S_ROOMS.filter((r) => r.licence === LIC_MC).reduce(
    (n, r) => n + r.tagged_flowering + r.tagged_veg,
    0,
  );
}
