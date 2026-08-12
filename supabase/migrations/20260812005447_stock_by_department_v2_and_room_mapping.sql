-- Agent I (Database COO), 12 Aug 2026. DBI-033 v2 (reviewers V, X, W). v1 failed on guessed
-- column names; v_onhand_by_room_stage actually carries licence, department, room, stage,
-- ownership (a ROW dimension), tags, lb, units, tested_ok, failed, no_coa. Checked this time.
-- room_department (owner-editable mapping, RLS'd) applied in v1's transaction was rolled back
-- with it - recreated here. The owner's Stock On Hand redesign spine: HIS departments -> rooms
-- -> streams -> per-tag proof, with the licence-level department already present for every room
-- including post-harvest vaults (the room-board footnote gap closes with this).
-- UNDO: drop view v_stock_by_department; drop table room_department;

create table if not exists room_department (
  room          text primary key,
  department_id uuid not null references departments(id),
  set_by        text not null,
  set_at        timestamptz not null default now()
);
alter table room_department enable row level security;
drop policy if exists rd_read on room_department;
drop policy if exists rd_write on room_department;
create policy rd_read  on room_department for select to authenticated using (true);
create policy rd_write on room_department for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table room_department is
 'Which of the owner''s 8 created departments each room belongs to - OWNER-EDITABLE, admin-gated, '
 'signed. Never inferred by an agent: a mis-filed room silently moves pounds between departments. '
 'Unmapped rooms fall back to the licence-level department from v_onhand_by_room_stage and render '
 'with an assign action. Display always room_qualified (J7).';

create or replace view public.v_stock_by_department as
select coalesce(d.name, o.department, 'UNMAPPED')     as department,
       d.color                                        as department_color,
       coalesce(d.sort, 99)                           as department_sort,
       (rd.room is null)                              as using_licence_fallback,
       o.licence, o.room, o.stage, o.room_role, o.category,
       count(*) filter (where o.ownership ilike '%our%')        as our_lines,
       round(sum(o.lb) filter (where o.ownership ilike '%our%'), 1)   as ours_lb,
       round(sum(o.lb) filter (where o.ownership not ilike '%our%'), 1) as third_party_lb,
       round(sum(o.lb), 1)                            as total_lb,
       sum(o.tags)                                    as tags,
       sum(o.units)                                   as units,
       sum(o.failed)                                  as failed,
       sum(o.no_coa)                                  as no_coa
from v_onhand_by_room_stage o
left join room_department rd on rd.room = o.room
left join departments d on d.id = rd.department_id
group by coalesce(d.name, o.department, 'UNMAPPED'), d.color, coalesce(d.sort,99),
         (rd.room is null), o.licence, o.room, o.stage, o.room_role, o.category;

comment on view public.v_stock_by_department is
 'Stock On Hand the owner''s way: his departments (room_department mapping, licence-level '
 'department as honest fallback), then room, stage and category, ours vs third-party split on '
 'every line, failed and no-COA counts carried. Per-tag drill: v_stock_proof by room. The spine '
 'of WO-003. Post-harvest rooms are ON this view - the room-board footnote gap is data-closed.';;
