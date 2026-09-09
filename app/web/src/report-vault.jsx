/* Report Vault — drop Metrc/Apex files here. Bytes stored forever.
   Owner 8 Sep 2026: stop sending reports in chat. Parse is a later step.
   No delete. No ledger rewrite. CERTIFIED is not implied by landing here.
   9 Sep: every file classified with licence. Full ledger, live poll. */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";

const ACCEPT = ".xls,.xlsx,.csv,.pdf,.zip,.txt";

const LABEL = {
  harvests_inactive: "Harvests — Inactive (moisture)",
  harvests_active: "Harvests — Active",
  packages_transferred: "Packages — Transferred",
  packages_inactive: "Packages — Inactive",
  packages_active: "Packages — Active",
  packages_intransit: "Packages — In Transit",
  packages_lineage: "Packages — lineage (source harvest/package)",
  packages_adjustments: "Packages — Adjustments",
  packages_inventory: "Packages Inventory report",
  lab_results: "Lab Results",
  inventory_point_in_time: "Inventory Point in Time",
  plants_flowering: "Plants — Flowering",
  plants_vegetative: "Plants — Vegetative",
  plants_inactive: "Plants — Inactive",
  plants_waste: "Plants — Waste",
  plants_destroyed: "Plants — Destroyed",
  plants_trend: "Plants Trend report",
  plants_inventory_monthly: "Monthly Plants Inventory",
  plantings_active: "Plantings / plant batches — Active",
  plantings_inactive: "Plantings / plant batches — Inactive",
  test_batches: "Test Batches",
  wholesale_transfers: "Wholesale Transfers",
  transfers: "Transfers — full report",
  transfers_limited: "Transfers — limited",
  transfers_incoming: "Transfers — Incoming active",
  transfers_outgoing: "Transfers — Outgoing active",
  transfers_incoming_inactive: "Transfers — Incoming inactive",
  transfers_outgoing_inactive: "Transfers — Outgoing inactive",
  metrc_items: "Items catalogue",
  metrc_strains: "Strains",
  metrc_locations: "Locations",
  apex_orders: "Apex — Selling orders / invoices",
  apex_payments: "Apex — Payments",
  apex_sales_lines: "Apex — All Product Sales (lines)",
  apex_inventory: "Apex — Inventory Overview",
  apex_buyers: "Apex — Buyer export",
  apex_buyer_contacts: "Apex — Buyer contacts",
  audit_evidence: "CM audit evidence (held)",
};

function guessedAs(r) {
  if (r?.need_key && LABEL[r.need_key]) return LABEL[r.need_key];
  if (r?.need_key) return String(r.need_key).replace(/_/g, " ");
  if (r?.report_key) return r.report_key;
  return "unclassified — still kept";
}

function fmtWhen(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeName(name) {
  return String(name || "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 180);
}

export default function ReportVault({ session }) {
  const [board, setBoard] = useState([]);
  const [held, setHeld] = useState([]);
  const [msg, setMsg] = useState([]);
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState(false);
  const [q, setQ] = useState("");
  const [lic, setLic] = useState("ALL");
  const [refreshed, setRefreshed] = useState(null);

  const load = useCallback(async () => {
    const [b, h] = await Promise.all([
      supabase.from("v_report_vault_board").select("*").order("priority"),
      supabase.from("report_vault").select("id,stored_at,original_name,need_key,report_key,licence,bytes,parse_status,parse_note,sha256").order("stored_at", { ascending: false }).limit(5000),
    ]);
    if (b.error) setMsg([{ ok: false, file: "need list", note: b.error.message }]);
    else setBoard(Array.isArray(b.data) ? b.data : []);
    if (h.error) setMsg((m) => [...m, { ok: false, file: "vault", note: h.error.message }]);
    else setHeld(Array.isArray(h.data) ? h.data : []);
    setRefreshed(new Date());
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  async function storeFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true);
    const out = [];
    for (const f of files) {
      try {
        const hex = await sha256Hex(f);
        const { data: existing, error: existingErr } = await supabase
          .from("report_vault").select("id,storage_path,stored_at,original_name")
          .eq("sha256", hex).limit(1);
        if (existingErr) throw existingErr;
        const already = existing && existing[0];
        const { data: guess, error: guessErr } = await supabase.rpc("f_report_vault_guess", { p_name: f.name });
        if (guessErr) throw guessErr;
        const g = Array.isArray(guess) ? guess[0] : guess;
        if (already) {
          out.push({
            ok: true, file: f.name,
            note: `Already in the vault since ${new Date(already.stored_at).toLocaleString()}. Same bytes. Not stored twice.`,
          });
          continue;
        }
        const yyyymm = new Date().toISOString().slice(0, 7);
        const path = `forever/${yyyymm}/${hex.slice(0, 16)}_${safeName(f.name)}`;
        const up = await supabase.storage.from("report-vault").upload(path, f, {
          upsert: false,
          contentType: f.type || "application/octet-stream",
        });
        if (up.error) throw up.error;
        const licence = g?.licence ?? null;
        const ins = await supabase.from("report_vault").insert({
          original_name: f.name,
          storage_path: path,
          sha256: hex,
          bytes: f.size,
          mime: f.type || null,
          report_key: g?.report_key ?? null,
          licence,
          need_key: g?.need_key ?? null,
          uploaded_by: session?.user?.id ?? null,
          uploaded_email: session?.user?.email ?? null,
          parse_status: "stored",
          parse_note: "Stored forever. Not parsed. Not certified.",
          source: "os-vault",
        });
        if (ins.error) throw ins.error;
        out.push({
          ok: true, file: f.name,
          note: `Stored forever as ${g?.need_key ? guessedAs(g) : "unclassified"}${licence ? ` · ${licence}` : ""}. ${f.size.toLocaleString()} bytes. Not parsed yet.`,
        });
      } catch (e) {
        out.push({ ok: false, file: f.name, note: String(e.message ?? e) });
      }
    }
    setMsg(out);
    setBusy(false);
    load();
  }

  const missing = board.filter((r) => (r.vault_status || "").startsWith("MISSING")).length;
  const classified = held.filter((r) => r.need_key).length;
  const licenceList = [...new Set(held.map((r) => r.licence).filter(Boolean))].sort();
  const lastDrop = held[0]?.stored_at;

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return held.filter((r) => {
      if (lic === "APEX" && !(r.need_key || "").startsWith("apex_")) return false;
      if (lic === "NONE" && r.licence) return false;
      if (lic !== "ALL" && lic !== "APEX" && lic !== "NONE" && r.licence !== lic) return false;
      if (!qq) return true;
      const blob = `${r.original_name} ${r.need_key || ""} ${r.report_key || ""} ${r.licence || ""} ${guessedAs(r)}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [held, q, lic]);

  return (
    <div className="rvault">
      <style>{CSS}</style>
      <header>
        <p className="eyebrow">Twisted Growers · Report Vault · forever · live</p>
        <h1>Drop Metrc reports here. They stay forever.</h1>
        <p className="sub">
          Chat is not a source of record. XLS, XLSX, CSV, PDF, ZIP. Every file is classified with a licence when the name allows it.
          Nothing is deleted. Parse into the books is a later step — landing here does
          <strong> not </strong> certify a number.
        </p>
      </header>

      <section className="headline">
        <div className={missing ? "stat was" : "stat now"}>
          <p className="k">Still needed</p>
          <p className="v">{missing}</p>
          <p className="n">{missing ? "Export these from Metrc and drop them" : "Every requested report is in the vault"}</p>
        </div>
        <div className="stat now">
          <p className="k">Files in vault</p>
          <p className="v">{held.length}</p>
          <p className="n">{classified}/{held.length} classified · never deleted</p>
        </div>
        <div className="stat cut">
          <p className="k">By licence</p>
          <p className="v" style={{ fontSize: 16, lineHeight: "1.5rem" }}>
            {licenceList.length ? licenceList.map((L) => `${L} ${held.filter((r) => r.licence === L).length}`).join(" · ") : "—"}
          </p>
          <p className="n">{held.filter((r) => !r.licence).length} without a licence in the filename</p>
        </div>
        <div className="stat cut">
          <p className="k">Live</p>
          <p className="v" style={{ fontSize: 16, lineHeight: "1.6rem" }}>{session?.user?.email ?? "—"}</p>
          <p className="n">{refreshed ? `Refreshed ${refreshed.toLocaleTimeString()}` : "loading"}{lastDrop ? ` · last ${fmtWhen(lastDrop)}` : ""}</p>
        </div>
      </section>

      <section>
        <h2>Drop zone</h2>
        <p className="lede">Several files at once is fine. Classified on drop. Tick every column in Metrc before you export — hidden columns never arrive.</p>
        <div
          className={`up ${hot ? "hot" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setHot(true); }}
          onDragLeave={() => setHot(false)}
          onDrop={(e) => { e.preventDefault(); setHot(false); storeFiles(e.dataTransfer.files); }}
        >
          <input
            id="rvault-file"
            type="file"
            accept={ACCEPT}
            multiple
            disabled={busy}
            onChange={(e) => { storeFiles(e.target.files); e.target.value = ""; }}
          />
          <label htmlFor="rvault-file">{busy ? "Storing…" : "Choose files"}</label>
          <p>or drag them here · .xls .xlsx .csv .pdf .zip</p>
        </div>
        {msg.length ? (
          <div className="msgs">
            {msg.map((m, i) => (
              <div key={i} className={`msg ${m.ok ? "" : "bad"}`}>
                <b>{m.file}</b> {m.note}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2>What we need from you — now</h2>
        <p className="lede">One file per licence where it says both. Date range: grand opening through today unless noted.</p>
        <div className="req">
          {board.map((r) => (
            <div key={r.need_key} className={`r ${(r.vault_status || "").startsWith("MISSING") ? "crit" : "ok"}`}>
              <div className="n">{r.priority}</div>
              <div>
                <b>{r.title}</b>
                <p className="why">{r.why}</p>
                <p className="path">{r.how_to_export}</p>
                {r.tick_columns ? <p className="path">Tick columns: {r.tick_columns}</p> : null}
                <p className="path">Licences: {(r.licences || []).join(" · ")} · {r.cadence}</p>
              </div>
              <div className="st">
                <span className={`pill ${(r.vault_status || "").startsWith("IN VAULT") && !(r.vault_status || "").includes("ageing") ? "on" : "no"}`}>
                  {r.vault_status}
                </span>
                {r.last_stored ? (
                  <p className="path" style={{ marginTop: 8 }}>
                    {r.n_files} file{r.n_files === 1 ? "" : "s"} · last {fmtWhen(r.last_stored)}
                    {r.last_name ? ` · ${r.last_name}` : ""}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Vault — everything ever dropped</h2>
        <p className="lede">{held.length} files · live, refreshes every 8 seconds · landing is not certification</p>
        <div className="filters">
          <button type="button" className={`chip ${lic === "ALL" ? "on" : ""}`} onClick={() => setLic("ALL")}>All licences</button>
          {licenceList.map((L) => (
            <button key={L} type="button" className={`chip ${lic === L ? "on" : ""}`} onClick={() => setLic(L)}>{L}</button>
          ))}
          <button type="button" className={`chip ${lic === "APEX" ? "on" : ""}`} onClick={() => setLic("APEX")}>Apex</button>
          <button type="button" className={`chip ${lic === "NONE" ? "on" : ""}`} onClick={() => setLic("NONE")}>No licence</button>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter file / class / licence" />
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>File</th>
                <th>Guessed as</th>
                <th>Licence</th>
                <th className="num">Bytes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((r) => (
                <tr key={r.id}>
                  <td className="times">{fmtWhen(r.stored_at)}</td>
                  <td>{r.original_name}</td>
                  <td>{guessedAs(r)}</td>
                  <td className="times">{r.licence || "—"}</td>
                  <td className="num">{Number(r.bytes || 0).toLocaleString()}</td>
                  <td><span className="pill on">{r.parse_status}</span></td>
                </tr>
              )) : (
                <tr className="off"><td colSpan={6}>{held.length ? "No files match that filter." : "Empty. Drop the files above. They will never be deleted."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="lede" style={{ marginTop: 8 }}>{rows.length} shown of {held.length} · never deleted</p>
      </section>
      <footer>No delete. No chat. Signed in as {session?.user?.email ?? "—"}.</footer>
    </div>
  );
}

const CSS = `
.rvault { max-width: 1180px; margin: 0 auto; padding: 8px 4px 48px; color: #e8f0ea; }
.rvault header h1 { font-size: 1.85rem; margin: 4px 0 8px; letter-spacing: -0.02em; }
.rvault .eyebrow { color: #2df26a; font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; }
.rvault .sub { color: #9aa69f; max-width: 46rem; line-height: 1.45; }
.rvault .headline { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin: 22px 0; }
.rvault .stat { border: 1px solid #242a26; background: #111513; border-radius: 10px; padding: 14px 16px; }
.rvault .stat.was { border-color: rgba(255,66,69,0.45); }
.rvault .stat.now { border-color: rgba(45,242,106,0.35); }
.rvault .stat .k { font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; color: #5b665f; }
.rvault .stat .v { font-size: 2rem; font-weight: 700; color: #2df26a; line-height: 1.2; }
.rvault .stat .n { color: #9aa69f; font-size: 0.85rem; }
.rvault h2 { margin: 28px 0 8px; font-size: 1.15rem; }
.rvault .lede { color: #9aa69f; margin: 0 0 12px; }
.rvault .up { border: 1px dashed rgba(45,242,106,0.45); border-radius: 12px; padding: 28px; text-align: center; background: #111513; }
.rvault .up.hot { background: rgba(45,242,106,0.08); }
.rvault .up input { display: none; }
.rvault .up label { display: inline-block; background: #2df26a; color: #051509; font-weight: 700; padding: 10px 18px; border-radius: 8px; cursor: pointer; }
.rvault .up p { color: #9aa69f; margin: 10px 0 0; }
.rvault .msgs { display: grid; gap: 8px; margin-top: 14px; }
.rvault .msg { border: 1px solid #242a26; background: #181d1a; padding: 10px 12px; border-radius: 8px; }
.rvault .msg.bad { border-color: rgba(255,66,69,0.5); color: #ff8a8c; }
.rvault .req { display: grid; gap: 8px; }
.rvault .r { display: grid; grid-template-columns: 44px 1fr 220px; gap: 12px; border: 1px solid #242a26; background: #111513; border-radius: 10px; padding: 12px 14px; }
.rvault .r.crit { border-color: rgba(255,66,69,0.4); }
.rvault .r.ok { border-color: rgba(45,242,106,0.25); }
.rvault .n { font-weight: 700; color: #2df26a; font-size: 1.1rem; }
.rvault .why { color: #c5d0c8; margin: 4px 0; font-size: 0.92rem; }
.rvault .path { color: #7d8a80; font-size: 0.8rem; margin: 2px 0; }
.rvault .pill { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.rvault .pill.on { background: rgba(45,242,106,0.15); color: #2df26a; }
.rvault .pill.no { background: rgba(255,66,69,0.14); color: #ff8a8c; }
.rvault .filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; align-items: center; }
.rvault .chip { background: #181d1a; color: #9aa69f; border: 1px solid #242a26; border-radius: 999px; padding: 5px 12px; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
.rvault .chip.on { background: #2df26a; color: #051509; border-color: #2df26a; }
.rvault .filters input { flex: 1; min-width: 16rem; background: #111513; color: #e8f0ea; border: 1px solid #242a26; border-radius: 8px; padding: 7px 10px; }
.rvault .scroll { overflow: auto; border: 1px solid #242a26; border-radius: 10px; max-height: 70vh; }
.rvault table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.rvault th { text-align: left; color: #7d8a80; font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; padding: 8px 10px; position: sticky; top: 0; background: #111513; }
.rvault td { padding: 8px 10px; border-top: 1px solid #242a26; }
.rvault td.num, .rvault th.num { text-align: right; }
.rvault td.times { color: #9aa69f; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rvault tr.off td { color: #5b665f; }
.rvault footer { margin-top: 28px; color: #5b665f; font-size: 0.8rem; }
@media (max-width: 900px) {
  .rvault .headline, .rvault .r { grid-template-columns: 1fr; }
}
`;
