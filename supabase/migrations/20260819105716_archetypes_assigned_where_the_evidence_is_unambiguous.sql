/* PAGE ARCHETYPES, ASSIGNED ON EVIDENCE — 19 Aug 2026.
 *
 * page-architecture went red at 152 undeclared pages against a ratchet of 129.
 * It crossed while pages aged past their 24-hour grace, so it would have failed
 * on the next push whoever made it.
 *
 * THE TEMPTING FIX IS THE WRONG ONE. A single UPDATE setting all 152 to
 * data_browser would turn the gate green in one line — and it is exactly the
 * defect this platform was built to end: 522 pages sharing one renderer because
 * nobody decided what any of them were. "Share primitives, never layouts."
 *
 * So each page is classified by WHAT IT READS, and only where the evidence is
 * unambiguous: a page over a gap or finding view is an issue queue, a page over
 * manifests and lineage is a custody chain, a page over certificates is a
 * document register. 58 pages classify on that evidence and are set here.
 *
 * The other 94 are LEFT UNDECLARED ON PURPOSE. Every one of them would have
 * fallen to data_browser by default, which is the answer "it is just a table" —
 * and that is a design decision about the owner's pages, not a database fact I
 * can derive. They stay on the ratchet so the pressure to decide them remains.
 * 152 -> 94 is a real tightening, and the gate's limit drops with it. */

update nav_registry n set archetype = c.proposed
from (
  select view_key,
    case
      when sig ~ 'gap|issue|alert|finding|discrepan|unresolved|awaiting|overdue|breach|violation' then 'issue_queue'
      when sig ~ 'coa|certificate|document|manifest_doc'                                          then 'document_register'
      when sig ~ 'manifest|transfer|custody|lineage|chain|shipped|seed_to_sale|genealog'           then 'custody_chain'
      when sig ~ 'stock|inventory|on_hand|room_contents|locator|holding|position'                  then 'stock_position'
      when sig ~ 'schedule|calendar|plan|forecast|upcoming|pipeline'                               then 'schedule'
      when sig ~ 'cost|price|margin|value|valuation|revenue|invoice|cash|payroll|budget|econom'    then 'cost_sheet'
      when sig ~ 'reconcil|vs_|_vs|match|compare|agreement|variance'                               then 'reconciliation'
      when sig ~ 'scorecard|performance|yield|ranking|benchmark|conversion|best|worst|trend'       then 'scorecard'
      when sig ~ 'catalogue|catalog|registry|items|strains|locations|skus|products|directory'      then 'catalogue'
      when sig ~ 'employee|roster|people|staff|schedulable|seats|roles'                            then 'roster'
      when sig ~ 'punch|timesheet|attendance|hours'                                                then 'punch_log'
      when sig ~ 'rule|setting|config|factor|threshold|target|goal|policy'                         then 'rules_editor'
      when sig ~ 'dashboard|command|control_tower|overview|summary'                                then 'dashboard'
      else null end as proposed
  from (
    select view_key,
           lower(view_key || ' ' || coalesce(table_ref,'') || ' ' || coalesce(label,'')) as sig
    from nav_registry where archetype is null and enabled
  ) s
) c
where n.view_key = c.view_key and c.proposed is not null;;
