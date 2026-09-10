import { AGENTS, FAC_ROOMS, liveFor, taggedFlowering } from "@/data/facility";
import { S2S_AS_OF, S2S_ROOMS } from "@/data/s2s-rooms";
import { LOTS } from "@/data/s2s-chain";
import { OPEN_CLOCK } from "@/data/weight";
import { shipDesk } from "@/data/shipping";
import { packKpis, packLow, type PackItem } from "@/data/pack-inventory";
import { invExpiryKpi } from "@/data/inventory-lots";
import { FLOOR_STAFF, ROOM_DEPT, staffForRoom } from "@/data/room-ops";
import { opsKpis, type OpsRow } from "@/data/room-coo";
import type { FacTarget } from "@/components/fac-forensic";

export type Lens = "floor" | "coo" | "cfo" | "ceo";

export const LENSES: { id: Lens; label: string; who: string }[] = [
  { id: "floor", label: "Floor", who: "Leads · occupancy, days left, machines" },
  { id: "coo", label: "COO", who: "Coverage, work, fire, open seats" },
  { id: "cfo", label: "CFO", who: "Dock $, supplies $, ISSUE lb — never $ on plants" },
  { id: "ceo", label: "CEO", who: "Exceptions only. Green stays off this strip" },
];

export type Grain = "CERTIFIED" | "PARTIAL" | "ISSUE" | "GAP" | "REFUSED";

export type ExecHit = {
  id: string;
  lens: Lens[];
  tone: "ok" | "hold" | "crit";
  grain: Grain;
  k: string;
  v: string;
  s: string;
  room?: string;
  drill: FacTarget;
};

export const SYNC = {
  metrc: S2S_AS_OF,
  apex: shipDesk().asOf,
  law: "As-of is the last certified pull. After deploy the Metrc and Apex mirrors refresh this stamp. Cards never say LIVE on a freeze. Weights stay unlabeled until dual MATCH.",
};

export function execHits(pack: PackItem[], ops: OpsRow[]): ExecHit[] {
  const desk = shipDesk();
  const pk = packKpis(pack);
  const ok = opsKpis(ops);
  const exp = invExpiryKpi();
  const execH = OPEN_CLOCK.filter((h) => h.level === "EXEC");
  const remH = OPEN_CLOCK.filter((h) => h.level === "REMINDER");
  const issuePkg = S2S_ROOMS.filter((r) => r.status === "ISSUE" || r.pkg_stale_n > 0);
  const issueLb = issuePkg.reduce((s, r) => s + r.pkg_qty_g, 0) / 453.592;
  const empty = S2S_ROOMS.filter((r) => r.status === "EMPTY");
  const named = FLOOR_STAFF.length;
  const hits: ExecHit[] = [
    {
      id: "harvest-exec",
      lens: ["ceo", "coo", "floor"],
      tone: execH.length ? "crit" : "ok",
      grain: "CERTIFIED",
      k: "Harvests EXEC",
      v: String(execH.length),
      s: execH.length ? `${execH[0].harvest} · ${execH[0].biz_late}d late` : "None on EXEC",
      room: "dry2",
      drill: execH[0] ? { k: "harvest", name: execH[0].harvest } : { k: "plants" },
    },
    {
      id: "harvest-t7",
      lens: ["coo", "floor"],
      tone: remH.length ? "hold" : "ok",
      grain: "CERTIFIED",
      k: "Dry due window",
      v: String(remH.length),
      s: remH.length ? `REMINDER · due ${remH[0].dry_due}` : "No T-7",
      room: "dry2",
      drill: remH[0] ? { k: "harvest", name: remH[0].harvest } : { k: "plants" },
    },
    {
      id: "low-pack",
      lens: ["ceo", "coo", "cfo"],
      tone: pk.low ? "crit" : "ok",
      grain: "PARTIAL",
      k: "Low stock",
      v: String(pk.low),
      s: "Packaging & Supplies · OS book",
      room: "stage",
      drill: { k: "s2s", room: "Packaging Inventory" },
    },
    {
      id: "ops-fire",
      lens: ["ceo", "coo"],
      tone: ok.fire ? "crit" : ok.alerts ? "hold" : "ok",
      grain: "PARTIAL",
      k: "COO fire",
      v: String(ok.fire || ok.alerts),
      s: `${ok.tasks} open tasks · ${ok.overdue} overdue`,
      drill: { k: "ops", room: ops.find((o) => o.kind === "alert")?.room_id || "f1" },
    },
    {
      id: "dock",
      lens: ["ceo", "cfo", "coo"],
      tone: desk.going.length ? "hold" : "ok",
      grain: "CERTIFIED",
      k: "Going out",
      v: String(desk.going.length),
      s: `${desk.goingUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} · ${desk.asOf}`,
      room: "ship",
      drill: desk.going[0] ? { k: "invoice", id: desk.going[0].invoice } : { k: "s2s", room: "Shipping & Receiving" },
    },
    {
      id: "returns",
      lens: ["ceo", "coo", "cfo"],
      tone: desk.openReturns.length ? "crit" : "ok",
      grain: "PARTIAL",
      k: "Returns",
      v: String(desk.openReturns.length),
      s: "Shipping desk · every return",
      room: "ship",
      drill: { k: "returns" },
    },
    {
      id: "pack-waste",
      lens: ["coo", "cfo"],
      tone: pk.wasted + pk.damaged ? "hold" : "ok",
      grain: "PARTIAL",
      k: "Waste / damage",
      v: String(pk.wasted + pk.damaged),
      s: "Packaging & Supplies card",
      room: "stage",
      drill: { k: "waste" },
    },
    {
      id: "expiry",
      lens: ["coo", "floor", "ceo"],
      tone: "hold",
      grain: "PARTIAL",
      k: "Expiring lots",
      v: String(exp.watch),
      s: `${exp.expired} expired · ${exp.soon} inside 30 days`,
      room: "vault",
      drill: { k: "expiry", id: "vault" },
    },
    {
      id: "issue-pkg",
      lens: ["ceo", "cfo", "coo"],
      tone: issuePkg.length ? "crit" : "ok",
      grain: "ISSUE",
      k: "Package ISSUE",
      v: `${issuePkg.reduce((s, r) => s + r.pkg_n, 0)}`,
      s: `${issueLb.toLocaleString(undefined, { maximumFractionDigits: 1 })} lb OS overstate until retire-pass`,
      drill: { k: "packages" },
    },
    {
      id: "empty",
      lens: ["coo", "floor"],
      tone: "hold",
      grain: "CERTIFIED",
      k: "Empty Metrc rooms",
      v: String(empty.length),
      s: "Empty is a status, not missing",
      drill: { k: "legend", zone: "process" },
    },
    {
      id: "canopy",
      lens: ["ceo", "coo", "floor"],
      tone: "ok",
      grain: "CERTIFIED",
      k: "Tagged plants",
      v: taggedFlowering().toLocaleString(),
      s: `F1–F4 · ${S2S_AS_OF}`,
      drill: { k: "plants" },
    },
    {
      id: "people",
      lens: ["coo", "ceo"],
      tone: named < AGENTS.n ? "hold" : "ok",
      grain: "PARTIAL",
      k: "Named / census",
      v: `${named} / ${AGENTS.n}`,
      s: `${AGENTS.n - named} unnamed until Metrc employee file lands. Do not invent.`,
      drill: { k: "staff" },
    },
    {
      id: "supplies-$",
      lens: ["cfo"],
      tone: pk.value ? "ok" : "hold",
      grain: pk.value ? "PARTIAL" : "GAP",
      k: "Supplies on-hand $",
      v: pk.value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
      s: pk.value ? "Landed × qty" : "$0 until unit cost is entered",
      room: "stage",
      drill: { k: "s2s", room: "Packaging Inventory" },
    },
    {
      id: "po",
      lens: ["cfo", "coo"],
      tone: pk.order ? "hold" : "ok",
      grain: "PARTIAL",
      k: "Open POs",
      v: String(pk.order),
      s: `${pk.po.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} on order`,
      room: "stage",
      drill: { k: "s2s", room: "Packaging Inventory" },
    },
    {
      id: "plant-$",
      lens: ["cfo"],
      tone: "hold",
      grain: "REFUSED",
      k: "Plant $ / room P&L",
      v: "REFUSED",
      s: "No certified COGS by room. Apex is invoices, not canopy.",
      drill: { k: "site" },
    },
  ];
  return hits;
}

export const TASK_TEMPLATES: { roomIds: string[]; title: string; body: string; kind: "task" | "reminder" }[] = [
  { roomIds: ["f1", "f2", "f3", "f4"], title: "IPM walk", body: "Walk every table. Record pests, spray, exceptions. Tag the room.", kind: "task" },
  { roomIds: ["f1", "f2", "f3", "f4"], title: "Harvest pull checklist", body: "Count vs cap. Cut list. Wet to dry. Nothing leaves without a harvest name.", kind: "task" },
  { roomIds: ["dry1", "dry2"], title: "Dry check", body: "Temp, RH, days since cut, remaining wet. File if due today.", kind: "reminder" },
  { roomIds: ["conf", "pack", "office", "infused"], title: "Machine start-up", body: "Operator assigned. Packer assigned on flower pack. First article weight.", kind: "task" },
  { roomIds: ["ship"], title: "Dock wave", body: "Today's invoices, manifests, same-door trucks. Apex vs Metrc.", kind: "task" },
  { roomIds: ["stage"], title: "Reorder below point", body: "Buy every SKU under reorder. PO note on the item.", kind: "task" },
  { roomIds: ["hydro", "solventless", "kitchen"], title: "Run card", body: "Work order, in-lb, out-lb, yield vs 3% floor. DRAFT to Vincent.", kind: "task" },
];

export const REFUSED = [
  { k: "GPS avatars", v: "No RTLS. Walking dots would be theater." },
  { k: "Write to Metrc", v: "Custody writes stay in Metrc. Twin is read + ops." },
  { k: "Second alert inbox", v: "Harvest + low stock + COO fire land here and on Floor work." },
  { k: "Invent 23 names", v: "Census is 27. Named file is 4 until Metrc employees load." },
  { k: "Package $ while ISSUE", v: "OS overstates on-hand. No dollar until retire-pass." },
];

export function lotsInRoom(roomId: string) {
  const rows = liveFor(FAC_ROOMS.find((r) => r.id === roomId) ?? FAC_ROOMS[0]);
  return LOTS.filter((l) => rows.some((r) => r.room === l.now_room));
}

export function seatsOpen(roomId: string) {
  const desk = ROOM_DEPT[roomId];
  const named = staffForRoom(FAC_ROOMS.find((r) => r.id === roomId) ?? FAC_ROOMS[0]).length;
  const need = desk?.n ?? 0;
  return { need, named, open: Math.max(0, need - named) };
}
