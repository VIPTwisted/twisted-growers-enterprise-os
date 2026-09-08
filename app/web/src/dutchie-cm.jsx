/* Twisted C&M — live canopy HUD. Metrc custody SoR. Apex invoice SoR. Write NEVER. Cycle 56. */
import React, { useCallback, useEffect, useState } from "react";
import { supabase, FUNCTIONS_URL } from "./lib/supabase.js";
import "./os-desk.css";
import { DkRoomPlantDrill, TagEvidence, TagEvidenceProvider } from "./dashkit.jsx";

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

function fillPct(plants, cap) {
  const p = Number(plants);
  const c = Number(cap);
  if (!Number.isFinite(p) || !Number.isFinite(c) || c <= 0) return 0;
  const x = (p / c) * 100;
  if (x > 100) return 100;
  if (x < 0) return 0;
  return x;
}

function lb(v) {
  if (v == null || v === "") return "not recorded";
  const x = Number(v);
  return Number.isFinite(x) ? x.toLocaleString() + " lb" : "not recorded";
}

function RoomForensic({ roomRow }) {
  const room = roomRow.room;
  const [harvests, setHarvests] = useState(null);
  const [herr, setHerr] = useState(null);
  const [pick, setPick] = useState(null);
  const [yieldRow, setYieldRow] = useState(null);
  const [yerr, setYerr] = useState(null);
  const [pkgs, setPkgs] = useState(null);
  const [perr, setPerr] = useState(null);

  useEffect(() => {
    let live = true;
    setHarvests(null); setHerr(null); setPick(null); setYieldRow(null); setPkgs(null);
    supabase.from("metrc_harvests")
      .select("name, harvest_start, wet_weight, package_count, source_state, license, metrc_id")
      .eq("flower_room", room)
      .order("harvest_start", { ascending: false })
      .limit(80)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setHerr(error.message); return; }
        setHarvests(Array.isArray(data) ? data : []);
      });
    return () => { live = false; };
  }, [room]);

  function openHarvest(h) {
    setPick(h);
    setYieldRow(null); setYerr(null); setPkgs(null); setPerr(null);
    supabase.from("v_harvest_water_and_yield").select("*").eq("harvest", h.name).limit(1)
      .then(({ data, error }) => {
        if (error) { setYerr(error.message); return; }
        setYieldRow(Array.isArray(data) && data[0] ? data[0] : null);
      });
    supabase.from("v_stock_proof").select("package_tag, item_name, quantity, uom, pounds, coa_url, apex_invoice_no, manifest_no, source_harvest, lab_state")
      .eq("source_harvest", h.name)
      .limit(80)
      .then(({ data, error }) => {
        if (error) { setPerr(error.message); return; }
        setPkgs(Array.isArray(data) ? data : []);
      });
  }

  const noSnap = roomRow.verdict === "NO SNAPSHOT" || roomRow.plants_now == null;
  const pct = noSnap ? 0 : fillPct(roomRow.plants_now, roomRow.cap);
  const tags = (pkgs || []).map((p) => p.package_tag).filter(Boolean);

  return (
    <section className="osdesk-forensic" aria-label={`${room} forensic drill`}>
      <div className="osdesk-head">
        <div>
          <h2>{`${room} — cultivation department`}</h2>
          <p>
            {roomRow.size || "size not recorded"} · cap {n(roomRow.cap)} · snapshot {roomRow.verdict || "—"} as-of {roomRow.as_of || "not recorded"}.
            {noSnap
              ? " Canopy snapshot has no plant count for this room. Standing plants below are live from v_room_plants_drill — they are not the snapshot."
              : ` Snapshot plants now ${n(roomRow.plants_now)} (${Math.round(pct)}%).`}
            {" "}1,150 is labor, not cap. Cycle 56 locked.
          </p>
        </div>
      </div>

      <h3 className="osdesk-h3">Standing plants</h3>
      <DkRoomPlantDrill room={room} metrcRoomName={null} />

      <h3 className="osdesk-h3">Harvests that came from this room</h3>
      {herr ? <p className="osdesk-note osdesk-err" role="alert">Harvests could not be read: {herr}</p> : null}
      {harvests === null && !herr ? <p className="osdesk-lede">Reading harvests whose flower_room is {room}…</p> : null}
      {harvests && harvests.length === 0 ? (
        <p className="osdesk-note">No harvest in Metrc names {room} as flower_room. That is empty, not a failed read.</p>
      ) : null}
      {harvests && harvests.length > 0 ? (
        <div className="osdesk-tablewrap">
          <table>
            <thead>
              <tr>
                <th>Harvest</th>
                <th>Started</th>
                <th>Wet (Metrc)</th>
                <th>Packages</th>
                <th>State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {harvests.map((h) => (
                <tr key={h.metrc_id || h.name} className={pick && pick.name === h.name ? "on" : ""}>
                  <td>{h.name}</td>
                  <td>{h.harvest_start ? String(h.harvest_start).slice(0, 10) : "not recorded"}</td>
                  <td>{lb(h.wet_weight)}</td>
                  <td>{h.package_count == null ? "not recorded" : Number(h.package_count).toLocaleString()}</td>
                  <td>{h.source_state || "not recorded"}</td>
                  <td>
                    <button type="button" className="osdesk-add" onClick={() => openHarvest(h)}>
                      Allocation + docs
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="osdesk-own">Waste is never totaled on this page. Mixed units. Per-harvest waste is v_harvest_water_and_yield.waste_lb only.</p>

      {pick ? (
        <div className="osdesk-editor">
          <b>{pick.name}</b>
          <p>Wet / waste / water / dry from v_harvest_water_and_yield. Packages from v_stock_proof. COA and manifest via evidence. Apex invoice if the package has one. CERTIFIED 0 unless dual MATCH.</p>
          {yerr ? <p className="osdesk-note osdesk-err" role="alert">Yield could not be read: {yerr}</p> : null}
          {yieldRow ? (
            <div className="osdesk-kpis">
              <div className="osdesk-kpi"><span className="osdesk-kicker">Plants</span><b>{n(yieldRow.plants)}</b></div>
              <div className="osdesk-kpi"><span className="osdesk-kicker">Wet in</span><b>{lb(yieldRow.wet_in_lb)}</b></div>
              <div className="osdesk-kpi"><span className="osdesk-kicker">Waste</span><b>{lb(yieldRow.waste_lb)}</b></div>
              <div className="osdesk-kpi"><span className="osdesk-kicker">Water lost</span><b>{lb(yieldRow.water_lost_lb)}</b></div>
              <div className="osdesk-kpi"><span className="osdesk-kicker">Dry yield</span><b>{yieldRow.dry_yield_lb == null ? "not recorded" : lb(yieldRow.dry_yield_lb)}</b></div>
            </div>
          ) : (!yerr ? <p className="osdesk-lede">No v_harvest_water_and_yield row for this harvest name. Dry / water / waste not invented.</p> : null)}
          {yieldRow && yieldRow.in_plain_english ? <p className="osdesk-note">{yieldRow.in_plain_english}</p> : null}

          <h3 className="osdesk-h3">Packages from this harvest — COA, manifest, Apex</h3>
          {perr ? <p className="osdesk-note osdesk-err" role="alert">Packages could not be read: {perr}</p> : null}
          {pkgs === null && !perr ? <p className="osdesk-lede">Reading packages…</p> : null}
          {pkgs && pkgs.length === 0 ? (
            <p className="osdesk-note">No v_stock_proof row names this harvest as source_harvest. Documents cannot attach to a package that is not in the proof view.</p>
          ) : null}
          {pkgs && pkgs.length > 0 ? (
            <TagEvidenceProvider tags={tags}>
              <div className="osdesk-tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>COA + manifest</th>
                      <th>Apex invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pkgs.map((p) => (
                      <tr key={p.package_tag}>
                        <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{p.package_tag}</td>
                        <td>{p.item_name || "not recorded"}</td>
                        <td>{p.quantity == null ? "not recorded" : `${Number(p.quantity).toLocaleString()} ${p.uom || ""}`.trim()}</td>
                        <td><TagEvidence tag={p.package_tag} compact /></td>
                        <td>{p.apex_invoice_no ? p.apex_invoice_no : "no Apex invoice on this package"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TagEvidenceProvider>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function DutchieCm({ go, session }) {
  const [k, setK] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const [openRoom, setOpenRoom] = useState(null);

  const load = useCallback(async () => {
    const [flower, veg, batches, harvests, pkgs, canopy] = await Promise.all([
      supabase.from("metrc_plants").select("id", { count: "exact", head: true }).ilike("phase", "%flower%"),
      supabase.from("metrc_plants").select("id", { count: "exact", head: true }).ilike("phase", "%veg%"),
      supabase.from("metrc_plant_batches").select("id", { count: "exact", head: true }),
      supabase.from("metrc_harvests").select("id", { count: "exact", head: true }),
      supabase.from("metrc_packages").select("id", { count: "exact", head: true }),
      supabase.from("v_canopy_two_size").select("room,size,cap,plants_now,as_of,verdict"),
    ]);
    const errs = [flower, veg, batches, harvests, pkgs, canopy].map((x) => x.error && x.error.message).filter(Boolean);
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session && session.access_token}` },
      });
      const j = await r.json();
      setNote(j.ok ? `${fn} pulled. ${j.total || ""}`.trim() : (j.error || "Pull failed"));
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    }
    setBusy(null);
  }

  const tiles = [
    ["Flowering", k ? n(k.flower) : "…", "rpt-plants-flowering", "plants"],
    ["Vegetative", k ? n(k.veg) : "…", "rpt-plants-vegetative", "plants"],
    ["Batches", k ? n(k.batches) : "…", "rpt-plantings", "lots"],
    ["Harvests", k ? n(k.harvests) : "…", "rpt-harvests", "since day one"],
    ["Packages", k ? n(k.pkgs) : "…", "rpt-packages-inventory", "tags"],
  ];

  const asOf = Array.isArray(k && k.canopy) && k.canopy.length && k.canopy[0].as_of ? k.canopy[0].as_of : "live";
  const rooms = Array.isArray(k && k.canopy) ? k.canopy : [];

  return (
    <div className="osdesk osdesk-cm">
      <header className="osdesk-hud">
        <div>
          <p className="osdesk-kicker">Cultivation & Manufacturing</p>
          <h1 className="osdesk-title">Twisted C&M</h1>
          <p className="osdesk-lede">
            Live canopy. Metrc is custody of record. Apex is the invoice. We watch here — we write nothing to Metrc.
            Click a number. Forensic drill. Cycle 56 locked.
          </p>
        </div>
        <div className="osdesk-hud-meta">
          <span className="osdesk-live"><i className="osdesk-pulse" /> LIVE</span>
          <span className="osdesk-asof">as-of {asOf}</span>
        </div>
      </header>

      <div className="osdesk-chips">
        <span className="osdesk-chip">METRC custody</span>
        <span className="osdesk-chip">APEX invoice</span>
        <span className="osdesk-chip osdesk-chip-warn">WRITE NEVER</span>
        <span className="osdesk-chip">CYCLE 56</span>
        <span className="osdesk-chip">UNCERTIFIED until dual MATCH</span>
      </div>

      <div className="osdesk-actions">
        <button type="button" className="osdesk-save" disabled={!!busy} onClick={() => pull("metrc-sync")}>
          {busy === "metrc-sync" ? "Pulling Metrc…" : "Pull Metrc"}
        </button>
        <button type="button" className="osdesk-add" disabled={!!busy} onClick={() => pull("apex-sync")}>
          {busy === "apex-sync" ? "Pulling Apex…" : "Pull Apex"}
        </button>
        <button type="button" className="osdesk-add" onClick={() => go && go("report_center")}>Report Center</button>
        <button type="button" className="osdesk-add" onClick={() => go && go("report_vault")}>Report Vault</button>
        <button type="button" className="osdesk-add" onClick={() => go && go("ops_spine")}>Harvest spine</button>
      </div>
      {note ? <p className="osdesk-note">{note}</p> : null}
      {err ? <p className="osdesk-err">{err}</p> : null}

      <div className="osdesk-shell">
        <div className="osdesk-split">
          <aside className="osdesk-rail">
            <div className="osdesk-rail-h">
              <b>Twisted board</b>
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
            <div className="osdesk-kpis">
              {tiles.map(([label, val, drill, unit]) => (
                <button key={label} type="button" className="osdesk-kpi" onClick={() => go && go(drill)}>
                  <span className="osdesk-kicker">{label}</span>
                  <b>{val}</b>
                  <span className="osdesk-open">{unit} → drill</span>
                </button>
              ))}
            </div>

            <div className="osdesk-head" style={{ marginTop: 22 }}>
              <div>
                <h2>Two-size rooms</h2>
                <p>F1 / F3 cap 1,140. F2 / F4 cap 1,050. 1,150 is labor, not cap. Click a room.</p>
              </div>
            </div>

            <div className="osdesk-rooms">
              {rooms.length ? rooms.map((r) => {
                const noSnap = r.verdict === "NO SNAPSHOT" || r.plants_now == null;
                const pct = noSnap ? 0 : fillPct(r.plants_now, r.cap);
                return (
                  <button
                    key={r.room}
                    type="button"
                    className={"osdesk-room" + (openRoom && openRoom.room === r.room ? " on" : "")}
                    onClick={() => setOpenRoom(r)}
                    aria-pressed={openRoom && openRoom.room === r.room}
                  >
                    <div className="osdesk-room-top">
                      <b>{`${r.room} — cultivation department`}</b>
                      <span className="osdesk-tag">{r.size || "—"}</span>
                    </div>
                    <div className="osdesk-room-nums">
                      <span><strong>{noSnap ? "—" : n(r.plants_now)}</strong> {noSnap ? "no snapshot" : "now"}</span>
                      <span>cap {n(r.cap)}</span>
                    </div>
                    <div className="osdesk-meter" aria-hidden="true">
                      <i className="osdesk-meter-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="osdesk-foot">
                      <span>{r.verdict || "—"} · as-of {r.as_of || "not recorded"}</span>
                      <span className="osdesk-open">{noSnap ? "drill live plants →" : `${Math.round(pct)}% →`}</span>
                    </div>
                  </button>
                );
              }) : (
                <p className="osdesk-lede">{k ? "No canopy rows yet." : "Reading live canopy…"}</p>
              )}
            </div>

            {openRoom ? <RoomForensic roomRow={openRoom} /> : null}

            <h2 style={{ marginTop: 22, fontSize: 16 }}>Where work lives</h2>
            <div className="osdesk-map">
              {FEATURES.map(([name, why, where, st]) => (
                <div key={name} className="osdesk-map-row">
                  <b>{name}</b>
                  <span className="osdesk-screens">{why}</span>
                  <span className="osdesk-tag">{where}</span>
                  <span className={st === "LIVE" ? "osdesk-yes" : st === "NEVER" ? "osdesk-no" : "osdesk-tag"}>{st}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
