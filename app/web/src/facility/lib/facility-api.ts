import { FAC_ROOMS, FACILITY } from "@/data/facility";
import { PACK_SEED, type PackItem } from "@/data/pack-inventory";

export type AssignRow = {
  who: string;
  date: string;
  station: string;
  seat: "operator" | "packer";
};

export type WaveRow = {
  id: string;
  label: string;
  start: string;
  end: string;
  note: string;
  sort_rank: number;
};

export type SiteRow = {
  id: string;
  name: string;
  address: string;
  sheet: string;
  plan: string;
  aspect: number;
};

const WAVES: WaveRow[] = [
  { id: "w1", label: "Wave 1", start: "12:00", end: "12:30", note: "Unpaid break. Wave 2 remains on the floor.", sort_rank: 1 },
  /* Floor file (facility.ts BREAK_WAVES) is 13:30-14:00. This loader had drifted
     to 13:00-13:30. Owner 10 Sep 2026 17:49 ET: the floor file is the clock.
     localStorage that still holds the drifted pair is rewritten on read. */
  { id: "w2", label: "Wave 2", start: "13:30", end: "14:00", note: "Unpaid break. Wave 1 remains on the floor.", sort_rank: 2 },
];

function wavesFromStore(): WaveRow[] {
  const rows = read<WaveRow[]>("waves", WAVES);
  const next = rows.map((r) =>
    r.id === "w2" && (r.start !== "13:30" || r.end !== "14:00")
      ? { ...r, start: "13:30", end: "14:00", note: "Unpaid break. Wave 1 remains on the floor." }
      : r,
  );
  if (JSON.stringify(next) !== JSON.stringify(rows)) write("waves", next);
  return next;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem("tg.facility." + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem("tg.facility." + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export async function loadFacility() {
  return {
    rooms: FAC_ROOMS,
    site: {
      id: "phase1",
      name: FACILITY.name,
      address: FACILITY.address,
      sheet: FACILITY.sheet,
      plan: FACILITY.plan,
      aspect: FACILITY.aspect,
    } satisfies SiteRow,
    waves: wavesFromStore(),
    assigns: read<AssignRow[]>("assigns", []),
    pack: read<PackItem[]>("pack", PACK_SEED),
  };
}

export async function saveAssign({ data }: { data: AssignRow }) {
  const rows = read<AssignRow[]>("assigns", []);
  const next = rows.filter((r) => !(r.who === data.who && r.date === data.date));
  next.push(data);
  write("assigns", next);
  return { ok: true as const };
}

export async function savePackItem({ data }: { data: PackItem }) {
  const rows = read<PackItem[]>("pack", PACK_SEED);
  write("pack", rows.map((r) => (r.id === data.id ? { ...r, ...data } : r)));
  return { ok: true as const };
}

export async function addPackItem({ data }: { data: PackItem }) {
  const rows = read<PackItem[]>("pack", PACK_SEED);
  write("pack", [...rows, data]);
  return { ok: true as const };
}

export async function loadOps() {
  return { rows: read<unknown[]>("ops", []) };
}

export async function saveOp({ data }: { data: Record<string, unknown> }) {
  const rows = read<Record<string, unknown>[]>("ops", []);
  const id = String(data.id || `op-${Date.now().toString(36)}`);
  const next = rows.filter((r) => r.id !== id);
  next.unshift({ ...data, id });
  write("ops", next);
  return { ok: true as const, id };
}

export async function removeOp({ data }: { data: { id: string } }) {
  write("ops", read<Record<string, unknown>[]>("ops", []).filter((r) => r.id !== data.id));
  return { ok: true as const };
}

export async function saveWave({ data }: { data: WaveRow }) {
  const rows = wavesFromStore();
  write("waves", rows.map((r) => (r.id === data.id ? { ...r, ...data } : r)));
  return { ok: true as const };
}

export async function saveRoom() {
  return { ok: true as const };
}
export async function addRoom() {
  return { ok: true as const };
}
export async function removeRoom() {
  return { ok: true as const };
}
export async function saveSite() {
  return { ok: true as const };
}
