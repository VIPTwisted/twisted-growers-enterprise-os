import { Download, FileText, FlaskConical, Printer, Receipt } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { liveFor, type FacRoom } from "@/data/facility";
import { DOSSIERS, type Attachment } from "@/data/dossiers";
import { hopsForRoom, LOTS } from "@/data/s2s-chain";
import { docsForLot } from "@/data/chain-docs";
import { AttachChips } from "@/components/attach-chips";
import { cropsFor, roomKpis } from "@/data/room-ops";
import { OPEN_ORDERS } from "@/data/shipping";
import { S2S_AS_OF, type S2SRoom } from "@/data/s2s-rooms";
import type { FacTarget } from "@/components/fac-forensic";
import { downloadBlob, printHtml } from "@/lib/proof";
import { LIC_MC, LIC_MP } from "@/data/licences";

function fmt(n: number, d = 0) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}
function lb(g: number) {
  return (g / 453.592).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function attachmentsFor(room: FacRoom, rows: S2SRoom[]): Attachment[] {
  const names = rows.map((r) => r.room);
  const hit =
    DOSSIERS.find((d) => names.includes(d.room) || (room.id === "veg" && d.id === "veg-cluster")) ??
    DOSSIERS.find((d) => d.room === room.metrc || d.room === room.name);
  if (hit) return hit.attachments;
  const invoices = room.id === "ship" || room.id === "dock-inv" ? OPEN_ORDERS : [];
  return [
    { kind: "coa", status: "GAP", id: null, source: "Metrc lab", note: "No COA row on this occupancy freeze. Lands when a package from this room is lab-tested." },
    { kind: "manifest", status: "GAP", id: null, source: "Metrc transfers", note: "No outbound transfer on this freeze. Manifest attaches when a package leaves." },
    {
      kind: "invoice",
      status: invoices.length ? "ON FILE" : "GAP",
      id: invoices[0]?.invoice ?? null,
      source: "Apex",
      note: invoices.length ? `${invoices.length} open Apex invoice(s) on the book.` : "Apex invoice is money after a sold package.",
    },
  ];
}

function proofHtml(room: FacRoom, rows: S2SRoom[], atts: Attachment[]) {
  const crops = cropsFor(room);
  const lots = LOTS.filter((l) => rows.some((r) => r.room === l.now_room));
  const hops = rows.flatMap((r) => hopsForRoom(r.room, r.licence) ?? []);
  return `<h1>${room.name}</h1>
    <p class="k">Twisted Growers · Metrc occupancy · as of ${S2S_AS_OF} · Metrc is SoR</p>
    ${rows
      .map(
        (r) => `<table>
      <tr><td>Metrc room</td><td>${r.room} · ${r.licence} · ${r.status}</td></tr>
      <tr><td>Role / stage</td><td>${r.role} · ${r.stage}</td></tr>
      <tr><td>Tagged flowering</td><td>${fmt(r.tagged_flowering)}</td></tr>
      <tr><td>Tagged vegetative</td><td>${fmt(r.tagged_veg)}</td></tr>
      <tr><td>Batches</td><td>${fmt(r.batch_n)} / ${fmt(r.batch_plants)} plants</td></tr>
      <tr><td>Open harvests</td><td>${fmt(r.harvests_open)} · ${fmt(r.harvest_plants)} plants · ${fmt(r.harvest_wet_lb, 1)} lb wet</td></tr>
      <tr><td>Packages (OS)</td><td>${fmt(r.pkg_n)} · ${lb(r.pkg_qty_g)} lb · stale ${fmt(r.pkg_stale_n)}</td></tr>
      <tr><td>Note</td><td>${r.note}</td></tr>
    </table>`,
      )
      .join("")}
    <p class="k">Strains</p>
    <table>${crops.map((c) => `<tr><td>${c.strain}</td><td>${fmt(c.plants)} plants · day ${c.day}/${c.cycle} · ${c.left}d</td></tr>`).join("") || "<tr><td colspan=2>None on this freeze</td></tr>"}</table>
    <p class="k">Lots</p>
    <table>${lots.map((l) => `<tr><td>${l.name}</td><td>${l.identity} · ${l.status}</td></tr>`).join("") || "<tr><td colspan=2>None</td></tr>"}</table>
    <p class="k">Chain hops</p>
    <table>${hops.map((h) => `<tr><td>${h.at} · ${h.action}</td><td>${h.qty} · ${h.source} · ${h.status}</td></tr>`).join("") || "<tr><td colspan=2>None</td></tr>"}</table>
    <p class="k">COA · Manifest · Invoice</p>
    <table>${atts.map((a) => `<tr><td>${a.kind.toUpperCase()}</td><td class="${a.status === "ON FILE" ? "ok" : "gap"}">${a.status} · ${a.id ?? "—"} · ${a.source}<br>${a.note}</td></tr>`).join("")}</table>`;
}

export function RoomMetrcBoard({
  room,
  onDrill,
  lic = "ALL",
}: {
  room: FacRoom;
  onDrill: (t: FacTarget) => void;
  lic?: "ALL" | typeof LIC_MC | typeof LIC_MP;
}) {
  const rows = liveFor(room).filter((r) => lic === "ALL" || r.licence === lic);
  const k = roomKpis(room);
  const crops = cropsFor(room);
  const atts = attachmentsFor(room, rows);
  const html = proofHtml(room, rows, atts);
  const file = `twisted-${room.id}-metrc-${S2S_AS_OF.replace(/\s+/g, "-")}.html`;

  if (!rows.length && !room.metrc) {
    return (
      <section>
        <p className="fac-kicker">Metrc</p>
        <p className="rb-copy">Not a licensed location. No plants, packages, harvests, COA, or manifest attach here.</p>
      </section>
    );
  }

  return (
    <section className="rm-board">
      <div className="rm-head">
        <p className="fac-kicker">Metrc occupancy · {S2S_AS_OF} · SoR</p>
        <div className="rm-tools">
          <button type="button" onClick={() => printHtml(`${room.name} · Metrc`, html)}>
            <Printer className="size-3.5" /> Print
          </button>
          <button type="button" onClick={() => downloadBlob(file, `<!doctype html>${html}`)}>
            <Download className="size-3.5" /> Download
          </button>
        </div>
      </div>
      {rows.map((r) => (
        <div key={r.licence + r.room}>
        <div className="rb-kpis">
          <Tile k="Licence" v={r.licence} s={`${r.role} · ${r.stage}`} onClick={() => onDrill({ k: "s2s", room: r.room })} />
          <Tile k="Grain" v={r.status} s={r.status === "ISSUE" ? "OS vs Metrc Active grid" : r.status === "CERTIFIED" ? "Dual MATCH" : "Not dual MATCH"} tone={r.status === "ISSUE" ? "crit" : r.status === "CERTIFIED" ? "ok" : "hold"} onClick={() => onDrill({ k: "s2s", room: r.room })} />
          <Tile k="Flowering tagged" v={fmt(r.tagged_flowering)} s="Metrc plant grid" tone={r.tagged_flowering ? "ok" : undefined} onClick={() => onDrill({ k: "plants" })} />
          <Tile k="Veg tagged" v={fmt(r.tagged_veg)} s="Metrc plant grid" onClick={() => onDrill({ k: "plants" })} />
          <Tile k="Batches" v={`${fmt(r.batch_n)}`} s={`${fmt(r.batch_plants)} plants · untagged stays PARTIAL`} onClick={() => onDrill({ k: "s2s", room: r.room })} />
          <Tile k="Open harvests" v={fmt(r.harvests_open)} s={`${fmt(r.harvest_plants)} plants · ${fmt(r.harvest_wet_lb, 1)} lb wet`} onClick={() => k.harvests[0] && onDrill({ k: "harvest", name: k.harvests[0].harvest })} />
          <Tile k="Packages" v={fmt(r.pkg_n)} s={`${lb(r.pkg_qty_g)} lb OS · not certified until retire-pass`} tone={r.pkg_stale_n ? "crit" : r.pkg_n ? "hold" : undefined} onClick={() => onDrill({ k: "packages" })} />
          <Tile k="Stale packages" v={fmt(r.pkg_stale_n)} s="OS active, Metrc grid does not return" tone={r.pkg_stale_n ? "crit" : undefined} onClick={() => onDrill({ k: "packages" })} />
          {atts.map((a) => (
            <Tile
              key={r.licence + a.kind}
              k={a.kind.toUpperCase()}
              v={a.status}
              s={a.id ? `${a.id} · ${a.source}` : a.source}
              tone={a.status === "ON FILE" ? "ok" : a.status === "GAP" ? "hold" : "crit"}
              onClick={() => onDrill({ k: a.kind, room: r.room, id: a.id ?? undefined })}
            />
          ))}
          {r.pkg_n || r.status === "ISSUE" ? (
            <Link to="/p/$key" params={{ key: "inv_value" }} className="rb-tile hold">
              <span className="rb-k">Inventory $</span>
              <strong className="rb-v">ISSUE</strong>
              <em>Not on this pin. Open Inventory Value. Grain stays ISSUE until retire-pass.</em>
            </Link>
          ) : null}
        </div>
        <p className="rb-copy">{r.note}</p>
        </div>
      ))}
      {crops.length ? (
        <div className="rb-kpis">
          {crops.slice(0, 8).map((c) => (
            <Tile
              key={c.strain}
              k={c.strain}
              v={fmt(c.plants)}
              s={c.cycle ? `Day ${c.day}/${c.cycle} · ${c.left}d left` : "on the floor"}
              onClick={() => onDrill({ k: "strain", strain: c.strain })}
            />
          ))}
        </div>
      ) : null}

      <p className="fac-kicker">Lots / tags in this location · fills when the tag book is certified</p>
      <div className="rm-atts">
        {LOTS.filter((l) => rows.some((r) => r.room === l.now_room)).map((l) => (
          <article key={l.id} className="rm-att">
            <button type="button" className="rm-att-hit" onClick={() => onDrill({ k: "harvest", name: l.name })}>
              <div>
                <b>{l.name}</b>
                <em>
                  {l.strain} · {l.licence} · {l.status} · {l.now_stage}
                </em>
                <span>
                  {fmt(l.plants)} plants · {fmt(l.wet_lb, 1)} lb wet · {lb(l.pkg_g)} lb pkg · {l.identity}
                </span>
              </div>
            </button>
            <AttachChips atts={docsForLot(l)} room={l.now_room} onDrill={onDrill} />
          </article>
        ))}
        {!LOTS.filter((l) => rows.some((r) => r.room === l.now_room)).length ? (
          <p className="rb-copy">No lot on this freeze in this room. Tag-level book lands here when certified — this card will fill. No fake tags.</p>
        ) : null}
      </div>

      <p className="fac-kicker">Chain hops · transfers / converts / harvests</p>
      <div className="rm-atts">
        {rows.flatMap((r) => hopsForRoom(r.room, r.licence)).slice(0, 12).map((h) => (
          <article key={h.id} className="rm-att">
            <div className="rm-att-hit">
              <div>
                <b>
                  {h.action} · {h.at}
                </b>
                <em>
                  {h.source} · {h.status} · {h.qty}
                </em>
                <span>{h.note}</span>
              </div>
            </div>
          </article>
        ))}
      </div>

      <p className="fac-kicker">COA · Manifest · Invoice</p>
      <div className="rm-atts">
        {atts.map((a) => (
          <AttachCard
            key={a.kind}
            a={a}
            room={room}
            rows={rows}
            onOpen={() => onDrill({ k: a.kind, room: rows[0]?.room ?? room.metrc ?? room.name, id: a.id ?? undefined })}
          />
        ))}
      </div>
    </section>
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
  onClick: () => void;
}) {
  return (
    <button type="button" className={"rb-tile" + (tone ? " " + tone : "")} onClick={onClick}>
      <span className="rb-k">{k}</span>
      <strong className="rb-v">{v}</strong>
      {s ? <em>{s}</em> : null}
    </button>
  );
}

function AttachCard({
  a,
  room,
  rows,
  onOpen,
}: {
  a: Attachment;
  room: FacRoom;
  rows: S2SRoom[];
  onOpen: () => void;
}) {
  const Icon = a.kind === "coa" ? FlaskConical : a.kind === "manifest" ? FileText : Receipt;
  const html = `<h1>${a.kind.toUpperCase()} · ${room.name}</h1>
    <p class="k">${a.status} · ${a.source} · as of ${S2S_AS_OF}</p>
    <table>
      <tr><td>Id</td><td>${a.id ?? "GAP — nothing on file"}</td></tr>
      <tr><td>Status</td><td class="${a.status === "ON FILE" ? "ok" : "gap"}">${a.status}</td></tr>
      <tr><td>Source</td><td>${a.source}</td></tr>
      <tr><td>Note</td><td>${a.note}</td></tr>
      <tr><td>Metrc rooms</td><td>${rows.map((r) => r.room + " " + r.licence).join(" · ") || room.metrc || "none"}</td></tr>
    </table>
    <p>Print/download is the OS forensic extract. Original Metrc PDF / Apex PDF is pulled when ON FILE and a file exists in the vault.</p>`;
  const name = `twisted-${room.id}-${a.kind}-${S2S_AS_OF.replace(/\s+/g, "-")}.html`;
  return (
    <article className={"rm-att" + (a.status === "GAP" ? " is-gap" : "")}>
      <button type="button" className="rm-att-hit" onClick={onOpen}>
        <Icon className="size-4" />
        <div>
          <b>{a.kind.toUpperCase()}</b>
          <em>
            {a.status} · {a.id ?? "no id"} · {a.source}
          </em>
          <span>{a.note}</span>
        </div>
      </button>
      <div className="rm-tools">
        <button type="button" onClick={() => printHtml(`${a.kind} · ${room.name}`, html)}>
          <Printer className="size-3.5" /> Print
        </button>
        <button type="button" onClick={() => downloadBlob(name, `<!doctype html>${html}`)}>
          <Download className="size-3.5" /> Download
        </button>
      </div>
    </article>
  );
}

export function proofForRoom(room: FacRoom) {
  const rows = liveFor(room);
  return proofHtml(room, rows, attachmentsFor(room, rows));
}
