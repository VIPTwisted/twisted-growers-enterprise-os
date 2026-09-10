export const WEIGHT_AS_OF = "8 Sep 2026";
export const DRY_DAYS = 10;
export const EXEC_BUSINESS_DAYS = 5;

export const WEIGHT_LAW = {
  actual: "Saleable dried/trim/FF that exists as product is Metrc TotalPackagedWeight — tags created from the harvest.",
  remaining: "Metrc moisture loss = TotalWetWeight − TotalWasteWeight − TotalPackagedWeight. Official seed-to-sale identity. On an OPEN harvest that residual is still on the rack. On a CLOSED harvest Metrc writes it off as moisture.",
  grades: "After dry, cultivation MUST record A / B / C buds, trim, waste. harvest_grades and harvest_weights rows = 0. That is our floor sheet, not Metrc.",
  match: "CERTIFIED only when the sheet MATCHES the tags two ways. Discrepancy requires a cultivation explanation.",
  metrc: "OS does not write Metrc. Close and package in Metrc. Moisture is already in Metrc as the residual. Record A/B/C here.",
  alloc: "Per harvest Metrc identity: wet = waste + packaged tags + moisture residual. Flower / trim / FF is the tag split. Destroyed plants are a plant count, never harvest lb. Never rewrite destroyed_on.",
} as const;

export const WEIGHT_KPI = {
  harvests: 389,
  first: "15 May 2024",
  last: "31 Aug 2026",
  wet_lb: 47670.7,
  packaged_lb: 12020.2,
  remaining_lb: 27314.2,
  remaining_harvests: 310,
  waste_lb: 4015.2,
  grades_rows: 0,
  open_n: 22,
  open_wet: 4757.0,
  open_packaged: 266.3,
  open_remaining: 4321.2,
  closed_n: 367,
  closed_no_grade: 367,
  avg_wet_harvest: 122.5,
  avg_pkg_harvest: 30.9,
  avg_g_plant_pkg: 118.7,
  plants_destroyed: 3773,
  destroyed_ledger_on: 0,
  moisture_report_n: 350,
  moisture_report_lb: 24896.7,
  avg_moisture_pct: 54.6,
  owner_moist_min: 70,
  owner_moist_max: 77,
  harvest_weights_rows: 0,
};

export type AlertLevel = "REMINDER" | "DAY" | "FIRE" | "EXEC" | "CLOCK";

export type OpenHarvest = {
  harvest: string;
  cut: string;
  plants: number;
  wet: number;
  packaged: number;
  remaining: number;
  days_since_cut: number;
  dry_due: string;
  level: AlertLevel;
  biz_late: number;
};

export const OPEN_CLOCK: OpenHarvest[] = [
  { harvest: "TG Lemon Drop - 20260831 F1", cut: "2026-08-31", plants: 380, wet: 393.3, packaged: 0, remaining: 393.3, days_since_cut: 8, dry_due: "2026-09-10", level: "REMINDER", biz_late: 0 },
  { harvest: "TG Gush Mintz - 20260831 F1", cut: "2026-08-31", plants: 380, wet: 465.6, packaged: 0, remaining: 465.6, days_since_cut: 8, dry_due: "2026-09-10", level: "REMINDER", biz_late: 0 },
  { harvest: "TG Chimera - 20260831 F1", cut: "2026-08-31", plants: 190, wet: 166.4, packaged: 0, remaining: 166.4, days_since_cut: 8, dry_due: "2026-09-10", level: "REMINDER", biz_late: 0 },
  { harvest: "TG XJ-13 - 20260831 F1", cut: "2026-08-31", plants: 190, wet: 180.5, packaged: 0, remaining: 180.5, days_since_cut: 8, dry_due: "2026-09-10", level: "REMINDER", biz_late: 0 },
  { harvest: "TG Spec Ops - 20260810 f4", cut: "2026-08-10", plants: 305, wet: 439.6, packaged: 0, remaining: 410.5, days_since_cut: 29, dry_due: "2026-08-20", level: "EXEC", biz_late: 13 },
  { harvest: "TG Super Boof - 20260810 f4", cut: "2026-08-10", plants: 182, wet: 154.1, packaged: 15, remaining: 126.1, days_since_cut: 29, dry_due: "2026-08-20", level: "EXEC", biz_late: 13 },
  { harvest: "TG Shake Shack - 20260810 f4", cut: "2026-08-10", plants: 210, wet: 215.9, packaged: 15, remaining: 190, days_since_cut: 29, dry_due: "2026-08-20", level: "EXEC", biz_late: 13 },
  { harvest: "TG Jet Fuel Gelato - 20260810 f", cut: "2026-08-10", plants: 143, wet: 195.1, packaged: 15, remaining: 175.6, days_since_cut: 29, dry_due: "2026-08-20", level: "EXEC", biz_late: 13 },
  { harvest: "TG Apple Fritter - 20260811 f4", cut: "2026-08-11", plants: 210, wet: 275.1, packaged: 0, remaining: 261.7, days_since_cut: 28, dry_due: "2026-08-21", level: "EXEC", biz_late: 12 },
  { harvest: "TG Spec Ops - 20260727f3", cut: "2026-07-27", plants: 215, wet: 224.8, packaged: 15.7, remaining: 191.5, days_since_cut: 43, dry_due: "2026-08-06", level: "EXEC", biz_late: 23 },
  { harvest: "TG Blueberry Muffin #4 - 20260727 aF3", cut: "2026-07-27", plants: 190, wet: 93.1, packaged: 15, remaining: 70.2, days_since_cut: 43, dry_due: "2026-08-06", level: "EXEC", biz_late: 23 },
  { harvest: "TG Blue Dream - 20260727 F3", cut: "2026-07-27", plants: 190, wet: 171.7, packaged: 15, remaining: 149.6, days_since_cut: 43, dry_due: "2026-08-06", level: "EXEC", biz_late: 23 },
  { harvest: "TG Apple Fritter - 20260727 F3", cut: "2026-07-27", plants: 380, wet: 392.3, packaged: 7.5, remaining: 367.5, days_since_cut: 43, dry_due: "2026-08-06", level: "EXEC", biz_late: 23 },
  { harvest: "TG LMNT 115 #5 - 20260713 F2", cut: "2026-07-13", plants: 95, wet: 102, packaged: 15, remaining: 84.5, days_since_cut: 57, dry_due: "2026-07-23", level: "EXEC", biz_late: 33 },
  { harvest: "TG Apple Fritter - 20260713 F2", cut: "2026-07-13", plants: 210, wet: 238.1, packaged: 15.7, remaining: 218.1, days_since_cut: 57, dry_due: "2026-07-23", level: "EXEC", biz_late: 33 },
  { harvest: "TG Lemon Drop - 20260713 f2", cut: "2026-07-13", plants: 230, wet: 217.4, packaged: 23, remaining: 190.9, days_since_cut: 57, dry_due: "2026-07-23", level: "EXEC", biz_late: 33 },
  { harvest: "TG Glitter Bomb - 20260629 F1", cut: "2026-06-29", plants: 190, wet: 118.4, packaged: 1.1, remaining: 111.8, days_since_cut: 71, dry_due: "2026-07-09", level: "EXEC", biz_late: 43 },
  { harvest: "TG Satsuma Sherbet - 20260629 F1", cut: "2026-06-29", plants: 95, wet: 32, packaged: 0.2, remaining: 26.6, days_since_cut: 71, dry_due: "2026-07-09", level: "EXEC", biz_late: 43 },
  { harvest: "TG Gush Mintz - 20260629 F1", cut: "2026-06-29", plants: 380, wet: 296.6, packaged: 61.2, remaining: 224.6, days_since_cut: 71, dry_due: "2026-07-09", level: "EXEC", biz_late: 43 },
  { harvest: "TG XJ-13 - 20260629 F1", cut: "2026-06-29", plants: 190, wet: 108.8, packaged: 15, remaining: 89.9, days_since_cut: 71, dry_due: "2026-07-09", level: "EXEC", biz_late: 43 },
  { harvest: "TG Orange Cream - 20260608 f4", cut: "2026-06-08", plants: 224, wet: 187.2, packaged: 21.7, remaining: 158.7, days_since_cut: 92, dry_due: "2026-06-18", level: "EXEC", biz_late: 58 },
  { harvest: "TG Gastro Pop - 20260608 f4", cut: "2026-06-08", plants: 109, wet: 89, packaged: 15, remaining: 67.6, days_since_cut: 92, dry_due: "2026-06-18", level: "EXEC", biz_late: 58 },
];

export const ALERT_LADDER = [
  { when: "T-7", level: "REMINDER" as AlertLevel, who: "Cultivation", what: "Weight data required in a week. A / B / C buds, trim, waste, water. Vincent has not seen it yet." },
  { when: "T-0 dry complete", level: "DAY" as AlertLevel, who: "Cultivation", what: "Due today. Record the scale. Assigned. File as DRAFT to Vincent." },
  { when: "T+1 … T+4 business", level: "FIRE" as AlertLevel, who: "Cultivation + Ops", what: "Fire every day until recorded AND sitting on Vincent's tray." },
  { when: "T+5 business days", level: "EXEC" as AlertLevel, who: "CEO + Vincent (CFO)", what: "Immediate action. Vincent still must approve the numbers. Event logged." },
];

export const VINCENT = {
  name: "Vincent DeMartino",
  seat: "CFO",
  bot: "cfo",
  law: "Cultivation and Manufacturing RECORD. Vincent APPROVES weights and allocations. The team then FOLLOWS what Vincent set. Top G carries the tray. No Metrc write. CERTIFIED still requires dual MATCH — Vincent's yes is the operating gate, not a second source.",
  sets: [
    "Moisture owner band 70–77%",
    "A / B / C grade definitions and what may go FF vs flower vs trim",
    "First-run concentrate yield band 3.0–6.0% of wet FF. Below 3.0% is BLEED — fire Manufacturing.",
    "Do not mix wet FF into dry conversion %",
    "180 lb packaged FLOOR per pull (yield)",
    "360 lb packaged FLOOR per month (2 pulls). OS stretch still 380 until Vincent overwrites conversion_factors.",
    "Every table planted. Operating fill 1,150 plants/room. Not a single plant short.",
    "What the vault may hold pending allocation",
  ],
  flow: [
    "1. Cultivation files A/B/C + trim + waste + water + FF — DRAFT",
    "2. Manufacturing files FF in / first-run out — DRAFT",
    "3. Top G puts it on Vincent's tray — never auto-approves",
    "4. Vincent approves or sends back",
    "5. Team follows Vincent's set. COO fires anyone who skips the tray",
  ],
};

export const GRADE_CARD = {
  assigned: "Cultivation records. Manufacturing records FF yield.",
  verified: "Vincent DeMartino (CFO) approves. Team follows what Vincent set.",
  fields: ["A buds", "B buds", "C buds", "Trim", "Waste", "Water (moisture weighed)", "Fresh frozen if any"],
  identity: "A + B + C + trim + waste + water + FF = dry input. Then A+B+C+trim MATCHES Metrc packaged tags.",
  cert: "Filed = DRAFT on Vincent's tray. APPROVED = team follows. CERTIFIED only on dual MATCH after Vincent's yes. Variance > 0.1 lb needs a cultivation explanation before Vincent sees it.",
};

export type CloseDraft = {
  harvest: string;
  a: number;
  b: number;
  c: number;
  trim: number;
  waste: number;
  water: number;
  ff: number;
  explanation: string;
};

export function accounted(d: CloseDraft) {
  return d.a + d.b + d.c + d.trim + d.waste + d.water + d.ff;
}

export const CLOCK_COUNTS = {
  reminder: OPEN_CLOCK.filter((h) => h.level === "REMINDER").length,
  fire: OPEN_CLOCK.filter((h) => h.level === "FIRE").length,
  exec_open: OPEN_CLOCK.filter((h) => h.level === "EXEC").length,
  exec_backlog: WEIGHT_KPI.closed_no_grade,
  on_time: 0,
  grades_filed: 0,
};

/** Chop month = harvest_start. Packaged = harvest header tags. Flower/trim/FF = package category split (shared names can inflate — not MATCH). Destroyed = plant count that month, not lb. */
export type MonthAlloc = {
  month: string;
  harvests: number;
  plants: number;
  wet: number;
  waste: number;
  packaged: number;
  remaining: number;
  avg_wet: number;
  avg_pkg: number;
  flower: number;
  trim: number;
  ff: number;
  destroyed: number;
  open_n: number;
};

export const MONTHLY: MonthAlloc[] = [
  { month: "2024-05", harvests: 39, plants: 1045, wet: 868.7, waste: 57.4, packaged: 150.6, remaining: 660.6, avg_wet: 22.3, avg_pkg: 3.9, flower: 203.9, trim: 114.9, ff: 0, destroyed: 609, open_n: 0 },
  { month: "2024-06", harvests: 23, plants: 2186, wet: 1689.2, waste: 101.0, packaged: 284.5, remaining: 1303.8, avg_wet: 73.4, avg_pkg: 12.4, flower: 415.9, trim: 88.6, ff: 0, destroyed: 492, open_n: 0 },
  { month: "2024-07", harvests: 17, plants: 1958, wet: 2234.1, waste: 154.2, packaged: 271.1, remaining: 1808.8, avg_wet: 131.4, avg_pkg: 15.9, flower: 316.4, trim: 55.0, ff: 0, destroyed: 482, open_n: 0 },
  { month: "2024-08", harvests: 12, plants: 1928, wet: 1853.8, waste: 106.5, packaged: 257.8, remaining: 1489.4, avg_wet: 154.5, avg_pkg: 21.5, flower: 245.9, trim: 188.4, ff: 0, destroyed: 399, open_n: 0 },
  { month: "2024-09", harvests: 6, plants: 1132, wet: 955.9, waste: 45.1, packaged: 223.9, remaining: 686.8, avg_wet: 159.3, avg_pkg: 37.3, flower: 691.2, trim: 63.5, ff: 0, destroyed: 323, open_n: 0 },
  { month: "2024-10", harvests: 12, plants: 2167, wet: 2331.8, waste: 128.8, packaged: 429.0, remaining: 1774.0, avg_wet: 194.3, avg_pkg: 35.7, flower: 943.3, trim: 111.6, ff: 0, destroyed: 68, open_n: 0 },
  { month: "2024-11", harvests: 6, plants: 1039, wet: 1303.5, waste: 119.5, packaged: 392.3, remaining: 791.8, avg_wet: 217.2, avg_pkg: 65.4, flower: 820.3, trim: 98.2, ff: 0, destroyed: 145, open_n: 0 },
  { month: "2024-12", harvests: 17, plants: 3209, wet: 3239.6, waste: 202.4, packaged: 625.9, remaining: 2411.3, avg_wet: 190.6, avg_pkg: 36.8, flower: 1485.6, trim: 220.8, ff: 0, destroyed: 15, open_n: 0 },
  { month: "2025-01", harvests: 5, plants: 1050, wet: 1083.1, waste: 75.4, packaged: 196.0, remaining: 811.6, avg_wet: 216.6, avg_pkg: 39.2, flower: 551.0, trim: 73.8, ff: 0, destroyed: 25, open_n: 0 },
  { month: "2025-02", harvests: 4, plants: 1139, wet: 1205.3, waste: 68.3, packaged: 180.0, remaining: 957.0, avg_wet: 301.3, avg_pkg: 45.0, flower: 210.4, trim: 0, ff: 0, destroyed: 3, open_n: 0 },
  { month: "2025-03", harvests: 12, plants: 2182, wet: 1932.8, waste: 164.3, packaged: 366.5, remaining: 1402.0, avg_wet: 161.1, avg_pkg: 30.5, flower: 544.6, trim: 10.1, ff: 92.5, destroyed: 23, open_n: 0 },
  { month: "2025-04", harvests: 5, plants: 997, wet: 1175.5, waste: 143.9, packaged: 229.6, remaining: 802.1, avg_wet: 235.1, avg_pkg: 45.9, flower: 257.3, trim: 0, ff: 174.8, destroyed: 43, open_n: 0 },
  { month: "2025-05", harvests: 13, plants: 2182, wet: 1686.8, waste: 230.4, packaged: 571.0, remaining: 885.4, avg_wet: 129.8, avg_pkg: 43.9, flower: 517.2, trim: 0, ff: 673.4, destroyed: 1, open_n: 0 },
  { month: "2025-06", harvests: 9, plants: 1739, wet: 1664.9, waste: 206.8, packaged: 659.4, remaining: 798.8, avg_wet: 185.0, avg_pkg: 73.3, flower: 217.4, trim: 0, ff: 1018.4, destroyed: 187, open_n: 0 },
  { month: "2025-07", harvests: 10, plants: 1402, wet: 1108.4, waste: 135.2, packaged: 342.1, remaining: 631.1, avg_wet: 110.8, avg_pkg: 34.2, flower: 451.1, trim: 0, ff: 355.3, destroyed: 45, open_n: 0 },
  { month: "2025-08", harvests: 16, plants: 2182, wet: 1649.4, waste: 167.4, packaged: 707.4, remaining: 774.7, avg_wet: 103.1, avg_pkg: 44.2, flower: 798.4, trim: 0, ff: 862.5, destroyed: 19, open_n: 0 },
  { month: "2025-09", harvests: 11, plants: 2119, wet: 1906.1, waste: 272.4, packaged: 737.9, remaining: 895.8, avg_wet: 173.3, avg_pkg: 67.1, flower: 565.8, trim: 0, ff: 1125.2, destroyed: 37, open_n: 0 },
  { month: "2025-10", harvests: 19, plants: 1046, wet: 727.7, waste: 86.2, packaged: 262.0, remaining: 379.4, avg_wet: 38.3, avg_pkg: 13.8, flower: 429.3, trim: 0, ff: 216.3, destroyed: 30, open_n: 0 },
  { month: "2025-11", harvests: 30, plants: 2138, wet: 1754.3, waste: 159.3, packaged: 631.6, remaining: 963.4, avg_wet: 58.5, avg_pkg: 21.1, flower: 949.7, trim: 0, ff: 585.4, destroyed: 0, open_n: 0 },
  { month: "2025-12", harvests: 19, plants: 2189, wet: 1719.4, waste: 178.4, packaged: 715.2, remaining: 825.8, avg_wet: 90.5, avg_pkg: 37.6, flower: 827.6, trim: 0, ff: 1025.4, destroyed: 32, open_n: 0 },
  { month: "2026-01", harvests: 16, plants: 2137, wet: 2003.5, waste: 225.6, packaged: 753.5, remaining: 1024.3, avg_wet: 125.2, avg_pkg: 47.1, flower: 747.8, trim: 0, ff: 943.3, destroyed: 6, open_n: 0 },
  { month: "2026-02", harvests: 8, plants: 1140, wet: 862.7, waste: 46.8, packaged: 270.2, remaining: 545.6, avg_wet: 107.8, avg_pkg: 33.8, flower: 389.7, trim: 0, ff: 213.3, destroyed: 3, open_n: 0 },
  { month: "2026-03", harvests: 12, plants: 2190, wet: 1901.0, waste: 128.7, packaged: 356.8, remaining: 1415.5, avg_wet: 158.4, avg_pkg: 29.7, flower: 618.7, trim: 0, ff: 131.7, destroyed: 0, open_n: 0 },
  { month: "2026-04", harvests: 16, plants: 2188, wet: 2612.7, waste: 238.0, packaged: 860.4, remaining: 1514.3, avg_wet: 163.3, avg_pkg: 53.8, flower: 1114.7, trim: 0, ff: 990.9, destroyed: 30, open_n: 0 },
  { month: "2026-05", harvests: 16, plants: 2190, wet: 2030.5, waste: 188.4, packaged: 574.7, remaining: 1267.4, avg_wet: 126.9, avg_pkg: 35.9, flower: 568.2, trim: 0, ff: 712.7, destroyed: 40, open_n: 0 },
  { month: "2026-06", harvests: 13, plants: 2176, wet: 1720.7, waste: 134.2, packaged: 495.2, remaining: 1091.3, avg_wet: 132.4, avg_pkg: 38.1, flower: 514.3, trim: 0, ff: 656.1, destroyed: 1, open_n: 6 },
  { month: "2026-07", harvests: 14, plants: 2190, wet: 1963.9, waste: 179.9, packaged: 430.4, remaining: 1353.6, avg_wet: 140.3, avg_pkg: 30.7, flower: 341.5, trim: 0, ff: 586.6, destroyed: 27, open_n: 7 },
  { month: "2026-08", harvests: 9, plants: 2190, wet: 2485.5, waste: 70.7, packaged: 45.1, remaining: 2369.7, avg_wet: 276.2, avg_pkg: 5.0, flower: 45.3, trim: 0, ff: 0, destroyed: 0, open_n: 9 },
];

export const YEARLY = [
  { year: "2024", harvests: 132, plants: 14664, wet: 14476.6, waste: 915.0, packaged: 2635.2, remaining: 10926.4 },
  { year: "2025", harvests: 153, plants: 20365, wet: 17613.7, waste: 1887.9, packaged: 5598.7, remaining: 10127.1 },
  { year: "2026", harvests: 104, plants: 16401, wet: 15580.4, waste: 1212.3, packaged: 3786.3, remaining: 10581.7 },
];

export function gPerPlant(row: { packaged: number; plants: number }) {
  if (!row.plants) return 0;
  return (row.packaged * 453.592) / row.plants;
}

export function pkgPct(row: { packaged: number; wet: number }) {
  if (!row.wet) return 0;
  return (100 * row.packaged) / row.wet;
}

export const FF_RATIO = 4.5;

/** Single-source harvest tags only. Shared SourceHarvestNames excluded — those do not MATCH. */
export const SOLO: Record<string, { flower: number; trim: number; ff: number; conv: number | null }> = {
  "2024-05": { flower: 92.4, trim: 8.7, ff: 0, conv: 17.3 },
  "2024-06": { flower: 331.8, trim: 0, ff: 0, conv: 16.8 },
  "2024-07": { flower: 196.8, trim: 45.0, ff: 0, conv: 12.1 },
  "2024-08": { flower: 198.9, trim: 180.1, ff: 0, conv: 13.9 },
  "2024-09": { flower: 620.2, trim: 12.9, ff: 0, conv: 23.4 },
  "2024-10": { flower: 843.1, trim: 75.1, ff: 0, conv: 18.4 },
  "2024-11": { flower: 799.5, trim: 93.6, ff: 0, conv: 30.1 },
  "2024-12": { flower: 1121.8, trim: 119.1, ff: 0, conv: 19.3 },
  "2025-01": { flower: 396.6, trim: 60.1, ff: 0, conv: 18.1 },
  "2025-02": { flower: 200.4, trim: 0, ff: 0, conv: 14.9 },
  "2025-03": { flower: 398.6, trim: 0, ff: 92.5, conv: 19.0 },
  "2025-04": { flower: 192.2, trim: 0, ff: 174.8, conv: 19.5 },
  "2025-05": { flower: 366.1, trim: 0, ff: 673.3, conv: 33.9 },
  "2025-06": { flower: 168.7, trim: 0, ff: 1018.3, conv: 39.6 },
  "2025-07": { flower: 272.9, trim: 0, ff: 355.3, conv: 30.9 },
  "2025-08": { flower: 339.7, trim: 0, ff: 862.5, conv: 42.9 },
  "2025-09": { flower: 304.5, trim: 0, ff: 1125.3, conv: 38.7 },
  "2025-10": { flower: 206.6, trim: 0, ff: 216.3, conv: 36.0 },
  "2025-11": { flower: 538.8, trim: 0, ff: 585.4, conv: 36.0 },
  "2025-12": { flower: 502.8, trim: 0, ff: 1025.4, conv: 41.6 },
  "2026-01": { flower: 340.5, trim: 0, ff: 943.2, conv: 37.6 },
  "2026-02": { flower: 178.8, trim: 0, ff: 213.3, conv: 31.3 },
  "2026-03": { flower: 360.0, trim: 0, ff: 131.7, conv: 18.8 },
  "2026-04": { flower: 494.0, trim: 0, ff: 990.8, conv: 32.9 },
  "2026-05": { flower: 407.6, trim: 0, ff: 712.6, conv: 28.3 },
  "2026-06": { flower: 298.2, trim: 0, ff: 656.1, conv: null },
  "2026-07": { flower: 233.7, trim: 0, ff: 586.6, conv: null },
  "2026-08": { flower: 45.2, trim: 0, ff: 0, conv: null },
};

export const MFG = {
  ff_ratio: FF_RATIO,
  ff_from_harvest_lb: 10363.4,
  ff_dry_eq_lb: 2303.0,
  first_run: [
    { input: "Fresh frozen", in_lb: 5175.1, still_on_tag_lb: 0, out_lb: 155.31, yield_pct: 3.0, dry_eq_yield: 13.5, note: "Fully consumed. On Vincent's 3.0% floor. One tick under is bleed." },
    { input: "Buds sent to extract", in_lb: 1142.2, still_on_tag_lb: 71.1, out_lb: 318.5, yield_pct: 27.9, dry_eq_yield: 27.9, note: "HIGH not bleed. Splits can inflate. Vincent has not approved." },
    { input: "Shake / trim", in_lb: 647.6, still_on_tag_lb: 0, out_lb: 126.54, yield_pct: 19.5, dry_eq_yield: 19.5, note: "First-run from trim. Fully consumed." },
  ],
  conc_created_all_lb: 1366.5,
  conc_on_hand_lb: 240.05,
  conc_on_hand_usd: 902965,
  vape_pkgs: 251,
  edible_pkgs: 253,
  law: "Manufacturing input = Fresh Frozen Flower tags created from a harvest (single source). Output = first concentrate package whose source tag is that biomass. Child splits of concentrate are NOT yield. CERTIFIED 0 until consumed qty MATCHES output two ways.",
};

/** Vincent sets the band. Below min = BLEED. Team may not freelance a lower number. */
export const YIELD_BAND = {
  set_by: "Vincent DeMartino",
  ff_wet_min_pct: 3.0,
  ff_wet_max_pct: 6.0,
  ff_wet_mid_pct: 4.5,
  live_usd_per_g: 12,
  ff_on_hand_lb: 370.9,
};

export const BLEED = {
  ff_from_harvest_lb: 10363.4,
  ff_consumed_lb: 5175.1,
  ff_first_run_out_lb: 155.31,
  ff_actual_pct: 3.0,
  ff_unprocessed_lb: 5188.3,
  ff_on_hand_lb: 370.9,
  expected_at_min_lb: 155.25,
  expected_at_mid_lb: 232.88,
  short_vs_mid_lb: 77.57,
  short_vs_mid_usd: 422384,
  status: "HOLD" as const,
  why: "First-run is 3.00% — sitting on Vincent's floor. Unprocessed FF 5,188 lb never became first-run oil. On-hand FF only 370.9 lb. The rest is allocation bleed until Manufacturing files every tag. Flower 27.9% is inflation, not bleed.",
  law: "Every FF tag that leaves Cultivation is Vincent-allocated. Manufacturing files yield the day the tag hits 0. Below 3.0% wet = BLEED, fire daily. Above 6.0% = HOLD (wet low or splits). Unprocessed FF sitting is working-capital bleed. Child splits are not yield.",
};

export const FLOOR = {
  set_by: "Vincent DeMartino",
  pull_lb: 180,
  month_lb: 360,
  pulls_per_month: 2,
  stretch_month_lb: 380,
  labor_plants: 1150,
  tables_per_room: 4,
  law: "Floor = 180 lb packaged tags per PULL and 360 lb per month. Stretch 380 stored. TWO SIZE ROOMS: F1/F3 LARGE 1,140 (4×285) · F2/F4 SMALL 1,050 (4×262.5). 1,150 is Labor Calculator crew-sizing, not cap. Cultivation records. Vincent approves.",
};

export const CANOPY = [
  { room: "F1", size: "LARGE", plants: 1140, cap: 1140, next: "pull in 12d", short: 0 },
  { room: "F2", size: "SMALL", plants: 1050, cap: 1050, next: "pull in 27d", short: 0 },
  { room: "F3", size: "LARGE", plants: 1140, cap: 1140, next: "pull in 41d", short: 0 },
  { room: "F4", size: "SMALL", plants: 1050, cap: 1050, next: "pull in 55d", short: 0 },
];

export const CANOPY_TOTAL = { plants: 4380, cap: 4380, short: 0, as_of: "Metrc flowering · two-size MATCH conversion_factors" };

export const FLOOR_LADDER = [
  { when: "Plant / flip", who: "Cultivation", what: "Fill THIS room's cap. LARGE 1,140 · SMALL 1,050. Do not grade F2/F4 against 1,140." },
  { when: "Daily canopy", who: "Cultivation + COO", what: "Count vs that room's size. Fire empty slots the same day. 1,150 is crew-sizing only." },
  { when: "Pull day", who: "Cultivation", what: "Packaged tags from that room yield ≥ 180 lb. File DRAFT to Vincent." },
  { when: "Month close", who: "Vincent", what: "Packaged tags ≥ 360 lb. Below 360 is floor miss. 380 is stretch, not the floor." },
];

export function monthVsFloor(packaged: number, open_n: number) {
  if (open_n > 0) return "OPEN";
  if (packaged >= FLOOR.stretch_month_lb) return "STRETCH";
  if (packaged >= FLOOR.month_lb) return "FLOOR";
  return "SHORT";
}

export const YIELD_LADDER = [
  { when: "Tag hits Manufacturing", who: "Manufacturing", what: "Log FF tag in, expected oil at Vincent's band." },
  { when: "Tag qty = 0", who: "Manufacturing", what: "File first-run out vs in. DRAFT on Vincent's tray same day." },
  { when: "Yield < 3.0% wet", who: "Manufacturing + COO", what: "BLEED. Fire every day. Named explanation required. Vincent sees it." },
  { when: "Yield > 6.0% wet", who: "Manufacturing + Guard", what: "HOLD. Splits or wet recorded low. Do not celebrate. Vincent decides." },
  { when: "FF unprocessed > 7 days", who: "Inventory + Manufacturing", what: "Allocation bleed. Freezer sitting is money. Vincent's vault rule." },
];

export function plantsPerLb(row: { plants: number; packaged: number }) {
  if (!row.packaged) return 0;
  return row.plants / row.packaged;
}

export function ffDryEq(ff: number) {
  return ff / FF_RATIO;
}

export const METRC_FLOW = [
  { step: "1 · Chop", metrc: "TotalWetWeight", where: "Scale before the dry room", note: "Whole plant wet. Seed-to-sale starts the harvest mass here." },
  { step: "2 · Dry room", metrc: "DryingLocationName", where: "Water leaves as vapor", note: "Metrc holds the harvest in a drying location. It does not take a second 'out of dry' scale." },
  { step: "3 · Waste", metrc: "TotalWasteWeight", where: "Stems, fan, rot on the harvest", note: "Harvest waste. Destroyed plants are a different ledger — they never became a harvest." },
  { step: "4 · Trim + dried tags", metrc: "TotalPackagedWeight", where: "Create package from harvest", note: "Buds tag = dried flower. Shake/Trim tag = trim. FF tag = freezer. That create IS the dried weight." },
  { step: "5 · Moisture", metrc: "wet − waste − packaged", where: "CurrentWeight / moisture_loss_lb", note: "Official Metrc formula. Closed harvest residual = moisture loss. Open harvest residual = still on the rack." },
] as const;
