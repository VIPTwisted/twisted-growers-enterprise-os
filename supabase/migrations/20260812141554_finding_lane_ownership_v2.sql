-- Agent I (Database COO), 12 Aug 2026. DBI-048 v2 (reviewers V, X, W).
-- v2: sum() over bigint returns numeric and create-or-replace cannot change a view column's
-- type - cast the rollups back to bigint. Same constraint family that has caught me three times
-- today; the view contract is stricter than my drafts.
--
-- THE WATCHGUARD'S NUMBER-ONE FINDING, and it is mine. v_findings tags each finding with a LANE
-- ("Allocation control", "Cash velocity", "Room turnaround"), not a DEPARTMENT.
-- mv_global_management published all 27 lane names; the front end knows 11 dashboards; the
-- other 16 fell to a banner reading "NOBODY OWNS THESE - 1,582 open findings". Nobody was
-- missing - the lanes were never mapped to the departments that own them. The cost is the whole
-- point of the platform: 426 allocation findings never reached the inventory manager, 30
-- critical room-turnaround findings never reached cultivation, because the board said they
-- belonged to no one. And "Sales & Cash" was displayed as ownerless while publishing four tiles.
--
-- The mapping is DATA - owner-editable, signed - not a CASE buried in a view and not a literal
-- in the front end.
--
-- UNDO: restore v_global_management from global_management_band; drop table finding_lane_owner.

create table if not exists finding_lane_owner (
  lane        text primary key,
  department  text not null,
  why         text not null,
  set_by      text not null default 'Agent I',
  set_at      timestamptz not null default now()
);

alter table finding_lane_owner enable row level security;
drop policy if exists flo_read  on finding_lane_owner;
drop policy if exists flo_write on finding_lane_owner;
create policy flo_read  on finding_lane_owner for select to authenticated using (true);
create policy flo_write on finding_lane_owner for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table finding_lane_owner is
 'Which dashboard owns each finding LANE. v_findings labels findings by lane; dashboards are '
 'departments. Without this join, 16 of 27 lanes rendered as "NOBODY OWNS THESE" across 1,582 '
 'findings - including Sales & Cash, which has four tiles and a real dashboard. OWNER-EDITABLE '
 'data, never a CASE in a view or a literal in the front end: a mis-routed lane silently hides '
 'work from the manager who should be doing it.';

insert into finding_lane_owner (lane, department, why) values
 ('Allocation control',            'Inventory',    '426 findings, the largest pile in the company. Unapproved allocations are inventory movements and the missing approval workflow is an inventory build.'),
 ('Inventory control',             'Inventory',    'Inventory by name.'),
 ('Third party',                   'Inventory',    'Third-party material is inventory; the forensic ledger sits on the inventory side.'),
 ('Cash velocity',                 'Sales & Cash', '221 findings of ageing stock and money not moving - the sales and cash lane by definition.'),
 ('Sales, Orders & Fulfillment',   'Sales & Cash', 'THE LANE THAT RENDERED AS OWNERLESS while Sales & Cash published four tiles. Different name, same department.'),
 ('Compliance watch',              'Quality',      '328 findings, 39 critical - failed testing unresolved; quality owns the disposition.'),
 ('Compliance',                    'Quality',      'Same lane, shorter historic label.'),
 ('Laboratory',                    'Quality',      'Lab turnaround and results.'),
 ('QA & Independent Verification', 'Quality',      'Verification maps to quality.'),
 ('Room turnaround',               'Cultivation',  '30 findings, ALL critical - rooms held past their cycle. Cultivation owns the pull.'),
 ('Schedule discipline',           'Cultivation',  'Harvest cadence against the 2026 calendar.'),
 ('Loss and yield',                'Cultivation',  'Yield gaps and unexplained loss originate in the grow.'),
 ('Metrc & Compliance',            'Metrc',        'Sync and mirror integrity.'),
 ('Unanswered',                    'Command',      'Open questions waiting on a human answer; they block other work, so they sit with the owner.'),
 ('Unassigned',                    'Command',      'HONEST DEFAULT: 168 findings, 42 critical, claimed by no lane. They surface on Command deliberately - an unrouted finding is the owner''s problem until someone claims it, and hiding it would be worse than showing it.')
on conflict (lane) do nothing;

create or replace view public.v_global_management as
with mapped as (
  select coalesce(o.department, f.lane) as department,
         (o.department is null)         as lane_unmapped,
         f.open_findings, f.critical_findings, f.oldest_finding
  from (
    select coalesce(nullif(vf.department,''), 'Unassigned') as lane,
           count(*)                                         as open_findings,
           count(*) filter (where vf.severity='critical')   as critical_findings,
           min(vf.first_raised)::date                       as oldest_finding
    from v_findings vf
    where vf.resolved_at is null and not coalesce(vf.is_duplicate,false)
    group by 1
  ) f
  left join finding_lane_owner o on o.lane = f.lane
),
rolled as (
  select department,
         bool_or(lane_unmapped)         as any_unmapped,
         sum(open_findings)::bigint     as open_findings,
         sum(critical_findings)::bigint as critical_findings,
         min(oldest_finding)            as oldest_finding
  from mapped group by department
),
depts as (
  select department, count(*) as tiles,
         count(*) filter (where tone='bad')    as tiles_bad,
         count(*) filter (where value is null) as tiles_null
  from mv_department_dashboard group by department
),
t as (
  select coalesce(nullif(tasks.department,''),'Unassigned') as department,
         count(*) as open_orders,
         count(*) filter (where tasks.due_on < current_date) as orders_overdue
  from tasks where tasks.status <> all (array['done','completed'])
  group by 1
)
select coalesce(d.department, r.department, t.department)                  as department,
       (coalesce(d.department, r.department, t.department) = 'Unassigned') as is_the_unrouted_pile,
       coalesce(d.tiles,0)                                                 as tiles,
       coalesce(d.tiles_bad,0)                                             as tiles_bad,
       coalesce(d.tiles_null,0)                                            as tiles_null,
       coalesce(r.open_findings,0::bigint)                                 as open_findings,
       coalesce(r.critical_findings,0::bigint)                             as critical_findings,
       r.oldest_finding,
       coalesce(t.open_orders,0)                                           as open_orders,
       coalesce(t.orders_overdue,0)                                        as orders_overdue,
       case when coalesce(r.critical_findings,0) > 0 then 'bad'
            when coalesce(d.tiles_bad,0) > 0 or coalesce(t.orders_overdue,0) > 0 then 'watch'
            when coalesce(d.tiles,0) = 0 then 'bad'
            else 'good' end                                                as tone,
       case when coalesce(d.tiles,0) = 0 and coalesce(d.department,'') <> ''
            then 'PUBLISHES NO TILES — a required category with nothing replicating up (rule 1/4)'
            when coalesce(r.any_unmapped,false)
            then 'LANE NOT MAPPED — findings arrive under a lane name with no owning department; add a row to finding_lane_owner'
            end                                                            as gap_note
from depts d
full join rolled r on r.department = d.department
full join t       on t.department  = coalesce(d.department, r.department);

comment on view public.v_global_management is
 'Every department: tiles, findings, open orders. Findings roll up through finding_lane_owner, '
 'which maps v_findings LANES to owning departments - before it existed, 16 of 27 lanes rendered '
 'as "NOBODY OWNS THESE" over 1,582 findings, including Sales & Cash while it published four '
 'tiles. An unmapped lane now says so in gap_note instead of being silently orphaned.';;
