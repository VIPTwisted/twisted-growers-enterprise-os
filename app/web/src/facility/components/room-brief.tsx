import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, Leaf, Package, Users } from "lucide-react";
import { liveFor, roomHold, type FacRoom } from "@/data/facility";
import { DOSSIERS } from "@/data/dossiers";
import { S2S_AS_OF } from "@/data/s2s-rooms";
import { cropsFor, dutiesFor, etYmd, roomKpis, ROOM_DEPT, staffForRoom, OPS_STATIONS, stationLabel } from "@/data/room-ops";
import { FLOOR, MFG } from "@/data/weight";
import { shipDesk, type ShipOrder } from "@/data/shipping";
import { packKpis, type PackItem } from "@/data/pack-inventory";
import { invExpiryKpi } from "@/data/inventory-lots";
import { cultForRoom, isCultRoom } from "@/data/cult-book";
import type { FacTarget } from "@/components/fac-forensic";
import type { AssignRow, WaveRow } from "@/lib/facility-api";
import { PackStock } from "@/components/pack-stock";
import { RoomOpsDesk } from "@/components/room-ops-desk";
import { RoomMetrcBoard } from "@/components/room-metrc";
import { FgBoard } from "@/components/fg-board";
import { ProdBoard } from "@/components/prod-board";
import { LIC_MC, LIC_MP } from "@/data/licences";

function clock12(hhmm: string) {
  const [hs, ms] = (hhmm || "00:00").split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

function minutesET() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

function toMin(hhmm: string) {
  const [h, m] = (hhmm || "0:0").split(":").map(Number);
  return h * 60 + m;
}

function fmt(n: number, d = 0) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}

function fmtLb(g: number) {
  return (g / 453.592).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

const ZONE_TITLE: Record<FacRoom["zone"], string> = {
  flower: "Flowering",
  canopy: "Vegetation",
  dry: "Dry / cure",
  process: "Manufacturing & vault",
  office: "Operations",
  service: "Building services",
};

function functionCopy(room: FacRoom) {
  if (room.id === "break" || /break/i.test(room.name)) {
    return "Unpaid employee break. Coverage splits across two 30-minute waves so the floor never empties.";
  }
  if (room.zone === "flower") {
    return "Licensed flowering rooms. Room card carries Metrc wet, waste, water (moisture residual), packaged tags, and Vincent’s CFO allocation (A/B/C + trim + FF). Cultivation records. Vincent approves. Floor is 180 lb packaged tags per pull.";
  }
  if (room.zone === "canopy" || room.id === "veg") {
    return "One room, three Metrc locations: Vegetation Room, Mother Room, Clone Room. Tagged mothers CERTIFIED. Untagged veg and clone batches stay PARTIAL until dual MATCH. COA, manifest, and Apex invoice attach here as each tag moves seed-to-sale.";
  }
  if (room.zone === "dry") {
    return "Hang, A/B/C, moisture. 10-day dry clock. Wet stays on the rack until packaged. Card tracks Metrc wet / waste / water / packaged and Vincent’s allocation. Grade card is DRAFT until he signs.";
  }
  if (room.id === "ship") {
    return "Dock. Outbound orders, every return, and shipping items. Apex invoice is SoR. Manifests happen in Metrc.";
  }
  if (room.id === "dock-inv") {
    return "Inventory. Every packed finished good ready for resale — Finish Vault, Fulfillment Vault, and the dock. Plants and wet harvests stay on those rooms. CERTIFIED lb only on dual MATCH.";
  }
  if (room.id === "rr-m" || /trim/i.test(room.name)) {
    return "Trim. Hand and machine. Metrc Trim Room. Standing desk is the Trimming department — one headcount plus the manufacturing floor manager. Technician names are not on a shift book yet.";
  }
  if (room.id === "stage") {
    return "Packaging & Supplies. Tubes, jars, labels, lids, bags, boxes. Track on-hand, wasted, damaged, and label/supply expiry on the cards. Not Metrc.";
  }
  if (room.id === "vault" || room.id === "fulfill") {
    return "Inventory. Finished goods packed and ready. Every lot carries an expiration. CERTIFIED lb only on dual MATCH.";
  }
  if (room.id === "pack") {
    return "Finish packaging. Pre-rolls, vapes, and other non-flower goods. Josh is an equipment operator — schedule him here as Other, or on flower packaging / infused.";
  }
  if (room.id === "conf" || /flower pack/i.test(room.name) || room.metrc === "Packaging Room") {
    return "Finished flower packaging. The machine needs one operator and one packer. Josh is the operator when the schedule says Flower packaging equipment.";
  }
  if (room.id === "infused") {
    return "Infused pre-rolls. The machine needs one operator. Josh is on this machine when the schedule says Infused pre-rolls.";
  }
  if (room.zone === "office") return "Operations. Not a Metrc location.";
  if (room.zone === "process") return "Manufacturing floor. Packages and weight come from the live Metrc location mapped to this room.";
  return "Building services. Not a Metrc location.";
}

function JoshBoard({
  date,
  assigns,
  onStation,
}: {
  date: string;
  assigns: AssignRow[];
  onStation?: (who: string, date: string, station: "" | "flower-pack" | "infused" | "other", seat?: "operator" | "packer") => void;
}) {
  const op = assigns.find((a) => a.who === "Josh" && a.date === date && a.seat !== "packer");
  const st = op?.station ?? "";
  const packer = assigns.find((a) => a.date === date && a.seat === "packer" && a.station === "flower-pack");
  const infusedOk = st === "infused";
  const flowerOpOk = st === "flower-pack";
  const flowerPackOk = !!packer?.who;
  return (
    <div className="josh-board">
      <p className="fac-kicker">Crew · machines · {date}</p>
      <article className={infusedOk ? "need ok" : "need"}>
        <b>Infused pre-roll machine</b>
        <span>Needs 1 operator</span>
        <em>{infusedOk ? "Josh on this machine" : st ? `Josh is on ${stationLabel(st)}` : "Operator open"}</em>
      </article>
      <article className={flowerOpOk && flowerPackOk ? "need ok" : "need"}>
        <b>Flower packaging machine</b>
        <span>Needs 1 operator + 1 packer</span>
        <em>
          Operator: {flowerOpOk ? "Josh" : "open"} · Packer: {packer?.who || "open"}
        </em>
      </article>
      <p className="fac-kicker">Josh · equipment operator</p>
      <div className="josh-picks">
        {OPS_STATIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={st === s.id ? "on" : ""}
            onClick={() => onStation?.("Josh", date, st === s.id ? "" : s.id, "operator")}
          >
            {s.label}
            {s.packer ? " · +packer" : " · 1 operator"}
          </button>
        ))}
      </div>
      {st === "flower-pack" || packer ? (
        <label className="josh-packer">
          Packer on flower packaging
          <input title="Name of packer"
            defaultValue={packer?.who ?? ""}
            placeholder="Name of packer"
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (!name) {
                if (packer) onStation?.(packer.who, date, "", "packer");
                return;
              }
              onStation?.(name, date, "flower-pack", "packer");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </label>
      ) : null}
    </div>
  );
}

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function ShipTable({ rows, onOpen }: { rows: ShipOrder[]; onOpen: (id: string) => void }) {
  return (
    <div className="rb-table-wrap">
      <table className="rb-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Buyer</th>
            <th>Status</th>
            <th>Ordered</th>
            <th>Delivery</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.invoice} className="is-hit" role="button" tabIndex={0} onClick={() => onOpen(o.invoice)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(o.invoice); } }}>
              <td>
                {o.invoice}
                <i>{o.city}</i>
              </td>
              <td>{o.buyer}</td>
              <td>{o.status}</td>
              <td className="num">{o.ordered}</td>
              <td className={o.delivery ? "" : "soon"}>{o.delivery ?? "unscheduled"}</td>
              <td className="num">{usd(o.dollars)}</td>
            </tr>
          ))}
          {rows.length > 1 ? (
            <tr className="total">
              <td>Total</td>
              <td>{rows.length} invoices</td>
              <td colSpan={3} />
              <td className="num">{usd(rows.reduce((s, r) => s + r.dollars, 0))}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function Tile({
  k,
  v,
  s,
  tone,
  onClick,
}: {
  k: string;
  v: string;
  s?: string;
  tone?: "ok" | "hold" | "crit";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={"rb-tile" + (tone ? " " + tone : "")} onClick={onClick}>
      <span className="rb-k">{k}</span>
      <span className="rb-v">{v}</span>
      {s ? <p>{s}</p> : null}
    </Tag>
  );
}

function Hero({
  room,
  hold,
  crops,
  plantN,
  pkgs,
  pkgG,
  wet,
  desk,
  onDrill,
}: {
  room: FacRoom;
  hold: ReturnType<typeof roomHold>;
  crops: ReturnType<typeof cropsFor>;
  plantN: number;
  pkgs: number;
  pkgG: number;
  wet: number;
  desk: ReturnType<typeof shipDesk> | null;
  onDrill: (t: FacTarget) => void;
}) {
  const top = [...crops].sort((a, b) => b.plants - a.plants).slice(0, 4);
  const max = top[0]?.plants || 1;
  const cap = room.cap || hold.cap || 0;
  const occ = cap ? Math.min(100, Math.round((plantN / cap) * 100)) : 0;
  const isShip = room.id === "ship";
  let n = plantN;
  let label = "Plants standing";
  let sub = cap ? `${occ}% of ${cap.toLocaleString()} hold` : room.metrc ?? "Ops room";
  if (!plantN && pkgs) {
    n = pkgs;
    label = "Packages on hand";
    sub = `${fmtLb(pkgG)} lb net`;
  } else if (!plantN && wet) {
    n = Math.round(wet);
    label = "Lb wet on rack";
    sub = `${fmt(hold.harvestPlants)} plants hanging`;
  } else if (isShip && desk) {
    n = desk.going.length;
    label = "Going out today";
    sub = `${desk.goingUsd ? desk.goingUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "$0"} on the dock`;
  }

  return (
    <section className="rb-hero">
      <button type="button" className="rb-hero-hit" onClick={() => onDrill(plantN ? { k: "plants" } : pkgs ? { k: "packages" } : { k: "s2s", room: room.metrc ?? room.name })}>
        <p className="rb-hero-n">{fmt(n)}</p>
        <p className="rb-hero-l">{label}</p>
        <p className="rb-hero-s">{sub}</p>
        {cap ? (
          <span className="rb-occ" aria-hidden>
            <i style={{ width: `${occ}%` }} />
          </span>
        ) : null}
      </button>
      {top.length ? (
        <ul className="rb-strains">
          <li className="rb-strains-k">Strains — top {top.length}</li>
          {top.map((c) => (
            <li key={c.strain}>
              <button type="button" onClick={() => onDrill({ k: "strain", strain: c.strain })}>
                <span>
                  {c.strain}
                  <i style={{ width: `${Math.max(8, Math.round((c.plants / max) * 100))}%` }} />
                </span>
                <em>{fmt(c.plants)}</em>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function RoomBrief({
  room,
  waves,
  assigns = [],
  pack = [],
  onPack,
  onClose,
  onDrill,
  onStation,
  lic = "ALL",
}: {
  room: FacRoom;
  waves: WaveRow[];
  assigns?: AssignRow[];
  pack?: PackItem[];
  onPack?: (next: PackItem[]) => void;
  onClose: () => void;
  onDrill: (t: FacTarget) => void;
  onStation?: (who: string, date: string, station: "" | "flower-pack" | "infused" | "other", seat?: "operator" | "packer") => void;
  lic?: "ALL" | typeof LIC_MC | typeof LIC_MP;
}) {
  const rows = liveFor(room);
  const isShip = room.id === "ship";
  const isInv = room.id === "dock-inv" || room.id === "vault" || room.id === "fulfill";
  const isBreak = room.id === "break" || /break/i.test(room.name);
  const desk = isShip ? shipDesk() : null;
  const now = minutesET();
  const liveWaves = isBreak ? waves : [];
  const activeWave = liveWaves.find((w) => now >= toMin(w.start) && now < toMin(w.end));
  const nextWave = liveWaves.find((w) => toMin(w.start) > now);
  const k = roomKpis(room);
  const hold = roomHold(room);
  const pk = packKpis(pack);
  const exp = invExpiryKpi(room.id);
  const cult = isCultRoom(room) ? cultForRoom(room) : null;
  const crops = cropsFor(room);
  const staff = staffForRoom(room);
  const deptDesk = ROOM_DEPT[room.id];
  const today = etYmd();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const duties = useMemo(() => dutiesFor(room, from, to, assigns), [room, from, to, assigns]);
  const namedToday = staff.length + (deptDesk?.n ?? 0);
  const nextLeft = crops.length ? Math.min(...crops.map((c) => c.left)) : null;
  const nextCrop = crops.find((c) => c.left === nextLeft);
  const status = rows[0]?.status ?? (room.metrc ? "EMPTY" : null);

  let nowLine = "Floor is live.";
  if (isShip && desk) {
    nowLine = desk.going.length
      ? `${desk.going.length} going out · ${usd(desk.goingUsd)} · ${desk.asOf}`
      : `Nothing packed for today · ${desk.scheduled.length} still scheduled · ${desk.asOf}`;
  } else if (isBreak) {
    if (activeWave) nowLine = `${activeWave.label} in session · ${clock12(activeWave.start)}–${clock12(activeWave.end)} ET`;
    else if (nextWave) nowLine = `Between waves · next ${nextWave.label} at ${clock12(nextWave.start)} ET`;
    else nowLine = "Both break waves complete · production hours";
  } else if (nextCrop && nextCrop.cycle) {
    nowLine = nextCrop.status;
  } else if (rows.length) {
    nowLine = `${rows[0].role} · as of ${S2S_AS_OF}`;
  } else if (!room.metrc) {
    nowLine = "Operations room · not a Metrc location";
  }

  return (
    <div className="rb">
      <header className="rb-head">
        <div>
          <p className="fac-kicker">
            {ZONE_TITLE[room.zone]}
            {status ? ` · ${status}` : ""}
          </p>
          <h2>{room.id === "veg" ? "Vegetation Room" : room.name}</h2>
          <p className="rb-now">
            <Clock className="size-3.5" />
            {nowLine}
          </p>
        </div>
        <button type="button" className="fac-close" onClick={onClose}>
          ← Back to all rooms
        </button>
      </header>

      <Hero
        room={room}
        hold={hold}
        crops={crops}
        plantN={k.plantN || k.tagged || hold.inRoom}
        pkgs={k.pkgs}
        pkgG={k.pkgG}
        wet={k.wet}
        desk={desk}
        onDrill={onDrill}
      />

      {room.id === "stage" ? <PackStock items={pack} onChange={(next) => onPack?.(next)} /> : null}

      {isInv ? <FgBoard roomId={room.id} onDrill={onDrill} /> : null}
      {["conf", "pack", "office", "infused", "kitchen", "hydro", "grind", "rr-m"].includes(room.id) ? (
        <ProdBoard roomId={room.id} assigns={assigns} />
      ) : null}

      <RoomOpsDesk room={room} onDrill={onDrill} />

      <div className="rb-kpis">
        {room.id !== "dock-inv" ? (
        <Tile
          k="In room"
          v={fmt(k.plantN || k.tagged || k.crops.reduce((s, c) => s + c.plants, 0) || hold.inRoom)}
          s="plants currently in this room"
          tone={hold.inRoom ? "ok" : undefined}
          onClick={() => onDrill({ k: "plants" })}
        />
        ) : null}
        {room.cap ? (
          <Tile
            k="Room hold"
            v={fmt(room.cap)}
            s={`${Math.round(((hold.inRoom || 0) / room.cap) * 100)}% occupied`}
            tone={hold.inRoom === room.cap ? "ok" : "hold"}
            onClick={() => room.metrc && onDrill({ k: "s2s", room: room.metrc })}
          />
        ) : null}
        {nextCrop && nextCrop.cycle ? (
          <Tile
            k="Days till done"
            v={nextLeft === 0 ? "Due today" : nextLeft !== null && nextLeft < 0 ? `${Math.abs(nextLeft)}d late` : `${nextLeft}d left`}
            s={`Day ${nextCrop.day} of ${nextCrop.cycle} · due ${nextCrop.due}`}
            tone={nextLeft === null ? undefined : nextLeft <= 0 ? "crit" : nextLeft <= 7 ? "hold" : "ok"}
            onClick={() => onDrill({ k: "strain", strain: nextCrop.strain })}
          />
        ) : null}
        {k.harvests.length ? (
          <Tile
            k="Open harvests"
            v={String(k.harvests.length)}
            s={`${fmt(k.wet, 1)} lb wet on rack`}
            tone={k.harvests.some((h) => h.level === "EXEC") ? "crit" : "hold"}
            onClick={() => onDrill({ k: "harvest", name: k.harvests[0].harvest })}
          />
        ) : null}
        {cult && (cult.n > 0 || room.zone === "flower" || room.zone === "dry") ? (
          <>
            <Tile
              k="Wet (Metrc)"
              v={`${fmt(cult.wet, 1)} lb`}
              s={`${cult.n} harvest${cult.n === 1 ? "" : "s"} · wet = waste + packaged + water`}
              tone={cult.identityOk ? "ok" : "crit"}
              onClick={() => onDrill({ k: "weights", room: room.id })}
            />
            <Tile
              k="Waste (Metrc)"
              v={`${fmt(cult.waste, 1)} lb`}
              s="Harvest waste on the Metrc identity. Not packaging waste."
              tone={cult.waste ? "hold" : "ok"}
              onClick={() => onDrill({ k: "weights", room: room.id })}
            />
            <Tile
              k="Water / moisture"
              v={`${fmt(cult.water, 1)} lb`}
              s="Metrc residual still on the rack until packaged. Cultivation must also weigh water on the grade card."
              tone={cult.exec ? "crit" : "hold"}
              onClick={() => onDrill({ k: "weights", room: room.id })}
            />
            <Tile
              k="Packaged tags"
              v={`${fmt(cult.packaged, 1)} lb`}
              s="Metrc TotalPackagedWeight. Actual saleable."
              tone="ok"
              onClick={() => onDrill({ k: "weights", room: room.id })}
            />
            <Tile
              k="CFO allocation"
              v={cult.filed ? `${cult.filed} filed` : "Not filed"}
              s={`${cult.vincent} approves A/B/C + trim + waste + water + FF. DRAFT until he signs.`}
              tone={cult.filed ? "ok" : "hold"}
              onClick={() => onDrill({ k: "weights", room: room.id })}
            />
          </>
        ) : null}
        {k.pkgs && room.id !== "dock-inv" ? (
          <Tile
            k="Packages"
            v={fmt(k.pkgs)}
            s={`${fmtLb(k.pkgG)} lb net weight · package count, not plants`}
            tone={rows.some((r) => r.pkg_stale_n) ? "crit" : "hold"}
            onClick={() => onDrill({ k: "packages" })}
          />
        ) : null}
        {room.id === "stage" ? (
          <>
            <Tile
              k="Wasted / damaged"
              v={String(pk.wasted + pk.damaged)}
              s={`${pk.wasted} wasted · ${pk.damaged} damaged packaging, supplies, labels`}
              tone={pk.wasted + pk.damaged ? "crit" : "ok"}
              onClick={() => onDrill({ k: "waste" })}
            />
            <Tile
              k="Supplies expiring"
              v={String(pk.expiring)}
              s="Labels and supplies within 30 days or expired"
              tone={pk.expiring ? "hold" : "ok"}
              onClick={() => onDrill({ k: "expiry" })}
            />
          </>
        ) : null}
        {isInv ? (
          <Tile
            k="Lots expiring"
            v={String(exp.watch)}
            s={`${exp.expired} expired · ${exp.soon} inside 30 days`}
            tone={exp.expired ? "crit" : exp.soon ? "hold" : "ok"}
            onClick={() => onDrill({ k: "expiry", id: room.id })}
          />
        ) : null}
        {room.zone === "process" && !isShip && room.id === "kitchen" ? (
          <Tile k="FF → oil" v={`${MFG.first_run[0].yield_pct}%`} s={`${fmt(MFG.first_run[0].out_lb, 2)} lb first-run / ${fmt(MFG.first_run[0].in_lb, 1)} lb wet`} tone="ok" onClick={() => onDrill({ k: "packages" })} />
        ) : null}
        {isShip && desk ? (
          <>
            <Tile k="Going out" v={String(desk.going.length)} s={`${usd(desk.goingUsd)} on the dock / due`} tone={desk.going.length ? "hold" : "ok"} onClick={() => desk.going[0] && onDrill({ k: "invoice", id: desk.going[0].invoice })} />
            <Tile k="Scheduled" v={String(desk.scheduled.length)} s={`${usd(desk.scheduledUsd)} still on the book`} onClick={() => desk.scheduled[0] && onDrill({ k: "invoice", id: desk.scheduled[0].invoice })} />
            <Tile k="Returns" v={String(desk.openReturns.length)} s={`${usd(desk.returnUsd)} on the dock / inspect · shipping handles every return`} tone={desk.openReturns.length ? "crit" : "ok"} onClick={() => onDrill({ k: "returns" })} />
            <Tile k="Shipping items" v={String(desk.freight.length)} s={`${desk.going.length} outbound · ${desk.openReturns.length} inbound returns`} onClick={() => onDrill({ k: "returns" })} />
          </>
        ) : null}
        {room.zone === "flower" ? (
          <Tile k="Pull floor" v={`${FLOOR.pull_lb} lb`} s={`${FLOOR.tables_per_room} tables · ${FLOOR.month_lb} lb / month`} onClick={() => onDrill({ k: "plants" })} />
        ) : null}
        <Tile
          k="Staff assigned"
          v={String(namedToday)}
          s={
            deptDesk
              ? `${staff.map((s) => s.name.split(" ").slice(-1)[0]).join(" · ") || "Lead"} · ${deptDesk.n} on ${deptDesk.dept}`
              : staff.length
                ? staff.map((s) => s.name.split(" ").slice(-1)[0]).join(" · ")
                : "No desk on this room"
          }
          onClick={() => onDrill({ k: "staff", name: staff[0]?.name })}
        />
        {room.metrc ? (
          <Tile k="License" v={[...new Set(rows.map((r) => r.licence))].join(" · ") || "—"} s={room.id === "veg" ? "Vegetation Room · Mother Room · Clone Room" : room.metrc} onClick={() => onDrill({ k: "s2s", room: room.id === "veg" ? "Vegetation Room" : room.metrc! })} />
        ) : (
          <Tile k="Metrc" v="None" s="Ops room" onClick={() => onDrill({ k: "site" })} />
        )}
      </div>

      <section>
        <p className="fac-kicker">What happens here</p>
        <p className="rb-copy">{functionCopy(room)}</p>
      </section>

      {room.id === "veg" ? (
        <>
          <section>
            <p className="fac-kicker">Metrc locations in this room · {LIC_MC}</p>
            <div className="rb-kpis">
              {rows.map((r) => (
                <Tile
                  key={r.room}
                  k={r.room}
                  v={
                    r.tagged_veg
                      ? `${fmt(r.tagged_veg)} tagged`
                      : r.batch_plants
                        ? `${fmt(r.batch_plants)} plants`
                        : "empty"
                  }
                  s={`${r.status} · ${r.role}${r.batch_n ? ` · ${r.batch_n} batches` : ""}`}
                  tone={r.status === "CERTIFIED" ? "ok" : r.status === "PARTIAL" ? "hold" : undefined}
                  onClick={() => onDrill({ k: "s2s", room: r.room })}
                />
              ))}
            </div>
          </section>
          <section>
            <p className="fac-kicker">Seed-to-sale attachments · as each becomes available</p>
            <div className="rb-kpis">
              {(DOSSIERS.find((d) => d.id === "veg-cluster")?.attachments ?? []).map((a) => (
                <Tile
                  key={a.kind}
                  k={a.kind.toUpperCase()}
                  v={a.status}
                  s={a.id ?? a.note}
                  tone={a.status === "ON FILE" ? "ok" : a.status === "GAP" ? "hold" : "crit"}
                  onClick={() => onDrill({ k: a.kind, room: "Vegetation Room" })}
                />
              ))}
            </div>
            <p className="rb-copy">
              {fmt(k.hops.length)} hops through Vegetation / Mother / Clone. Click a location above for the forensic ledger.
            </p>
          </section>
        </>
      ) : null}

      {crops.length ? (
        <section>
          <p className="fac-kicker">
            Plants by strain · {fmt(k.plantN)} plants · {k.strainN} strain{k.strainN === 1 ? "" : "s"}
          </p>
          <div className="rb-table-wrap">
            <table className="rb-table">
              <thead>
                <tr>
                  <th>Strain</th>
                  <th>Plants</th>
                  <th>Stage</th>
                  <th>Wet lb</th>
                  <th>Day</th>
                  <th>Left</th>
                </tr>
              </thead>
              <tbody>
                {crops.map((c) => (
                  <tr key={c.name} className="is-hit" role="button" tabIndex={0} onClick={() => onDrill({ k: "strain", strain: c.strain })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDrill({ k: "strain", strain: c.strain }); } }}>
                    <td>
                      {c.strain}
                      <i>{c.status}</i>
                    </td>
                    <td className="num">{fmt(c.plants)}</td>
                    <td>{c.stage === "FLOWER" ? "Flowering" : c.stage === "DRY" ? "Drying" : c.stage === "CURE" ? "Curing" : c.stage === "VEG" ? "Veg" : "Clone"}</td>
                    <td className="num">{c.wet_lb ? fmt(c.wet_lb, 1) : "—"}</td>
                    <td>
                      {c.cycle ? (
                        <span className="rb-bar">
                          <span style={{ width: `${Math.min(100, Math.max(4, Math.round((c.day / c.cycle) * 100)))}%` }} />
                          {c.day}/{c.cycle}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={c.left < 0 ? "late" : c.left <= 7 && c.cycle ? "soon" : ""}>
                      {c.cycle ? (c.left < 0 ? `${Math.abs(c.left)}d late` : `${c.left}d`) : "—"}
                    </td>
                  </tr>
                ))}
                {crops.length > 1 ? (
                  <tr className="total is-hit" role="button" tabIndex={0} onClick={() => onDrill({ k: "plants" })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDrill({ k: "plants" }); } }}>
                    <td>Total</td>
                    <td className="num">{fmt(k.plantN)}</td>
                    <td>{k.strainN} strains</td>
                    <td className="num">{k.wet ? fmt(k.wet, 1) : "—"}</td>
                    <td colSpan={2} />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {liveWaves.length ? (
        <section>
          <p className="fac-kicker">Break schedule · America/New_York</p>
          <div className="rb-waves">
            {liveWaves.map((w) => {
              const on = activeWave?.id === w.id;
              return (
                <article
                  key={w.id}
                  className={on ? "on" : ""}
                  onClick={() => onDrill({ k: "staff" })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDrill({ k: "staff" }); } }}
                >
                  <div>
                    <b>{w.label}</b>
                    <span>
                      {clock12(w.start)} – {clock12(w.end)} ET
                    </span>
                  </div>
                  <em>{on ? "In session" : "Not in session"}</em>
                  {w.note ? <p>{w.note}</p> : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <p className="fac-kicker">
          <Users className="size-3 inline" /> Staff assigned
        </p>
        {staff.some((s) => s.badge) ? (
          <div className="rb-badges">
            {staff.filter((s) => s.badge).map((s) => (
              <button key={s.name} type="button" className="rb-badge" onClick={() => onDrill({ k: "staff", name: s.name })}>
                <img src={s.badge} alt={`${s.name} — ${s.seat}`} />
              </button>
            ))}
          </div>
        ) : null}
        <div className="rb-range">
          <label>
            From
            <input title="Field" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value || today)} />
          </label>
          <label>
            To
            <input title="Field" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value || today)} />
          </label>
          <button type="button" className={from === today && to === today ? "on" : ""} onClick={() => { setFrom(today); setTo(today); }}>
            Today
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date(`${today}T12:00:00`);
              const start = new Date(d);
              start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
              const end = new Date(start);
              end.setDate(start.getDate() + 6);
              setFrom(etYmd(start));
              setTo(etYmd(end));
            }}
          >
            This week
          </button>
        </div>
        {staff.filter((s) => s.name === "Josh").length ? (
          <JoshBoard date={from === to ? from : today} assigns={assigns} onStation={onStation} />
        ) : null}
        {deptDesk ? (
          <p className="rb-copy">
            {deptDesk.dept} desk · {deptDesk.n} headcount · {deptDesk.shift} ET weekdays.
            {staff.length ? ` ${staff.map((s) => `${s.name} · ${s.seat}`).join(" · ")}.` : ""}
          </p>
        ) : null}
        {duties.length ? (
          <div className="rb-table-wrap">
            <table className="rb-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Role / station</th>
                  <th>Shift</th>
                </tr>
              </thead>
              <tbody>
                {duties.map((d, i) => (
                  <tr
                    key={`${d.date}-${d.name}-${i}`}
                    className={d.named ? "is-hit" : ""}
                    role="button"
                    tabIndex={0}
                    onClick={() => d.named && d.name !== "Josh" && onDrill({ k: "staff", name: d.name })}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); d.named && d.name !== "Josh" && onDrill({ k: "staff", name: d.name }); } }}
                  >
                    <td>{d.label}</td>
                    <td>{d.name}</td>
                    <td>
                      {d.name === "Josh" && onStation ? (
                        <select title="Field"
                          className="rb-station"
                          value={d.station ?? ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onStation("Josh", d.date, e.target.value as "" | "flower-pack" | "infused" | "other", "operator")}
                        >
                          <option value="">Unscheduled</option>
                          {OPS_STATIONS.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        d.role
                      )}
                    </td>
                    <td>{d.shift}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rb-copy">No floor manager is zoned to this room. Owners, CEO, and CFO are not facility employees.</p>
        )}
      </section>

      {isShip && desk ? (
        <>
          <section>
            <p className="fac-kicker">Going out today · {desk.today} ET</p>
            {desk.going.length ? (
              <ShipTable rows={desk.going} onOpen={(id) => onDrill({ k: "invoice", id })} />
            ) : (
              <p className="rb-copy">Nothing packed or dated for {desk.today}. Apex book is {desk.asOf}.</p>
            )}
          </section>
          <section>
            <p className="fac-kicker">Scheduled · {desk.scheduled.length} invoices</p>
            {desk.scheduled.length ? (
              <ShipTable rows={desk.scheduled} onOpen={(id) => onDrill({ k: "invoice", id })} />
            ) : (
              <p className="rb-copy">No other open invoices on the book.</p>
            )}
            <p className="rb-copy">Apex is money. Manifests go out in Metrc. Same-door invoices on one truck.</p>
          </section>
        </>
      ) : null}

      {room.id === "kitchen" ? (
        <section>
          <p className="fac-kicker">Manufacturing · production</p>
          <div className="rb-kpis">
            <Tile k="FF first-run" v={`${MFG.first_run[0].yield_pct}%`} s="On 3.0% floor · wet" tone="ok" onClick={() => onDrill({ k: "packages" })} />
            <Tile k="Flower → extract" v={`${MFG.first_run[1].yield_pct}%`} s="HIGH · not CERTIFIED" tone="crit" onClick={() => onDrill({ k: "packages" })} />
            <Tile k="Vape pkgs" v={fmt(MFG.vape_pkgs)} s={`${fmt(MFG.edible_pkgs)} edible pkgs`} onClick={() => onDrill({ k: "packages" })} />
            <Tile k="Concentrate on hand" v={`${fmt(MFG.conc_on_hand_lb, 1)} lb`} s="First-run only · no child splits" onClick={() => onDrill({ k: "packages" })} />
          </div>
        </section>
      ) : null}

      <section>
        <RoomMetrcBoard room={room} onDrill={onDrill} lic={lic} />
      </section>

      <div className="fac-actions">
        <Link to="/s2s" className="fac-go ghost">
          <Leaf className="size-3.5" />
          Seed-to-sale
        </Link>
        <Link to="/cm/$tool" params={{ tool: "harvests" }} className="fac-go ghost">
          Harvest clock
        </Link>
        <Link to="/p/$key" params={{ key: "inv_value" }} className="fac-go ghost">
          Inventory Value
        </Link>
        <Link to="/p/$key" params={{ key: "true_cost_per_pound" }} className="fac-go ghost">
          True cost / lb
        </Link>
        <Link to="/p/$key" params={{ key: "invoices" }} className="fac-go ghost">
          Invoices & AR
        </Link>
        <Link to="/p/$key" params={{ key: "my_alerts" }} className="fac-go ghost">
          My Alerts
        </Link>
        <Link to="/p/$key" params={{ key: "facility_90" }} className="fac-go ghost">
          Facility 90
        </Link>
        <span className="fac-go ghost">
          <Package className="size-3.5" />
          Inventory follows Metrc
        </span>
      </div>
    </div>
  );
}
