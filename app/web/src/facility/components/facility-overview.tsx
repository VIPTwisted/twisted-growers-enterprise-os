import { useMemo, useState } from "react";
import { CardSlide } from "@/components/card-slide";
import { S2S_ROOMS, type S2SRoom } from "@/data/s2s-rooms";
import { AGENTS, roomMetrics, taggedFlowering, wingOf, type FacRoom } from "@/data/facility";
import { floorIdFromName, sameMetrc } from "@/data/room-alias";
import { roomClock } from "@/data/room-ops";
import type { FacTarget } from "@/components/fac-forensic";

export const DEPTS = [
  { name: "Cultivation", n: 4, wing: "cultivation" as const, room: "veg" },
  { name: "Economy Pre-Rolls", n: 3, wing: "manufacturing" as const, room: "office" },
  { name: "Extraction", n: 2, wing: "manufacturing" as const, room: "kitchen" },
  { name: "Flower/Infused Pre-Rolls", n: 2, wing: "manufacturing" as const, room: "infused" },
  { name: "Packaging", n: 2, wing: "packaging" as const, room: "pack" },
  { name: "Shipping/Support", n: 1, wing: "manufacturing" as const, room: "ship" },
  { name: "Trimming", n: 1, wing: "manufacturing" as const, room: "rr-m" },
  { name: "Quality & Testing", n: 0, wing: "manufacturing" as const, room: null },
];

const activeStaff = DEPTS.reduce((s, d) => s + d.n, 0);

type Filter = "all" | "plants" | "packages" | "flower" | "veg" | "dry" | "vault" | "process" | "quarantine";

function roomLine(rows: S2SRoom[], fac?: FacRoom) {
  if (fac) return roomMetrics(fac).join(" · ");
  const plants = rows.reduce((s, r) => s + r.tagged_flowering + r.tagged_veg + r.harvest_plants, 0);
  const pkg = rows.reduce((s, r) => s + r.pkg_n, 0);
  const g = rows.reduce((s, r) => s + r.pkg_qty_g, 0);
  const wet = rows.reduce((s, r) => s + r.harvest_wet_lb, 0);
  const bits: string[] = [];
  if (plants) bits.push(`${plants.toLocaleString()} pl`);
  if (wet) bits.push(`${wet.toLocaleString(undefined, { maximumFractionDigits: 1 })} lb wet`);
  if (pkg) bits.push(`${pkg.toLocaleString()} pk`);
  if (g) bits.push(`${(g / 453.59237).toLocaleString(undefined, { maximumFractionDigits: 1 })} lb`);
  return bits.join(" · ") || "empty";
}

function kindOf(name: string): Filter {
  if (/flower/i.test(name)) return "flower";
  if (/mother|clone|veg/i.test(name)) return "veg";
  if (/dry|cure|pre.?trim/i.test(name)) return "dry";
  if (/vault|fulfill|finish|bda|freezer|warehouse/i.test(name)) return "vault";
  if (/quarantine/i.test(name)) return "quarantine";
  return "process";
}

function swatch(name: string) {
  const k = kindOf(name);
  if (k === "flower") return "#7dba8c";
  if (k === "veg") return "#9dceb0";
  if (k === "dry") return "#c4a056";
  if (k === "vault") return "#8aa0b8";
  if (k === "quarantine") return "#c47a6a";
  return "#9aa394";
}

function matches(name: string, filter: Filter, rows: S2SRoom[]) {
  if (filter === "all") return true;
  if (filter === "plants") return rows.some((r) => r.tagged_flowering + r.tagged_veg + r.harvest_plants > 0);
  if (filter === "packages") return rows.some((r) => r.pkg_n > 0);
  return kindOf(name) === filter;
}

export function FacilityOverview({
  rooms,
  onOpen,
  onWing,
  onDrill,
  cardW,
  onCardW,
  cardMax,
}: {
  rooms: FacRoom[];
  onOpen: (id: string) => void;
  onWing: (wing: "facility" | "cultivation" | "manufacturing" | "packaging") => void;
  onDrill: (t: FacTarget) => void;
  cardW?: number;
  onCardW?: (n: number) => void;
  cardMax?: number;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openName, setOpenName] = useState<string | null>(null);
  const plants = taggedFlowering();
  const pkgs = S2S_ROOMS.reduce((s, r) => s + r.pkg_n, 0);
  const names = useMemo(() => Array.from(new Set(S2S_ROOMS.map((r) => r.room))), []);
  const byName = useMemo(
    () => new Map(rooms.filter((r) => r.metrc).map((r) => [r.metrc as string, r])),
    [rooms],
  );

  const openRoom = (name: string) => {
    const id = floorIdFromName(name);
    const fac = id
      ? rooms.find((r) => r.id === id)
      : rooms.find((r) => sameMetrc(r.metrc ?? "", name) || sameMetrc(r.name, name));
    if (fac) {
      onWing(wingOf(fac));
      onOpen(fac.id);
      return;
    }
    setOpenName((cur) => (cur === name ? null : name));
  };

  return (
    <aside className="fac-overview" aria-label="Facility overview" style={cardW ? { width: cardW } : undefined}>
      {onCardW && cardW ? <CardSlide w={cardW} max={cardMax ?? 720} onW={onCardW} /> : null}
      <p className="fac-kicker">All rooms</p>
      <h2>Facility overview</h2>
      <div className="fo-hero">
        <button type="button" className={filter === "plants" ? "on" : ""} onClick={() => onDrill({ k: "plants" })}>
          <b>{plants.toLocaleString()}</b>
          <span>Plants</span>
        </button>
        <button type="button" className={filter === "packages" ? "on" : ""} onClick={() => onDrill({ k: "packages" })}>
          <b>{pkgs.toLocaleString()}</b>
          <span>Packages</span>
        </button>
        <button type="button" className={filter === "all" ? "on" : ""} onClick={() => onDrill({ k: "site" })}>
          <b>{names.length}</b>
          <span>Metrc rooms</span>
        </button>
      </div>
      <p className="fo-lead">Every line opens. Plants, packages, a department, or a room — click it.</p>

      <p className="fo-lead">
        <button type="button" className="fac-link" onClick={() => onDrill({ k: "staff" })}>
          Staffing — {activeStaff} on a department desk of {AGENTS.n} active employees
        </button>
      </p>
      <ul className="fo-depts">
        {DEPTS.map((d) => (
          <li key={d.name} className={d.n ? "" : "is-zero"}>
            <button
              type="button"
              onClick={() => onDrill({ k: "dept", name: d.name })}
            >
              <i style={{ background: d.n ? "#7dba8c" : "#c47a6a" }} />
              <span>{d.name}</span>
              <em>{d.n || "none"}</em>
            </button>
          </li>
        ))}
      </ul>
      <p className="fo-note">
        Quality & Testing has <strong>no active staff</strong>. No shift, hours or time-off data exists anywhere yet —
        every scheduling table is empty, so nothing here shows who is on today.
      </p>

      <p className="fac-kicker">Rooms{filter !== "all" ? ` · ${filter}` : ""}</p>
      <ul className="fo-rooms">
        {names.map((name) => {
          const rows = S2S_ROOMS.filter((r) => r.room === name);
          if (!matches(name, filter, rows)) return null;
          const fac = byName.get(name);
          const open = openName === name;
          return (
            <li key={name} className={open ? "open" : ""}>
              <button
                type="button"
                onClick={() => {
                  if (fac) onOpen(fac.id);
                  else onDrill({ k: "s2s", room: name });
                }}
              >
                <i style={{ background: swatch(name) }} />
                <span>{name}</span>
                <em>
                  {roomLine(rows, fac)}
                  {fac && roomClock(fac) ? (
                    <b className={"fac-clock " + roomClock(fac)!.tone}> {roomClock(fac)!.text}</b>
                  ) : null}
                </em>
              </button>
              {open ? (
                <div className="fo-drill">
                  {rows.map((r) => (
                    <button
                      key={r.licence}
                      type="button"
                      className="fo-drill-line"
                      onClick={() => onDrill({ k: "s2s", room: r.room })}
                    >
                      <b>{r.licence}</b> · {r.role} · {r.status}
                      {r.tagged_flowering ? ` · ${r.tagged_flowering.toLocaleString()} flowering` : ""}
                      {r.tagged_veg ? ` · ${r.tagged_veg.toLocaleString()} veg` : ""}
                      {r.harvest_plants ? ` · ${r.harvest_plants.toLocaleString()} on harvest` : ""}
                      {r.pkg_n ? ` · ${r.pkg_n.toLocaleString()} packages` : ""}
                      {r.note ? ` — ${r.note}` : ""}
                    </button>
                  ))}
                  {fac ? (
                    <button type="button" className="fo-drill-line" onClick={() => onOpen(fac.id)}>
                      Open floor · {fac.name}
                    </button>
                  ) : (
                    <p>Not on the Phase I floor. Live Metrc only until you place it.</p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export function FacilityLegend({ onPick, active }: { onPick?: (zone: string) => void; active?: string }) {
  const items = [
    ["#7dba8c", "Flower", "flower"],
    ["#9dceb0", "Veg / Mother", "veg"],
    ["#c4a056", "Dry / Cure", "dry"],
    ["#8aa0b8", "Vault", "vault"],
    ["#9aa394", "Process", "process"],
    ["#c47a6a", "Quarantine", "quarantine"],
  ] as const;
  return (
    <ul className="fac-legend" aria-label="Room types">
      {items.map(([c, n, z]) => (
        <li key={n}>
          <button type="button" className={active === z ? "on" : ""} onClick={() => onPick?.(z)}>
            <i style={{ background: c }} />
            {n}
          </button>
        </li>
      ))}
    </ul>
  );
}
