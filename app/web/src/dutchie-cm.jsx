/* Dutchie C&M — Grok chrome on the live OS.
   Metrc custody SoR. Apex invoice SoR. Write to Metrc NEVER. Cycle 56 locked. */
import React, { useCallback, useEffect, useState } from "react";
import { supabase, FUNCTIONS_URL } from "./lib/supabase.js";
import "./os-desk.css";

const FEATURES = [
  ["Canopy", "Clones → plants → phases → harvest → package", "METRC", "LIVE"],
  ["Harvest a batch", "Room, start, wet weight. Harvest IN Metrc, watch it here.", "METRC", "LIVE"],
  ["Waste / destroy", "v_waste_qty_truth only. Never sum mixed units.", "METRC", "LIVE"],
  ["Rooms", "F1–F4 two-size (1140 / 1050). Cycle 56 locked.", "METRC", "LIVE"],
  ["BOM / run cards", "Plan here. Convert in Metrc. No Complete button.", "OS", "PLAN"],
  ["Inventory / packages", "Move/convert/manifest in Metrc. Board shows custody.", "METRC", "LIVE"],
  ["Lab / COA", "Attaches as each exists. Not invented.", "METRC", "PARTIAL"],
  ["Wholesale", "Apex is the order book. Phase 1 read. Phase 2 Apex write later.", "APEX", "LIVE"],
  ["Vendor bills / POS", "Not this phase.", "OS", "NEVER"],
  ["Write to Metrc", "Never. Not phase 2 either.", "OS", "NEVER"],
];

const RAIL = [
  ["ops_cm", "Overview"],
  ["rpt-plants-flowering", "Flowering plants"],
  ["rpt-plants-vegetative", "Vegetative plants"],
  ["rpt-harvests", "Harvests"],
  ["rpt-packages-inventory", "Packages"],
  ["grow_rooms", "Rooms"],
  ["rpt-plant-waste", "Waste"],
  ["ops_spine", "Harvest spine"],
  ["report_center", "Report Center"],
  ["report_vault", "Report Vault"],
];

function n(v) {
  if (v == null) return "—";
  const x = Number(v);
  return Number.isFinite(x) ? x.toLocaleString() : "—";
}

export default function DutchieCm({ go, session }) {
  const [k, setK] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    const [flower, veg, batches, harvests, pkgs, canopy] = await Promise.all([
      supabase.from("metrc_plants").select("id", { count: "exact", head: true }).ilike("phase", "%flower%"),
      supabase.from("metrc_plants").select("id", { count: "exact", head: true }).ilike("phase", "%veg%"),
      supabase.from("metrc_plant_batches").select("id", { count: "exact", head: true }),
      supabase.from("metrc_harvests").select("id", { count: "exact", head: true }),
      supabase.from("metrc_packages").select("id", { count: "exact", head: true }),
      supabase.from("v_canopy_two_size").select("room,size,cap,plants_now,as_of,verdict"),
    ]);
    const errs = [flower, veg, batches, harvests, pkgs, canopy].map((x) => x.error?.message).filter(Boolean);
    setErr(errs.length ? errs.join(" · ") : null);
    setK({
      flower: flower.count,
      veg: veg.count,
      batches: batches.count,
      harvests: harvests.count,
      pkgs: pkgs.count,
      canopy: Array.isArray(canopy.data) ? canopy.data : [],
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function pull(fn) {
    setBusy(fn); setNote(null); setErr(null);
    try {
      const r = await fetch(`${FUNCTIONS_URL}/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      });
      const j = await r.json();
      setNote(j.ok ? `${fn} pulled. ${j.total ?? ""}`.trim() : (j.error || "Pull failed"));
      await load();
    } catch (e) {
      setErr(String(e.message ?? e));
    }
    setBusy(null);
  }

  const tiles = [
    ["Flowering plants", k ? n(k.flower) : "…", "rpt-plants-flowering"],
    ["Vegetative plants", k ? n(k.veg) : "…", "rpt-plants-vegetative"],
    ["Plant batches", k ? n(k.batches) : "…", "rpt-plantings"],
    ["Harvests", k ? n(k.harvests) : "…", "rpt-harvests"],
    ["Packages", k ? n(k.pkgs) : "…", "rpt-packages-inventory"],
  ];

  return (
    <div className="osdesk">
      <p className="osdesk-kicker">Cultivation & Manufacturing</p>
      <h1 className="osdesk-title">Dutchie C&M</h1>
      <p className="osdesk-lede">
        Better than Dutchie for TG because Metrc stays custody of record and Apex stays the invoice.
        Phase 1: see everything, write nothing to Metrc. Click a number — forensic drill.
      </p>

      <div className="osdesk-jump" style={{ marginTop: 14, border: "1px solid var(--line)", borderRadius: 8 }}>
        <button type="button" className="osdesk-save" disabled={!!busy} onClick={() => pull("metrc-sync")}>
          {busy === "metrc-sync" ? "Pulling Metrc…" : "Run — pull live from Metrc"}
        </button>
        <button type="button" className="osdesk-add" disabled={!!busy} onClick={() => pull("apex-sync")}>
          {busy === "apex-sync" ? "Pulling Apex…" : "Run — pull live from Apex"}
        </button>
        <button type="button" className="osdesk-add" onClick={() => go && go("report_center")}>Report Center</button>
        <button type="button" className="osdesk-add" onClick={() => go && go("report_vault")}>Report Vault</button>
      </div>
      {note ? <p className="osdesk-note">{note}</p> : null}
      {err ? <p className="osdesk-err">{err}</p> : null}

      <div className="osdesk-shell" style={{ marginTop: 16 }}>
        <div className="osdesk-split">
          <aside className="osdesk-rail">
            <div className="osdesk-rail-h">
              <b>Dutchie board</b>
              <span className="osdesk-online"><i /> Read only</span>
            </div>
            {RAIL.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={key === "ops_cm" ? "on" : ""}
                onClick={() => go && go(key)}
              >
                {label}
              </button>
            ))}
          </aside>
          <div className="osdesk-main">
            <div className="osdesk-head">
              <div>
                <h2>Live canopy</h2>
                <p>Metrc plants and rooms. Caps are two-size. 1,150 is labor, not cap.</p>
              </div>
            </div>

            <div className="osdesk-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))" }}>
              {tiles.map(([label, val, drill]) => (
                <button key={label} type="button" className="osdesk-card" onClick={() => go && go(drill)}>
                  <span className="osdesk-kicker">{label}</span>
                  <b style={{ fontSize: "1.55rem", letterSpacing: "-0.03em" }}>{val}</b>
                  <span className="osdesk-open">Open cloned report →</span>
                </button>
              ))}
            </div>

            <h2 style={{ marginTop: 22, fontSize: 16 }}>Two-size rooms (as-of)</h2>
            <div className="osdesk-tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Size</th>
                    <th>Plants now</th>
                    <th>Cap</th>
                    <th>Verdict</th>
                    <th>As-of</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(k?.canopy) && k.canopy.length ? k.canopy.map((r) => (
                    <tr key={r.room}>
                      <td>{`${r.room} — cultivation department`}</td>
                      <td>{r.size}</td>
                      <td>{n(r.plants_now)}</td>
                      <td>{n(r.cap)}</td>
                      <td>{r.verdict || "—"}</td>
                      <td>{r.as_of || "—"}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6}>{k ? "No canopy rows yet." : "Reading…"}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <h2 style={{ marginTop: 22, fontSize: 16 }}>Dutchie map — what lives where</h2>
            <div className="osdesk-cards">
              {FEATURES.map(([name, why, where, st]) => (
                <div key={name} className="osdesk-card" style={{ cursor: "default" }}>
                  <b>{name}</b>
                  <span className="osdesk-screens">{why}</span>
                  <div className="osdesk-foot">
                    <span className="osdesk-tag">{where}</span>
                    <span className={st === "LIVE" ? "osdesk-yes" : st === "NEVER" ? "osdesk-no" : "osdesk-tag"}>{st}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
