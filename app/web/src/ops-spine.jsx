/* Harvest spine — two-size canopy, dry DRAFT for Vincent, moisture identity.
   Owner 8 Sep 2026. This page computes no business figure. Reads views.
   Metrc write NEVER. CERTIFIED 0 until dual MATCH. */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import {
  useDefaultRange, DkRangeSearch, rangeSearch,
  grab, listOf, DkTag, DkErr, DkEmpty, DkHead, DkDrill, DrillRoot,
  useSectionStore,
} from "./dashkit.jsx";
import { DateRangeSelect } from "./App.jsx";

const VIEW_KEY = "ops_spine";
const PAGE_KEY = "ops_spine";

function num(v, d = 0) {
  if (v === null || v === undefined || v === "") return "not recorded";
  const n = Number(v);
  if (!Number.isFinite(n)) return "not recorded";
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

export default function OpsSpine({ go, session, role, viewAs, reports }) {
  const store = useSectionStore(session && session.user ? session.user.id : null, PAGE_KEY);
  const [d, setD] = useState(null);
  const [ver, setVer] = useState(0);
  const [q, setQ] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [form, setForm] = useState({
    metrc_harvest_name: "", grade_a_lb: "", grade_b_lb: "", grade_c_lb: "",
    trim_lb: "", waste_lb: "", recorded_by: "",
  });
  const [saveErr, setSaveErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [openRoom, setOpenRoom] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [canopy, hf, drafts] = await Promise.all([
        supabase.from("v_canopy_two_size").select("*").order("room"),
        supabase.from("v_harvest_forensic").select("*").order("harvest_started", { ascending: false, nullsFirst: false }),
        supabase.from("harvest_close_draft").select("*").order("created_at", { ascending: false }),
      ]);
      if (!live) return;
      setD({ canopy: grab(canopy), hf: grab(hf), drafts: grab(drafts) });
    })();
    return () => { live = false; };
  }, [ver]);

  const harvests = useMemo(() => (d ? d.hf.rows : []), [d]);
  const rs = useMemo(() => rangeSearch(harvests, {
    from: range.from, to: range.to, dateField: "harvest_started", q,
    fields: ["harvest_name", "strain", "drying_room"],
  }), [harvests, range.from, range.to, q]);
  const open = useMemo(() => listOf(rs.rows).filter((r) => String(r.harvest_state || "").toUpperCase() !== "FINISHED"
    && String(r.harvest_state || "").toUpperCase() !== "CLOSED"), [rs.rows]);
  const drafts = useMemo(() => listOf(d ? d.drafts.rows : []), [d]);
  const waiting = drafts.filter((r) => r.vincent_status === "WAITING");

  async function fileDraft(e) {
    e.preventDefault();
    setSaveErr(null);
    const name = form.metrc_harvest_name.trim();
    if (!name) { setSaveErr("Pick a Metrc harvest name. OS harvests table is empty — drafts key off Metrc names."); return; }
    setSaving(true);
    const row = {
      metrc_harvest_name: name,
      grade_a_lb: Number(form.grade_a_lb || 0),
      grade_b_lb: Number(form.grade_b_lb || 0),
      grade_c_lb: Number(form.grade_c_lb || 0),
      trim_lb: Number(form.trim_lb || 0),
      waste_lb: Number(form.waste_lb || 0),
      recorded_by: form.recorded_by.trim() || (session && session.user && session.user.email) || "floor",
      status: "DRAFT",
      vincent_status: "WAITING",
    };
    const { error } = await supabase.from("harvest_close_draft").upsert(row, { onConflict: "metrc_harvest_name" });
    setSaving(false);
    if (error) { setSaveErr(error.message); return; }
    setForm({ ...form, grade_a_lb: "", grade_b_lb: "", grade_c_lb: "", trim_lb: "", waste_lb: "" });
    setVer((v) => v + 1);
  }

  async function vincent(name, vincent_status) {
    const { error } = await supabase.from("harvest_close_draft").update({
      vincent_status,
      status: vincent_status === "APPROVED" ? "APPROVED" : "REJECTED",
      vincent_at: new Date().toISOString(),
      vincent_note: vincent_status === "APPROVED" ? "Vincent DeMartino approved. Team follows." : "Vincent rejected. Cultivation refiles.",
    }).eq("metrc_harvest_name", name);
    if (error) setSaveErr(error.message);
    setVer((v) => v + 1);
  }

  if (d === null) {
    return <div className="ccpage"><div className="cc-fine" style={{ padding: 16 }}>Reading the harvest spine…</div></div>;
  }

  const canopy = listOf(d.canopy.rows);
  const shortN = canopy.filter((r) => r.verdict === "SHORT").length;

  return (
    <DrillRoot label="Harvest spine">
      <div className="ccpage">
        <DkHead title="Harvest spine" viewKey={VIEW_KEY} dept="Cultivation" role={role}
          viewAs={viewAs} computed={null} busy={false}>
          <DkTag tone={shortN ? "crit" : "ok"}>{shortN ? `${shortN} rooms short of own cap` : "canopy at own cap"}</DkTag>
          <DkTag tone={drafts.length ? "info" : "attn"}>{drafts.length} A/B/C drafts · {waiting.length} waiting on Vincent</DkTag>
          <DkTag tone="neutral">CERTIFIED 0 · Metrc read only</DkTag>
        </DkHead>

        <div className="cc-tools">
          <div className="cc-tools-l">
            <button type="button" className="cc-btn" onClick={() => setVer((v) => v + 1)}>↻ read again</button>
            <button type="button" className="cc-btn" onClick={() => window.print()}>🖨 print</button>
            <DateRangeSelect label="Chopped between" from={range.from} to={range.to}
              onFrom={(v) => setRange((prev) => ({ ...prev, from: v }))}
              onTo={(v) => setRange((prev) => ({ ...prev, to: v }))}
              presetKey={dateDefault.presetKey} session={session} viewKey={VIEW_KEY} allowSave />
          </div>
          <div className="cc-tools-r">
            <button type="button" className="cc-btn" onClick={() => go("harvests")}>Harvest register →</button>
            <button type="button" className="cc-btn" onClick={() => go("grading")}>Weights and grading →</button>
            <button type="button" className="cc-btn" onClick={() => go("moisture_loss_register")}>Moisture →</button>
            <button type="button" className="cc-btn" onClick={() => go("plant_census")}>Plant census →</button>
            <button type="button" className="cc-btn" onClick={() => go("os_staff")}>Staff / Top G →</button>
          </div>
        </div>

        <p className="cc-fine">
          Two-size rooms: F1/F3 LARGE 1,140 · F2/F4 SMALL 1,050. <b>1,150 is labor calculator, not cap.</b>
          Moisture identity: wet = waste + packaged tags + residual. A/B/C is DRAFT until Vincent DeMartino approves.
          OS <code>harvests</code> table is empty — closes key off Metrc harvest names. No Metrc write.
        </p>

        {d.canopy.err ? <DkErr what="Two-size canopy" err={d.canopy.err} /> : (
          <div className="cc-kpi-strip">
            {canopy.map((r) => (
              <button key={r.room} type="button" className="cc-kpi" onClick={() => setOpenRoom(openRoom === r.room ? null : r.room)}>
                <span className="cc-kpi-lbl">{`${r.room} · ${r.size} — cultivation department`}</span>
                <span className="cc-kpi-line">
                  <b className={`cc-kpi-val ${r.verdict === "FULL" ? "plain" : "crit"}`}>
                    {r.plants_now == null ? "no snapshot" : num(r.plants_now, 0)}
                  </b>
                  <em className="cc-kpi-unit">/ {num(r.cap, 0)}</em>
                </span>
                <span className="cc-kpi-target">{r.verdict}{r.short_by ? ` · ${num(r.short_by, 0)} short of this room` : ""}</span>
                <span className="cc-kpi-ctx">{r.law}</span>
              </button>
            ))}
          </div>
        )}

        {openRoom && (
          <DkDrill label={`${openRoom} — served row from v_canopy_two_size`} onClose={() => setOpenRoom(null)}>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Field</th><th>Value</th></tr></thead>
                <tbody>
                  {Object.entries(canopy.find((r) => r.room === openRoom) || {}).map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td>{String(v ?? "not recorded")}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DkDrill>
        )}

        <section className="cc-panel">
          <div className="cc-panel-head"><span className="cc-panel-title">A/B/C close — DRAFT for Vincent</span></div>
          <div className="cc-panel-body">
            <p className="cc-fine">
              Cultivation records. Status is DRAFT. Vincent approves or sends back. Team follows what he set.
              Do not write Metrc from here. Packaged tags stay the dried-weight SoR.
            </p>
            <form onSubmit={fileDraft} className="cc-tools" style={{ flexWrap: "wrap", gap: 8 }}>
              <label>Harvest
                <select aria-label="Metrc harvest" value={form.metrc_harvest_name}
                  onChange={(e) => setForm({ ...form, metrc_harvest_name: e.target.value })}>
                  <option value="">Select Metrc harvest</option>
                  {listOf(rs.rows).slice(0, 400).map((h) => (
                    <option key={h.harvest_name} value={h.harvest_name}>{h.harvest_name}</option>
                  ))}
                </select>
              </label>
              {["grade_a_lb", "grade_b_lb", "grade_c_lb", "trim_lb", "waste_lb"].map((k) => (
                <label key={k}>{k.replace("_lb", "").replace("grade_", "Grade ")} lb
                  <input aria-label={k} inputMode="decimal" value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </label>
              ))}
              <label>Recorded by
                <input aria-label="Recorded by" value={form.recorded_by}
                  onChange={(e) => setForm({ ...form, recorded_by: e.target.value })} />
              </label>
              <button type="submit" className="cc-btn" disabled={saving}>File DRAFT to Vincent</button>
            </form>
            {saveErr ? <DkErr what="Saving the draft" err={saveErr} /> : null}
            {d.drafts.err ? <DkErr what="Drafts" err={d.drafts.err} /> : drafts.length === 0 ? (
              <DkEmpty why="No A/B/C close has been filed."
                fills="A row appears when Cultivation files a DRAFT. Vincent then approves. harvest_grades stays 0 until that OS table is keyed to Metrc — this draft table is the live path because harvests.id is empty." />
            ) : (
              <div className="tablewrap">
                <table>
                  <thead><tr><th>Harvest</th><th>A</th><th>B</th><th>C</th><th>Trim</th><th>Waste</th><th>Vincent</th><th>Act</th></tr></thead>
                  <tbody>
                    {drafts.map((r) => (
                      <tr key={r.id}>
                        <td>{r.metrc_harvest_name}</td>
                        <td>{num(r.grade_a_lb, 1)}</td>
                        <td>{num(r.grade_b_lb, 1)}</td>
                        <td>{num(r.grade_c_lb, 1)}</td>
                        <td>{num(r.trim_lb, 1)}</td>
                        <td>{num(r.waste_lb, 1)}</td>
                        <td>{r.vincent_status}</td>
                        <td>
                          {r.vincent_status === "WAITING" ? (
                            <>
                              <button type="button" className="cc-btn" onClick={() => vincent(r.metrc_harvest_name, "APPROVED")}>Vincent approve</button>
                              <button type="button" className="cc-btn" onClick={() => vincent(r.metrc_harvest_name, "REJECTED")}>Send back</button>
                            </>
                          ) : (r.vincent_note || r.vincent_status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <DkRangeSearch id="spine-q" label="Search harvest name, strain, room"
          q={q} onQ={setQ} result={rs} noun="harvests" rangeLabel="this range"
          source="v_harvest_forensic" err={d.hf.err} />

        {d.hf.err ? <DkErr what="Harvest register" err={d.hf.err} /> : (
          <section className="cc-panel">
            <div className="cc-panel-head">
              <span className="cc-panel-title">Open harvests — exact rows</span>
              <span className="cc-panel-chips"><DkTag tone="info">{open.length}</DkTag></span>
            </div>
            <div className="cc-panel-body">
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>Harvest</th><th>Started</th><th>State</th><th>Plants</th>
                    <th>Wet lb</th><th>Packaged lb</th><th>Waste lb</th><th>Still in room</th><th>What is wrong</th>
                  </tr></thead>
                  <tbody>
                    {open.slice(0, 200).map((r) => (
                      <tr key={r.harvest_name}>
                        <td>{r.harvest_name}</td>
                        <td>{r.harvest_started ? String(r.harvest_started).slice(0, 10) : "not recorded"}</td>
                        <td>{r.harvest_state || "not recorded"}</td>
                        <td>{num(r.plants, 0)}</td>
                        <td>{num(r.wet_lb, 1)}</td>
                        <td>{num(r.packaged_lb, 1)}</td>
                        <td>{num(r.waste_lb, 1)}</td>
                        <td>{num(r.still_in_room_lb, 1)}</td>
                        <td>{r.what_is_wrong || "none stated"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </DrillRoot>
  );
}
