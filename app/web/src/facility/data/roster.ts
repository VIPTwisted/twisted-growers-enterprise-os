import { AGENTS } from "@/data/facility";
import { FLOOR_STAFF } from "@/data/room-ops";

/** Named facility employees. Owners / CEO / CFO / Marianna are not on this file. */
export const ROSTER = FLOOR_STAFF.map((s) => ({
  name: s.name,
  seat: s.seat,
  badge: s.badge ?? "",
  rooms: s.rooms ?? [],
  zones: s.zones,
}));

export const ROSTER_NAMES = ROSTER.map((r) => r.name);

export function onRoster(name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (AGENTS.excluded.some((x) => x.toLowerCase() === n)) return false;
  return ROSTER_NAMES.some((x) => x.toLowerCase() === n);
}

export function rosterSuggest(q: string) {
  const n = q.trim().toLowerCase();
  if (!n) return ROSTER;
  return ROSTER.filter((r) => r.name.toLowerCase().includes(n) || r.seat.toLowerCase().includes(n));
}

export const ROSTER_LAW =
  "Assign only names on this roster. Jacqueline Dixon — Cultivation. Kyle Dixon — Pre-Rolls. Bert Goode — Manufacturing. Josh — flower equipment and infused pre-rolls. Megan is HR. Vincent DeMartino is CEO, CFO and Sales Director — leadership, not a floor employee. Dominick, Anthony, and Marianna are not facility employees.";
