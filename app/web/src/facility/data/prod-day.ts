import { FLOOR } from "@/data/weight";
import { shipDesk } from "@/data/shipping";
import { ROSTER } from "@/data/roster";
import type { AssignRow } from "@/lib/facility-api";
import { etYmd } from "@/data/room-ops";

export const PROD_HOURS = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"] as const;

export const PROD_STATIONS: {
  id: "flower-pack" | "infused" | "other";
  room: string;
  label: string;
  seats: { seat: "operator" | "packer"; n: number }[];
  need: string;
}[] = [
  { id: "flower-pack", room: "conf", label: "Flower packaging machine", seats: [{ seat: "operator", n: 1 }, { seat: "packer", n: 1 }], need: "3.5 g jars and finished flower units" },
  { id: "infused", room: "infused", label: "Infused pre-roll machine", seats: [{ seat: "operator", n: 1 }], need: "Infused pre-rolls" },
  { id: "other", room: "pack", label: "Packaging (pre-rolls, vapes, other)", seats: [{ seat: "operator", n: 1 }], need: "Other finished SKUs" },
];

export function prodDay(assigns: AssignRow[], roomId?: string) {
  const today = etYmd();
  const desk = shipDesk();
  const stations = PROD_STATIONS.filter((s) => !roomId || s.room === roomId);
  return {
    today,
    hours: PROD_HOURS,
    floorLb: FLOOR.pull_lb,
    monthLb: FLOOR.month_lb,
    going: desk.going.length,
    goingUsd: desk.goingUsd,
    law: "Schedule vs needed. Produced today is CERTIFIED only when Metrc packages created today MATCH the sheet. No guessed hourly units.",
    stations: stations.map((s) => {
      const filled = s.seats.map((seat) => {
        const who = assigns.filter((a) => a.date === today && a.station === s.id && a.seat === seat.seat && ROSTER.some((r) => r.name === a.who));
        return { ...seat, who: who.map((w) => w.who), open: Math.max(0, seat.n - who.length) };
      });
      return { ...s, filled, open: filled.reduce((n, x) => n + x.open, 0) };
    }),
  };
}
