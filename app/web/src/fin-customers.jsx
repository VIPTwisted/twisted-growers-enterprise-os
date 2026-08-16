/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOMERS — the account book. Agent B, 15 Aug 2026.
   nav_registry view_key `customers`, Finance › Orders & Customers.

   THIS PAGE IS A DIRECTORY, not a ledger. It reads across accounts rather than
   down a timeline: who we trade with, under which company, how much of it is
   real trade against laboratory samples and custody legs, and — the part that
   is actually urgent — whether anybody here could contact any of them.

   ─────────────────────────────────────────────────────────────────────────────
   THE FINDING THIS PAGE EXISTS TO SURFACE, measured 15 Aug 2026.

   There are TWO customer contact books in this database and the platform's own
   customer directory reads the empty one.

     customers            128 rows · every one carries a state licence
                          0 with an email address, 0 with a phone number,
                          0 with a named contact, 0 with a credit limit,
                          128 with terms_days = 30 — a uniform default on every
                          row, which is a default and not a negotiated term
     facility_contacts    0 rows

   `v_customer_directory` LEFT JOINs facility_contacts for email, ship-to
   address, phone, payment terms, credit limit and the do-not-ship flag. That
   table is empty, so every one of those columns is null on every row, and the
   view's own `record_status` reads "Nothing on file" for every trading partner
   we have. Meanwhile 128 populated rows sit in `customers`, which the directory
   never looks at.

   This page shows BOTH books side by side and joins them on the state licence,
   because that is the only honest thing to do with a duplicated primitive: show
   the split rather than pick a winner. Which of the two is the real one is a
   question for the owner and it is stated as a question, not decided here
   (rule 7 — never assume how the business works, ask).

   Also measured: 209 distinct facility licences have been shipped to on Metrc's
   own wholesale report, and 84 of them have no row in either book.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { rowsOr } from "./App.jsx";
import {
  grab, listOf, DkTag, DkErr, DkEmpty, DkHead, DkDrill, DrillRoot, DkCaret,
  Widget, WidgetBoard, WidgetBarControls, useWidgetLayout, useSectionStore,
  DkNarrative, DkReports, DkTasks,
} from "./dashkit.jsx";
import {
  FinKpiStrip, FinMoney, FinBasis, FinDefect, FinCard, FinActions, FinAnswer,
  FinReading, FinCapped, finReadAll, useFinTargets, useFinRead,
} from "./fin-kit.jsx";

const DEPT = "Finance";
const VIEW_KEY = "customers";
const PAGE_KEY = "fin_customers";

const norm = (v) => String(v ?? "").trim().toUpperCase();
const ymd = (v) => (v ? String(v).slice(0, 10) : null);

/* ═══════════ one account, opened ═══════════
   Everything held about a facility from every source, and where a source holds
   nothing it says which source and why — never a blank cell. */
function AccountDetail({ account, wholesale }) {
  const lines = useMemo(
    () => listOf(wholesale).filter((r) => norm(r.destination_licence) === norm(account.licence)),
    [wholesale, account.licence]);
  const manifests = useMemo(() => {
    const m = new Map();
    for (const r of lines) {
      const g = m.get(r.manifest_number) ?? { manifest_number: r.manifest_number, created_on: r.created_on, lines: 0, value: 0, voided: 0 };
      g.lines += 1;
      if (r.voided) g.voided += 1; else g.value += Number(r.amount ?? 0);
      m.set(r.manifest_number, g);
    }
    return [...m.values()].sort((a, b) => String(b.created_on ?? "").localeCompare(String(a.created_on ?? "")));
  }, [lines]);

  const field = (label, value, absent) => (
    <div className="df">
      <div className="dk">{label}</div>
      <div className="dv">{value ?? <span className="fin-docwhy">{absent}</span>}</div>
    </div>
  );

  return (
    <>
      <FinBasis
        source={`v_customer_directory and the customers table, both filtered to licence ${account.licence}; metrc_rpt_wholesale filtered to the same licence as destination`}
        included={`${manifests.length} priced manifests and ${lines.length} priced lines`} />

      <h4 className="cc-striplabel">What the trading record says</h4>
      <div className="dgrid">
        {field("Facility name on the manifests", account.facility, "No facility name resolved for this licence.")}
        {field("State licence", account.licence, "No licence — this account cannot be identified.")}
        {field("Facility type", account.facility_type, "The licence prefix is not in licence_type_prefix, so the type cannot be resolved. Add the prefix rather than guessing.")}
        {field("Company", account.company, "No company grouping resolved.")}
        {field("Sibling facilities under the same company", account.sibling_facilities, "Not resolved.")}
        {field("Customer sales on the manifest ledger", account.customer_sales, "Not recorded.")}
        {field("Laboratory samples sent here", account.lab_samples, "Not recorded.")}
        {field("First sale", ymd(account.first_sale), "No sale recorded to this facility.")}
        {field("Last sale", ymd(account.last_sale), "No sale recorded to this facility.")}
        {field("Trading status", account.trading_status, "Not resolved — the directory served no status for this row.")}
        {field("Packages shipped", account.packages_shipped, "Not recorded.")}
        {field("Manifests with a document held", account.manifests_with_document, "Not recorded.")}
      </div>

      <h4 className="cc-striplabel">What the contact books hold</h4>
      <div className="dgrid">
        {field("Contact name", account.contact_name ?? account.c_contact_name,
          "No contact name in either book. facility_contacts is empty and the customers row holds none.")}
        {field("Email address", account.email ?? account.c_email,
          "No email address in either book. Nobody can be reached about this account from this platform.")}
        {field("Telephone", account.phone ?? account.c_phone,
          "No telephone number in either book.")}
        {field("Ship-to address", account.ship_to_line1,
          "No ship-to address. facility_contacts holds the address fields and that table is empty.")}
        {field("Payment terms, days", account.terms_days ?? account.c_terms_days,
          "No payment terms recorded in either book.")}
        {field("Credit limit", account.credit_limit ?? account.c_credit_limit,
          "No credit limit recorded in either book.")}
        {field("Row in the customers table", account.in_customers ? "Yes" : null,
          "This facility has been shipped to and has no row in the customers table at all.")}
        {field("Row in facility_contacts", account.email || account.ship_to_line1 ? "Yes" : null,
          "No row — facility_contacts is empty across the whole database, so this is true of every account.")}
      </div>

      <h4 className="cc-striplabel">Every priced manifest to this account</h4>
      {manifests.length === 0
        ? <DkEmpty why="Metrc's wholesale report prices nothing to this licence."
            fills="Either nothing has been sold to them, or what was sent was a laboratory sample or an unpriced transfer. The trading record above says which." />
        : (
          <div className="fin-tablewrap">
            <table className="fin-table">
              <thead><tr><th>Manifest</th><th>Shipped</th><th className="num">Priced lines</th><th className="num">Value</th></tr></thead>
              <tbody>
                {manifests.map((m) => (
                  <tr key={m.manifest_number}>
                    <td>{m.manifest_number}</td>
                    <td>{ymd(m.created_on) ?? <span className="fin-docwhy">No date on the report row.</span>}</td>
                    <td className="num">{m.lines}{m.voided > 0 && <div className="fin-docwhy">{m.voided} voided</div>}</td>
                    <td className="num"><FinMoney cents value={m.value} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>{manifests.length} manifests</td>
                  <td className="num">{lines.length}</td>
                  <td className="num"><FinMoney cents value={manifests.reduce((a, m) => a + m.value, 0)} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
    </>
  );
}

/* ═══════════ the account table ═══════════ */
function AccountTable({ accounts, wholesale, emptyWhy }) {
  const [open, setOpen] = useState(null);
  if (!accounts.length) return <DkEmpty why={emptyWhy} fills="That is a real position from the rows read for this page, not a failed read." />;
  return (
    <div className="fin-tablewrap">
      <table className="fin-table">
        <thead>
          <tr>
            <th>Facility</th><th>Licence</th><th>Type</th><th>Company</th>
            <th>Trading status</th><th>Last sale</th>
            <th className="num">Priced value</th><th>Can we contact them</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <React.Fragment key={a.licence}>
              <tr>
                <td>
                  <button className="fin-rowbtn" aria-expanded={open === a.licence}
                    onClick={() => setOpen(open === a.licence ? null : a.licence)}
                    title={open === a.licence ? "Close this account." : "Open everything held about this account, from every source."}>
                    <DkCaret open={open === a.licence} />{a.facility ?? "facility name not resolved"}
                  </button>
                </td>
                <td>{a.licence}</td>
                <td>{a.facility_type ?? <span className="fin-docwhy">Licence prefix not in the owner&rsquo;s list.</span>}</td>
                <td>{a.company ?? <span className="fin-docwhy">Not grouped.</span>}</td>
                <td>{a.trading_status ?? <span className="fin-docwhy">The directory served no status for this row.</span>}</td>
                <td>{ymd(a.last_sale) ?? <span className="fin-docwhy">No sale recorded.</span>}</td>
                <td className="num">{a.value > 0
                  ? <FinMoney value={a.value} />
                  : <span className="fin-docwhy">Nothing priced to this licence.</span>}</td>
                <td>{(a.email ?? a.c_email)
                  ? (a.email ?? a.c_email)
                  : <span className="fin-docwhy">No — no email address in either contact book.</span>}</td>
              </tr>
              {open === a.licence && (
                <tr>
                  <td colSpan={8}>
                    <DkDrill label={`${a.facility ?? a.licence} — everything held about this account`} onClose={() => setOpen(null)}>
                      <AccountDetail account={a} wholesale={wholesale} />
                    </DkDrill>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6}>{accounts.length.toLocaleString()} accounts — the total is the sum of exactly these rows</td>
            <td className="num"><FinMoney value={accounts.reduce((a, x) => a + x.value, 0)} /></td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ═══════════ companies, with their sibling facilities ═══════════ */
function CompanyBand({ accounts, wholesale }) {
  const [open, setOpen] = useState(null);
  const companies = useMemo(() => {
    const m = new Map();
    for (const a of accounts) {
      const k = a.company ?? "company not resolved";
      const g = m.get(k) ?? { company: k, facilities: [], value: 0, sales: 0 };
      g.facilities.push(a);
      g.value += a.value;
      g.sales += Number(a.customer_sales ?? 0);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [accounts]);

  if (!companies.length) return <DkEmpty why="No account resolved to a company." />;
  return (
    <>
      <FinBasis source="v_customer_directory's own company_key, which strips the corporate suffix from the facility name"
        included="every facility that has appeared as a counterparty"
        caution="A company is inferred from the facility NAME, not from a corporate registry. Two facilities under one owner with different trading names will not group, and two unrelated facilities with similar names could. It is a grouping aid, not a legal relationship." />
      <div className="fin-cards">
        {companies.map((c) => (
          <FinCard key={c.company} open={open === c.company} onToggle={() => setOpen(open === c.company ? null : c.company)}
            name={c.company}
            sub={`${c.facilities.length} ${c.facilities.length === 1 ? "facility" : "facilities"}`}
            title={open === c.company ? "Close." : `Open every facility trading under ${c.company}.`}
            figures={[
              { k: "priced value", v: c.value, money: true },
              { k: "facilities", v: c.facilities.length },
              { k: "sales on the ledger", v: c.sales.toLocaleString() },
            ]}
            chips={c.facilities.length > 1
              ? <DkTag tone="info" title="More than one licensed facility trades under this name. Credit and terms are usually set at the company, not the facility.">{c.facilities.length} sibling facilities</DkTag>
              : null} />
        ))}
      </div>
      {open && (
        <DkDrill label={`${open} — every facility`} onClose={() => setOpen(null)}>
          <AccountTable accounts={listOf(companies.find((c) => c.company === open)?.facilities)}
            wholesale={wholesale} emptyWhy="No facility under this company." />
        </DkDrill>
      )}
    </>
  );
}

/* ═══════════════════ the page ═══════════════════ */
export default function CustomersPage({ go, session, reports, role, viewAs, onViewAs, isAdmin, viewRoles }) {
  const store = useSectionStore(session?.user?.id, VIEW_KEY);
  const [ver, setVer] = useState(0);
  const [tile, setTile] = useState(null);
  const [q, setQ] = useState("");
  const { targets, trend, err: targetErr } = useFinTargets(DEPT);

  const WIDGETS = useMemo(() => [
    { key: "contactgap", title: "The contact books — two of them, and the directory reads the empty one", span: 2 },
    { key: "accounts", title: "Every account we have traded with", span: 2 },
    { key: "companies", title: "By company — facilities that share an owner", span: 2 },
    { key: "words", title: "In plain words — and signed notes", span: 2 },
    { key: "tasks", title: "Tasks raised from this page", span: 1 },
    { key: "reports", title: "Finance reports — by group", span: 1 },
  ], []);
  const layout = useWidgetLayout(PAGE_KEY, WIDGETS);

  const d = useFinRead(async () => {
    const [dir, cust, tasks, wholesale, fc] = await Promise.all([
      supabase.from("v_customer_directory").select("*"),
      supabase.from("customers").select("id,name,state_license,terms_days,credit_limit,active,contact_name,email,phone,metrc_facility_name,notes"),
      supabase.from("v_dashboard_tasks").select("*"),
      finReadAll("metrc_rpt_wholesale", "manifest_number,destination_licence,destination_facility,amount,voided,created_on"),
      /* THE EMPTY CONTACT BOOK IS READ, NOT ASSERTED. An earlier draft printed a
         literal 0 here because that is what I had measured at the terminal. A
         measurement typed into a page is a fabricated figure the moment the data
         moves, and the whole point of this card is that somebody will eventually
         populate the table. `limit(1)` rather than `head: true` so a refusal
         arrives as a message instead of an indistinguishable null. */
      supabase.from("facility_contacts").select("facility_licence", { count: "exact" }).limit(1),
    ]);
    return {
      dir: grab(dir), cust: grab(cust), tasks: grab(tasks), wholesale,
      contacts: fc.error ? { count: null, err: fc.error.message }
        : fc.count == null ? { count: null, err: "No count came back and no error was given." }
        : { count: Number(fc.count), err: null },
    };
  }, [], ver);

  if (d === null) return <div className="finpage"><FinReading what="the customer directory and both contact books" /></div>;

  /* ── the join. Licence is the identity; a name is not. ─────────────────────
     Three populations are merged on the state licence: the directory (trading
     reality from the manifests), the customers table (the populated contact
     book), and every destination licence that appears on the wholesale report.
     A facility present in only one of the three is not dropped — it is carried
     with the sources it is missing from named on its row. */
  const custByLic = new Map(d.cust.rows.map((r) => [norm(r.state_license), r]));
  const valueByLic = new Map();
  const nameByLic = new Map();
  for (const r of d.wholesale.rows) {
    const k = norm(r.destination_licence);
    if (!k) continue;
    if (!r.voided) valueByLic.set(k, (valueByLic.get(k) ?? 0) + Number(r.amount ?? 0));
    else if (!valueByLic.has(k)) valueByLic.set(k, 0);
    if (r.destination_facility && !nameByLic.has(k)) nameByLic.set(k, r.destination_facility);
  }

  const keys = new Set([
    ...d.dir.rows.map((r) => norm(r.facility_licence)),
    ...d.cust.rows.map((r) => norm(r.state_license)),
    ...valueByLic.keys(),
  ].filter(Boolean));

  const accounts = [...keys].map((k) => {
    const dir = d.dir.rows.find((r) => norm(r.facility_licence) === k) ?? {};
    const c = custByLic.get(k) ?? null;
    return {
      licence: dir.facility_licence ?? c?.state_license ?? k,
      facility: dir.facility ?? c?.metrc_facility_name ?? c?.name ?? nameByLic.get(k) ?? null,
      facility_type: dir.facility_type ?? null,
      company: dir.company ?? null,
      sibling_facilities: dir.sibling_facilities ?? null,
      customer_sales: dir.customer_sales ?? null,
      lab_samples: dir.lab_samples ?? null,
      first_sale: dir.first_sale ?? null,
      last_sale: dir.last_sale ?? null,
      trading_status: dir.trading_status ?? null,
      packages_shipped: dir.packages_shipped ?? null,
      manifests_with_document: dir.manifests_with_document ?? null,
      email: dir.email ?? null, phone: dir.phone ?? null, contact_name: dir.contact_name ?? null,
      ship_to_line1: dir.ship_to_line1 ?? null, terms_days: dir.terms_days ?? null,
      credit_limit: dir.credit_limit ?? null,
      c_email: c?.email ?? null, c_phone: c?.phone ?? null, c_contact_name: c?.contact_name ?? null,
      c_terms_days: c?.terms_days ?? null, c_credit_limit: c?.credit_limit ?? null,
      in_customers: Boolean(c),
      in_directory: Boolean(dir.facility_licence),
      value: valueByLic.get(k) ?? 0,
    };
  }).sort((a, b) => b.value - a.value);

  const traded = accounts.filter((a) => valueByLic.has(norm(a.licence)));
  const noRecord = traded.filter((a) => !a.in_customers);
  const reachable = accounts.filter((a) => a.email || a.c_email);
  const labs = accounts.filter((a) => a.facility_type === "Independent Testing Laboratory");
  const filtered = q.trim()
    ? accounts.filter((a) => `${a.facility ?? ""} ${a.licence} ${a.company ?? ""} ${a.facility_type ?? ""}`
        .toLowerCase().includes(q.trim().toLowerCase()))
    : accounts;

  const openTasks = d.tasks.rows.filter((t) => t.department === DEPT);
  const T = (k) => tile === k;
  const toggle = (k) => setTile(tile === k ? null : k);

  /* A refused read is not zero. Each tile names the read it cannot survive
     without, and FinKpiStrip prints the reason in place of a figure. */
  const wUnknown = d.wholesale.err && `Metrc's wholesale report could not be read: ${d.wholesale.err}.`;
  const dirUnknown = d.dir.err && `The customer directory could not be read: ${d.dir.err}.`;
  const custUnknown = d.cust.err && `The customers contact book could not be read: ${d.cust.err}.`;
  const anyUnknown = wUnknown || dirUnknown || custUnknown;

  const tiles = [
    {
      key: "traded", label: "Facilities we have actually shipped priced goods to", value: traded.length, unit: "facilities",
      tone: "plain", open: T("traded"), onOpen: () => toggle("traded"), unknown: wUnknown,
      basis: "Distinct destination licences on metrc_rpt_wholesale. Opens exactly those accounts.",
    },
    {
      key: "norecord", label: "Traded with, and no row in the customer book", value: noRecord.length, unit: "facilities",
      tone: noRecord.length > 0 ? "bad" : "good", open: T("norecord"), onOpen: () => toggle("norecord"),
      /* Needs BOTH sides: without either, the set difference is meaningless
         rather than empty — and "0 customers missing a record" is the most
         reassuring wrong answer this page could give. */
      unknown: wUnknown || custUnknown,
      context: "Goods left the building to a counterparty this platform holds no account record for.",
      basis: "Destination licences on the wholesale report with no matching state_license in the customers table.",
    },
    {
      key: "reachable", label: "Accounts anybody could actually contact", value: reachable.length, unit: "accounts",
      tone: reachable.length === 0 ? "bad" : "plain", open: T("reachable"), onOpen: () => toggle("reachable"),
      unknown: dirUnknown || custUnknown,
      context: "An email address in either contact book. facility_contacts is empty and the customers table holds none.",
      basis: "Accounts with a non-null email in v_customer_directory or in customers.",
    },
    {
      key: "labs", label: "Counterparties that are testing laboratories, not customers", value: labs.length, unit: "laboratories",
      tone: "plain", open: T("labs"), onOpen: () => toggle("labs"), unknown: dirUnknown,
      context: "Samples go to them; they buy nothing. They are separated here so they never inflate a customer count.",
      basis: "Facility type Independent Testing Laboratory, resolved from licence_type_prefix — the owner's own table.",
    },
    {
      key: "all", label: "Accounts on the books in total", value: accounts.length, unit: "accounts",
      tone: "plain", open: T("all"), onOpen: () => toggle("all"), unknown: anyUnknown,
      basis: "The union of v_customer_directory, the customers table and every destination licence on the wholesale report, joined on the state licence.",
    },
  ];

  return (
    <DrillRoot label="Customers">
      <div className="finpage">
        <DkHead title="Customers — the account book" viewKey={VIEW_KEY} dept={DEPT}
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
          object="facility_contacts is empty"
          what="This database holds two customer contact books. v_customer_directory — the view behind this page's directory — reads facility_contacts for email, ship-to address, telephone, payment terms, credit limit and the do-not-ship flag. The customers table holds a separate set of the same fields and the directory never looks at it."
          measured="facility_contacts: 0 rows. customers: 128 rows, every one with a state licence, 0 with an email address, 0 with a telephone number, 0 with a named contact, 0 with a credit limit, and 128 with payment terms of exactly 30 days — a uniform value on every row, which is a default rather than a negotiated term. 209 facility licences have been shipped priced goods and 84 of them have no row in either book."
          instead="This page joins both books on the state licence and shows every account from either, with the sources it is missing from named on its own row. It does not pick a winner between the two books."
          filed="Which of the two books is the real one is an owner decision, not a front-end one, and it is raised as a question rather than answered here. Nobody can contact a single customer from this platform today; that is the actionable part." />

        {d.dir.err && <DkErr what="The customer directory" err={d.dir.err} />}
        {d.cust.err && <DkErr what="The customers contact book" err={d.cust.err} />}
        {d.wholesale.err && <DkErr what="The Metrc wholesale report" err={d.wholesale.err} />}
        <FinCapped read={d.wholesale} what="The Metrc wholesale report" />

        <FinKpiStrip department={DEPT} tiles={tiles} targets={targets} trend={trend}
          targetErr={targetErr} onAssigned={() => setVer((v) => v + 1)} />

        {T("traded") && (
          <DkDrill label="Every facility we have shipped priced goods to" onClose={() => setTile(null)}>
            <AccountTable accounts={traded} wholesale={d.wholesale.rows} emptyWhy="No priced shipment to any facility." />
          </DkDrill>
        )}
        {T("norecord") && (
          <DkDrill label="Shipped to, and no row in the customer book" onClose={() => setTile(null)}>
            <AccountTable accounts={noRecord} wholesale={d.wholesale.rows}
              emptyWhy="Every facility shipped to has a row in the customers table." />
          </DkDrill>
        )}
        {T("reachable") && (
          <DkDrill label="Accounts with an email address in either book" onClose={() => setTile(null)}>
            <AccountTable accounts={reachable} wholesale={d.wholesale.rows}
              emptyWhy="Not one account in this platform carries an email address. facility_contacts is empty and every one of the 128 customers rows has a null email. Nobody could send an invoice, a certificate or a delivery note from here today." />
          </DkDrill>
        )}
        {T("labs") && (
          <DkDrill label="Testing laboratories — samples go to them, they buy nothing" onClose={() => setTile(null)}>
            <AccountTable accounts={labs} wholesale={d.wholesale.rows}
              emptyWhy="No counterparty resolves to a testing laboratory." />
          </DkDrill>
        )}
        {T("all") && (
          <DkDrill label="Every account on the books, from all three sources" onClose={() => setTile(null)}>
            <AccountTable accounts={accounts} wholesale={d.wholesale.rows} emptyWhy="No account in any source." />
          </DkDrill>
        )}

        <WidgetBoard layout={layout}>
          {layout.list.map((w) => {
            switch (w.key) {
              case "contactgap": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={anyUnknown
                    ? <DkTag tone="crit" title={anyUnknown}>read failed — no counts</DkTag>
                    : <>
                        <DkTag tone="crit">{reachable.length} of {accounts.length} reachable</DkTag>
                        <DkTag tone="attn">{noRecord.length} traded with, no record</DkTag>
                      </>}>
                  <div className="fin-answers">
                    <FinAnswer
                      label="facility_contacts — the book the directory reads"
                      value={d.contacts.count}
                      unknown={d.contacts.err && `The facility_contacts count could not be read: ${d.contacts.err}`}
                      note={d.contacts.count === 0
                        ? "Rows. Every contact column on v_customer_directory is therefore null for every account, and its record_status reads “Nothing on file” for all of them."
                        : "Rows. The directory reads its contact columns from this table."} />
                    <FinAnswer
                      label="customers — the other book"
                      value={d.cust.rows.length}
                      unknown={d.cust.err && `The customers table could not be read: ${d.cust.err}`}
                      note={`${d.cust.rows.filter((r) => r.email).length} carry an email address, ${d.cust.rows.filter((r) => r.phone).length} a telephone number, ${d.cust.rows.filter((r) => r.credit_limit != null).length} a credit limit. ${new Set(d.cust.rows.map((r) => r.terms_days)).size === 1 && d.cust.rows.length > 1 ? `Payment terms are identical on every row (${d.cust.rows[0].terms_days} days), which is a default rather than a negotiated term.` : "Payment terms vary by account."}`} />
                    <FinAnswer
                      label="Shipped to on Metrc's own report"
                      value={traded.length}
                      unknown={wUnknown}
                      note={`Facility licences that have received priced goods. ${noRecord.length.toLocaleString()} of them appear in neither contact book.`} />
                  </div>
                  <div className="fin-neveradd">
                    <b>These are two books for one thing, and this page does not merge them behind your back.</b> Which
                    is the real customer record is an owner decision. Until it is made, an account shows whichever book
                    holds a value and names the one that does not.
                  </div>
                </Widget>
              );
              case "accounts": return (
                <Widget key={w.key} w={w} layout={layout} store={store}
                  chips={anyUnknown
                    ? <DkTag tone="crit" title={anyUnknown}>read failed — the list below is not the account book</DkTag>
                    : <DkTag tone="neutral">{filtered.length.toLocaleString()} shown of {accounts.length.toLocaleString()}</DkTag>}>
                  <div className="fin-filters">
                    <label htmlFor="fin-cust-q">Search facility, licence, company or type</label>
                    <input id="fin-cust-q" className="cc-input fin-search" value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="type any part of a name or a licence" />
                    {q.trim() && (
                      <button className="cc-btn" onClick={() => setQ("")} title="Clear the search and show every account.">clear</button>
                    )}
                    <span className="fin-count">
                      {q.trim()
                        ? `${filtered.length.toLocaleString()} of ${accounts.length.toLocaleString()} accounts match. Nothing is hidden by anything except this search box.`
                        : `All ${accounts.length.toLocaleString()} accounts shown.`}
                    </span>
                  </div>
                  <FinBasis source="v_customer_directory, the customers table and metrc_rpt_wholesale destination licences, joined on the state licence"
                    included="every facility present in any of the three"
                    caution="Identity here is the state licence, never the name. The same company appears under several licences and the same name is spelled several ways across Metrc's own records." />
                  <AccountTable accounts={filtered} wholesale={d.wholesale.rows}
                    emptyWhy={q.trim() ? `Nothing matches “${q}”.` : "No account in any source."} />
                </Widget>
              );
              case "companies": return (
                <Widget key={w.key} w={w} layout={layout} store={store} defaultOpen={false}
                  chips={anyUnknown ? <DkTag tone="crit" title={anyUnknown}>read failed</DkTag> : null}>
                  {anyUnknown
                    ? <DkErr what="The company grouping" err={dirUnknown || custUnknown || wUnknown} />
                    : <CompanyBand accounts={accounts} wholesale={d.wholesale.rows} />}
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
