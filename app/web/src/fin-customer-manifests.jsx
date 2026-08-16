/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOMER MANIFESTS & DOCUMENTS — the document room. Agent B, 15 Aug 2026.
   nav_registry view_key `customer_manifests`, Finance › Orders & Customers.

   THIS PAGE IS A DOCUMENT ROOM. Sales History is a ledger and Customers is a
   directory; this one answers a different question — for any shipment we made,
   can we put the paperwork in front of an inspector, an auditor or a buyer, and
   does what arrived match what left. It is laid out around documents and
   variances, not around money or accounts.

   ─────────────────────────────────────────────────────────────────────────────
   TWO DEFECTS IN THE REGISTERED VIEW, BOTH MEASURED TODAY, BOTH NAMED ON SCREEN.

   1 · v_customer_manifests CANNOT BE READ IN FULL ANY MORE. Four of its columns
       — packages_matched, products_on_manifest, certificate_of_analysis_links
       and packages_with_certificate — are correlated subqueries that match a
       package to a manifest with

           t.raw::text LIKE '%' || p.tag || '%'

       against metrc_packages. That table went from 4,595 rows to 19,417 today,
       so the view now attempts roughly fifty million text comparisons for a
       single full read. `select * from v_customer_manifests` times out; the
       plan is a sequential scan over every transfer for every package. It was
       slow yesterday and it is unusable today, and nothing announced that.

   2 · IT HANDS OUT AN EXPIRING LINK AS IF IT WERE PERMANENT. Its
       manifest_download column returns metrc_documents.download_url — a stored,
       pre-signed URL. All 3,666 stored URLs in this database were signed
       together and expire on one day. Every document button on this page mints
       its link at the moment of the click from storage_path instead, which is
       what DkDocButton does everywhere else in the platform.

   It also repeats the wrong-JSON-depth defect described on the Sales History
   page, so its customer_license, received_on and delivery_status are wrong for
   the same reason.

   WHAT THIS PAGE READS INSTEAD. Metrc's own transfer-manifest report
   (metrc_rpt_transfer_manifests — typed columns, no JSON, reconciles exactly),
   metrc_documents for the stored copies, and Metrc's own package-transfer
   report for the packages on a manifest. Each figure names its source.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { rowsOr } from "./App.jsx";
import {
  grab, listOf, DkTag, DkErr, DkEmpty, DkHead, DkDrill, DrillRoot, DkCaret, DkDocButton,
  Widget, WidgetBoard, WidgetBarControls, useWidgetLayout, useSectionStore,
  TagEvidence, TagEvidenceProvider, DkNarrative, DkReports, DkTasks,
} from "./dashkit.jsx";
import {
  FinKpiStrip, FinQty, FinMoney, FinBasis, FinDefect, FinActions, FinAnswer,
  FinReading, FinCapped, finReadAll, useFinTargets, useFinRead,
} from "./fin-kit.jsx";

const DEPT = "Finance";
const VIEW_KEY = "customer_manifests";
const PAGE_KEY = "fin_customer_manifests";

const ymd = (v) => (v ? String(v).slice(0, 10) : null);

/* METRC SPELLS THE SAME BOOLEAN FOUR WAYS on this report — measured 15 Aug 2026
   across 5,280 rows: "No" 4,137 · "False" 1,062 · "Yes" 69 · "True" 12. Two
   export vintages, two spellings, one meaning. A page testing `=== "Yes"` finds
   69 voided manifests and silently misses 12. Anything that is neither spelling
   is returned as null so the row can SAY it is unreadable rather than be
   quietly counted as not voided. */
function readVoided(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "yes" || s === "true") return true;
  if (s === "no" || s === "false") return false;
  return null;
}

/* The variance columns are TEXT on this table, so a non-numeric value is a real
   possibility. Parsed defensively: a value that is not a number comes back as
   the original string and the row prints it rather than treating it as zero. */
function readVariance(v) {
  if (v === null || v === undefined || String(v).trim() === "") return { n: null, raw: null };
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? { n, raw: String(v) } : { n: null, raw: String(v) };
}

/* ═══════════ every package on one manifest, with its evidence ═══════════ */
function ManifestPackages({ manifest }) {
  const d = useFinRead(async () => {
    const r = await supabase.from("metrc_rpt_package_transfers")
      .select("package_tag,item,category,strain,source_harvest,source_package,shipped_qty,shipped_uom,shipped_lb,received_qty,gross_weight,shipper_wholesale_price,status,received_on")
      .eq("manifest_number", manifest);
    return grab(r);
  }, [manifest], 0);

  if (d === null) return <FinReading what={`the packages on manifest ${manifest}`} />;
  if (d.err) return <DkErr what={`The packages on manifest ${manifest}`} err={d.err} />;
  if (!d.rows.length) {
    return <DkEmpty
      why={`Metrc's package-transfer report holds no package rows for manifest ${manifest}.`}
      fills="That report is loaded from Metrc's own exports. A manifest present on the transfer report but absent from the package report has not had its package detail exported yet — it is a gap in the import, not an empty shipment." />;
  }
  const tags = d.rows.map((r) => r.package_tag).filter(Boolean);
  return (
    <TagEvidenceProvider tags={tags}>
      <FinBasis source={`metrc_rpt_package_transfers filtered to manifest ${manifest}`}
        included={`all ${d.rows.length} package rows`}
        excluded="nothing" />
      <div className="fin-tablewrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Package tag</th><th>Item</th><th>Category</th><th>Cultivar</th>
              <th>Came from</th><th className="num">Shipped</th><th className="num">Received</th>
              <th className="num">Price</th><th>Status</th>
              <th>Certificate of Analysis and manifest</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r, i) => (
              <tr key={(r.package_tag ?? "no-tag") + i}>
                <td>{r.package_tag ?? <span className="fin-docwhy">No package tag on this row of Metrc&rsquo;s report.</span>}</td>
                <td>{r.item ?? <span className="fin-docwhy">Item not recorded.</span>}</td>
                <td>{r.category ?? <span className="fin-docwhy">Category not recorded.</span>}</td>
                <td>{r.strain ?? <span className="fin-docwhy">No single cultivar — a blend has none, and identity is the tag.</span>}</td>
                <td>{r.source_harvest ?? r.source_package ?? <span className="fin-docwhy">Neither a source harvest nor a source package is named.</span>}</td>
                <td className="num"><FinQty qty={r.shipped_qty} uom={r.shipped_uom} /></td>
                <td className="num">{r.received_qty == null
                  ? <span className="fin-docwhy">Receipt not recorded against this package.</span>
                  : <FinQty qty={r.received_qty} uom={r.shipped_uom} />}</td>
                <td className="num">{r.shipper_wholesale_price == null
                  ? <span className="fin-docwhy">No price on this package row.</span>
                  : <FinMoney cents value={r.shipper_wholesale_price} />}</td>
                <td>{r.status ?? <span className="fin-docwhy">Status not recorded.</span>}</td>
                <td>{r.package_tag
                  ? <TagEvidence tag={r.package_tag} compact />
                  : <span className="fin-docwhy">No tag on this row, so no certificate or manifest can be resolved for it.</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TagEvidenceProvider>
  );
}

/* ═══════════ the document row: the copies held for one manifest ═══════════ */
function DocumentCell({ docs }) {
  const manifestDocs = listOf(docs).filter((x) => x.doc_type === "manifest");
  const withPath = manifestDocs.filter((x) => x.storage_path);
  if (!manifestDocs.length) {
    return (
      <span className="fin-docwhy">
        No copy of this manifest has been fetched from Metrc. The overnight document job pulls them;
        this one has not been pulled or the pull failed.
      </span>
    );
  }
  if (!withPath.length) {
    const err = manifestDocs.find((x) => x.fetch_error)?.fetch_error;
    return (
      <span className="fin-docwhy">
        A document record exists for this manifest but no file is stored against it
        {err ? <> — the fetch reported: {err}</> : <>, and the fetch recorded no error saying why</>}.
      </span>
    );
  }
  return (
    <span className="fin-docrow">
      {withPath.map((x) => (
        <DkDocButton key={x.id} path={x.storage_path} label="Manifest"
          title="Opens the stored copy of this manifest. The link is signed at the moment you press it and lasts five minutes — no stored link is used, because every stored link in this database expires on one day." />
      ))}
    </span>
  );
}

/* ═══════════ the manifest table ═══════════ */
function ManifestTable({ rows, docsByManifest, emptyWhy }) {
  const [open, setOpen] = useState(null);
  if (!rows.length) return <DkEmpty why={emptyWhy} fills="That is a real position from the rows read for this page, not a failed read." />;
  return (
    <div className="fin-tablewrap">
      <table className="fin-table">
        <thead>
          <tr>
            <th>Manifest</th><th>Shipped</th><th>Received</th><th>Went to</th><th>Their type</th>
            <th className="num">Packages</th><th className="num">Count difference</th>
            <th className="num">Weight difference</th><th>Voided</th><th>Paperwork</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const cv = readVariance(m.count_variance);
            const wv = readVariance(m.weight_variance);
            const voided = readVoided(m.voided);
            return (
              <React.Fragment key={m.manifest_number}>
                <tr>
                  <td>
                    <button className="fin-rowbtn" aria-expanded={open === m.manifest_number}
                      onClick={() => setOpen(open === m.manifest_number ? null : m.manifest_number)}
                      title={open === m.manifest_number ? "Close this manifest." : "Open every package on this manifest, each with its certificate and its manifest."}>
                      <DkCaret open={open === m.manifest_number} />{m.manifest_number}
                    </button>
                  </td>
                  <td>{ymd(m.created_on) ?? <span className="fin-docwhy">No ship date on the report row.</span>}</td>
                  <td>{ymd(m.received_on) ?? <span className="fin-docwhy">Not recorded as received.</span>}</td>
                  <td>{m.destination_facility ?? <span className="fin-docwhy">Destination not named on the report.</span>}
                    {m.destination_licence && <div className="fin-docwhy">licence {m.destination_licence}</div>}</td>
                  <td>{m.destination_type ?? <span className="fin-docwhy">Metrc recorded no facility type.</span>}</td>
                  <td className="num">{m.packages == null
                    ? <span className="fin-docwhy">Not recorded.</span>
                    : Number(m.packages).toLocaleString()}</td>
                  <td className="num">{cv.raw === null
                    ? <span className="fin-docwhy">Not recorded.</span>
                    : cv.n === null
                      ? <span className="fin-docwhy">Recorded as &ldquo;{cv.raw}&rdquo;, which is not a number.</span>
                      : cv.n === 0 ? "none" : cv.n.toLocaleString()}</td>
                  <td className="num">{wv.raw === null
                    ? <span className="fin-docwhy">Not recorded.</span>
                    : wv.n === null
                      ? <span className="fin-docwhy">Recorded as &ldquo;{wv.raw}&rdquo;, which is not a number.</span>
                      : wv.n === 0 ? "none" : wv.n.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                  <td>{voided === null
                    ? <span className="fin-docwhy">Recorded as &ldquo;{String(m.voided)}&rdquo;, which is neither yes nor no.</span>
                    : voided ? "Voided" : "No"}</td>
                  <td><DocumentCell docs={docsByManifest.get(m.manifest_number)} /></td>
                </tr>
                {open === m.manifest_number && (
                  <tr>
                    <td colSpan={10}>
                      <DkDrill label={`Manifest ${m.manifest_number} — every package, with its certificate and its manifest`}
                        onClose={() => setOpen(null)}>
                        <ManifestPackages manifest={m.manifest_number} />
                      </DkDrill>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr><td colSpan={10}>{rows.length.toLocaleString()} manifests — every one of them, nothing sampled and nothing cut.</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ═══════════════════ the page ═══════════════════ */
export default function CustomerManifestsPage({ go, session, reports, role, viewAs, onViewAs, isAdmin, viewRoles }) {
  const store = useSectionStore(session?.user?.id, VIEW_KEY);
  const [ver, setVer] = useState(0);
  const [tile, setTile] = useState(null);
  const [q, setQ] = useState("");
  const { targets, trend, err: targetErr } = useFinTargets(DEPT);

  const WIDGETS = useMemo(() => [
    { key: "manifests", title: "Every outbound manifest, with the paperwork held for it", span: 2 },
    { key: "variance", title: "What arrived did not match what left", span: 2 },
    { key: "words", title: "In plain words — and signed notes", span: 2 },
    { key: "tasks", title: "Tasks raised from this page", span: 1 },
    { key: "reports", title: "Finance reports — by group", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);

  const d = useFinRead(async () => {
    const [man, docs, tasks] = await Promise.all([
      finReadAll("metrc_rpt_transfer_manifests",
        "manifest_number,direction,transfer_type,origin_licence,origin_facility,destination_licence," +
        "destination_facility,destination_type,packages,shipped_count,received_count,count_variance," +
        "shipped_weight,received_weight,weight_variance,created_on,received_on,voided,licence,invoice_number",
        (q2) => q2.eq("direction", "outbound").order("created_on", { ascending: false, nullsFirst: false })),
      finReadAll("metrc_documents", "id,doc_type,manifest_number,package_tag,storage_path,fetch_error,byte_size"),
      supabase.from("v_dashboard_tasks").select("*"),
    ]);
    return { man, docs, tasks: grab(tasks) };
  }, [], ver);

  if (d === null) return <div className="finpage"><FinReading what="every outbound manifest and every document held" /></div>;

  /* One row per manifest. The report carries a row per licence, so an internal
     move between our own two licences appears twice; deduplicating on the
     manifest number is what makes the count on the tile the count in the list. */
  const byManifest = new Map();
  for (const r of d.man.rows) if (!byManifest.has(r.manifest_number)) byManifest.set(r.manifest_number, r);
  const manifests = [...byManifest.values()];

  const docsByManifest = new Map();
  for (const x of d.docs.rows) {
    if (!x.manifest_number) continue;
    const a = listOf(docsByManifest.get(x.manifest_number));
    a.push(x);
    docsByManifest.set(x.manifest_number, a);
  }
  const hasCopy = (m) => listOf(docsByManifest.get(m.manifest_number))
    .some((x) => x.doc_type === "manifest" && x.storage_path);

  const withCopy = manifests.filter(hasCopy);
  const withoutCopy = manifests.filter((m) => !hasCopy(m));
  const coaCount = d.docs.rows.filter((x) => x.doc_type === "coa" && x.storage_path).length;
  const countOff = manifests.filter((m) => { const v = readVariance(m.count_variance); return v.n !== null && v.n !== 0; });
  const weightOff = manifests.filter((m) => { const v = readVariance(m.weight_variance); return v.n !== null && v.n !== 0; });
  const voidedMan = manifests.filter((m) => readVoided(m.voided) === true);
  const unreadableVoided = manifests.filter((m) => readVoided(m.voided) === null);

  const filtered = q.trim()
    ? manifests.filter((m) => `${m.manifest_number} ${m.destination_facility ?? ""} ${m.destination_licence ?? ""} ${m.invoice_number ?? ""}`
        .toLowerCase().includes(q.trim().toLowerCase()))
    : manifests;

  const openTasks = d.tasks.rows.filter((t) => t.department === DEPT);
  const T = (k) => tile === k;
  const toggle = (k) => setTile(tile === k ? null : k);

  /* A refused read is not zero. Every tile here needs BOTH the manifest report
     and the document index; with either missing, "0 manifests with no copy held"
     is the most reassuring wrong answer this page could give. */
  const manUnknown = d.man.err && `Metrc's outbound manifest report could not be read: ${d.man.err}.`;
  const docUnknown = d.docs.err && `The stored document index could not be read: ${d.docs.err}.`;

  const tiles = [
    {
      key: "copy", label: "Outbound manifests with a copy of the paperwork held", value: withCopy.length, unit: "manifests",
      tone: "good", open: T("copy"), onOpen: () => toggle("copy"), unknown: manUnknown || docUnknown,
      basis: "metrc_documents rows of type manifest that carry a storage path, matched to Metrc's own outbound manifest report.",
    },
    {
      key: "nocopy", label: "Outbound manifests with no copy held", value: withoutCopy.length, unit: "manifests",
      tone: withoutCopy.length > 0 ? "bad" : "good", open: T("nocopy"), onOpen: () => toggle("nocopy"),
      unknown: manUnknown || docUnknown,
      context: "Nothing to hand an inspector for these shipments without going back into Metrc.",
      basis: "Outbound manifests with no metrc_documents row of type manifest carrying a storage path. Each row states which of the two reasons applies.",
    },
    {
      key: "coa", label: "Certificates of Analysis stored in the platform", value: coaCount, unit: "certificates",
      tone: "plain", open: T("coa"), onOpen: () => toggle("coa"), unknown: docUnknown,
      context: "Held against a package tag, so any manifest carrying that package can produce it.",
      basis: "metrc_documents rows of type coa that carry a storage path.",
    },
    {
      key: "countoff", label: "Manifests where the package count received differs", value: countOff.length, unit: "manifests",
      tone: countOff.length > 0 ? "bad" : "good", open: T("countoff"), onOpen: () => toggle("countoff"),
      unknown: manUnknown,
      context: "A different number of packages arrived from the number that left. Every one is a real exception.",
      basis: "metrc_rpt_transfer_manifests.count_variance, parsed from text, where it is a number other than zero.",
    },
    {
      key: "weightoff", label: "Manifests where the weight received differs", value: weightOff.length, unit: "manifests",
      tone: weightOff.length > 0 ? "warn" : "good", open: T("weightoff"), onOpen: () => toggle("weightoff"),
      unknown: manUnknown,
      context: "The receiver weighed it differently from us. Small differences are scales; large ones are not.",
      basis: "metrc_rpt_transfer_manifests.weight_variance, parsed from text, where it is a number other than zero.",
    },
  ];

  return (
    <DrillRoot label="Customer manifests">
      <div className="finpage">
        <DkHead title="Customer manifests and documents" viewKey={VIEW_KEY} dept={DEPT}
          role={role} viewAs={viewAs} computed={null} busy={false} />

        <div className="cc-tools">
          <div className="cc-tools-l">
            <button className="cc-btn" onClick={() => store.setAll(WIDGETS.map((w) => w.key), false)}
              title="Collapse every section — remembered for you on this device.">− collapse all</button>
            <button className="cc-btn" onClick={() => store.setAll(WIDGETS.map((w) => w.key), true)}
              title="Expand every section.">+ expand all</button>
            <WidgetBarControls layout={layout} />
            {isAdmin && (
              <select className="cc-input cc-viewsel" value={viewAs ?? ""}
                aria-label="View this page as another role — presentation preview only"
                onChange={(e) => onViewAs(e.target.value || null)}>
                <option value="">view as…</option>
                {rowsOr(viewRoles).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
          </div>
          <FinActions onReread={() => setVer((v) => v + 1)} busy={false} go={go} />
        </div>

        <FinDefect
          object="v_customer_manifests"
          what="The view this page is registered against can no longer be read in full, and it hands out an expiring link as if it were permanent. Four of its columns match packages to manifests with a text LIKE against every row of metrc_packages, and one of its columns returns a pre-signed URL that was stored months ago."
          measured="metrc_packages went from 4,595 rows to 19,417 today, so a single full read of the view now attempts roughly fifty million text comparisons and times out — measured, not estimated. Separately, all 3,666 stored download links in metrc_documents were signed together and expire on one day."
          instead="Every figure here is read from Metrc's own transfer-manifest report, which has typed columns and no JSON, and from metrc_documents. Every document button mints its own signed link at the moment you press it and it lasts five minutes; no stored link is used anywhere on this page."
          filed="Both are database changes and this lane holds no write. They are filed with the database owner with the measurements above." />

        {d.man.err && <DkErr what="Metrc's outbound manifest report" err={d.man.err} />}
        {d.docs.err && <DkErr what="The stored documents" err={d.docs.err} />}
        <FinCapped read={d.man} what="Metrc's outbound manifest report" />
        <FinCapped read={d.docs} what="The stored document index" />
        {unreadableVoided.length > 0 && (
          <div className="fin-more">
            <b>{unreadableVoided.length} manifests record a voided state this page cannot read.</b> Metrc&rsquo;s
            report spells the same boolean four ways across two export vintages — &ldquo;Yes&rdquo;,
            &ldquo;True&rdquo;, &ldquo;No&rdquo; and &ldquo;False&rdquo;. Anything that is none of those is shown
            on the row as the raw value rather than counted as not voided.
          </div>
        )}

        <FinKpiStrip department={DEPT} tiles={tiles} targets={targets} trend={trend}
          targetErr={targetErr} onAssigned={() => setVer((v) => v + 1)} />

        {T("copy") && (
          <DkDrill label="Every outbound manifest with a stored copy" onClose={() => setTile(null)}>
            <ManifestTable rows={withCopy} docsByManifest={docsByManifest} emptyWhy="No manifest has a stored copy." />
          </DkDrill>
        )}
        {T("nocopy") && (
          <DkDrill label="Outbound manifests with no copy held" onClose={() => setTile(null)}>
            <ManifestTable rows={withoutCopy} docsByManifest={docsByManifest}
              emptyWhy="Every outbound manifest has a stored copy. Nothing is missing." />
          </DkDrill>
        )}
        {T("coa") && (
          <DkDrill label="Every Certificate of Analysis stored in the platform" onClose={() => setTile(null)}>
            <FinBasis source="metrc_documents where the document type is coa and a storage path is held"
              included={`all ${coaCount.toLocaleString()} stored certificates`}
              caution="A certificate is held against a PACKAGE TAG, not against a manifest. A manifest can produce a certificate for any package on it, including one inherited from a parent package — which is why the certificate appears on the package row inside a manifest rather than on the manifest itself." />
            <div className="fin-tablewrap">
              <table className="fin-table">
                <thead><tr><th>Package tag</th><th>Certificate</th><th>File size</th></tr></thead>
                <tbody>
                  {d.docs.rows.filter((x) => x.doc_type === "coa" && x.storage_path).map((x) => (
                    <tr key={x.id}>
                      <td>{x.package_tag ?? <span className="fin-docwhy">This certificate is stored against no package tag, so nothing can resolve it to a shipment.</span>}</td>
                      <td><DkDocButton path={x.storage_path} label="Certificate of Analysis"
                        title="Opens the stored certificate. The link is signed at the moment you press it." /></td>
                      <td className="num">{x.byte_size == null
                        ? <span className="fin-docwhy">Size not recorded.</span>
                        : `${Math.round(Number(x.byte_size) / 1024).toLocaleString()} kilobytes`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DkDrill>
        )}
        {T("countoff") && (
          <DkDrill label="Manifests where a different number of packages arrived" onClose={() => setTile(null)}>
            <ManifestTable rows={countOff} docsByManifest={docsByManifest}
              emptyWhy="Every outbound manifest was received with exactly the number of packages that left." />
          </DkDrill>
        )}
        {T("weightoff") && (
          <DkDrill label="Manifests where the weight received differs from the weight shipped" onClose={() => setTile(null)}>
            <ManifestTable rows={weightOff} docsByManifest={docsByManifest}
              emptyWhy="No outbound manifest shows a weight difference." />
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            switch (w.key) {
              case "manifests": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={(manUnknown || docUnknown)
                    ? <DkTag tone="crit" title={manUnknown || docUnknown}>read failed — no counts</DkTag>
                    : <>
                        <DkTag tone="neutral">{manifests.length.toLocaleString()} outbound manifests</DkTag>
                        <DkTag tone={withoutCopy.length ? "crit" : "ok"}>{withoutCopy.length.toLocaleString()} with no copy held</DkTag>
                        {voidedMan.length > 0 && <DkTag tone="attn">{voidedMan.length} voided</DkTag>}
                      </>}>
                  <div className="fin-filters">
                    <label htmlFor="fin-man-q">Search manifest number, destination or invoice number</label>
                    <input id="fin-man-q" className="cc-input fin-search" value={q}
                      onChange={(e) => setQ(e.target.value)} placeholder="type any part of it" />
                    {q.trim() && <button className="cc-btn" onClick={() => setQ("")} title="Clear the search and show every manifest.">clear</button>}
                    <span className="fin-count">
                      {q.trim()
                        ? `${filtered.length.toLocaleString()} of ${manifests.length.toLocaleString()} manifests match.`
                        : `All ${manifests.length.toLocaleString()} outbound manifests shown — nothing is paged away.`}
                    </span>
                  </div>
                  <FinBasis source="metrc_rpt_transfer_manifests where the direction is outbound, one row per manifest"
                    included="every outbound manifest Metrc's own report holds"
                    caution="The report carries one row per licence, so a move between our own two licences appears twice in it. Rows are reduced to one per manifest number here, which is why this count is lower than the report's own row count." />
                  <ManifestTable rows={filtered} docsByManifest={docsByManifest}
                    emptyWhy={q.trim() ? `Nothing matches “${q}”.` : "Metrc's outbound manifest report holds no rows."} />
                </Widget>
              );
              case "variance": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={manUnknown
                    ? <DkTag tone="crit" title={manUnknown}>read failed — no counts</DkTag>
                    : <>
                        <DkTag tone={countOff.length ? "crit" : "ok"}>{countOff.length} count differences</DkTag>
                        <DkTag tone={weightOff.length ? "attn" : "ok"}>{weightOff.length} weight differences</DkTag>
                      </>}>
                  <FinBasis source="metrc_rpt_transfer_manifests count_variance and weight_variance, both stored as text and parsed here"
                    included="outbound manifests only"
                    caution="These two are never combined into one number. A package-count difference means something did not arrive; a weight difference usually means two scales disagreed. They are different problems with different owners." />
                  <div className="fin-answers">
                    <FinAnswer label="Packages: a different number arrived" value={countOff.length}
                      unknown={manUnknown}
                      note="Press the tile above to open every one. Each opens further to the packages on the manifest, with each tag's certificate and manifest on its row." />
                    <FinAnswer label="Weight: the receiver weighed it differently" value={weightOff.length}
                      unknown={manUnknown}
                      note="Shown as recorded. No tolerance is applied, because nobody has set one — a tolerance is an owner decision and this page will not invent a threshold to hide rows behind." />
                  </div>
                </Widget>
              );
              case "words": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}>
                  <DkNarrative page={PAGE_KEY} range={{ from: "", to: "" }} role={role} session={session} go={go} />
                </Widget>
              );
              case "tasks": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={d.tasks.err ? <DkTag tone="crit">read failed</DkTag> : <DkTag tone="neutral">{openTasks.length} open</DkTag>}>
                  {d.tasks.err ? <DkErr what="The task list" err={d.tasks.err} /> : <DkTasks tasks={d.tasks.rows} dept={DEPT} go={go} />}
                </Widget>
              );
              case "reports": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}>
                  <DkReports reports={reports} dept={DEPT} go={go} />
                </Widget>
              );
              default: return null;
            }
          })}
        </WidgetBoard>
      </div>
    </DrillRoot>
  );
}
