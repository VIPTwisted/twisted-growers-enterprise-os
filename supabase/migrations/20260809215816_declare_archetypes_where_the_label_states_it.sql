-- ============================================================================
-- Declare the archetype where the PAGE'S OWN LABEL states what kind of page it is.
--
-- 278 of 610 enabled pages had no archetype, against a gate baseline of 220: agents added
-- 58 pages today without declaring what kind of page each is, which is exactly how 522
-- pages ended up sharing one renderer.
--
-- WHAT THIS IS AND IS NOT. Every rule below reads a word the page itself uses. "Pay Runs" is
-- a cost sheet because it is a pay run. "Earning Codes" is a rules editor because a code
-- table is configuration. "Shift Swaps" is a schedule. That is READING, not inferring.
--
-- Anything whose kind is NOT stated by its own label is deliberately LEFT NULL --
-- "General", "Genetics", "Metrc report - Adjustments", "Assistant". Guessing those is how
-- Employee Notes acquired a harvest date filter, and the owner's ruling on that was
-- emphatic. v_page_design_queue lists what remains.
--
-- EVERY ASSIGNMENT HERE IS A PROPOSAL THE OWNING AGENT SHOULD CONFIRM. The archetype decides
-- layout, and the agent that built the page knows things a label cannot say. This unblocks
-- the gate; it does not settle the design.
-- ============================================================================

update nav_registry set archetype = 'cost_sheet'
 where enabled and archetype is null
   and label ~* ('(pay run|payroll|labour forecast|department labour|year to date|cost model|'
              || 'true cost|harvest economics|cash & overhead|overhead & outlook|inventory value|'
              || 'invoices|labor budget|pto balance|product economics|margin by route|'
              || 'cost versus output|who pays for|ai spend)');

update nav_registry set archetype = 'rules_editor'
 where enabled and archetype is null
   and label ~* ('(codes$|codes \(|tax profile|cost classes|leave polic|holidays|'
              || 'zone requirement|break window|kpi definition|labels & wording|page permission|'
              || 'session policy|checklist step|menu manager|menu visibility|users & permissions|'
              || 'artificial intelligence settings|artificial intelligence access|^zones$)');

update nav_registry set archetype = 'issue_queue'
 where enabled and archetype is null
   and label ~* ('(watch$|under-utilised|call-out|time off request|review queue|offboarding|'
              || 'open obligation|issue register|issue report|action register|my alerts|'
              || 'exception|deviations|unconfirmed|failed testing on hand|late pulls|'
              || 'underperforming|yield gap|awaiting allocation|aging stock|discrepanc)');

update nav_registry set archetype = 'schedule'
 where enabled and archetype is null
   and label ~* ('(availability|open shift|shift claim|shift swap|schedule builder|'
              || 'schedule draft|draft lines|work schedule|scheduling & zones|who can work|'
              || 'production schedule|manufacturing schedule|supply forecast|room yield planner)');

update nav_registry set archetype = 'punch_log'
 where enabled and archetype is null
   and label ~* '(timesheet|attendance occurrence|scheduled vs worked|punch queue|wall terminal)';

update nav_registry set archetype = 'roster'
 where enabled and archetype is null
   and label ~* '(^employees$|employee file|wage bands)';

update nav_registry set archetype = 'scorecard'
 where enabled and archetype is null
   and label ~* ('(average staffing|zone staffing|scorecard|ranking|fail rate|versus industry|'
              || 'best vs worst|room performance|leadership accountability|by month$)');

update nav_registry set archetype = 'reconciliation'
 where enabled and archetype is null
   and label ~* ('(metrc vs os|agents agree|disagreement|plan vs actual|mass ledger|'
              || 'full accountability)');

update nav_registry set archetype = 'document_register'
 where enabled and archetype is null
   and label ~* ('(certificate|document links|never tested|laboratory result|'
              || 'laboratory turnaround|lab testing status)');

update nav_registry set archetype = 'custody_chain'
 where enabled and archetype is null
   and label ~* ('(manifest custody|seed to sale|harvest lineage|package dossier|'
              || 'package forensic|forensic trace|transfer ledger|harvest stage map)');

update nav_registry set archetype = 'stock_position'
 where enabled and archetype is null
   and label ~* '(third party stock|counted inventory|inventory report|package inventory)';

update nav_registry set archetype = 'dashboard'
 where enabled and archetype is null
   and label ~* ('(activity feed|on the floor now|zone coverage now|room board|'
              || 'facility live map|monthly meeting pack)');

select count(*) filter (where archetype is null)        as still_undeclared,
       count(*) filter (where archetype is not null)    as declared,
       count(*)                                          as total
  from nav_registry where enabled;;
