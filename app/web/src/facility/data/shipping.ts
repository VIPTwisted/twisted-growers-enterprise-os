/** Shipping desk. Apex invoice is SoR for the order. Metrc is the manifest. As-of the 30 Aug Apex pull. */

export const SHIP_AS_OF = "2026-08-30";
export const SHIP_AS_OF_LABEL = "30 Aug 2026 Apex book";
export const SHIP_OWNER = "Olivia Hendricks";

export type ShipOrder = {
  invoice: string;
  buyer: string;
  city: string;
  status: string;
  ordered: string;
  delivery: string | null;
  dollars: number;
};

export type ShipReturn = {
  id: string;
  invoice: string;
  buyer: string;
  city: string;
  reason: string;
  status: "dock" | "inspect" | "restock" | "destroy";
  items: string;
  qty: number;
  received: string;
  dollars: number;
};

export type ShipFreight = {
  id: string;
  name: string;
  invoice: string | null;
  buyer: string;
  status: string;
  qty: number;
  kind: "outbound" | "return";
};

/** Open outbound — not Delivered / Complete / cancelled. Past-due 2025 is collections, not this dock. */
export const OPEN_ORDERS: ShipOrder[] = [
  { invoice: "Twiste-1824", buyer: "solar", city: "Somerset", status: "Packed + scheduled", ordered: "2026-08-24", delivery: "2026-08-31", dollars: 17918 },
  { invoice: "Twiste-1813", buyer: "Fine Fettle - W. Springfield", city: "Springfield", status: "Order packed", ordered: "2026-08-20", delivery: "2026-09-01", dollars: 12430 },
  { invoice: "Twiste-1848", buyer: "Green N' Go", city: "Uxbridge", status: "Packed + scheduled", ordered: "2026-08-26", delivery: "2026-09-01", dollars: 2050 },
  { invoice: "Twiste-1841", buyer: "NEW LEAF (S. MAIN ST.)", city: "Fall River", status: "Packed + scheduled", ordered: "2026-08-26", delivery: "2026-09-01", dollars: 1380 },
  { invoice: "Twiste-1842", buyer: "NEW LEAF (360 2ND ST.)", city: "Fall River", status: "Packed + scheduled", ordered: "2026-08-26", delivery: "2026-09-01", dollars: 1380 },
  { invoice: "Twiste-1832", buyer: "Green Stratus dba Cannapi", city: "Brockton", status: "Invoice finalized", ordered: "2026-08-25", delivery: "2026-09-03", dollars: 2950 },
  { invoice: "Twiste-1739", buyer: "Fine Fettle Rowley - Rec", city: "Rowley", status: "Order packed", ordered: "2026-08-10", delivery: null, dollars: 1520 },
  { invoice: "Twiste-1850", buyer: "Fine Fettle Rowley - Rec", city: "Rowley", status: "Order submitted", ordered: "2026-08-27", delivery: null, dollars: 5860 },
  { invoice: "Twiste-1851", buyer: "Cana Craft Cannabis - Norton", city: "Norton", status: "Order submitted", ordered: "2026-08-28", delivery: null, dollars: 5334 },
  { invoice: "Twiste-1852", buyer: "Cana Craft Cannabis - Norton", city: "Norton", status: "Order submitted", ordered: "2026-08-28", delivery: null, dollars: 3900 },
  { invoice: "Twiste-1853", buyer: "Cana Craft Cannabis - Fairhaven", city: "Fairhaven", status: "Order submitted", ordered: "2026-08-28", delivery: null, dollars: 5046 },
  { invoice: "Twiste-1854", buyer: "Cana Craft Cannabis - Fairhaven", city: "Fairhaven", status: "Order submitted", ordered: "2026-08-28", delivery: null, dollars: 1950 },
  { invoice: "Twiste-1855", buyer: "Cana Craft Cannabis - New Bedford", city: "New Bedford", status: "Order submitted", ordered: "2026-08-28", delivery: null, dollars: 5046 },
  { invoice: "Twiste-1856", buyer: "Cana Craft Cannabis - New Bedford", city: "New Bedford", status: "Order submitted", ordered: "2026-08-28", delivery: null, dollars: 1950 },
  { invoice: "Twiste-1859", buyer: "Buudda Brothers dba RollingJs", city: "Holyoke", status: "Order submitted", ordered: "2026-08-28", delivery: null, dollars: 5850 },
  { invoice: "Twiste-1860", buyer: "Pettals Cannabis Attleboro", city: "Attleboro", status: "Order submitted", ordered: "2026-08-30", delivery: null, dollars: 6270 },
  { invoice: "Twiste-1861", buyer: "Charlton Investments LLC DBA Pettals Cannabis", city: "Charlton", status: "Order submitted", ordered: "2026-08-30", delivery: null, dollars: 5890 },
];

export const RETURNS: ShipReturn[] = [
  { id: "RT-104", invoice: "Twiste-1739", buyer: "Fine Fettle Rowley - Rec", city: "Rowley", reason: "Buyer refused — label mismatch", status: "inspect", items: "3.5g flower jars", qty: 12, received: "2026-09-08", dollars: 420 },
  { id: "RT-105", invoice: "Twiste-1813", buyer: "Fine Fettle - W. Springfield", city: "Springfield", reason: "Damaged carton in transit", status: "dock", items: "Pre-roll tubes", qty: 4, received: "2026-09-09", dollars: 180 },
  { id: "RT-101", invoice: "Twiste-1688", buyer: "Green N' Go", city: "Uxbridge", reason: "Short ship — credit already issued", status: "restock", items: "Exit bags (empty return of overpack)", qty: 20, received: "2026-09-02", dollars: 0 },
];

const PACKED = /packed/i;

export function todayET() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function shipDesk(today = todayET()) {
  const going: ShipOrder[] = [];
  const scheduled: ShipOrder[] = [];
  for (const o of OPEN_ORDERS) {
    const onDock = PACKED.test(o.status) && (!o.delivery || o.delivery <= today);
    const dueToday = o.delivery === today;
    if (dueToday || onDock) going.push(o);
    else scheduled.push(o);
  }
  going.sort((a, b) => (a.delivery ?? a.ordered).localeCompare(b.delivery ?? b.ordered) || a.invoice.localeCompare(b.invoice));
  scheduled.sort((a, b) => (a.delivery ?? a.ordered).localeCompare(b.delivery ?? b.ordered) || a.invoice.localeCompare(b.invoice));
  const sum = (rows: ShipOrder[]) => rows.reduce((s, r) => s + r.dollars, 0);
  const openReturns = RETURNS.filter((r) => r.status === "dock" || r.status === "inspect");
  const freight: ShipFreight[] = [
    ...going.map((o) => ({
      id: o.invoice,
      name: `${o.buyer} · ${o.city}`,
      invoice: o.invoice,
      buyer: o.buyer,
      status: o.status,
      qty: 1,
      kind: "outbound" as const,
    })),
    ...openReturns.map((r) => ({
      id: r.id,
      name: `${r.buyer} · ${r.items}`,
      invoice: r.invoice,
      buyer: r.buyer,
      status: r.status,
      qty: r.qty,
      kind: "return" as const,
    })),
  ];
  return {
    today,
    going,
    scheduled,
    goingUsd: sum(going),
    scheduledUsd: sum(scheduled),
    asOf: SHIP_AS_OF_LABEL,
    returns: RETURNS,
    openReturns,
    returnUsd: openReturns.reduce((s, r) => s + r.dollars, 0),
    freight,
  };
}
