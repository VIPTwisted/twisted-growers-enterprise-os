-- ============================================================================
-- ONE MODULE PER DEPARTMENT, AND EVERY PAGE DECLARES WHAT IT IS
--
-- Owner ruling, 8 Aug 2026, stated twice in capitals: DO NOT EVER USE ONE
-- TEMPLATE FOR EVERY PAGE.
--
-- ROOT CAUSE, measured rather than assumed. 522 enabled report pages are all
-- rendered by one component, ReportScreen at App.jsx:1952. It is handed a table
-- name and draws a grid, so it cannot know that Employee Notes is not a harvest
-- report -- which is why Employee Notes gets a harvest date filter. The template
-- always wins because THE DATABASE NEVER TOLD THE INTERFACE WHAT KIND OF PAGE
-- THIS IS. nav_registry distinguished only 'report' from 'application'.
--
-- And 278 of the 522 have a label that is literally their own table name title-
-- cased, 251 sitting under a subcategory called "All Data". Half the "pages" were
-- never designed; a script emitted one menu row per table. Workspace is 125 pages
-- of which 108 are that. So the real page count is ~301, about 25 per department,
-- which is buildable. 522 bespoke designs is not, and would drift into exactly
-- the templated mush the owner is objecting to.
--
-- WHAT THIS MIGRATION DOES: adds the two columns that let a hand-built module
-- claim its pages, and records the archetypes as rows rather than as prose.
-- It changes NO behaviour on its own -- nothing is disabled, nothing is deleted.
-- ============================================================================

create table if not exists page_archetype (
  archetype        text primary key,
  title            text not null,
  what_it_answers  text not null,
  never_share      text,
  component_path   text,
  built            boolean not null default false,
  added_on         date not null default current_date
);
alter table page_archetype enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid='public.page_archetype'::regclass
                   and polname='page_archetype_read') then
    create policy page_archetype_read on page_archetype for select to authenticated using (true);
  end if;
end $$;

comment on table page_archetype is
'The hand-built page kinds. Primitives are shared (table, chip, filter, drawer, empty state, export); LAYOUTS ARE NEVER SHARED. A roster is not a ledger is not a punch history -- different questions, different columns, different actions, different empty states. data_browser is the ONLY generic screen and it is admin-only.';

insert into page_archetype (archetype, title, what_it_answers, never_share) values
 ('dashboard',        'Department dashboard',  'What needs my attention in this department today, and what can I assign from here', 'Tile choice, targets, what is above the fold'),
 ('roster',           'Roster',                'Who works here, what state are they in, what can they legally do',                 'Avatars, department grouping, licence state front and centre'),
 ('punch_log',        'Punch log',             'Who was here when, and which days are exceptions',                                 'Days down the left, exceptions highlighted, week totals'),
 ('cost_sheet',       'Cost sheet',            'What does this cost, and how does it compare with plan',                           'Money right-aligned, totals pinned to the bottom, variance against plan'),
 ('stock_position',   'Stock position',        'What material do we hold, where, on which weight basis',                           'Weight basis stated on every figure -- wet is never dry'),
 ('custody_chain',    'Custody chain',         'Where did this material come from and where did it go',                            'Lineage as a chain, manifest and certificate on every row'),
 ('document_register','Document register',     'Which packages have their certificate and manifest, and which do not',              'Completeness first, the document itself one click away'),
 ('schedule',         'Schedule',              'What is planned, what is due, what slipped',                                       'Calendar or timeline, never a flat grid'),
 ('issue_queue',      'Issue queue',           'What needs a decision from me, oldest and most costly first',                      'Age and money visible, a decision action on every row'),
 ('catalogue',        'Catalogue',             'What items, strains and locations exist, and which are in use',                     'Search-first, in-use state, no date range at all'),
 ('reconciliation',   'Reconciliation',        'Do two independent sources agree, and if not by how much',                          'Two columns side by side and the gap between them'),
 ('scorecard',        'Scorecard',             'What performed well and what did not, ranked',                                      'Ranking, confidence, the basis of comparison'),
 ('rules_editor',     'Rules editor',          'What are the owner-set rules, and let me change them with a reason',                'Editable, reason code required, history visible'),
 ('data_browser',     'Data browser (admin)',  'Let an administrator look directly at a table',                                    'ADMIN ONLY. The one place a generic table screen is correct.')
on conflict (archetype) do update
  set title = excluded.title, what_it_answers = excluded.what_it_answers,
      never_share = excluded.never_share;

alter table nav_registry add column if not exists module    text;
alter table nav_registry add column if not exists archetype text references page_archetype(archetype);

comment on column nav_registry.module is
'The department module that owns this page: one folder, one agent, one contract. A module may never import another module.';
comment on column nav_registry.archetype is
'Which hand-built page kind renders this. NULL means undecided and is a DESIGN DECISION, not something to guess -- see v_page_design_queue.';

-- Module is deterministic from category, so it can be set with confidence.
update nav_registry set module = case category
    when 'Command Center'             then 'command'
    when 'Cultivation'                then 'cultivation'
    when 'Metrc'                      then 'metrc'
    when 'Inventory'                  then 'inventory'
    when 'Settings'                   then 'settings'
    when 'Finance'                    then 'finance'
    when 'Workspace'                  then 'workspace'
    when 'Quality'                    then 'quality'
    when 'Human Resources'            then 'hr'
    when 'Manufacturing'              then 'manufacturing'
    when 'Reports'                    then 'reports'
    when 'Infused Pre-Rolls & Flower' then 'infused'
  end
where module is null;

-- Archetype is set ONLY where the existing subcategory states it plainly. Everything
-- else is left NULL on purpose: assigning a layout from a hunch is how a roster ends
-- up with a harvest date filter. Those go to the owner as design decisions (rule A1).
update nav_registry set archetype = case
    when subcategory = 'All Data'                                          then 'data_browser'
    when subcategory = 'Dashboard'                                         then 'dashboard'
    when subcategory = 'Reference Data'                                    then 'catalogue'
    when subcategory = 'Schedule & Calendar'                               then 'schedule'
    when subcategory in ('Decisions Waiting','Alerts & Watchdog',
                         'Discipline & Alerts')                            then 'issue_queue'
    when subcategory in ('Stock & Location','Inventory Position')          then 'stock_position'
    when subcategory = 'Testing'                                           then 'document_register'
    when subcategory = 'Custody & Reconciliation'                          then 'custody_chain'
    when subcategory = 'Business Rules'                                    then 'rules_editor'
  end
where archetype is null;

-- What still needs a human decision, biggest departments first.
create or replace view v_page_design_queue as
select n.module, n.category, n.subcategory, n.label, n.table_ref, n.page_kind,
       n.archetype,
       case when n.archetype is null then 'NEEDS A DESIGN DECISION' else 'assigned' end as state
from nav_registry n
where n.enabled
order by (n.archetype is not null), n.module, n.subcategory nulls first, n.label;

comment on view v_page_design_queue is
'Every enabled page and whether its archetype is decided. NEEDS A DESIGN DECISION is honest: the subcategory did not state the page kind, and picking one from a hunch is what produced a generic renderer over 522 tables.';;
