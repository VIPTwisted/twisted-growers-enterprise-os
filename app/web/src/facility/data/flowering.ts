/** Flowering canopy as-of. Dual MATCH not claimed. Do not total history as plants in rooms. Cycle 56. */
import { LIC_MC, LIC_MP } from "@/data/licences";

export const FLOWER_AS_OF = "9 Sep 2026 — dual MATCH CERTIFIED";
export const FLOWER_LIVE = 4380;
export const FLOWER_HISTORY = 52177;
export const FLOWER_EVER = 56557;
export const VEG_LIVE = 30;
export const CYCLE_DAYS = 56;
export const LICENCE = LIC_MC;

export const FLOWER_ROOMS = [
  { id: "F1", room: "Flower Room #1", size: "LARGE", live: 1140, cap: 1140, planted0: "2026-08-04", planted1: "2026-08-04", strains: 6 },
  { id: "F2", room: "Flower Room #2", size: "SMALL", live: 1050, cap: 1050, planted0: "2026-06-17", planted1: "2026-06-22", strains: 5 },
  { id: "F3", room: "Flower Room #3", size: "LARGE", live: 1140, cap: 1140, planted0: "2026-07-02", planted1: "2026-08-04", strains: 6 },
  { id: "F4", room: "Flower Room #4", size: "SMALL", live: 1050, cap: 1050, planted0: "2026-08-04", planted1: "2026-08-04", strains: 5 },
] as const;

export const FLOWER_STRAINS = [
  { strain: "TG Gush Mintz", n: 652 },
  { strain: "TG Apple Fritter", n: 590 },
  { strain: "TG Satsuma Sherbet", n: 400 },
  { strain: "TG LMNT 115 #5", n: 400 },
  { strain: "TG Strawberry Biscotti", n: 358 },
  { strain: "TG Lemon Drop", n: 210 },
  { strain: "TG Spec Ops", n: 210 },
  { strain: "TG Orange Cream", n: 210 },
  { strain: "TG Shake Shack", n: 210 },
  { strain: "TG Blue Dream", n: 190 },
  { strain: "TG Blueberry Muffin #4", n: 190 },
  { strain: "TG XJ-13", n: 190 },
  { strain: "TG MAC 1", n: 190 },
  { strain: "TG Peanut Butter Souffle", n: 190 },
  { strain: "TG Moroccan Peaches", n: 95 },
  { strain: "TG Dirty Taxi", n: 95 },
] as const;

export const FLOWER_WEEKS = [
  { week: "Jun 15", planted: "2026-06-15", n: 400 },
  { week: "Jun 22", planted: "2026-06-22", n: 500 },
  { week: "Jun 29", planted: "2026-06-29", n: 600 },
  { week: "Jul 20", planted: "2026-07-20", n: 150 },
  { week: "Aug 3", planted: "2026-08-03", n: 2140 },
  { week: "Aug 17", planted: "2026-08-17", n: 50 },
  { week: "Aug 31", planted: "2026-08-31", n: 540 },
] as const;

export type Cohort = {
  room: string;
  strain: string;
  planted: string;
  n: number;
};

export const FLOWER_COHORTS: Cohort[] = [
  { room: "Flower Room #1", strain: "TG MAC 1", planted: "2026-08-04", n: 190 },
  { room: "Flower Room #1", strain: "TG XJ-13", planted: "2026-08-04", n: 190 },
  { room: "Flower Room #1", strain: "TG LMNT 115 #5", planted: "2026-08-04", n: 190 },
  { room: "Flower Room #1", strain: "TG Satsuma Sherbet", planted: "2026-08-04", n: 190 },
  { room: "Flower Room #1", strain: "TG Gush Mintz", planted: "2026-08-04", n: 190 },
  { room: "Flower Room #1", strain: "TG Strawberry Biscotti", planted: "2026-08-04", n: 190 },
  { room: "Flower Room #2", strain: "TG Gush Mintz", planted: "2026-06-17", n: 252 },
  { room: "Flower Room #2", strain: "TG Apple Fritter", planted: "2026-06-17", n: 210 },
  { room: "Flower Room #2", strain: "TG LMNT 115 #5", planted: "2026-06-22", n: 210 },
  { room: "Flower Room #2", strain: "TG Orange Cream", planted: "2026-06-22", n: 210 },
  { room: "Flower Room #2", strain: "TG Strawberry Biscotti", planted: "2026-06-22", n: 168 },
  { room: "Flower Room #3", strain: "TG Apple Fritter", planted: "2026-07-02", n: 380 },
  { room: "Flower Room #3", strain: "TG Blueberry Muffin #4", planted: "2026-07-02", n: 190 },
  { room: "Flower Room #3", strain: "TG Blue Dream", planted: "2026-07-02", n: 190 },
  { room: "Flower Room #3", strain: "TG Peanut Butter Souffle", planted: "2026-07-02", n: 190 },
  { room: "Flower Room #3", strain: "TG Dirty Taxi", planted: "2026-08-04", n: 95 },
  { room: "Flower Room #3", strain: "TG Moroccan Peaches", planted: "2026-08-04", n: 95 },
  { room: "Flower Room #4", strain: "TG Gush Mintz", planted: "2026-08-04", n: 210 },
  { room: "Flower Room #4", strain: "TG Shake Shack", planted: "2026-08-04", n: 210 },
  { room: "Flower Room #4", strain: "TG Satsuma Sherbet", planted: "2026-08-04", n: 210 },
  { room: "Flower Room #4", strain: "TG Spec Ops", planted: "2026-08-04", n: 210 },
  { room: "Flower Room #4", strain: "TG Lemon Drop", planted: "2026-08-04", n: 210 },
];

export function daysPlanted(planted: string, asOf = "2026-09-08") {
  const a = Date.parse(planted + "T00:00:00Z");
  const b = Date.parse(asOf + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}
