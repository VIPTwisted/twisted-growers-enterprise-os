import { useEffect, useState, type ReactNode } from "react";
import { CardSlide } from "@/components/card-slide";
import { S2S_AS_OF, S2S_LAW, S2S_ROOMS } from "@/data/s2s-rooms";
import { AGENTS, FACILITY, taggedFlowering, type FacRoom } from "@/data/facility";
import { floorIdFromName, sameMetrc } from "@/data/room-alias";
import { FLOWER_LIVE, FLOWER_ROOMS, FLOWER_STRAINS, VEG_LIVE } from "@/data/flowering";
import { FLOOR_STAFF, LEADERSHIP } from "@/data/room-ops";
import { OPEN_CLOCK } from "@/data/weight";
import { OPEN_ORDERS, SHIP_AS_OF_LABEL, RETURNS, shipDesk, type ShipOrder } from "@/data/shipping";
import { packKpis, PACK_SEED } from "@/data/pack-inventory";
import { invExpiryKpi } from "@/data/inventory-lots";
import { METRC_COVER, roomsOnMap } from "@/data/metrc-cover";
import { cultForRoom, cultHarvests } from "@/data/cult-book";
import { DOSSIERS } from "@/data/dossiers";
import { DEPTS } from "@/components/facility-overview";
import { loadOps } from "@/lib/facility-api";
import { kindLabel, parseExtra, type OpsRow } from "@/data/room-coo";
import { downloadBlob, printHtml } from "@/lib/proof";
import { LIC_MC, LIC_MP } from "@/data/licences";

export type FacTarget =
  | { k: "plants" }
  | { k: "packages" }
  | { k: "staff"; name?: string }
  | { k: "legend"; zone: string }
  | { k: "dept"; name: string }
  | { k: "s2s"; room: string }
  | { k: "invoice"; id?: string; room?: string }
  | { k: "coa"; room?: string; id?: string }
  | { k: "manifest"; room?: string; id?: string }
  | { k: "strain"; strain: string }
  | { k: "harvest"; name: string }
  | { k: "site" }
  | { k: "ops"; room: string; id?: string }
  | { k: "waste" }
  | { k: "returns"; id?: string }
  | { k: "weights"; room: string }
  | { k: "expiry"; id?: string };

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmt(n: number, d = 0) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}
function lb(g: number) {
  return (g / 453.592).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function OpsDrill({ room, id, onOpen }: { room: string; id?: string; onOpen: (id: string) => void }) {
  const [row, setRow] = useState<OpsRow | null>(null);
  const [list, setList] = useState<OpsRow[]>([]);
  useEffect(() => {
    void loadOps().then((d) => {
      const rows = (d.rows ?? []).filter((r) => r.room_id === room);
      setList(rows);
      setRow(id ? rows.find((r) => r.id === id) ?? null : null);
    });
  }, [room, id]);
  const x = row ? parseExtra(row.extra) : {};
  return (
    <>
      {row ? (
        <>
          <p className="ff-copy">
            {kindLabel(row.kind)}. {row.who || "Unassigned"}. {row.status}. {row.priority}
            {row.due ? ` · due ${row.due}` : ""}.
          </p>
          <Row k="Title" v={row.title} />
          <Row k="Owner" v={row.who || "—"} />
          <Row k="Status" v={row.status} />
          <Row k="Priority" v={row.priority} />
          <Row k="Due" v={row.due || "—"} />
          {x.shift ? <Row k="Shift" v={x.shift} /> : null}
          {x.seats ? <Row k="Seats" v={String(x.seats)} /> : null}
          {x.reports ? <Row k="Reports to" v={x.reports} /> : null}
          {x.certs ? <Row k="Certs" v={x.certs} /> : null}
          {x.duties ? <p className="ff-copy">{x.duties}</p> : null}
          {row.body ? <p className="ff-copy">{row.body}</p> : null}
        </>
      ) : (
        <p className="ff-copy">All work filed on this room. Click a card on the COO desk for the full record.</p>
      )}
      {list.map((r) => (
        <Row key={r.id} k={`${kindLabel(r.kind)} · ${r.title}`} v={`${r.who || "—"} · ${r.status}`} onClick={() => onOpen(room)} />
      ))}
    </>
  );
}

function zoneMeta(zone: string) {
  if (zone === "flower")
    return { title: "Flower rooms", law: "Dual MATCH on tagged plants. 56-day flower. Floor is 180 lb packaged tags per pull.", color: "#7dba8c" };
  if (zone === "veg")
    return { title: "Veg & mother", law: "Tagged mothers are certified. Clone and vegetation batches stay PARTIAL until dual MATCH.", color: "#9dceb0" };
  if (zone === "dry")
    return { title: "Dry & cure", law: "10-day dry clock. Wet stays on the rack until packaged. Saleable is Metrc packaged tags.", color: "#c4a056" };
  if (zone === "vault")
    return { title: "Vaults", law: "Metrc Active grid is SoR. OS overstates until the retire-pass. Stale tags are called out.", color: "#8aa0b8" };
  if (zone === "quarantine")
    return { title: "Quarantine", law: "Hold only. Nothing leaves until QA clears it. Empty is a status, not a missing room.", color: "#c47a6a" };
  return { title: "Process & manufacturing", law: "Packaging, trim, production, shipping. Packages not certified until the retire-pass.", color: "#9aa394" };
}

function zoneMatch(name: string, zone: string) {
  if (zone === "flower") return /flower/i.test(name);
  if (zone === "veg") return /mother|clone|veg/i.test(name);
  if (zone === "dry") return /dry|cure|pre.?trim/i.test(name);
  if (zone === "vault") return /vault|fulfill|finish|bda|freezer|warehouse/i.test(name);
  if (zone === "quarantine") return /quarantine/i.test(name);
  return /pack|ship|hydro|solvent|production|grind|trim|qa|biomass/i.test(name);
}

function ZoneKpi({
  zone,
  rows,
  onOpen,
}: {
  zone: string;
  rows: typeof S2S_ROOMS;
  onOpen: (name: string) => void;
}) {
  const meta = zoneMeta(zone);
  const plants = rows.reduce((s, r) => s + r.tagged_flowering + r.tagged_veg + r.harvest_plants, 0);
  const tagged = rows.reduce((s, r) => s + r.tagged_flowering + r.tagged_veg, 0);
  const hanging = rows.reduce((s, r) => s + r.harvest_plants, 0);
  const wet = rows.reduce((s, r) => s + r.harvest_wet_lb, 0);
  const pkgs = rows.reduce((s, r) => s + r.pkg_n, 0);
  const g = rows.reduce((s, r) => s + r.pkg_qty_g, 0);
  const stale = rows.reduce((s, r) => s + r.pkg_stale_n, 0);
  const harvests = rows.reduce((s, r) => s + r.harvests_open, 0);
  const batches = rows.reduce((s, r) => s + r.batch_plants, 0);
  const cap = zone === "flower" ? FLOWER_ROOMS.reduce((s, r) => s + r.cap, 0) : 0;
  const occ = cap ? Math.round((tagged / cap) * 100) : 0;
  const maxBar = Math.max(1, ...rows.map((r) => r.tagged_flowering + r.tagged_veg + r.harvest_plants + r.pkg_n + r.batch_plants));

  const tiles =
    zone === "flower"
      ? [
          { k: "Plants standing", v: fmt(tagged), s: `${FLOWER_ROOMS.length} rooms dual MATCH` },
          { k: "Room hold", v: fmt(cap), s: `${occ}% occupied` },
          { k: "Strains", v: fmt(FLOWER_STRAINS.length), s: "On the current flower rooms" },
          { k: "Licence", v: "MC", s: LIC_MC },
        ]
      : zone === "veg"
        ? [
            { k: "Tagged mothers", v: fmt(VEG_LIVE), s: "CERTIFIED · 30 strains" },
            { k: "Clone plants", v: fmt(batches), s: "Untagged · PARTIAL" },
            { k: "Rooms", v: fmt(rows.length), s: "Mother · Clone · Veg" },
            { k: "Licence", v: "MC", s: LIC_MC },
          ]
        : zone === "dry"
          ? [
              { k: "Plants hanging", v: fmt(hanging), s: `${harvests} open harvests` },
              { k: "Wet on rack", v: `${fmt(wet, 1)} lb`, s: "Until packaged tags exist" },
              { k: "Open clock", v: fmt(OPEN_CLOCK.length), s: "Facility-wide harvests" },
              { k: "Rooms", v: fmt(rows.length), s: "Dry · cure · pre-trim" },
            ]
          : zone === "quarantine"
            ? [
                { k: "Rooms on hold", v: fmt(rows.length), s: rows[0]?.status ?? "EMPTY" },
                { k: "Plants", v: fmt(plants), s: "Nothing tagged in hold" },
                { k: "Packages", v: fmt(pkgs), s: pkgs ? `${lb(g)} lb` : "Clear" },
                { k: "Status", v: "Hold", s: "QA must clear" },
              ]
            : [
                { k: "Packages", v: fmt(pkgs), s: stale ? `${fmt(stale)} stale tags` : "On-hand" },
                { k: "Net weight", v: `${lb(g)} lb`, s: "OS until retire-pass" },
                { k: "Plants", v: fmt(plants), s: hanging ? `${fmt(hanging)} hanging` : "No live plants" },
                { k: "Rooms", v: fmt(rows.length), s: `${S2S_AS_OF}` },
              ];

  return (
    <div className="zk">
      <p className="ff-copy">{meta.law}</p>
      <div className="zk-tiles">
        {tiles.map((t) => (
          <button key={t.k} type="button" className="zk-tile" onClick={() => rows[0] && onOpen(rows[0].room)}>
            <b>{t.v}</b>
            <span>{t.k}</span>
            <em>{t.s}</em>
          </button>
        ))}
      </div>
      {zone === "flower" && cap ? (
        <div className="zk-occ">
          <span>Occupancy</span>
          <i>
            <b style={{ width: `${occ}%`, background: meta.color }} />
          </i>
          <em>{occ}%</em>
        </div>
      ) : null}
      <p className="fac-kicker">Rooms</p>
      <ul className="zk-rooms">
        {rows.map((r) => {
          const n = r.tagged_flowering + r.tagged_veg + r.harvest_plants || r.pkg_n || r.batch_plants;
          const label = r.tagged_flowering || r.tagged_veg
            ? `${fmt(r.tagged_flowering + r.tagged_veg)} pl`
            : r.harvest_plants
              ? `${fmt(r.harvest_plants)} hang · ${fmt(r.harvest_wet_lb, 1)} lb`
              : r.pkg_n
                ? `${fmt(r.pkg_n)} pk · ${lb(r.pkg_qty_g)} lb`
                : r.batch_plants
                  ? `${fmt(r.batch_plants)} batch`
                  : r.status;
          return (
            <li key={r.licence + r.room}>
              <button type="button" onClick={() => onOpen(r.room)}>
                <span>
                  {r.room}
                  <i>
                    <b style={{ width: `${Math.max(6, Math.round((n / maxBar) * 100))}%`, background: meta.color }} />
                  </i>
                </span>
                <em>{label}</em>
              </button>
            </li>
          );
        })}
      </ul>
      {zone === "flower" ? (
        <>
          <p className="fac-kicker">Strains in flower</p>
          <ul className="zk-rooms">
            {FLOWER_STRAINS.slice(0, 8).map((s) => (
              <li key={s.strain}>
                <button type="button" onClick={() => onOpen(FLOWER_ROOMS[0].room)}>
                  <span>
                    {s.strain}
                    <i>
                      <b style={{ width: `${Math.max(8, Math.round((s.n / FLOWER_STRAINS[0].n) * 100))}%`, background: meta.color }} />
                    </i>
                  </span>
                  <em>{fmt(s.n)}</em>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {zone === "dry" ? (
        <>
          <p className="fac-kicker">Open harvest clock</p>
          <ul className="zk-rooms">
            {OPEN_CLOCK.slice(0, 8).map((h) => (
              <li key={h.harvest}>
                <button type="button" onClick={() => onOpen(rows[0]?.room ?? "Dry Room #2")}>
                  <span>
                    {h.harvest}
                    <i>
                      <b style={{ width: `${Math.min(100, h.days_since_cut)}%`, background: h.level === "EXEC" ? "#c47a6a" : meta.color }} />
                    </i>
                  </span>
                  <em>{h.level} · {fmt(h.remaining, 1)} lb</em>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function Row({
  k,
  v,
  onClick,
}: {
  k: string;
  v: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className="ff-row" onClick={onClick}>
      <span>{k}</span>
      <em>{v}</em>
    </Tag>
  );
}

export function FacForensic({
  target,
  rooms,
  onOpen,
  onDrill,
  onClose,
  cardW,
  onCardW,
  cardMax,
}: {
  target: FacTarget;
  rooms: FacRoom[];
  onOpen: (id: string) => void;
  onDrill: (t: FacTarget) => void;
  onClose: () => void;
  cardW?: number;
  onCardW?: (n: number) => void;
  cardMax?: number;
}) {
  const openS2s = (name: string) => {
    const id = floorIdFromName(name);
    const fac = id ? rooms.find((r) => r.id === id) : rooms.find((r) => sameMetrc(r.metrc ?? "", name) || sameMetrc(r.name, name));
    if (fac) onOpen(fac.id);
    else onDrill({ k: "s2s", room: name });
  };

  let title = "Forensic";
  let kicker = "Metrc + Apex";
  let body: ReactNode = null;

  if (target.k === "plants") {
    title = `${taggedFlowering().toLocaleString()} tagged plants`;
    kicker = `Flower · ${S2S_AS_OF}`;
    body = (
      <>
        <p className="ff-copy">
          {FLOWER_LIVE.toLocaleString()} flowering + {VEG_LIVE} veg. Dual MATCH on tagged plants. Untagged batches are not in this count.
        </p>
        {FLOWER_ROOMS.map((r) => (
          <Row key={r.id} k={`${r.id} · ${r.room}`} v={`${r.live.toLocaleString()} / ${r.cap}`} onClick={() => openS2s(r.room)} />
        ))}
        <p className="fac-kicker">By strain</p>
        {FLOWER_STRAINS.map((s) => (
          <Row key={s.strain} k={s.strain} v={fmt(s.n)} onClick={() => onDrill({ k: "strain", strain: s.strain })} />
        ))}
      </>
    );
  } else if (target.k === "packages") {
    const rows = S2S_ROOMS.filter((r) => r.pkg_n > 0).sort((a, b) => b.pkg_n - a.pkg_n);
    const n = rows.reduce((s, r) => s + r.pkg_n, 0);
    const g = rows.reduce((s, r) => s + r.pkg_qty_g, 0);
    title = `${fmt(n)} packages`;
    kicker = `${lb(g)} lb net · ${S2S_AS_OF}`;
    body = (
      <>
        <p className="ff-copy">Package rooms overstate until the retire-pass. Metrc Active grid is SoR. Click a room.</p>
        {rows.map((r) => (
          <Row
            key={r.licence + r.room}
            k={`${r.room} · ${r.licence}`}
            v={`${fmt(r.pkg_n)} pk · ${lb(r.pkg_qty_g)} lb`}
            onClick={() => openS2s(r.room)}
          />
        ))}
      </>
    );
  } else if (target.k === "staff") {
    const who = target.name ? FLOOR_STAFF.find((s) => s.name === target.name) : null;
    title = who ? who.name : `${AGENTS.n} active employees`;
    kicker = who ? who.covers : AGENTS.source;
    body = (
      <>
        {who ? (
          <>
            {who.badge ? <img className="rb-badge" src={who.badge} alt={`${who.name} ID badge`} style={{ width: "100%", borderRadius: 10, border: "1px solid #2a4536" }} /> : null}
            <p className="ff-copy">
              {who.seat}. {who.rooms?.length ? `Rooms: ${who.rooms.join(", ")}.` : `Zoned to ${who.zones.join(", ")}.`} Vincent (CEO/CFO/Sales) and Megan (HR) are leadership — not zoned on the floor.
            </p>
          </>
        ) : (
          <p className="ff-copy">
            {AGENTS.source} Vincent is CEO, CFO and Sales Director — not in the 27. Megan is HR. Dominick, Anthony, and Marianna are not facility employees. No shift table — cannot show who is on today.
          </p>
        )}
        {FLOOR_STAFF.map((s) => (
          <Row key={s.name} k={`${s.name} · ${s.seat}`} v={s.covers} onClick={() => onDrill({ k: "staff", name: s.name })} />
        ))}
        <p className="fac-kicker">Leadership · not zoned</p>
        {LEADERSHIP.map((s) => (
          <Row key={s.name} k={`${s.name} · ${s.seat}`} v={s.covers} />
        ))}
        {DEPTS.map((d) => (
          <Row key={d.name} k={d.name} v={d.n ? `${d.n} active` : "none"} onClick={() => onDrill({ k: "dept", name: d.name })} />
        ))}
      </>
    );
  } else if (target.k === "legend") {
    const rows = S2S_ROOMS.filter((r) => zoneMatch(r.room, target.zone));
    const meta = zoneMeta(target.zone);
    title = meta.title;
    kicker = `${rows.length} Metrc rooms · ${S2S_AS_OF}`;
    body = <ZoneKpi zone={target.zone} rows={rows} onOpen={openS2s} />;
  } else if (target.k === "dept") {
    const d = DEPTS.find((x) => x.name === target.name);
    title = target.name;
    kicker = d ? `${d.n} active` : "Department";
    body = (
      <>
        <p className="ff-copy">
          {d?.n ? `${d.n} on the roster in this department.` : "No active staff. Quality & Testing has none."} Click through to the floor those people work.
        </p>
        {d?.room ? <Row k="Open floor" v={d.room} onClick={() => onOpen(d.room!)} /> : null}
        <Row k="Wing" v={d?.wing ?? "—"} />
      </>
    );
  } else if (target.k === "s2s") {
    const names =
      floorIdFromName(target.room) === "veg"
        ? ["Vegetation Room", "Mother Room", "Clone Room"]
        : [target.room];
    const rows = S2S_ROOMS.filter((r) => names.some((n) => sameMetrc(n, r.room)));
    title = names.length > 1 ? "Vegetation Room" : target.room;
    kicker = names.length > 1 ? `Mother · Clone · Veg · ${LIC_MC} · ` + S2S_AS_OF : `${rows.length} licence row${rows.length === 1 ? "" : "s"} · ${S2S_AS_OF}`;
    const dossier = DOSSIERS.find((d) => names.includes(d.room) || d.id === "veg-cluster");
    body = (
      <>
        <p className="ff-copy">{S2S_LAW} One floor tile. Three Metrc locations. COA, manifest, and Apex invoice attach as the tag moves seed-to-sale.</p>
        {rows.map((r) => (
          <article key={r.licence + r.room} className="ff-card">
            <p className="fac-kicker">{r.licence} · {r.status}</p>
            <h3>{r.room}</h3>
            <Row k="Role" v={r.role} />
            <Row k="Flowering" v={fmt(r.tagged_flowering)} />
            <Row k="Veg tagged" v={fmt(r.tagged_veg)} />
            <Row k="Batches" v={`${fmt(r.batch_n)} / ${fmt(r.batch_plants)} plants`} />
            <Row k="Open harvests" v={`${fmt(r.harvests_open)} · ${fmt(r.harvest_plants)} pl · ${fmt(r.harvest_wet_lb, 1)} lb wet`} />
            <Row k="Packages" v={`${fmt(r.pkg_n)} · ${lb(r.pkg_qty_g)} lb`} onClick={() => onDrill({ k: "packages" })} />
            {r.pkg_stale_n ? <Row k="Stale active" v={fmt(r.pkg_stale_n)} /> : null}
            <p className="ff-copy">{r.note}</p>
          </article>
        ))}
        {dossier ? (
          <>
            <p className="fac-kicker">Attachments</p>
            {dossier.attachments.map((a) => (
              <Row
                key={a.kind}
                k={a.kind.toUpperCase()}
                v={a.status}
                onClick={() => onDrill({ k: a.kind, room: dossier.room, id: a.id ?? undefined })}
              />
            ))}
          </>
        ) : null}
        {!rows.length ? <p className="ff-copy">No Metrc occupancy for this name.</p> : null}
      </>
    );
  } else if (target.k === "coa" || target.k === "manifest" || target.k === "invoice") {
    const invoiceId = "id" in target ? target.id : undefined;
    const o: ShipOrder | undefined = target.k === "invoice" && invoiceId ? OPEN_ORDERS.find((x) => x.invoice === invoiceId) : undefined;
    const roomName = "room" in target ? target.room : undefined;
    const vegHit = floorIdFromName(roomName) === "veg";
    const dossier =
      DOSSIERS.find((d) => invoiceId && d.attachments.some((a) => a.id === invoiceId)) ??
      (vegHit ? DOSSIERS.find((d) => d.id === "veg-cluster") : undefined) ??
      DOSSIERS.find((d) => roomName && d.room === roomName);
    const att = dossier?.attachments.find((a) => a.kind === target.k);
    if (o) {
      title = o.invoice;
      kicker = `${o.status} · ${SHIP_AS_OF_LABEL}`;
      body = (
        <>
          <Row k="Buyer" v={o.buyer} />
          <Row k="City" v={o.city} />
          <Row k="Status" v={o.status} />
          <Row k="Ordered" v={o.ordered} />
          <Row k="Delivery" v={o.delivery ?? "unscheduled"} />
          <Row k="Amount" v={usd(o.dollars)} />
          <p className="ff-copy">Apex is the order SoR. Manifest still happens in Metrc. Same-door invoices ride one truck.</p>
          <div className="rm-tools">
            <button type="button" onClick={() => printHtml(o.invoice, `<h1>Invoice ${o.invoice}</h1><p>${o.buyer} · ${o.city}</p><p>${usd(o.dollars)} · ${o.status} · ${o.ordered} · ${o.delivery ?? "unscheduled"}</p>`)}>Print</button>
            <button type="button" onClick={() => downloadBlob(`invoice-${o.invoice}.html`, `<h1>${o.invoice}</h1><p>${o.buyer} · ${usd(o.dollars)}</p>`)}>Download</button>
          </div>
          <Row k="Open Shipping" v="Dock" onClick={() => onOpen("ship")} />
        </>
      );
    } else {
      title = target.k.toUpperCase();
      kicker = att ? `${att.status} · ${att.source}` : "As it becomes available";
      body = (
        <>
          <Row k="Status" v={att?.status ?? "GAP"} />
          <Row k="Source" v={att?.source ?? "—"} />
          <Row k="ID" v={att?.id ?? "not on file"} />
          <p className="ff-copy">
            {att?.note ?? "Lands on this tile when the tag is tested (COA), transferred (manifest), or sold (Apex invoice)."}
          </p>
          <div className="rm-tools">
            <button type="button" onClick={() => printHtml(title, `<h1>${title}</h1><p>${att?.status ?? "GAP"} · ${att?.source ?? ""}</p><p>${att?.id ?? "not on file"}</p><p>${att?.note ?? ""}</p>`)}>Print</button>
            <button type="button" onClick={() => downloadBlob(`${target.k}-${S2S_AS_OF.replace(/\s+/g, "-")}.html`, `<h1>${title}</h1><p>${att?.status ?? "GAP"}</p><p>${att?.note ?? ""}</p>`)}>Download</button>
          </div>
          <Row k="Vegetation Room" v="Open cluster" onClick={() => onDrill({ k: "s2s", room: "Vegetation Room" })} />
        </>
      );
    }
  } else if (target.k === "strain") {
    const s = FLOWER_STRAINS.find((x) => x.strain === target.strain);
    const harvests = OPEN_CLOCK.filter((h) => h.harvest.toLowerCase().includes(target.strain.replace(/^TG\s+/i, "").toLowerCase().slice(0, 8)));
    title = target.strain;
    kicker = s ? `${fmt(s.n)} flowering` : "Strain";
    body = (
      <>
        <p className="ff-copy">Live flowering count is dual MATCH by tag|strain|room|planted. Open harvests below if this strain is on a rack.</p>
        {FLOWER_ROOMS.map((r) => (
          <Row key={r.id} k={r.room} v={`${r.live.toLocaleString()} in room`} onClick={() => openS2s(r.room)} />
        ))}
        {harvests.map((h) => (
          <Row key={h.harvest} k={h.harvest} v={`${h.level} · ${fmt(h.wet, 1)} lb`} onClick={() => onDrill({ k: "harvest", name: h.harvest })} />
        ))}
      </>
    );
  } else if (target.k === "harvest") {
    const h = OPEN_CLOCK.find((x) => x.harvest === target.name);
    title = target.name;
    kicker = h ? `${h.level} · cut ${h.cut}` : "Harvest";
    body = h ? (
      <>
        <Row k="Plants" v={fmt(h.plants)} />
        <Row k="Wet lb" v={fmt(h.wet, 1)} />
        <Row k="Packaged lb" v={fmt(h.packaged, 1)} />
        <Row k="Remaining" v={fmt(h.remaining, 1)} />
        <Row k="Days since cut" v={String(h.days_since_cut)} />
        <Row k="Dry due" v={h.dry_due} />
        <Row k="Business days late" v={String(h.biz_late)} />
        <p className="ff-copy">Actual saleable is Metrc packaged tags. Remaining on an OPEN harvest is still on the rack.</p>
      </>
    ) : (
      <p className="ff-copy">Not on the open harvest clock.</p>
    );
  } else if (target.k === "ops") {
    title = "Room work";
    kicker = `${target.room} · COO desk`;
    body = <OpsDrill room={target.room} id={target.id} onOpen={onOpen} />;
  } else if (target.k === "waste") {
    const pk = packKpis(PACK_SEED);
    title = `${(pk.wasted + pk.damaged).toLocaleString()} wasted / damaged`;
    kicker = "Packaging & Supplies · OS book";
    body = (
      <>
        <p className="ff-copy">
          Wasted is scrapped. Damaged is still on the shelf until destroyed or returned to vendor. Labels and supplies with expiry sit on the same card.
        </p>
        <Row k="Wasted units" v={fmt(pk.wasted)} />
        <Row k="Damaged units" v={fmt(pk.damaged)} />
        <Row k="SKUs with loss" v={String(pk.wasteSkus)} />
        {PACK_SEED.filter((i) => (i.wasted || 0) + (i.damaged || 0) > 0).map((i) => (
          <Row
            key={i.id}
            k={`${i.name} · ${i.category}`}
            v={`waste ${i.wasted} · dmg ${i.damaged}${i.waste_note ? ` · ${i.waste_note}` : ""}`}
          />
        ))}
      </>
    );
  } else if (target.k === "returns") {
    const desk = shipDesk();
    const hit = target.id ? RETURNS.find((r) => r.id === target.id) : null;
    title = hit ? hit.id : `${desk.openReturns.length} open returns`;
    kicker = "Shipping desk · every return and shipping item";
    body = (
      <>
        <p className="ff-copy">
          Shipping handles all returns and every shipping item. Apex invoice stays SoR. Restock vs destroy is a dock call, not Metrc until a package is involved.
        </p>
        {hit ? (
          <>
            <Row k="Invoice" v={hit.invoice} onClick={() => onDrill({ k: "invoice", id: hit.invoice })} />
            <Row k="Buyer" v={`${hit.buyer} · ${hit.city}`} />
            <Row k="Status" v={hit.status} />
            <Row k="Items" v={`${hit.qty} · ${hit.items}`} />
            <Row k="Received" v={hit.received} />
            <Row k="Dollars" v={usd(hit.dollars)} />
            <Row k="Reason" v={hit.reason} />
          </>
        ) : (
          <>
            {RETURNS.map((r) => (
              <Row
                key={r.id}
                k={`${r.id} · ${r.status}`}
                v={`${r.buyer} · ${r.items} × ${r.qty}`}
                onClick={() => onDrill({ k: "returns", id: r.id })}
              />
            ))}
            <p className="fac-kicker">Shipping items on the dock</p>
            {desk.freight.map((f) => (
              <Row key={f.id} k={`${f.kind} · ${f.status}`} v={`${f.name} × ${f.qty}`} />
            ))}
          </>
        )}
      </>
    );
  } else if (target.k === "weights") {
    const fac = rooms.find((r) => r.id === target.room || r.metrc === target.room || r.name === target.room);
    const book = fac ? cultForRoom(fac) : null;
    const rows = book?.rows ?? cultHarvests();
    title = fac ? `${fac.name} · Metrc weights` : "Metrc weights";
    kicker = "Vincent (CFO) allocates · Metrc is identity";
    body = (
      <>
        <p className="ff-copy">
          Metrc identity: wet = waste + packaged tags + moisture (water). Cultivation records A/B/C + trim + waste + water + FF as DRAFT. Vincent approves. CERTIFIED only on dual MATCH. {book?.grade.cert}
        </p>
        {book ? (
          <>
            <Row k="Wet (Metrc)" v={`${fmt(book.wet, 1)} lb`} />
            <Row k="Waste (Metrc)" v={`${fmt(book.waste, 1)} lb`} />
            <Row k="Water / moisture (Metrc residual)" v={`${fmt(book.water, 1)} lb`} />
            <Row k="Packaged tags (Metrc)" v={`${fmt(book.packaged, 1)} lb`} />
            <Row k="Identity" v={book.identityOk ? "wet = waste + packaged + water" : "does not close — do not certify"} />
            <Row k="CFO allocation" v={book.filed ? `${book.filed} grade cards filed` : "DRAFT — 0 filed. Vincent has not approved A/B/C + trim + FF."} />
            <Row k="Approver" v={`${book.vincent} · CFO`} />
          </>
        ) : null}
        {rows.map((h) => (
          <Row
            key={h.harvest}
            k={h.harvest}
            v={`wet ${fmt(h.wet, 1)} · waste ${fmt(h.waste, 1)} · water ${fmt(h.water, 1)} · pkg ${fmt(h.packaged, 1)} · ${h.level}`}
            onClick={() => onDrill({ k: "harvest", name: h.harvest })}
          />
        ))}
      </>
    );
  } else if (target.k === "expiry") {
    const packExp = PACK_SEED.filter((i) => i.expires);
    const kpi = invExpiryKpi(target.id);
    title = !target.id || target.id === "stage" ? "Supplies expiry" : `${kpi.watch} lots on the clock`;
    kicker = "Expiration · inventory + supplies";
    body = (
      <>
        <p className="ff-copy">
          Inventory lots carry pack-date expiry. Packaging labels and adhesives expire on the supplies book. Shipping does not own expiry — Inventory does.
        </p>
        {(!target.id || target.id === "stage") && packExp.length ? (
          <>
            <p className="fac-kicker">Packaging & supplies</p>
            {packExp.map((i) => (
              <Row key={i.id} k={`${i.name} · ${i.expires || "—"}`} v={i.expires ? `expires ${i.expires}` : "no date"} />
            ))}
          </>
        ) : null}
        {target.id !== "stage" ? (
          <>
            <p className="fac-kicker">Finished goods lots</p>
            {kpi.rows.map(({ lot, d }) => (
              <Row
                key={lot.id}
                k={`${lot.product} · ${lot.strain}`}
                v={`${d != null && d < 0 ? `${Math.abs(d)}d expired` : d == null ? "no date" : `${d}d left`} · ${lot.qty} ${lot.uom} · ${lot.metrc}`}
              />
            ))}
          </>
        ) : null}
      </>
    );
  } else {
    title = FACILITY.name;
    kicker = FACILITY.sheet;
    body = (
      <>
        <Row k="Address" v={FACILITY.address} />
        <Row k="Plan" v={FACILITY.sheet} />
        <Row k="Law" v={FACILITY.law} />
        <Row k="As-of" v={S2S_AS_OF} />
        <Row k="Licences" v={`${LIC_MC} · ${LIC_MP}`} />
        <p className="ff-copy">{S2S_LAW}</p>
        <p className="fac-kicker">Metrc objects vs map and cards</p>
        {METRC_COVER.map((c) => (
          <Row key={c.object} k={`${c.object} · ${c.grain}`} v={`${c.where} — ${c.note}`} />
        ))}
        <p className="fac-kicker">Every Metrc location</p>
        {roomsOnMap().map((r) => (
          <Row
            key={r.name}
            k={`${r.name} · ${r.grain}`}
            v={r.floorName ? `Floor · ${r.floorName}` : "Not on Phase I plan"}
            onClick={r.floorId ? () => onOpen(r.floorId!) : undefined}
          />
        ))}
      </>
    );
  }

  return (
    <aside className="fac-overview fac-forensic" aria-label="Forensic drill" style={cardW ? { width: cardW } : undefined}>
      {onCardW && cardW ? <CardSlide w={cardW} max={cardMax ?? 720} onW={onCardW} /> : null}
      <header className="ff-head">
        <div>
          <p className="fac-kicker">{kicker}</p>
          <h2>{title}</h2>
        </div>
        <button type="button" className="fac-close" onClick={onClose} aria-label="Close forensic">
          Close
        </button>
      </header>
      <div className="ff-body">{body}</div>
    </aside>
  );
}
