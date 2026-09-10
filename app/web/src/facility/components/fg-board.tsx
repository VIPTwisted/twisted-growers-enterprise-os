import { Link } from "@tanstack/react-router";
import { fgBook, weightStamp } from "@/data/finished-goods";
import { invExpiryKpi, lotsForRoom, invDaysLeft } from "@/data/inventory-lots";
import { docsAtStage, docsForInv, docsSummary } from "@/data/chain-docs";
import { AttachChips } from "@/components/attach-chips";
import type { FacTarget } from "@/components/fac-forensic";

function fmt(n: number, d = 1) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

export function FgBoard({
  onDrill,
  roomId,
}: {
  onDrill: (t: FacTarget) => void;
  roomId?: string;
}) {
  const b = fgBook();
  const w = weightStamp(b.grain, b.lb);
  const locs =
    !roomId || roomId === "dock-inv"
      ? b.rows
      : b.rows.filter((r) =>
          r.room.toLowerCase().includes(
            roomId === "vault" ? "finish" : roomId === "fulfill" ? "fulfill" : roomId === "ship" ? "ship" : roomId,
          ),
        );
  const shown = locs.length ? locs : b.rows;
  const lots = roomId ? lotsForRoom(roomId) : invExpiryKpi().rows.map((x) => x.lot);
  const exp = invExpiryKpi(roomId);
  const sum = docsSummary(shown.flatMap((r) => docsAtStage("PACKAGE", r.room)));

  return (
    <section className="inv-board">
      <header className="inv-head">
        <p className="fac-kicker">
          {roomId === "dock-inv" || !roomId ? "All finished goods ready for resale" : "Inventory"} · Metrc packages · {b.metrcAsOf}
        </p>
        <div className="inv-links">
          <Link to="/p/$key" params={{ key: "sheet_vs_metrc" }}>
            Sheet vs Metrc
          </Link>
          <Link to="/p/$key" params={{ key: "fg_inventory" }}>
            FG sheet
          </Link>
          <Link to="/p/$key" params={{ key: "inv_value" }}>
            Inventory $
          </Link>
        </div>
      </header>

      <div className="rb-kpis">
        <button type="button" className={"rb-tile " + (b.grain === "ISSUE" ? "crit" : "hold")} onClick={() => onDrill({ k: "packages" })}>
          <span className="rb-k">Packages</span>
          <strong className="rb-v">{b.pkg.toLocaleString()}</strong>
          <em>{w.text}</em>
        </button>
        <button type="button" className={"rb-tile " + (b.stale ? "crit" : "")} onClick={() => onDrill({ k: "packages" })}>
          <span className="rb-k">Stale</span>
          <strong className="rb-v">{b.stale}</strong>
          <em>OS vs Metrc grid</em>
        </button>
        <button type="button" className={"rb-tile " + (exp.expired ? "crit" : exp.soon ? "hold" : "ok")} onClick={() => onDrill({ k: "expiry", id: roomId })}>
          <span className="rb-k">Expiry</span>
          <strong className="rb-v">{exp.watch}</strong>
          <em>
            {exp.expired} expired · {exp.soon} ≤30d
          </em>
        </button>
        <button type="button" className={"rb-tile " + (sum.gaps ? "hold" : "ok")} onClick={() => onDrill({ k: "coa" })}>
          <span className="rb-k">Documents</span>
          <strong className="rb-v">{sum.onFile}</strong>
          <em>COA · Manifest · Invoice on file</em>
        </button>
      </div>

      {shown.map((r) => {
        const lb = r.pkg_qty_g / 453.592;
        const stamp = weightStamp(r.status, lb);
        const atts = docsAtStage("PACKAGE", r.room);
        return (
          <article key={r.licence + r.room} className={"inv-loc" + (r.status === "ISSUE" ? " is-crit" : "")}>
            <header>
              <button type="button" className="inv-loc-name" onClick={() => onDrill({ k: "s2s", room: r.room })}>
                {r.room}
              </button>
              <span className="inv-lic">{r.licence}</span>
              <b className={"inv-grain " + r.status.toLowerCase()}>{r.status}</b>
            </header>
            <dl>
              <div>
                <dt>Packages</dt>
                <dd>{r.pkg_n.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Weight</dt>
                <dd>{fmt(lb)} lb</dd>
              </div>
              <div>
                <dt>Stale</dt>
                <dd>{r.pkg_stale_n}</dd>
              </div>
            </dl>
            <p className="inv-note">{stamp.text}. {r.note}</p>
            <AttachChips atts={atts} room={r.room} onDrill={onDrill} />
          </article>
        );
      })}

      {lots.length ? (
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Lot</th>
                <th className="num">Qty</th>
                <th>Expires</th>
                <th>Docs</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const d = invDaysLeft(lot);
                const late = d != null && d < 0;
                const soon = d != null && d >= 0 && d <= 30;
                return (
                  <tr key={lot.id} className={late ? "is-crit" : soon ? "is-hold" : undefined}>
                    <td>
                      <button type="button" className="inv-lot" onClick={() => onDrill({ k: "s2s", room: lot.metrc })}>
                        <b>{lot.id}</b>
                        <i>
                          {lot.product} · {lot.strain}
                        </i>
                      </button>
                    </td>
                    <td className="num">
                      {lot.qty.toLocaleString()} {lot.uom}
                    </td>
                    <td className={late ? "crit" : soon ? "hold" : ""}>
                      {lot.expires}
                      <i>{d == null ? "no date" : late ? `${Math.abs(d)}d expired` : `${d}d left`}</i>
                    </td>
                    <td>
                      <AttachChips atts={docsForInv(lot)} room={lot.metrc} onDrill={onDrill} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
