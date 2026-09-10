import { S2S_AS_OF, S2S_ROOMS } from "@/data/s2s-rooms";
import { shipDesk } from "@/data/shipping";

/** Packed, tested, ready to sell. Not plants. Not wet on a rack. Not in-process extract or pre-trim. */
export const FG_METRC_ROOMS = ["Finish Vault", "Fulfillment Vault", "Shipping & Receiving"] as const;

export const FG_LAW =
  "Inventory is every packed finished good ready for resale. Finish Vault + Fulfillment Vault packages + dock on-hand. Metrc packages are custody. CERTIFIED weight only on dual MATCH. ISSUE means OS overstates vs Metrc Active grid — do not print that lb as truth. Wet harvests stay on Dry / Cure / Fulfillment plant cards. Extraction and pre-trim are not resale.";

export function isFgResale(r: { room: string; pkg_n: number; stage: string }) {
  return (FG_METRC_ROOMS as readonly string[]).includes(r.room) && r.pkg_n > 0;
}

export function fgBook() {
  const rows = S2S_ROOMS.filter((r) => isFgResale(r));
  const pkg = rows.reduce((s, r) => s + r.pkg_n, 0);
  const g = rows.reduce((s, r) => s + r.pkg_qty_g, 0);
  const stale = rows.reduce((s, r) => s + r.pkg_stale_n, 0);
  const issue = rows.some((r) => r.status === "ISSUE" || r.pkg_stale_n > 0);
  const lb = g / 453.592;
  const byRoom = FG_METRC_ROOMS.map((name) => {
    const here = rows.filter((r) => r.room === name);
    return {
      name,
      pkg: here.reduce((s, r) => s + r.pkg_n, 0),
      g: here.reduce((s, r) => s + r.pkg_qty_g, 0),
      licences: [...new Set(here.map((r) => r.licence))],
    };
  }).filter((x) => x.pkg > 0);
  return {
    rows,
    pkg,
    g,
    lb,
    stale,
    byRoom,
    grain: issue ? ("ISSUE" as const) : rows.length ? ("PARTIAL" as const) : ("EMPTY" as const),
    metrcAsOf: S2S_AS_OF,
    sheetAsOf: shipDesk().asOf,
    sheet: "Finished Goods live sheet + Sheet vs Metrc. Catalog $ is not COGS.",
  };
}

export function weightStamp(grain: string, lb: number, uom = "lb") {
  if (grain === "CERTIFIED") return { ok: true, text: `${lb.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${uom}`, grain };
  if (grain === "ISSUE") return { ok: false, text: `${lb.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${uom} ISSUE — not certified`, grain };
  if (grain === "PARTIAL") return { ok: false, text: `${lb.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${uom} PARTIAL — awaiting MATCH`, grain };
  return { ok: false, text: `No certified ${uom}`, grain };
}