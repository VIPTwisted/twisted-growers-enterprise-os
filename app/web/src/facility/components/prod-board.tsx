import { Link } from "@tanstack/react-router";
import { prodDay } from "@/data/prod-day";
import { FLOOR } from "@/data/weight";
import type { AssignRow } from "@/lib/facility-api";

export function ProdBoard({ roomId, assigns }: { roomId: string; assigns: AssignRow[] }) {
  const d = prodDay(assigns, roomId);
  const mine = d.stations;
  if (!mine.length) return null;
  return (
    <section>
      <p className="fac-kicker">Production today · {d.today} · hourly vs needed</p>
      <p className="rb-copy">{d.law} Who is scheduled (roster only). Need: dock {d.going} going out. Packaged floor {FLOOR.pull_lb} lb / pull, {FLOOR.month_lb} lb / month — CERTIFIED on Metrc tags only.</p>
      <div className="rb-kpis">
        {mine.map((s) => (
          <div key={s.id} className={"rb-tile" + (s.open ? " crit" : " ok")}>
            <span className="rb-k">{s.label}</span>
            <strong className="rb-v">{s.open ? `${s.open} open seat` : "Staffed"}</strong>
            <em>{s.need}</em>
          </div>
        ))}
        <Link to="/p/$key" params={{ key: "preroll_schedule" }} className="rb-tile">
          <span className="rb-k">Production schedule</span>
          <strong className="rb-v">Open</strong>
          <em>Pre-roll / pack calendar</em>
        </Link>
        <Link to="/p/$key" params={{ key: "mfg_schedule" }} className="rb-tile">
          <span className="rb-k">Manufacturing schedule</span>
          <strong className="rb-v">Open</strong>
          <em>Runs and capacity</em>
        </Link>
      </div>
      {mine.map((s) => (
        <div key={s.id + "-h"} className="rm-atts">
          {s.filled.map((seat) => (
            <article key={seat.seat} className="rm-att">
              <div className="rm-att-hit">
                <div>
                  <b>
                    {seat.seat} · need {seat.n}
                  </b>
                  <em>{seat.who.length ? seat.who.join(" · ") : "OPEN — roster only, cannot invent"}</em>
                  <span>
                    Hours {d.hours[0]}–15:30. Produced this hour: GAP until today’s Metrc packages MATCH.
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ))}
    </section>
  );
}
