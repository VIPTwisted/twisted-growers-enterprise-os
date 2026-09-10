import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { LIC_MC, LIC_MP } from "@/data/licences";
import {
  Archive,
  Beaker,
  Box,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Coffee,
  Cog,
  Compass,
  Droplets,
  Factory,
  FlaskConical,
  Home,
  Leaf,
  Lock,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Scissors,
  ShieldAlert,
  Snowflake,
  Layers,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import { AGENTS, FAC_DEPTS, FAC_ROOMS, inWing, isRestroom, taggedFlowering, wingOf, type FacRoom } from "@/data/facility";
import { PACK_SEED, packLowCount, type PackItem } from "@/data/pack-inventory";
import { FacilityScene } from "@/components/facility-scene";
import { FacilityLegend, FacilityOverview } from "@/components/facility-overview";
import { FacForensic, type FacTarget } from "@/components/fac-forensic";
import { RoomBrief } from "@/components/room-brief";
import { CardSlide, cardMax, clampCardW } from "@/components/card-slide";
import { loadFacility, saveAssign, type AssignRow, type WaveRow } from "@/lib/facility-api";

if (typeof document !== "undefined" && !document.getElementById("tg-facility-css")) {
  const link = document.createElement("link");
  link.id = "tg-facility-css";
  link.rel = "stylesheet";
  link.href = "/facility.css";
  document.head.appendChild(link);
}

function roomIcon(id: string) {
  if (id.startsWith("f")) return Leaf;
  if (id === "veg") return Leaf;
  if (id === "dry1" || id === "dry2" || id === "cure") return Leaf;
  if (id === "hydro") return Droplets;
  if (id === "solventless") return Beaker;
  if (id === "kitchen") return Factory;
  if (id === "freezer") return Snowflake;
  if (id === "biomass") return Layers;
  if (id === "bda" || id === "wh1") return Warehouse;
  if (id === "vault") return Lock;
  if (id === "fulfill") return Package;
  if (id === "ship") return Truck;
  if (id === "dock-inv") return Archive;
  if (id === "pretrim" || id === "rr-m") return Scissors;
  if (id === "quar") return ShieldAlert;
  if (id === "conf" || id === "pack") return Package;
  if (id === "grind") return Cog;
  if (id === "office" || id === "infused") return Box;
  if (id === "break") return Coffee;
  if (id === "stage") return Package;
  if (id === "qa") return FlaskConical;
  return Building2;
}

function deptIcon(id: string) {
  if (id === "cult") return Leaf;
  if (id === "mfg") return Factory;
  if (id === "pack") return Package;
  return Building2;
}

const RAIL_KEY = "tg.fac.rail";
const CARD_KEY = "tg.fac.cardw";

function loadRail() {
  try {
    const raw = localStorage.getItem(RAIL_KEY);
    if (!raw) return { w: 210, collapsed: false as boolean, shut: [] as string[] };
    const p = JSON.parse(raw) as { w?: number; collapsed?: boolean; shut?: string[] };
    return {
      w: Math.min(340, Math.max(168, Number(p.w) || 210)),
      collapsed: !!p.collapsed,
      shut: Array.isArray(p.shut) ? p.shut : [],
    };
  } catch {
    return { w: 210, collapsed: false as boolean, shut: [] as string[] };
  }
}

function loadCardW() {
  try {
    const n = Number(localStorage.getItem(CARD_KEY));
    if (Number.isFinite(n) && n > 0) return clampCardW(n);
  } catch {
    /* ignore */
  }
  return 352;
}

export function FacilityTwin() {
  const [sel, setSel] = useState<string | null>(null);
  const [view] = useState<"iso" | "plan">("iso");
  const [wing, setWing] = useState<"facility" | "cultivation" | "manufacturing" | "packaging">("facility");
  const [drill, setDrill] = useState<FacTarget | null>(null);
  const [rooms, setRooms] = useState<FacRoom[]>(FAC_ROOMS);
  const [waves, setWaves] = useState<WaveRow[]>([]);
  const [assigns, setAssigns] = useState<AssignRow[]>([]);
  const [pack, setPack] = useState<PackItem[]>(PACK_SEED);
  const [rail, setRail] = useState(loadRail);
  const [cardW, setCardW] = useState(loadCardW);
  const [half, setHalf] = useState(cardMax);
  const [lic] = useState<"ALL" | typeof LIC_MC | typeof LIC_MP>("ALL");

  useEffect(() => {
    const onResize = () => {
      const max = cardMax();
      setHalf(max);
      setCardW((w) => clampCardW(w, max));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, JSON.stringify(rail));
    } catch {
      /* ignore */
    }
  }, [rail]);

  useEffect(() => {
    try {
      localStorage.setItem(CARD_KEY, String(cardW));
    } catch {
      /* ignore */
    }
  }, [cardW]);

  const refresh = useCallback(async () => {
    try {
      const data = await loadFacility();
      if (!data) return;
      const live = data.rooms?.length ? data.rooms : [];
      const byId = new Map(FAC_ROOMS.map((r) => [r.id, r]));
      for (const r of live) {
        const prev = byId.get(r.id);
        byId.set(r.id, prev ? { ...prev, ...r, metrc: r.metrc || prev.metrc, cap: r.cap ?? prev.cap } : r);
      }
      setRooms([...byId.values()]);
      setWaves(Array.isArray(data.waves) ? data.waves : []);
      setAssigns(
        (Array.isArray(data.assigns) ? data.assigns : []).map((a) => ({
          who: a.who,
          date: a.date,
          station: a.station,
          seat: a.seat === "packer" ? "packer" : "operator",
        })),
      );
      setPack(Array.isArray(data.pack) && data.pack.length ? data.pack : PACK_SEED);
    } catch {
      setRooms(FAC_ROOMS);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const floor = rooms;
  const shown =
    wing === "facility" ? floor.filter((r) => !isRestroom(r)) : floor.filter((r) => inWing(r, wing));
  const room = sel ? floor.find((r) => r.id === sel) : undefined;
  const canopy = useMemo(() => taggedFlowering(), []);
  const packLow = packLowCount(pack) > 0;
  const cardOpen = !!(drill || room);
  const setWidth = (n: number) => setCardW(clampCardW(n, half));

  const openRoom = (id: string) => {
    const hit = floor.find((r) => r.id === id);
    if (hit) setWing(wingOf(hit));
    setSel(id);
    setDrill(null);
  };

  const setWingView = (next: "facility" | "cultivation" | "manufacturing" | "packaging") => {
    setWing(next);
    setSel(null);
    setDrill(null);
  };

  return (
    <div
      className={"fac-root" + (cardOpen ? " is-open" : "")}
      style={{ ["--fac-card-w" as string]: `${cardW}px`, ["--fac-rail-w" as string]: rail.collapsed ? "3.2rem" : `${rail.w}px` }}
    >
      <div className="fac-stage">
        <div className="fac-toolbar">
          <button type="button" className={wing === "facility" ? "on" : ""} onClick={() => setWingView("facility")}>
            Facility
          </button>
          <button type="button" className={wing === "cultivation" ? "on" : ""} onClick={() => setWingView("cultivation")}>
            Cultivation
          </button>
          <button type="button" className={wing === "manufacturing" ? "on" : ""} onClick={() => setWingView("manufacturing")}>
            Manufacturing
          </button>
          <button type="button" className={wing === "packaging" ? "on" : ""} onClick={() => setWingView("packaging")}>
            Packaging
          </button>
        </div>
        <FacilityScene
          rooms={shown.length ? shown : FAC_ROOMS.filter((r) => !isRestroom(r))}
          selected={sel}
          onSelect={(id) => (id ? openRoom(id) : setSel(null))}
          view={view}
          fit={wing}
          packLow={packLow}
        />
      </div>

      <nav className={"fac-rail" + (rail.collapsed ? " is-thin" : "")} style={{ width: rail.collapsed ? "3.1rem" : rail.w }} aria-label="Rooms">
        <Link to="/board" className="fac-home" title="Command center">
          <Home className="size-4" />
          {rail.collapsed ? null : "Home"}
        </Link>
        <div className="fac-rail-tools">
          <button
            type="button"
            className="fac-rail-tog"
            title={rail.collapsed ? "Expand menu" : "Collapse menu"}
            onClick={() => setRail((r) => ({ ...r, collapsed: !r.collapsed }))}
          >
            {rail.collapsed ? <PanelLeftOpen className="size-4 text-mark" /> : <PanelLeftClose className="size-4 text-mark" />}
          </button>
          <button
            type="button"
            className="fac-rail-tog"
            title="Collapse all departments"
            onClick={() => setRail((r) => ({ ...r, shut: FAC_DEPTS.map((d) => d.id) }))}
          >
            <ChevronsDownUp className="size-4 text-mark" />
          </button>
          <button
            type="button"
            className="fac-rail-tog"
            title="Uncollapse all departments"
            onClick={() => setRail((r) => ({ ...r, shut: [] }))}
          >
            <ChevronsUpDown className="size-4 text-mark" />
          </button>
          {rail.collapsed ? null : (
            <label className="fac-rail-slide">
              <span className="sr-only">Menu width</span>
              <input title="Field"
                type="range"
                min={168}
                max={340}
                value={rail.w}
                onInput={(e) => setRail((r) => ({ ...r, w: Number((e.target as HTMLInputElement).value) }))}
                onChange={(e) => setRail((r) => ({ ...r, w: Number(e.target.value) }))}
              />
            </label>
          )}
        </div>
        {FAC_DEPTS.filter((d) => wing === "facility" || d.wing === wing).map((dept) => {
          const groups = dept.groups
            .map((g) => ({
              ...g,
              list: g.rooms.map((id) => floor.find((r) => r.id === id)).filter((r): r is FacRoom => !!r && !isRestroom(r)),
            }))
            .filter((g) => g.list.length);
          if (!groups.length) return null;
          const DeptIco = deptIcon(dept.id);
          const shut = rail.shut.includes(dept.id);
          return (
            <div key={dept.id} className="fac-rail-dept">
              <button
                type="button"
                className="fac-rail-dept-h"
                onClick={() =>
                  setRail((r) => ({
                    ...r,
                    shut: shut ? r.shut.filter((id) => id !== dept.id) : [...r.shut, dept.id],
                  }))
                }
              >
                <DeptIco className="size-3.5" />
                {rail.collapsed ? null : dept.label}
                {rail.collapsed ? null : shut ? <ChevronRight className="size-3.5 ml-auto" /> : <ChevronDown className="size-3.5 ml-auto" />}
              </button>
              {shut
                ? null
                : groups.map((g) => (
                    <div key={g.label} className="fac-rail-group">
                      {rail.collapsed ? null : <em>{g.label}</em>}
                      {g.list.map((r) => {
                        const Ico = roomIcon(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            className={sel === r.id ? "on" : ""}
                            title={r.name}
                            onClick={() => openRoom(r.id)}
                          >
                            <Ico className="size-3.5" />
                            {rail.collapsed ? null : <span>{r.name}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
            </div>
          );
        })}
      </nav>

      <footer className="fac-dock">
        <FacilityLegend
          active={drill?.k === "legend" ? drill.zone : undefined}
          onPick={(zone) => setDrill({ k: "legend", zone })}
        />
        <div className="fac-hud-right">
          <button type="button" className="fac-chip" onClick={() => setDrill({ k: "plants" })}>
            <Leaf className="size-3.5" />
            {canopy.toLocaleString()} tagged
          </button>
          <button type="button" className="fac-chip" onClick={() => setDrill({ k: "staff" })}>
            <Users className="size-3.5" />
            {AGENTS.n} active
          </button>
          <button type="button" className="fac-chip" onClick={() => setDrill({ k: "site" })}>
            <Compass className="size-3.5" />
            N
          </button>
        </div>
      </footer>

      {drill ? (
        <FacForensic
          target={drill}
          rooms={floor}
          onOpen={openRoom}
          onDrill={setDrill}
          onClose={() => setDrill(null)}
          cardW={cardW}
          onCardW={setWidth}
          cardMax={half}
        />
      ) : room ? (
        <aside className="fac-panel is-open" style={{ width: cardW }} aria-live="polite">
          <CardSlide w={cardW} max={half} onW={setWidth} />
          <RoomBrief
            room={room}
            waves={waves}
            assigns={assigns}
            pack={pack}
            onPack={setPack}
            lic={lic}
            onClose={() => setSel(null)}
            onDrill={setDrill}
            onStation={async (who, date, station, seat) => {
              await saveAssign({ data: { who, date, station, seat } });
              setAssigns((cur) => {
                const rest = cur.filter((a) => !(a.who === who && a.date === date));
                return station ? [...rest, { who, date, station, seat: seat ?? "operator" }] : rest;
              });
            }}
          />
        </aside>
      ) : (
        <FacilityOverview rooms={floor} onOpen={openRoom} onWing={setWingView} onDrill={setDrill} cardW={cardW} onCardW={setWidth} cardMax={half} />
      )}
    </div>
  );
}

export default FacilityTwin;
