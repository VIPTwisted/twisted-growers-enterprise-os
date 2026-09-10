/** Twin name, Metrc name, and every alias resolve to one floor room. */

export type RoomCanon = {
  id: string;
  floorId: string;
  metrc: string[];
  aliases: string[];
};

export const ROOM_CANON: RoomCanon[] = [
  { id: "f1", floorId: "f1", metrc: ["Flower Room #1"], aliases: ["Flower #1", "F1"] },
  { id: "f2", floorId: "f2", metrc: ["Flower Room #2"], aliases: ["Flower #2", "F2"] },
  { id: "f3", floorId: "f3", metrc: ["Flower Room #3"], aliases: ["Flower #3", "F3"] },
  { id: "f4", floorId: "f4", metrc: ["Flower Room #4"], aliases: ["Flower #4", "F4"] },
  { id: "veg", floorId: "veg", metrc: ["Vegetation Room"], aliases: ["Vegetation", "Veg"] },
  { id: "mother", floorId: "veg", metrc: ["Mother Room"], aliases: ["Mother"] },
  { id: "clone", floorId: "veg", metrc: ["Clone Room"], aliases: ["Clone"] },
  { id: "dry1", floorId: "dry1", metrc: ["Dry Room #1"], aliases: ["Dry #1"] },
  { id: "dry2", floorId: "dry2", metrc: ["Dry Room #2"], aliases: ["Dry #2"] },
  { id: "cure", floorId: "cure", metrc: ["Cure Vault"], aliases: [] },
  { id: "rr-m", floorId: "rr-m", metrc: ["Trim Room"], aliases: ["Trim"] },
  { id: "conf", floorId: "conf", metrc: ["Packaging Room"], aliases: ["Flower Packaging", "Flower Pack", "Conference"] },
  { id: "pack", floorId: "pack", metrc: [], aliases: ["Packaging", "Finish Packaging", "Vape Packaging"] },
  { id: "office", floorId: "office", metrc: [], aliases: ["Pre-Rolls", "Pre Rolls", "Economy Pre-Rolls", "Cheap Pre-Rolls"] },
  { id: "infused", floorId: "infused", metrc: [], aliases: ["Infused Pre-Rolls", "Infused PR"] },
  { id: "kitchen", floorId: "kitchen", metrc: ["Production Room"], aliases: ["Manufacturing", "Full Kitchen", "Kitchen"] },
  { id: "vault", floorId: "vault", metrc: ["Finish Vault"], aliases: ["Vault"] },
  { id: "fulfill", floorId: "fulfill", metrc: ["Fulfillment Vault"], aliases: ["Fulfillment"] },
  { id: "pretrim", floorId: "pretrim", metrc: ["Pre Trim Storage Room", "Pre-Trim Storage"], aliases: ["Pre-Trim", "Pre Trim"] },
  { id: "dock-inv", floorId: "dock-inv", metrc: ["Shipping & Receiving"], aliases: ["Inventory", "Ship / Inv", "Shipping / Inventory"] },
  { id: "ship", floorId: "ship", metrc: [], aliases: ["Shipping", "Dock"] },
  { id: "hydro", floorId: "hydro", metrc: ["Hydrocarbon"], aliases: [] },
  { id: "solventless", floorId: "solventless", metrc: ["Solventless"], aliases: [] },
  { id: "freezer", floorId: "freezer", metrc: ["Freezer/Biomass Storage"], aliases: ["Freezer / Biomass", "Freezer"] },
  { id: "bda", floorId: "bda", metrc: ["BDA/Storage Room"], aliases: ["BDA / Storage", "BDA"] },
  { id: "biomass", floorId: "biomass", metrc: ["Biomass Prep"], aliases: ["Biomass"] },
  { id: "grind", floorId: "grind", metrc: ["Grind Room"], aliases: ["Grind"] },
  { id: "qa", floorId: "qa", metrc: ["QA Room"], aliases: ["QA"] },
  { id: "quar", floorId: "quar", metrc: ["Quarantine"], aliases: [] },
  { id: "wh1", floorId: "wh1", metrc: ["Warehouse #1"], aliases: ["Warehouse"] },
  { id: "stage", floorId: "stage", metrc: [], aliases: ["Packaging & Supplies", "Packaging Inventory", "Staging", "Pack Inv"] },
  { id: "break", floorId: "break", metrc: [], aliases: ["Break Room", "Break"] },
];

export function foldName(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/#/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const LOOKUP = new Map<string, RoomCanon>();
for (const row of ROOM_CANON) {
  for (const n of [row.id, row.floorId, ...row.metrc, ...row.aliases]) {
    const k = foldName(n);
    if (k && !LOOKUP.has(k)) LOOKUP.set(k, row);
  }
}

export function canonOf(name: string | null | undefined): RoomCanon | undefined {
  if (!name) return undefined;
  return LOOKUP.get(foldName(name));
}

/** Floor box id (Mother / Clone / Vegetation → veg). */
export function floorIdFromName(name: string | null | undefined): string | undefined {
  return canonOf(name)?.floorId;
}

/** True if both strings are the same Metrc location (licence spelling variants). */
export function sameMetrc(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  if (foldName(a) === foldName(b)) return true;
  const ca = canonOf(a);
  const cb = canonOf(b);
  if (!ca || !cb) return false;
  return ca.id === cb.id;
}

/** True if both strings are the same twin room (cluster included). */
export function sameFloor(a: string | null | undefined, b: string | null | undefined) {
  const fa = floorIdFromName(a);
  const fb = floorIdFromName(b);
  if (fa && fb) return fa === fb;
  return sameMetrc(a, b);
}

export function metrcNamesForFloor(floorId: string): string[] {
  return ROOM_CANON.filter((r) => r.floorId === floorId).flatMap((r) => r.metrc);
}

export function allNamesFor(name: string): string[] {
  const c = canonOf(name);
  if (!c) return name ? [name] : [];
  const cluster = ROOM_CANON.filter((r) => r.floorId === c.floorId);
  return [...new Set(cluster.flatMap((r) => [r.id, r.floorId, ...r.metrc, ...r.aliases]))];
}

export function namesHit(hay: string, needle: string) {
  const folded = foldName(needle);
  if (!folded) return true;
  if (foldName(hay).includes(folded)) return true;
  return allNamesFor(needle).some((n) => foldName(hay).includes(foldName(n)));
}
