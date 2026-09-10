export type PackStatus = "active" | "planning" | "hold" | "discontinued";

export type PackItem = {
  id: string;
  name: string;
  image: string;
  on_hand: number;
  min_on_hand: number;
  reorder_point: number;
  cost: number;
  freight: number;
  notes: string;
  suppliers: string;
  on_order: number;
  on_order_note: string;
  sku: string;
  category: string;
  uom: string;
  status: PackStatus;
  par_max: number;
  lead_days: number;
  moq: number;
  case_pack: number;
  vendor: string;
  vendor_contact: string;
  bin: string;
  buyer: string;
  last_count: string;
  usage_30d: number;
  spec: string;
  wasted: number;
  damaged: number;
  waste_note: string;
  expires: string;
};

export const PACK_CATS = ["Tubes", "Jars", "Labels", "Lids", "Bags", "Boxes", "Vape", "Other"] as const;

const blank = {
  image: "",
  notes: "",
  suppliers: "",
  on_order_note: "",
  sku: "",
  uom: "ea",
  status: "active" as PackStatus,
  par_max: 0,
  lead_days: 14,
  moq: 0,
  case_pack: 1,
  vendor: "",
  vendor_contact: "",
  bin: "",
  buyer: "",
  last_count: "",
  usage_30d: 0,
  spec: "",
  wasted: 0,
  damaged: 0,
  waste_note: "",
  expires: "",
};

export function blankPack(name = "New item"): PackItem {
  return {
    id: "",
    name,
    on_hand: 0,
    min_on_hand: 0,
    reorder_point: 0,
    cost: 0,
    freight: 0,
    on_order: 0,
    category: "Other",
    ...blank,
  };
}

export const PACK_SEED: PackItem[] = [
  { ...blankPack(), id: "pr-plastic", name: "Plastic Pre-Roll Tubes", category: "Tubes", sku: "PKG-PR-PL", on_hand: 2400, min_on_hand: 500, reorder_point: 800, par_max: 5000, case_pack: 500, usage_30d: 900, wasted: 120, damaged: 36, waste_note: "Cracked barrels · crushed cases" },
  { ...blankPack(), id: "pr-glass", name: "Glass Pre-Roll Tubes", category: "Tubes", sku: "PKG-PR-GL", on_hand: 120, min_on_hand: 200, reorder_point: 400, par_max: 1500, case_pack: 100, usage_30d: 220, wasted: 0, damaged: 8, waste_note: "Broken in transit" },
  { ...blankPack(), id: "jar-35", name: "Flower Glass Jars 3.5g", category: "Jars", sku: "PKG-JR-35", on_hand: 80, min_on_hand: 150, reorder_point: 250, par_max: 2000, case_pack: 24, usage_30d: 180, wasted: 4, damaged: 2 },
  { ...blankPack(), id: "jar-conc", name: "Concentrate Jars", category: "Jars", sku: "PKG-JR-CON", on_hand: 400, min_on_hand: 100, reorder_point: 200, par_max: 800, case_pack: 50, usage_30d: 60 },
  { ...blankPack(), id: "lbl-flower", name: "Flower Labels", category: "Labels", sku: "PKG-LB-FL", on_hand: 50, min_on_hand: 200, reorder_point: 500, par_max: 3000, case_pack: 1000, usage_30d: 400, wasted: 40, damaged: 12, expires: "2026-09-20", waste_note: "Misprint + adhesive fail" },
  { ...blankPack(), id: "lbl-pr", name: "Pre-Roll Labels", category: "Labels", sku: "PKG-LB-PR", on_hand: 180, min_on_hand: 100, reorder_point: 250, par_max: 2000, case_pack: 1000, usage_30d: 220, expires: "2026-08-28", wasted: 18, waste_note: "Expired adhesive lot" },
  { ...blankPack(), id: "lid-cr", name: "Child-Resistant Lids", category: "Lids", sku: "PKG-LD-CR", on_hand: 900, min_on_hand: 200, reorder_point: 350, par_max: 2000, case_pack: 200, usage_30d: 160, damaged: 14 },
  { ...blankPack(), id: "bag-exit", name: "Exit Bags", category: "Bags", sku: "PKG-BG-EX", on_hand: 300, min_on_hand: 100, reorder_point: 200, par_max: 1000, case_pack: 100, usage_30d: 90 },
  { ...blankPack(), id: "box-35", name: "3.5g Carton", category: "Boxes", sku: "PKG-BX-35", on_hand: 0, min_on_hand: 0, reorder_point: 0, status: "planning", spec: "New carton. Art not approved. Do not buy." },
  { ...blankPack(), id: "ship-tape", name: "Shipping Tape", category: "Other", sku: "SHP-TP-01", bin: "SHIP", on_hand: 24, min_on_hand: 8, reorder_point: 12, usage_30d: 10 },
  { ...blankPack(), id: "ship-lbl", name: "Outbound Shipping Labels", category: "Labels", sku: "SHP-LB-01", bin: "SHIP", on_hand: 60, min_on_hand: 40, reorder_point: 80, usage_30d: 90, expires: "2026-10-01" },
];

export function packLow(item: PackItem) {
  if (item.status === "planning" || item.status === "discontinued") return false;
  const floor = item.reorder_point > 0 ? item.reorder_point : item.min_on_hand;
  if (floor <= 0) return item.on_hand <= 0 && item.status === "active";
  return item.on_hand < floor;
}

export function packLowCount(items: PackItem[]) {
  return items.filter(packLow).length;
}

export function packLanded(item: PackItem) {
  return item.cost + item.freight;
}

export function packDays(item: PackItem) {
  if (item.usage_30d <= 0) return null;
  return Math.round((item.on_hand / (item.usage_30d / 30)) * 10) / 10;
}

export function packExpiryDays(item: PackItem, today = new Date()) {
  if (!item.expires) return null;
  const t = Date.parse(item.expires + "T12:00:00");
  if (!Number.isFinite(t)) return null;
  return Math.round((t - today.getTime()) / 86400000);
}

export function packExpiring(item: PackItem, within = 30) {
  const d = packExpiryDays(item);
  return d != null && d <= within;
}

export function packKpis(items: PackItem[]) {
  const live = items.filter((i) => i.status !== "discontinued");
  const active = live.filter((i) => i.status === "active");
  const low = active.filter(packLow);
  const plan = live.filter((i) => i.status === "planning");
  const order = live.filter((i) => i.on_order > 0);
  const value = active.reduce((s, i) => s + packLanded(i) * i.on_hand, 0);
  const po = order.reduce((s, i) => s + packLanded(i) * i.on_order, 0);
  const cover = active.map(packDays).filter((n): n is number => n != null);
  const wasted = live.reduce((s, i) => s + (i.wasted || 0), 0);
  const damaged = live.reduce((s, i) => s + (i.damaged || 0), 0);
  const expiring = live.filter((i) => packExpiring(i));
  const ship = live.filter((i) => i.bin === "SHIP");
  return {
    skus: active.length,
    low: low.length,
    plan: plan.length,
    order: order.length,
    value,
    po,
    cover: cover.length ? Math.round(cover.reduce((a, b) => a + b, 0) / cover.length) : null,
    wasted,
    damaged,
    wasteSkus: live.filter((i) => (i.wasted || 0) + (i.damaged || 0) > 0).length,
    expiring: expiring.length,
    ship: ship.length,
  };
}

export function hydratePack(raw: Partial<PackItem> & { id: string; name: string }): PackItem {
  return {
    ...blankPack(raw.name),
    ...raw,
    status: raw.status ?? "active",
    category: raw.category || "Other",
    uom: raw.uom || "ea",
    wasted: Number(raw.wasted) || 0,
    damaged: Number(raw.damaged) || 0,
    waste_note: raw.waste_note || "",
    expires: raw.expires || "",
  };
}
