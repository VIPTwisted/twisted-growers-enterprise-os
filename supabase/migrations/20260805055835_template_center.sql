-- 0027: Template Center - cannabis/TG-native only, zero generic filler
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('Financial','Planning','Inventory','Production','Sales','Marketing','Compliance','HR')),
  template_type text not null check (template_type in ('space','folder','list','task','doc','view','whiteboard','form')),
  complexity text not null default 'beginner' check (complexity in ('beginner','intermediate','advanced')),
  description text not null,
  content jsonb not null default '{}',
  featured boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table templates enable row level security;
create policy staff_read on templates for select to authenticated using (true);
create policy exec_all on templates for all using (is_executive()) with check (is_executive());
create trigger audit_templates after insert or update or delete on templates
  for each row execute function audit_row();

insert into templates (name, category, template_type, complexity, featured, description, content) values
('Harvest Cycle', 'Production', 'space', 'advanced', true,
 'Full room cycle: flip -> harvest -> dry -> cure -> grade -> test -> package -> FG release, with cadence checks at every gate.',
 '{"checklist":["Confirm flip date + room","Pre-harvest pest/mold walk","Harvest day crew + scale check","Record wet weight per cultivar","Hang/dry log start","Dry-complete weight + moisture","Cure vessels logged","Grade A/B/C/smalls/trim weights","Mass-balance reconciliation","COA sample pulled + submitted","Package + Metrc tags","FG release + planner update"]}'),
('New Production Batch', 'Production', 'list', 'intermediate', true,
 'Stand up a manufacturing batch: BOM pull, allocation request, line setup, fill, QA, package, label, Metrc.',
 '{"checklist":["Create batch code","Request material allocation","Verify COA of inputs","Line setup + changeover clean","Fill run + unit counts","In-process QA checks","Packaging + case counts","Label proof + compliance check","Metrc package tags","Move to FG vault + sheet sync"]}'),
('Room Turnover', 'Production', 'task', 'beginner', false,
 'Post-harvest room reset: teardown, clean, sanitize, IPM, reset benches, ready-for-flip sign-off.',
 '{"checklist":["Teardown + waste log","Deep clean walls/floors/trays","Sanitize + dwell time","IPM preventative application","Equipment check (lights/HVAC/sensors)","Bench reset","Supervisor sign-off"]}'),
('Trim Day Plan', 'Production', 'list', 'beginner', false,
 'Trim crew day: assignments, per-tote custody, weights in/out, waste custody, end-of-day reconciliation.',
 '{"checklist":["Crew + stations assigned","Totes weighed in","Hourly weight checks","Waste bucket custody","Weights out + grade split","Daily mass balance","Metrc adjustments if needed"]}'),
('COA Submission', 'Compliance', 'task', 'beginner', true,
 'Sample pull to lab result: chain of custody, submission, tracking, pass/fail routing.',
 '{"checklist":["Pull sample per SOP + witness","Chain-of-custody form","Lab submission + manifest","Track turnaround vs SLA","Record result + link COA","Pass: release to FG","Fail: quarantine + open CAPA"]}'),
('Metrc Audit Prep', 'Compliance', 'list', 'advanced', true,
 'Inspection-ready in one sweep: tag audit, mass balance, waste logs, manifests, employee badges.',
 '{"checklist":["Physical tag audit vs Metrc","Plan-vs-actual reconciliation review","Waste log completeness","Open manifests review","Badge expirations","Vault counts + 3rd-party confirmations","Audit pack export"]}'),
('Deviation & CAPA', 'Compliance', 'doc', 'intermediate', false,
 'Containment -> root cause -> corrective/preventive -> verification, with owners and dates.',
 '{"sections":["What happened + containment","Root cause (5-why / fishbone)","Corrective action + owner + date","Preventive action + owner + date","Verification of effectiveness","Closure sign-off"]}'),
('Recall Trace Runbook', 'Compliance', 'doc', 'advanced', false,
 'One-click-deep recall walk: lot -> inputs -> outputs -> shipments -> customers, with comms scripts.',
 '{"sections":["Identify affected lot(s)","Trace upstream inputs","Trace downstream packages/shipments","Customer notification list + script","Regulator notification","Quarantine + retrieval log","Post-mortem CAPA"]}'),
('13-Week Cash Plan', 'Financial', 'view', 'advanced', true,
 'Rolling 13-week cash: opening cash, collections, committed PO cash, payroll, overhead, ending runway.',
 '{"columns":["Week","Opening cash","AR collections","Sales receipts","PO payments due","Payroll (loaded)","Overhead","Ending cash","Runway weeks"]}'),
('Vendor Scorecard', 'Financial', 'list', 'intermediate', false,
 'Quarterly supplier review: landed cost trend, on-time %, quality holds, terms - who earns the next PO.',
 '{"checklist":["Pull v_supplier_costs for quarter","On-time delivery %","Quality holds/rejections","Terms + committed cash","BEST COST ranking review","Renew / renegotiate / replace decision"]}'),
('Purchase-to-Cash Review', 'Financial', 'view', 'intermediate', false,
 'Monthly material aging review: days to allocation, capital tied up, ROI per lot.',
 '{"columns":["Lot","Supplier","Purchase date","Landed cost","Days to allocation","Days to cash","ROI %","Aging alert"]}'),
('Weekly S&OP Meeting', 'Planning', 'doc', 'intermediate', true,
 '30-minute weekly: demand vs supply vs capacity, BUILD NOW queue, promise-at-risk, decisions logged.',
 '{"sections":["Last week actuals vs plan","Demand changes","Supply: harvest + inventory position","BUILD NOW / PLAN BUILD queue","Promise-at-risk orders","Decisions + owners"]}'),
('Quarterly OKRs', 'Planning', 'list', 'intermediate', false,
 'Company + department objectives with live-metric targets wired to OS measures.',
 '{"checklist":["Draft 3-5 objectives","Bind each target to a live metric","Assign owners","Weekly scorecard cadence","Mid-quarter review","Quarter close + grading"]}'),
('New SKU Launch', 'Planning', 'list', 'advanced', false,
 'Concept to shelf: standards, BOM, packaging, compliance review, first batch, listing, launch marketing.',
 '{"checklist":["Product standards + unit economics","BOM + packaging spec","Compliance/label review","Pilot batch + COA","SKU + replenishment settings","Menu listings + buyer sheets","Launch content + drop plan"]}'),
('Cycle Count', 'Inventory', 'task', 'beginner', true,
 'Vault cycle count with two-person verification and Metrc variance handling.',
 '{"checklist":["Print count sheet by location","Two-person blind count","Variance list vs OS + Metrc","Investigate variances","Adjustments with witness","Sign-off + audit note"]}'),
('Receiving (3rd-Party Material)', 'Inventory', 'task', 'beginner', false,
 'Inbound manifest to vault: verify, weigh, tag-check, COA collect, purchase record.',
 '{"checklist":["Manifest vs PO check","Weigh + inspect","Metrc receive","Collect supplier COA","Create material purchase record","Vault placement + location log"]}'),
('Expiry Sweep', 'Inventory', 'view', 'beginner', false,
 'Weekly expiring-lot review: 30/60/90 buckets, discount/donate/destroy decisions.',
 '{"columns":["Lot","Product","Expiry","Days left","Units","Decision","Owner"]}'),
('Dispensary Buyer Outreach', 'Sales', 'list', 'intermediate', true,
 'Territory sweep: target dispensaries, buyer contacts, sample drops, follow-ups, first PO.',
 '{"checklist":["Build target list by territory","Buyer contact + license verify","Intro + menu send","Sample drop scheduled","Follow-up 48h","Price/terms negotiation","First PO + reorder cadence"]}'),
('Menu Refresh Blast', 'Sales', 'task', 'beginner', false,
 'New availability announcement to all active buyers with FG sheet attached.',
 '{"checklist":["Export Ready-To-Ship list","Update menu PDF","Segment buyer list","Send + log responses","Update demand forecast"]}'),
('Trade Show / Vendor Day', 'Marketing', 'list', 'intermediate', false,
 'Booth to follow-up: compliance-checked materials, samples custody, lead capture, post-event sequence.',
 '{"checklist":["Book + budget","Compliant materials review","Sample custody plan","Staffing + badges","Lead capture form","48h follow-up sequence","ROI review"]}'),
('Product Drop Campaign', 'Marketing', 'list', 'intermediate', true,
 'Strain/product drop: teaser, budtender education, launch assets, retail support, recap.',
 '{"checklist":["Drop date + allocation","Teaser content","Budtender one-pager","Launch assets (compliant)","Retail support kit","Sell-through tracking","Recap + learnings"]}'),
('Budtender Education Kit', 'Marketing', 'doc', 'beginner', false,
 'Per-product training sheet: genetics, potency, effects language (compliant), selling points.',
 '{"sections":["Genetics + story","Potency + terpenes","Compliant effects language","Price + margin for retailer","FAQ"]}'),
('New Hire Onboarding', 'HR', 'list', 'beginner', true,
 'Day-one to badge: paperwork, CCC requirements, badge application, training matrix, 30/60/90.',
 '{"checklist":["Offer + paperwork","CCC background requirements","Agent badge application","Employee file created","SOP training assignments","Equipment qualifications","30/60/90 check-ins"]}'),
('Incident Report', 'HR', 'form', 'beginner', false,
 'Safety/security incident capture: what, where, injuries, witnesses, immediate actions.',
 '{"fields":["Date/time","Location/room","People involved","Injury? (route to comp)","What happened","Immediate action taken","Witness names","Photos attached"]}')
on conflict (name) do nothing;

insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values ('Workspace', 8, 5, 'templates', 'Template Center', 'templates', null, 'clip',
  'Only our industry, only our company: 24 cannabis-native templates across Financial, Planning, Inventory, Production, Sales, Marketing, Compliance, and HR - searchable and filterable. Quick Use instantiation into live tasks arrives with the Work Layer.', true, '#8fa5ff')
on conflict do nothing;

insert into actions_register (title, priority, source, note, status) values
('AI agents that build sales-team playbooks and industry templates', 'P1', 'owner_directive',
 'Owner 2026-08-05: M5 Brain agents that (1) build the sales function - draft territory target lists from the Customers book + public dispensary data, outreach sequences, buyer one-pagers; (2) author new industry/company templates on demand into the Template Center. All agent output lands as drafts requiring human approval - Real-Records-Only holds.', 'open'),
('Template Quick Use: instantiate template content into live tasks/docs/forms', 'P0', 'owner_directive',
 'Owner 2026-08-05: one click on a template creates its checklist as real tasks (with assignee prompts), its sections as a doc, or its fields as a form. Content jsonb already seeded on all 24 TG templates.', 'open')
on conflict do nothing;;
