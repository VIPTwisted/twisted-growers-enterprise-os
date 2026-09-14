/* ---------------------------------------------------------------------------
   PACKAGE (TAG) 360 — Blueprint 2026 §4, the first object (BP-4-1).
   Owner, 14 Sep 2026: go-live in the customer's facility 23 Sep; "use what we
   have". One page per tag, assembled by f_package_360(tag) from the views the
   platform already certifies: dossier, master, lifecycle, ledger, provenance,
   evidence, certificate, every tag_event, dwell, documents, gaps, custody
   alerts, Apex reconciliation, findings and tasks. The caller's own row-level
   security applies (security invoker).

   Reached from: any table cell that is a tag (cellView renders it as a link),
   Spotlight (f_package_search), the address bar (#package_360:<tag>), and a
   scanned tag. Built from existing primitives only — pagehead, sbtotals,
   panel, pill, syncgrid, AssignTask. Theme untouched.

   Every figure shows its source; absence is explained, never blank (hard rule,
   6 Aug 2026). Nothing here is a silent fallback.
--------------------------------------------------------------------------- */
import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { useRole, AssignTask } from "./App.jsx";

const NO_ROWS = Object.freeze([]);
export const TAG_RE = /^1A4[0-9A-F]{21}$/;
const when = (ts) => (ts ? new Date(ts).toLocaleString() : "—");
const day = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const ago = (ts) => {
  if (!ts) return "never";
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const num = (v, d = 2) => (v == null || v === "" || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }));
const usd = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString(undefined, { style: "currency", currency: "USD" }));
const tone = (s) => {
  const t = String(s || "").toLowerCase();
  if (/(fail|missing|recall|hold|investigat|destroy|waste|reject|expired|gap|discrepan|error)/.test(t)) return "err";
  if (/(pass|ok|sellable|active|received|certified|match|paid|complete|finished)/.test(t)) return "ok";
  return "run";
};
/* A value with the view it came from, so the reader can trust it or challenge it. */
function Fact({ label, children, src, wrap }) {
  return (
    <tr><td className="note">{label}</td><td className={wrap ? "wrap" : ""}>{children ?? "—"}{src && <span className="p360-src" title={`Source: ${src}`}> · {src}</span>}</td></tr>
  );
}
/* A collapsible section — defined once at module level so React keeps its children mounted across renders. */
function P360Section({ title, count, open, onToggle, children }) {
  return (
    <div className="panel p360-sec" style={{ maxWidth: "none" }}>
      <button type="button" className="p360-sechead" onClick={onToggle} aria-expanded={open}>
        <span className="ptitle" style={{ margin: 0 }}>{title}</span>
        {count != null && <span className="pill muted">{count}</span>}
        <span className="note" style={{ marginLeft: "auto" }}>{open ? "hide" : "show"}</span>
      </button>
      {open && <div className="p360-secbody">{children}</div>}
    </div>
  );
}
/* Absence explained, never blank. */
const orWhy = (value, why) => (value != null && value !== "" ? value : <span className="note">{why}</span>);

export default function Package360({ session, tag: tagProp, go }) {
  const { role } = useRole(session);
  const [tag, setTag] = useState((tagProp || "").toUpperCase());
  const [q, setQ] = useState("");
  const [hits, setHits] = useState(NO_ROWS);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState({ identity: true, timeline: true, lab: true, docs: true, money: true, gaps: true, findings: true, tasks: true, lifecycle: true, dwell: false });
  useEffect(() => { setTag((tagProp || "").toUpperCase()); }, [tagProp]);

  useEffect(() => {
    if (!tag) { setData(null); return undefined; }
    let live = true;
    setLoading(true); setErr(null);
    /* One retry on a database timeout: twice an hour the materialised sources refresh
       and the database is busy for half a minute. The reader is told, never left. */
    const read = (attempt) => supabase.rpc("f_package_360", { p_tag: tag }).then(({ data: d, error }) => {
      if (!live) return;
      if (error && /timeout/i.test(error.message) && attempt === 0) { setErr("The database is busy (a scheduled refresh) — retrying…"); setTimeout(() => read(1), 2500); return; }
      setLoading(false);
      if (error) { setErr(error.message); setData(null); return; }
      if (!d || typeof d !== "object") { setErr("f_package_360 returned nothing."); setData(null); return; }
      setErr(null); setData(d);
    });
    read(0);
    return () => { live = false; };
  }, [tag]);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 4) { setHits(NO_ROWS); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      supabase.rpc("f_package_search", { p_q: s }).then(({ data: d, error }) => {
        if (!live) return;
        if (error) { setErr(error.message); return; }
        setHits(Array.isArray(d) ? d : NO_ROWS);
      });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const openTag = (t) => { setQ(""); setHits(NO_ROWS); if (typeof go === "function") go(`package_360:${t}`); else setTag(t); };
  const sec = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const d = data || {};
  const m = d.master || {};
  const dos = d.dossier || {};
  const life = d.lifecycle || {};
  const ev = d.evidence || {};
  const cert = d.certificate || {};
  const led = d.ledger || {};
  const prov = d.provenance || {};
  const timeline = Array.isArray(d.timeline) ? d.timeline : NO_ROWS;
  const docs = Array.isArray(d.documents) ? d.documents : NO_ROWS;
  const gaps = Array.isArray(d.gaps) ? d.gaps : NO_ROWS;
  const alerts = Array.isArray(d.custody_alerts) ? d.custody_alerts : NO_ROWS;
  const apex = Array.isArray(d.apex) ? d.apex : NO_ROWS;
  const findings = Array.isArray(d.findings) ? d.findings : NO_ROWS;
  const tasks = Array.isArray(d.tasks) ? d.tasks : NO_ROWS;
  const dwell = Array.isArray(d.dwell) ? d.dwell : NO_ROWS;
  const state = (() => {
    if (!data) return null;
    if (m.finished || dos.finished) return "finished";
    if (dos.on_recall) return "on recall";
    if (dos.on_hold) return "on hold";
    if (led.shipped_lb > 0 && !(led.in_stock)) return "transferred";
    const lab = String(dos.lab_state || m.coa_status || ev.lab_testing_state || "").toLowerCase();
    if (/pass/.test(lab) && led.in_stock) return "sellable";
    if (/submitted|pending|testing/.test(lab)) return "in testing";
    return led.in_stock ? "active" : (dos.status || "unknown");
  })();
  const stages = [
    ["Harvested", life.stage1_cut_on, life.stage1_harvest, life.stage1_note],
    ["Packaged", life.stage2_packaged_on, life.stage2_production_batch, null],
    ["Tested", life.stage3_result_on || life.stage3_submitted_on, life.stage3_lab_state, life.stage3_note],
    ["Shipped", life.stage4_shipped_on, life.stage4_shipped_to, life.stage4_note],
    ["Invoiced", life.stage5_invoice_date, life.stage5_apex_invoice, life.stage5_note],
    ["Finished", life.stage6_finished_on, life.stage6_finished ? "closed in Metrc" : null, null],
  ];
  const canAssign = ["owner", "executive", "admin", "manager", "dept_head", "hr", "cfo"].includes(role);
  const Section = (props) => <P360Section {...props} open={!!open[props.id]} onToggle={() => sec(props.id)} />;

  return (
    <>
      <div className="pagehead synchead">
        <div>
          <h1>Package 360</h1>
          <div className="sub">One page per tag: everything the platform knows about it, from every source, with the source named. Type a tag, its last digits, an item or a strain.</div>
        </div>
        <div className="synchead-acts">
          <input aria-label="Find a package by tag, item or strain" className="syncsearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="tag · last digits · item · strain" style={{ minWidth: 280 }} />
        </div>
      </div>
      {hits.length > 0 && (
        <div className="panel" style={{ maxWidth: "none", padding: 0 }}>
          <table className="syncgrid"><thead><tr><th>Tag</th><th>Item</th><th>Strain</th><th>Room</th><th>On hand</th><th>Licence</th></tr></thead>
            <tbody>{hits.map((h) => (
              <tr key={h.tag} className="syncrow" role="button" tabIndex={0} onClick={() => openTag(h.tag)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTag(h.tag); } }}>
                <td><code>{h.tag}</code></td><td className="wrap">{h.item}</td><td>{h.strain}</td><td>{h.room ? `${h.room} · ${h.licence}` : "—"}</td><td>{num(h.on_hand_lb, 3)} lb{h.finished ? <span className="note"> · finished</span> : ""}</td><td>{h.licence}</td>
              </tr>))}</tbody></table>
        </div>
      )}
      {err && <div className="msg err">{err}</div>}
      {!tag && !err && <div className="msg">No tag chosen. Search above, click a tag anywhere in the OS, or open <code>#package_360:&lt;tag&gt;</code>.</div>}
      {tag && loading && !data && <div className="note">Reading {tag}…</div>}
      {tag && data && !d.found && <div className="msg err">No package with tag <code>{tag}</code> in the Metrc mirror. The tag was typed wrongly, belongs to another licence, or has not been mirrored — the Metrc feed covers a subset of tags; the grid export in the vault is the complete source.</div>}

      {data && d.found && (
        <>
          {/* headline strip — every number names its source on hover */}
          <div className="sbtotals syncstats" style={{ marginTop: 12 }}>
            <div><b><code style={{ fontSize: 15 }}>{d.tag}</code></b><span>{m.licence || dos.licence || "licence —"} · {m.ownership || prov.harvested_by_ownership || "ownership —"}</span></div>
            <div><b><span className={`pill ${tone(state)}`}>{state}</span></b><span>state</span></div>
            <div title="v_tag_master.on_hand_lb"><b>{num(m.on_hand_lb ?? led.lb_on_hand, 3)}</b><span>lb on hand</span></div>
            <div title="v_package_dossier.quantity_raw — the package’s own unit, never converted"><b>{num(dos.quantity_raw, 3)}</b><span>{dos.unit_of_measure || "own unit"}{dos.units != null && dos.quantity_type === "CountBased" ? " · count" : ""}</span></div>
            <div title="v_package_dossier.room — a room is shown with its department (J7)"><b>{(m.room || dos.room) ? `${m.room || dos.room} · ${dos.department || dos.licence || m.licence || "department not recorded"}` : "—"}</b><span>room{dos.sublocation ? ` · ${dos.sublocation}` : ""}</span></div>
            <div title="v_package_dossier.lab_state"><b><span className={`pill ${tone(dos.lab_state || m.coa_status)}`}>{dos.lab_state || m.coa_status || "no lab state"}</span></b><span>lab</span></div>
            <div title="v_package_dossier.days_held"><b>{dos.days_held ?? "—"}</b><span>days held</span></div>
            <div title="v_package_dossier.value_at_our_cost"><b>{usd(dos.value_at_our_cost)}</b><span>value at our cost{dos.cost_basis ? ` · ${dos.cost_basis}` : ""}</span></div>
            <div className={gaps.length ? "hot" : ""}><b>{gaps.length}</b><span>gaps</span></div>
            <div className={findings.filter((f) => !f.resolved_at).length ? "hot" : ""}><b>{findings.filter((f) => !f.resolved_at).length}</b><span>open findings</span></div>
            <div style={{ marginLeft: "auto", flexDirection: "row", gap: 6, alignItems: "center" }}>
              {canAssign && <AssignTask key={d.tag} dept="Inventory" kpi={d.tag} value={m.on_hand_lb ?? led.lb_on_hand ?? 0} unit="lb" drill={`package_360:${d.tag}`} />}
              {life.metrc_screen && <a className="btn ghost small" href={life.metrc_screen} target="_blank" rel="noreferrer" title="The legal record — opens Metrc (read-only here)">Open in Metrc</a>}
              <button type="button" className="btn ghost small" onClick={() => { try { navigator.clipboard.writeText(d.tag); } catch { /* clipboard blocked: the tag is visible to copy by hand */ } }}>Copy tag</button>
            </div>
          </div>

          {/* lifecycle — six stages */}
          <Section id="lifecycle" title="Lifecycle">
            <div className="p360-stages">
              {stages.map(([name, on, what, note]) => (
                <div key={name} className={`p360-stage${on ? " on" : ""}`}>
                  <div className="p360-stagename">{name}</div>
                  <div className="p360-stagewhen">{on ? day(on) : <span className="note">not yet</span>}</div>
                  <div className="note wrap">{what || note || ""}</div>
                </div>
              ))}
            </div>
            {life.where_to_audit && <div className="note" style={{ marginTop: 8 }}>Audit: {life.where_to_audit}{life.audit_room ? ` · ${life.audit_room}` : ""}{life.audit_lb != null ? ` · ${num(life.audit_lb, 3)} lb` : ""}</div>}
          </Section>

          <div className="cols2 synccols">
            <Section id="identity" title="Identity & provenance">
              <table className="p360-facts"><tbody>
                <Fact label="Item" src="metrc_packages">{dos.item_name || m.item}</Fact>
                <Fact label="Strain" src="Metrc → COA → manifest (D4)">{orWhy(dos.strain || m.strain, "no single strain — a blend resolves by tag, not name")}</Fact>
                <Fact label="Category" src="metrc_items">{dos.category}{dos.category_type ? ` · ${dos.category_type}` : ""}{dos.department ? ` · ${dos.department}` : ""}</Fact>
                <Fact label="Packaged" src="metrc_packages">{day(dos.packaged_on || m.packaged_on)}</Fact>
                <Fact label="Source harvest" src="tag_event / metrc_harvests" wrap>{orWhy(dos.source_harvest || m.source_harvests, "no harvest recorded on this tag")}{dos.harvest_date ? ` · cut ${day(dos.harvest_date)}` : ""}{dos.drying_room ? ` · dried in ${dos.drying_room}` : ""}</Fact>
                <Fact label="Made from" src="metrc_packages lineage" wrap>{orWhy(dos.made_from_packages || m.source_packages, "no parent packages — created from harvest or received")}{dos.made_from_n_packages ? ` (${dos.made_from_n_packages})` : ""}</Fact>
                <Fact label="Production batch" src="metrc_packages">{orWhy(dos.production_batch, "none")}</Fact>
                <Fact label="Grown / processed by" src="v_tag_provenance" wrap>{orWhy(prov.harvested_by || m.grown_or_processed_by, "not attributed")}{prov.harvested_by_licence ? ` (${prov.harvested_by_licence})` : ""}{prov.manufactured_by ? ` · made by ${prov.manufactured_by}` : ""}</Fact>
                <Fact label="Ownership" src="ownership methodology (7 Aug)">{orWhy(dos.ownership_verdict || m.ownership, "not certified — ownership figures are suspended until certified")}</Fact>
                <Fact label="Received" src="metrc_transfers">{dos.received_on ? `${day(dos.received_on)} from ${dos.received_from || prov.shipped_to_us_by || "—"} · manifest ${dos.arrived_on_manifest || prov.inbound_manifest || "—"}` : <span className="note">not received — originated here</span>}</Fact>
                <Fact label="Quantities" src="metrc_packages">{`created ${num(dos.created_quantity, 3)} · original ${num(dos.original_quantity, 3)} · received ${num(dos.received_quantity, 3)} · consumed ${num(dos.consumed_since_creation, 3)} ${dos.unit_of_measure || ""}`}{dos.weight_basis ? ` · basis ${dos.weight_basis}` : ""}</Fact>
                <Fact label="Flags" src="metrc_packages">{[dos.on_hold && "on hold", dos.on_recall && "on recall", dos.trade_sample && "trade sample", dos.donation && "donation", dos.testing_sample && "testing sample", dos.contains_remediated && "contains remediated", dos.requires_remediation && "requires remediation", dos.on_investigation && "on investigation", dos.production_batch_flag && "production batch"].filter(Boolean).join(" · ") || <span className="note">none</span>}</Fact>
                <Fact label="Dates" src="metrc_packages">{`expires ${day(dos.expiration_date)} · sell by ${day(dos.sell_by_date)} · use by ${day(dos.use_by_date)} · last modified ${day(dos.last_modified)}`}</Fact>
              </tbody></table>
            </Section>

            <Section id="lab" title="Lab & sellability">
              <table className="p360-facts"><tbody>
                <Fact label="Lab state" src="metrc_packages.LabTestingState"><span className={`pill ${tone(dos.lab_state)}`}>{dos.lab_state || "none"}</span>{dos.lab_state_dated ? <span className="note"> · dated {day(dos.lab_state_dated)}</span> : ""}</Fact>
                <Fact label="Certificate" src="coa_extract / v_tag_certificate_final" wrap>
                  {cert.certificate_on_tag || dos.coa_number || m.coa_document
                    ? <>{cert.certificate_on_tag || dos.coa_number}{cert.certificate_hops ? <span className="note"> · inherited {cert.certificate_hops} hop(s) via {cert.certificate_route}</span> : ""}{(dos.coa_document_link || cert.coa_document_link) && <> · <a href={dos.coa_document_link || cert.coa_document_link} target="_blank" rel="noreferrer">open COA</a></>}</>
                    : <span className="note">{ev.why_no_certificate || "no certificate — no COA has been parsed for this tag or its lineage"}</span>}
                </Fact>
                <Fact label="Laboratory" src="coa_extract">{orWhy(dos.laboratory || m.coa_client, "—")}{dos.tested_on ? ` · tested ${day(dos.tested_on)}` : ""}{dos.coa_valid_until ? ` · valid until ${day(dos.coa_valid_until)}` : ""}{dos.certificate_expired ? <span className="syncdanger"> · expired</span> : ""}</Fact>
                <Fact label="Potency" src="coa_extract">{dos.total_thc != null ? `THC ${num(dos.total_thc)} · CBD ${num(dos.total_cbd)} · terpenes ${num(dos.total_terpenes)} · cannabinoids ${num(dos.total_cannabinoids)}` : <span className="note">no analytes — {ev.why_no_certificate || "Metrc's package interface carries no analyte values; the certificate supplies them when parsed"}</span>}</Fact>
                <Fact label="Panels" src="coa_extract" wrap>{dos.tests_run ? `${dos.tests_run} tests · ${dos.tests_failed || 0} failed${dos.failed_analytes ? ` (${dos.failed_analytes})` : ""} · micro ${dos.microbiology || "—"} · myco ${dos.mycotoxins || "—"} · metals ${dos.heavy_metals || "—"} · pesticides ${dos.pesticides || "—"} · solvents ${dos.solvents || "—"} · water activity ${dos.water_activity || "—"}` : <span className="note">no panel results parsed</span>}</Fact>
                <Fact label="Metrc lab rows" src="metrc lab results">{m.metrc_lab_rows ? `${m.metrc_lab_rows} rows · last ${m.metrc_last_test || "—"}${m.metrc_any_fail ? " · a Metrc test failed" : ""}` : <span className="note">none in the mirror</span>}</Fact>
                <Fact label="Sellable" src="derived: in stock + passed + not held">{state === "sellable" ? <span className="pill ok">yes</span> : <span className="pill run">no — {state}</span>}</Fact>
                <Fact label="Evidence grade" src="v_tag_evidence">{orWhy(ev.certificate_grade, "—")}{ev.evidence_source ? ` · ${ev.evidence_source}` : ""}</Fact>
              </tbody></table>
            </Section>
          </div>

          <Section id="timeline" title="Timeline — every event, every source" count={timeline.length}>
            {timeline.length === 0 ? <div className="note">No events recorded for this tag in tag_event or the package events view.</div> : (
              <div className="tablewrap"><table className="syncgrid">
                <thead><tr><th>When</th><th>Event</th><th>Stage</th><th>Where</th><th>Qty</th><th>Manifest</th><th>Counterparty</th><th>Source</th></tr></thead>
                <tbody>{timeline.map((e, i) => (
                  <tr key={i}><td title={e.at}>{when(e.at)}</td><td><span className={`pill ${tone(e.kind)}`}>{e.kind}</span></td><td>{e.stage || "—"}</td><td>{e.where || "—"}</td><td>{e.qty != null ? `${num(e.qty, 3)} ${e.uom || ""}` : "—"}</td><td>{e.manifest || "—"}</td><td className="note">{e.counterparty || "—"}</td><td className="note">{e.source}</td></tr>
                ))}</tbody></table></div>
            )}
          </Section>

          <div className="cols2 synccols">
            <Section id="docs" title="Documents" count={docs.length}>
              {docs.length === 0 ? <div className="note">No COA, manifest or invoice document is linked to this tag. A sellable item must carry its COA and its manifest (rule) — this is a gap until one is attached.</div> : (
                <table className="p360-facts"><tbody>
                  {docs.map((x, i) => (
                    <React.Fragment key={i}>
                      <Fact label="COA" src="v_package_documents">{x.coa_document_link ? <a href={x.coa_document_link} target="_blank" rel="noreferrer">{x.coa_certificate_id || "certificate"}</a> : <span className="note">none — {x.coa_status || "not fetched"}</span>}{x.lab_facility ? ` · ${x.lab_facility}` : ""}{x.coa_result_date ? ` · ${day(x.coa_result_date)}` : ""}</Fact>
                      <Fact label="Manifest" src="v_package_documents">{x.manifest_document_link ? <a href={x.manifest_document_link} target="_blank" rel="noreferrer">{x.manifest_number || x.manifest_no}</a> : orWhy(x.manifest_number, "none — no transfer on this tag")}{x.manifest_direction ? ` · ${x.manifest_direction}` : ""}{x.shipper ? ` · ${x.shipper} → ${x.recipient || "—"}` : ""}</Fact>
                      <Fact label="Apex invoice" src="apex">{x.apex_invoice_no ? `${x.apex_invoice_no} · ${usd(x.apex_invoice_usd)}` : <span className="note">none</span>}</Fact>
                    </React.Fragment>
                  ))}
                </tbody></table>
              )}
            </Section>
            <Section id="money" title="Money">
              <table className="p360-facts"><tbody>
                <Fact label="Value at our cost" src="valuation_rates × quantity">{usd(dos.value_at_our_cost)}{dos.cost_basis ? <span className="note"> · basis {dos.cost_basis}</span> : <span className="note"> · no basis rate set for this category — set it under Valuation rates</span>}</Fact>
                <Fact label="Declared transfer price" src="metrc_transfers">{usd(dos.declared_transfer_price)}</Fact>
                <Fact label="Shipper value" src="v_tag_ledger">{usd(led.shipper_value)}</Fact>
                <Fact label="Apex" src="apex reconciliation" wrap>{apex.length === 0 ? <span className="note">no Apex line for this tag{led.shipped_lb > 0 ? " — shipped but unreconciled" : ""}</span> : apex.map((a, i) => <div key={i}>{a.manifest_number || "—"} · {day(a.shipped_on)} · {a.buyer || "—"} · {num(a.lb, 3)} lb · {a.apex_invoice || "no invoice"} {usd(a.apex_usd)} · {a.payment_status || "—"} · <span className={`pill ${tone(a.verdict)}`}>{a.verdict || "—"}</span></div>)}</Fact>
                <Fact label="Bought as" src="material_purchases">{dos.supplier_name ? `${dos.supplier_name} · ${dos.bought_as || ""}${dos.typical_discount_pct != null ? ` · typical discount ${num(dos.typical_discount_pct)}%` : ""}` : <span className="note">not bought in</span>}</Fact>
                <Fact label="Third party" src="ruling: tracked separately">{prov.harvested_by_ownership && /third|3rd|not ours/i.test(prov.harvested_by_ownership) ? <span className="pill run">third-party material — never revenue</span> : <span className="note">ours, per current attribution</span>}</Fact>
              </tbody></table>
            </Section>
          </div>

          <Section id="gaps" title="Gaps & custody" count={gaps.length + alerts.length}>
            {gaps.length === 0 && alerts.length === 0 ? <div className="note">No gap rule fires on this tag and no custody alert is open.</div> : (
              <div className="tablewrap"><table className="syncgrid">
                <thead><tr><th>Rule</th><th>Severity</th><th>What is wrong</th><th>Required action</th></tr></thead>
                <tbody>
                  {gaps.map((g, i) => <tr key={`g${i}`}><td><code>{g.rule_code}</code> <span className="note">{g.gap_type}</span></td><td><span className={`pill ${tone(g.severity)}`}>{g.severity}</span></td><td className="wrap">{g.what_is_wrong}</td><td className="wrap">{g.required_action}</td></tr>)}
                  {alerts.map((a, i) => <tr key={`a${i}`}><td><code>{a.flag}</code></td><td><span className={`pill ${tone(a.severity)}`}>{a.severity}</span></td><td className="wrap">{a.detail}</td><td className="note">{a.location || "—"}{a.reference_date ? ` · ${day(a.reference_date)}` : ""}</td></tr>)}
                </tbody></table></div>
            )}
          </Section>

          <div className="cols2 synccols">
            <Section id="findings" title="Findings on this tag" count={findings.length}>
              {findings.length === 0 ? <div className="note">No agent finding names this tag.</div> : (
                <div className="tablewrap"><table className="syncgrid">
                  <thead><tr><th>When</th><th>Agent</th><th>Severity</th><th>Finding</th><th>Status</th></tr></thead>
                  <tbody>{findings.map((f) => <tr key={f.id}><td title={f.at}>{ago(f.at)}</td><td>{f.agent}</td><td><span className={`pill ${tone(f.severity)}`}>{f.severity}</span></td><td className="wrap"><b>{f.headline}</b><div className="note">{f.detail}</div></td><td>{f.resolved_at ? <span className="pill ok">resolved</span> : <span className="pill run">open</span>}{f.drill_to && <> · <a href={`#${f.drill_to}`}>open</a></>}</td></tr>)}</tbody></table></div>
              )}
            </Section>
            <Section id="tasks" title="Tasks on this tag" count={tasks.length}>
              {tasks.length === 0 ? <div className="note">No task references this tag. Assign one from the strip above — it captures the on-hand weight as it stands.</div> : (
                <div className="tablewrap"><table className="syncgrid">
                  <thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due</th></tr></thead>
                  <tbody>{tasks.map((t) => <tr key={t.id}><td className="wrap">{t.title}</td><td><span className={`pill ${tone(t.status)}`}>{t.status}</span></td><td>{t.priority}</td><td>{t.assignee || "—"}</td><td>{day(t.due_on)}</td></tr>)}</tbody></table></div>
              )}
            </Section>
          </div>

          <Section id="dwell" title="Where it has been" count={dwell.length}>
            {dwell.length === 0 ? <div className="note">No dwell rows.</div> : (
              <div className="tablewrap"><table className="syncgrid">
                <thead><tr><th>From</th><th>Event</th><th>Location</th><th>Days here</th><th>Next</th></tr></thead>
                <tbody>{dwell.map((w, i) => <tr key={i}><td>{when(w.event_at)}</td><td>{w.event_type}{w.stage ? ` · ${w.stage}` : ""}</td><td>{w.location || "—"}</td><td>{num(w.days_here, 1)}{w.still_open ? <span className="note"> · still here</span> : ""}</td><td className="note">{w.next_type ? `${w.next_type} · ${when(w.next_at)}` : "—"}</td></tr>)}</tbody></table></div>
            )}
          </Section>

          <div className="note p360-foot">Read {ago(d.as_of)} · dossier, lifecycle, gaps and events as of {d.materialised_as_of ? Object.entries(d.materialised_as_of).map(([k, v]) => `${k.replace("mv_", "")} ${ago(v)}`).join(", ") : "—"} (refreshed twice an hour) · live: ledger, master, documents, every tag_event · sources: {(d.sources || []).join(" · ")} · role {role || "…"} — the door is your menu visibility for packages.</div>
        </>
      )}
    </>
  );
}
