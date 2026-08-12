-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-007 (reviewers V, X, W).
-- Owner directive: every agent and every guard works to the standard of the most elite IRS
-- and Cannabis Control Commission examiners in the country.
--
-- WHY THIS TABLE EXISTS. The platform already has a rigorous conformance system - 55 checkers
-- with both-halves fixtures, an append-only conformance_ledger, policy_registry, audit_journal,
-- v_auditor_verdict. Every one of them measures us against OUR OWN rules. Not one maps to an
-- external examining authority. That is the gap: we can prove we followed our process and we
-- cannot yet prove we would survive an examination.
--
-- The two examiners differ in what they want and agree on the discipline:
--   IRS - under IRC 280E a cannabis business deducts almost nothing except cost of goods sold,
--         so COGS is the whole battleground and it must be substantiated to inventory-costing
--         standards. The burden of proof is on the taxpayer. An estimate is not evidence.
--   CCC - under the Massachusetts regulations the legal record is seed-to-sale: every plant
--         tagged, every package traceable, every transfer manifested, every disposal witnessed,
--         and inventory reconciled with discrepancies reported.
-- Both share the rule this whole platform is built on: IF YOU CANNOT PRODUCE THE DOCUMENT,
-- IT DID NOT HAPPEN. A number without a source is a number against you.
--
-- CITATIONS ARE UNVERIFIED UNTIL READ AT SOURCE. Every citation below is written from
-- knowledge, not from opening the statute or the CMR. An elite auditor never relies on a
-- remembered cite, so citation_status defaults to 'unverified' and NO citation here may be
-- quoted to a regulator, an accountant or a lawyer until someone reads the primary source and
-- promotes it. The TEST is useful immediately; the CITE is not evidence yet. This distinction
-- is the difference between a control and a liability.
--
-- UNDO: drop view v_examination_readiness; drop table examination_standard;

create table if not exists examination_standard (
  test_key          text primary key,
  authority         text not null check (authority in ('IRS','CCC','BOTH')),
  area              text not null,
  the_question      text not null,
  evidence_required text not null,
  where_it_lives    text,
  consequence       text not null,
  citation          text,
  citation_status   text not null default 'unverified'
                    check (citation_status in ('unverified','verified_primary_source','withdrawn')),
  control_key       text,
  severity          text not null check (severity in ('critical','elevated','watch')),
  added_on          date not null default current_date
);

alter table examination_standard enable row level security;

comment on table examination_standard is
 'What an elite IRS or Cannabis Control Commission examiner would actually ask for, as rows. '
 'One row per test. the_question is what they ask; evidence_required is what we must hand over; '
 'where_it_lives is the table or view that holds it, or NULL when nothing does - a NULL there is '
 'the finding. control_key links the test to the automated check that keeps it true. '
 'CITATIONS ARE UNVERIFIED BY DEFAULT and must not be quoted externally until read at source.';

comment on column examination_standard.citation_status is
 'unverified = written from knowledge, NOT yet read at primary source, NOT quotable to any '
 'regulator, accountant or lawyer. verified_primary_source = someone opened the statute or the '
 'CMR, confirmed the text and the subsection, and recorded it. withdrawn = checked and wrong.';

comment on column examination_standard.where_it_lives is
 'The relation that holds the evidence. NULL means we cannot currently produce this document at '
 'all - which is not a gap in the table, it is a gap in the company.';

insert into examination_standard
 (test_key, authority, area, the_question, evidence_required, where_it_lives, consequence, citation, control_key, severity) values

-- ─────────────────────────── IRS · the 280E battleground ───────────────────────────
('irs-280e-only-cogs','IRS','Deductibility',
 'Show me every amount you deducted and prove each one is cost of goods sold rather than an operating expense.',
 'A COGS computation that ties to inventory, with every component traceable to a source document. Selling, general and administrative costs separated and NOT deducted.',
 null,
 'Disallowance of every non-COGS deduction, tax on gross profit rather than net income, plus accuracy-related penalty. This is the single largest tax exposure a cannabis company carries.',
 'IRC 280E; CHAMP v. Commissioner, 128 T.C. 173 (2007)', null, 'critical'),

('irs-471-inventory-costing','IRS','Inventory costing',
 'Which costs did you capitalise into inventory, and under which method? Show the computation for one unit.',
 'A written, consistently applied costing method, and for a producer the absorption of direct materials, direct labour and allocable indirect production costs into units.',
 'cost_tracking_policy',
 'Recomputation of inventory by the examiner on their assumptions, which will not favour us. Inconsistency between years is itself an adjustment.',
 'IRC 471 and the regulations thereunder; Patients Mutual (Harborside), 151 T.C. No. 11 (2018)', null, 'critical'),

('irs-inventory-year-end-count','IRS','Inventory',
 'Show me the physical inventory count at year end and reconcile it to your perpetual records.',
 'A dated physical count, the perpetual balance at the same instant, the variance, and a written explanation of the variance.',
 null,
 'If beginning and ending inventory cannot be substantiated, the COGS deduction that depends on them cannot be sustained.',
 'IRC 471; IRC 6001', null, 'critical'),

('irs-purchase-substantiation','IRS','Purchases',
 'Show me the invoice for this purchased material and prove what you actually paid.',
 'A vendor invoice, the payment record, and the receiving document, tying to the tag that entered inventory.',
 'metrc_transfers / manifest_extract',
 'Unsubstantiated purchases are removed from COGS entirely. A declared wholesale transfer price on a compliance manifest is NOT proof of what was paid, and an examiner will say so.',
 'IRC 6001; IRC 162 substantiation principles as applied through 471', 'third-party-received-has-manifest', 'critical'),

('irs-no-estimates','IRS','Method',
 'This figure is an estimate. What is the source document?',
 'A contemporaneous record created at the time of the transaction, not a reconstruction.',
 'audit_journal',
 'Estimation relief is not available for amounts governed by 280E and 471. An estimated cost is a disallowed cost.',
 'IRC 6001; Cohan doctrine and its limits', null, 'critical'),

('irs-cash-form-8300','IRS','Cash',
 'You are a cash business. Show me the filings for every cash receipt over ten thousand dollars.',
 'Filed information returns for large cash receipts, with the counterparty identified, and a cash log that reconciles to deposits.',
 null,
 'Per-failure penalties, and in a cash industry it is the first thing an examiner tests because it is objective and easy to score.',
 'IRC 6050I / Form 8300', null, 'elevated'),

('irs-related-party','IRS','Related parties',
 'Which of these counterparties are related to you, and were the prices arm''s length?',
 'A related-party register and the basis on which each price was set.',
 null,
 'Reallocation of income and deductions between the related entities, at the examiner''s discretion.',
 'IRC 482', null, 'elevated'),

('irs-books-and-records','IRS','Records',
 'Produce the books and records supporting this return.',
 'Complete records for the period, retained and retrievable, sufficient to establish every item on the return.',
 'audit_journal / conformance_ledger',
 'Inadequate records shifts every doubt against us and supports a penalty on top of the tax.',
 'IRC 6001', null, 'critical'),

-- ─────────────────────── CCC · the seed-to-sale battleground ───────────────────────
('ccc-every-plant-tagged','CCC','Seed to sale',
 'Show me every plant on the premises and its tag. Now show me every tag in the system and the plant it is on.',
 'A two-way reconciliation between physical plants and tracked plants, with no unmatched item in either direction.',
 'metrc_plants / metrc_plant_batches',
 'Untracked plant material is a diversion finding. It is the most serious category of finding a cultivator can receive.',
 '935 CMR 500.105', null, 'critical'),

('ccc-package-traceability','CCC','Seed to sale',
 'Take this finished package and walk it back to the plants it came from.',
 'An unbroken lineage from finished package through every intermediate package to the harvest and the plant tags.',
 'metrc_packages.raw SourcePackageLabels / SourceHarvestNames',
 'A break in lineage means the product cannot be shown to be legally produced, and product that cannot be traced cannot be sold.',
 '935 CMR 500.105', 'third-party-derived-has-parent', 'critical'),

('ccc-inventory-reconciliation','CCC','Inventory',
 'Show me your inventory reconciliations and every discrepancy you found and reported.',
 'Periodic reconciliation of physical to tracked inventory, dated, with the variance, the investigation and the report of any reportable discrepancy.',
 null,
 'Failure to reconcile, or reconciling and not reporting, is treated more seriously than the underlying variance.',
 '935 CMR 500.105', null, 'critical'),

('ccc-transfer-manifests','CCC','Transfers',
 'Show me the manifest for every transfer in and out, with the transporter and both licensees named.',
 'A manifest for every inbound and outbound movement, matching what physically moved, with licence numbers on both ends.',
 'metrc_transfers / manifest_extract / metrc_documents',
 'An unmanifested movement is untracked material leaving or entering the premises - the same category as an untagged plant.',
 '935 CMR 500.105', 'third-party-received-has-manifest', 'critical'),

('ccc-testing-before-sale','CCC','Testing',
 'Prove this product passed required testing before it was sold, and show the certificate.',
 'A certificate of analysis tied to the package tag, dated before the sale, from a licensed laboratory.',
 'coa_extract / v_rpt_coa_compliance / metrc_documents',
 'Sale of untested or failing product is a public-health finding and can suspend the licence.',
 '935 CMR 500.160', null, 'critical'),

('ccc-waste-disposal','CCC','Waste',
 'Show me every gram you destroyed, how, when, who witnessed it, and where it went.',
 'A disposal record per event with quantity, method, date, witnesses and destination, reconciling to the weight removed from inventory.',
 'v_third_party_forensic destroy_rows_verbatim',
 'Undocumented destruction is indistinguishable from diversion on the record, and will be treated as such.',
 '935 CMR 500.105', null, 'critical'),

('ccc-record-retention','CCC','Records',
 'Produce records for the full retention period, including for material long since sold.',
 'Complete retained records for every period, retrievable on request.',
 'all - owner rule: ALL DATA IS KEPT FOREVER, 20+ years, no wipe, truncate, purge or rolling window',
 'Missing historical records prevent the Commission from closing an examination, which keeps it open.',
 '935 CMR 500.105', null, 'elevated'),

('ccc-metrc-is-the-record','CCC','System of record',
 'Where your platform and Metrc disagree, which one is right?',
 'Metrc, always. Evidence that the platform is a read-only mirror and cannot originate a change to the legal record.',
 'ai_write_policy / metrc_sync_runs',
 'A platform that can write to the legal record makes every figure in Metrc arguable. Keeping it read-only is what makes our mirror defensible.',
 '935 CMR 500.105', 'packages-mirror-vs-metrc', 'critical')

on conflict (test_key) do nothing;

create or replace view v_examination_readiness as
select e.test_key, e.authority, e.area, e.severity, e.the_question, e.evidence_required,
       e.where_it_lives, e.consequence, e.citation, e.citation_status,
       e.control_key,
       case
         when e.where_it_lives is null then 'CANNOT PRODUCE — nothing in the platform holds this'
         when e.control_key is null    then 'PRODUCIBLE BUT UNGUARDED — no automated check keeps it true'
         when c.check_key is null      then 'CONTROL NAMED BUT MISSING — control_key does not resolve'
         when not c.enabled            then 'CONTROL DISABLED'
         when upper(coalesce(r.verdict,'')) = 'AGREE' then 'GUARDED AND PASSING'
         when r.verdict is null        then 'CONTROL NEVER RUN'
         else 'CONTROL FAILING'
       end as readiness,
       r.verdict as last_verdict, r.ran_at as last_checked
from examination_standard e
left join verification_checks c on c.check_key = e.control_key
left join lateral (select * from verification_runs vr
                    where vr.check_key = e.control_key
                    order by vr.ran_at desc limit 1) r on true;

comment on view v_examination_readiness is
 'Examination readiness per test. CANNOT PRODUCE is the worst verdict and means no relation in '
 'the platform holds the evidence an examiner would ask for. PRODUCIBLE BUT UNGUARDED means we '
 'have the data today and nothing stops it rotting. Read this before any tax filing, any '
 'Commission correspondence and any year-end close.';;
