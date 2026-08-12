-- Agent I (Database COO), 12 Aug 2026. DBI-043 (reviewers V, X, W).
-- Owner, after approving the rebuilt Command direction: (1) build widgets so users can
-- rearrange; (2) fix the rooms section - it shows 4 flower rooms only, and must show ALL rooms
-- (drying, trim, extraction, vaults) with more to come.
--
-- RULE 12 APPLIED BEFORE BUILDING: dashboards and dashboard_widgets ALREADY EXIST (0 rows each,
-- correct shape, never fed) - extended, not replaced. Every room ALREADY carries room_role and
-- department in v_onhand_by_room_stage - the flower-only board was a front-end limit, not a
-- data gap. Nothing new was invented that the schema already had.
--
-- PART 1 - PERSONAL LAYOUTS. Owner rule 5: "Users personalise the two master dashboards. Anyone
-- with access can toggle individual tiles off and drag to rearrange their own layout. Saved per
-- user, so two executives can hold completely different views of the same data." That is now
-- storable: page + visible + span + position, per user, through one RPC. A user only ever sees
-- and writes their OWN layout (RLS on owner = auth.uid()).
--
-- PART 2 - EVERY ROOM. v_room_board_complete covers all rooms: flower rooms keep their cycle
-- ring; post-harvest rooms (Cure Vault, Pre Trim Storage, Hydrocarbon, Solventless, Finish
-- Vault, Freezer/Biomass, Shipping & Receiving, Fulfillment Vault) show what they HOLD instead,
-- since a vault has no 56-day cycle and inventing one would be rule A1. Department-qualified
-- names throughout (rule J7 - a room is never shown without its department; eleven room names
-- exist in both buildings).
--
-- UNDO: drop view v_room_board_complete; drop function tg_save_dashboard_layout(text, jsonb);
--       drop view v_my_dashboard_layout;
--       alter table dashboards drop column page; alter table dashboard_widgets drop column visible, drop column span;

alter table dashboards        add column if not exists page   text;
alter table dashboard_widgets add column if not exists visible boolean not null default true;
alter table dashboard_widgets add column if not exists span    integer not null default 1;

comment on column dashboards.page is
 'Which dashboard this layout belongs to (command, cultivation, inventory...). One row per user '
 'per page; owner holds the user_id.';
comment on column dashboard_widgets.visible is
 'FALSE = the user toggled this widget off. The widget is never deleted - hiding is personal and '
 'reversible, and a hidden widget keeps loading its freshness checks (collapse hides, it never '
 'unmounts monitoring).';
comment on column dashboard_widgets.span is
 'Column span for the widget in the page grid, 1 = single column. Drag-resize writes this.';

alter table dashboards        enable row level security;
alter table dashboard_widgets enable row level security;

drop policy if exists dash_own on dashboards;
create policy dash_own on dashboards for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists dashw_own on dashboard_widgets;
create policy dashw_own on dashboard_widgets for all to authenticated
  using (exists (select 1 from dashboards d where d.id = dashboard_id and d.owner = auth.uid()))
  with check (exists (select 1 from dashboards d where d.id = dashboard_id and d.owner = auth.uid()));

create or replace function public.tg_save_dashboard_layout(p_page text, p_widgets jsonb)
returns integer
language plpgsql security invoker set search_path to 'public'
as $fn$
declare v_dash uuid; v_n int;
begin
  if auth.uid() is null then
    raise exception 'A layout belongs to a person - no signed-in user, no layout.';
  end if;

  select id into v_dash from dashboards where owner = auth.uid() and page = p_page;
  if v_dash is null then
    insert into dashboards (owner, name, page, is_private)
    values (auth.uid(), p_page || ' layout', p_page, true)
    returning id into v_dash;
  end if;

  delete from dashboard_widgets where dashboard_id = v_dash;

  insert into dashboard_widgets (dashboard_id, widget_key, position, visible, span)
  select v_dash,
         w->>'widget_key',
         coalesce((w->>'position')::int, 0),
         coalesce((w->>'visible')::boolean, true),
         coalesce((w->>'span')::int, 1)
  from jsonb_array_elements(p_widgets) w
  where coalesce(w->>'widget_key','') <> '';

  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

comment on function public.tg_save_dashboard_layout(text, jsonb) is
 'Saves the calling user''s widget layout for one dashboard page: order, visibility and span. '
 'Owner rule 5 made storable - two executives hold different views of the same data. security '
 'INVOKER so RLS applies: a user can only ever write their own layout. Front end sends the full '
 'ordered array after a drag; the function replaces that page''s set atomically.';

create or replace view public.v_my_dashboard_layout as
select d.page, w.widget_key, w.position, w.visible, w.span
from dashboards d join dashboard_widgets w on w.dashboard_id = d.id
where d.owner = auth.uid()
order by d.page, w.position;

comment on view public.v_my_dashboard_layout is
 'The signed-in user''s saved widget layout. Empty means they have never rearranged anything - '
 'the front end then renders the default order, which is the correct honest fallback.';

create or replace view public.v_room_board_complete as
with held as (
  select o.room,
         max(o.department)                              as department,
         max(o.room_role)                               as room_role,
         max(o.licence)                                 as licence,
         round(sum(o.lb), 1)                            as lb_held,
         sum(o.tags)                                    as tags_held,
         sum(o.units)                                   as units_held,
         round(sum(o.lb) filter (where o.ownership not ilike '%our%'), 1) as third_party_lb,
         sum(o.failed)                                  as failed_tags,
         sum(o.no_coa)                                  as tags_without_coa,
         count(distinct o.category)                     as categories
  from v_onhand_by_room_stage o
  group by o.room
)
select coalesce(h.room, r.room)                          as room,
       coalesce(h.department, 'UNASSIGNED')              as department,
       coalesce(h.room, r.room) || ' — ' || coalesce(h.department, 'UNASSIGNED') as room_qualified,
       coalesce(h.room_role, r.room_type, 'Unclassified') as room_role,
       h.licence,
       (r.room is not null)                              as is_flower_room,
       r.plants_now, r.strains_now, r.cycle_days, r.next_event, r.next_event_date, r.days_until,
       h.lb_held, h.tags_held, h.units_held, h.third_party_lb, h.failed_tags, h.tags_without_coa,
       h.categories,
       case
         when r.room is not null and r.days_until is not null and r.days_until < 0
              then 'OVER — ' || abs(r.days_until) || ' days past'
         when r.room is not null and r.days_until is not null and r.days_until <= 7
              then 'PULLING — ' || r.days_until || ' days'
         when r.room is not null and r.plants_now > 0 then 'ON PLAN'
         when r.room is not null                        then 'TURNING'
         when coalesce(h.lb_held,0) > 0                 then 'HOLDING STOCK'
         else 'EMPTY'
       end                                               as state,
       case when coalesce(h.failed_tags,0) > 0 then 'bad'
            when r.room is not null and r.days_until is not null and r.days_until < 0 then 'bad'
            when r.room is not null and r.days_until is not null and r.days_until <= 7 then 'watch'
            else 'good' end                              as tone
from held h
full join v_room_board r on r.room = h.room;

comment on view public.v_room_board_complete is
 'EVERY room, not just the four flower rooms: flower rooms keep their cycle ring (days_until, '
 'plants, strains); post-harvest rooms - drying, pre-trim, cure, extraction, vaults, shipping - '
 'show what they HOLD instead, because a vault has no 56-day cycle and inventing one would '
 'violate rule A1. Always display room_qualified: eleven room names exist under both licences '
 'and a room is never shown without its department (J7). UNASSIGNED is honest and fixable - the '
 'owner maps it in room_department.';;
