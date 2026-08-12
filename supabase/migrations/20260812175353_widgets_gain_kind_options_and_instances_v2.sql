-- Agent I, 12 Aug 2026. DBI-072.
--
-- OWNER: "THERE WILL BE OTHER WIDGETS WE WANT TO ADD OPTIONS FOR USER CAN DESIDE TO USE OR NOT
-- CALANDARS AND CAN SELECT CALANDAR FROM DROPDOWN, SCHDULES AND CAN SELECT SCHEDULES FROM DROP
-- DOWN, TEAM MESSAGING, TASK, ALERTS TO BE SEEN WHILE WORKING."
--
-- WHAT THE MODEL COULD NOT DO. All 45 catalogue entries are METRIC TILES: a number, from a table,
-- with an aggregation and a drill. Two gaps:
--   1. A calendar, a message thread and a task list are not numbers. With no widget_kind the front
--      end cannot tell a KPI from a thread, so it cannot render either correctly.
--   2. "SELECT CALANDAR FROM DROPDOWN" means the widget carries SETTINGS, and settings belong to
--      the PLACED INSTANCE, not the catalogue entry — otherwise every user's calendar shows the
--      same one. Two calendars side by side, Harvest and Deliveries, was impossible while the key
--      was (user, page, widget_key).
--
-- WHY THE OPTIONS LIVE IN THE DATABASE. A dropdown's choices are DATA. In the front end, every new
-- calendar needs a deploy and the picker drifts from what the platform can actually show.
--
-- V2 NOTE: v1 failed because it tried to insert instance_id into the MIDDLE of v_my_layout.
-- create-or-replace cannot rename, reorder or retype an existing view column. Columns 1-17 keep
-- their names, order and types exactly; everything new is APPENDED. Only VALUES change, which is
-- permitted — label now prefers the user's own title, has_no_drill now scopes to metric tiles.
--
-- UNDO: alter table dashboard_layout drop column instance_id, config, title_override and restore
--       the original primary key; alter table widget_catalog drop column widget_kind,
--       options_schema, multi_instance; restore both views from DBI-071.

alter table widget_catalog
  add column if not exists widget_kind text not null default 'metric',
  add column if not exists options_schema jsonb,
  add column if not exists multi_instance boolean not null default false;

alter table widget_catalog drop constraint if exists widget_catalog_kind_check;
alter table widget_catalog add constraint widget_catalog_kind_check
  check (widget_kind in ('metric','calendar','schedule','list','feed','messaging','tasks','alerts','lookup','chart'));

comment on column widget_catalog.widget_kind is
 'What the canvas must RENDER. metric = a number with a drill (all 45 originals). calendar, '
 'schedule, list, feed, messaging, tasks, alerts, lookup and chart are interactive widgets that '
 'are not a single figure. Added 12 Aug 2026 on the owner''s widget ideas — before this the front '
 'end had no way to tell a KPI from a message thread.';

comment on column widget_catalog.options_schema is
 'What a user may CONFIGURE on a placed instance and the permitted choices — which calendar, '
 'which schedule, which department, how many days ahead. In the database on purpose: a dropdown''s '
 'choices are DATA. In the front end, every new calendar would need a deploy and the picker would '
 'drift from what the platform can actually show.';

comment on column widget_catalog.multi_instance is
 'True when the SAME widget may be placed more than once on one page — two calendars side by side, '
 'Harvest and Deliveries. False for a singleton such as Unread alerts.';

alter table dashboard_layout
  add column if not exists instance_id    int   not null default 1 check (instance_id >= 1),
  add column if not exists config         jsonb not null default '{}'::jsonb,
  add column if not exists title_override text;

alter table dashboard_layout drop constraint if exists dashboard_layout_pkey;
alter table dashboard_layout add primary key (user_id, page, widget_key, instance_id);

comment on column dashboard_layout.instance_id is
 'Which copy of this widget. 1 unless the user placed several. Part of the key, so two calendars '
 'on one page are two rows rather than a collision that silently overwrites the first.';
comment on column dashboard_layout.config is
 'This instance''s settings, validated against widget_catalog.options_schema. Belongs to the '
 'PLACEMENT, never the catalogue entry — settings on the catalogue would make everyone''s calendar '
 'show the same thing.';
comment on column dashboard_layout.title_override is
 'A user-chosen name for this instance. With two calendars on one screen, "Calendar" twice is '
 'useless; "Harvest" and "Deliveries" is the entire point.';

create or replace function tg_save_layout(p_page text, p_widgets jsonb)
returns int
language plpgsql security invoker set search_path = public as $$
declare n int; bad text;
begin
  if p_page is null or btrim(p_page) = '' then
    raise exception 'tg_save_layout needs a page name.';
  end if;
  if jsonb_typeof(p_widgets) <> 'array' then
    raise exception
      'tg_save_layout expects a JSON ARRAY of '
      '{widget_key,instance_id,x,y,w,h,visible,config,title_override}.';
  end if;

  select string_agg(distinct e->>'widget_key', ', ')
    into bad
    from jsonb_array_elements(p_widgets) e
   where not exists (select 1 from widget_catalog c where c.key = e->>'widget_key');
  if bad is not null then
    raise exception
      'Not in widget_catalog: %. A layout may only place widgets the catalogue defines — '
      'otherwise the saved screen references a tile nothing can render.', bad;
  end if;

  -- A singleton placed twice is a front-end bug. Fail loudly rather than silently keeping one.
  select string_agg(k, ', ') into bad from (
    select e->>'widget_key' as k
    from jsonb_array_elements(p_widgets) e
    join widget_catalog c on c.key = e->>'widget_key'
    where not c.multi_instance
    group by e->>'widget_key'
    having count(*) > 1
  ) dup;
  if bad is not null then
    raise exception
      'Placed more than once but not multi_instance: %. Either the catalogue should allow copies, '
      'or the canvas should not have offered a second one.', bad;
  end if;

  delete from dashboard_layout where user_id = auth.uid() and page = p_page;

  insert into dashboard_layout
    (user_id, page, widget_key, instance_id, x, y, w, h, visible, config, title_override)
  select auth.uid(), p_page,
         e->>'widget_key',
         coalesce((e->>'instance_id')::int, 1),
         coalesce((e->>'x')::int, 0),
         coalesce((e->>'y')::int, 0),
         coalesce((e->>'w')::int, 3),
         coalesce((e->>'h')::int, 2),
         coalesce((e->>'visible')::boolean, true),
         coalesce(e->'config', '{}'::jsonb),
         nullif(e->>'title_override','')
  from jsonb_array_elements(p_widgets) e;

  get diagnostics n = row_count;
  return n;
end $$;

-- APPEND ONLY. Columns 1-17 unchanged in name, order and type.
create or replace view public.v_my_layout as
select c.key                               as widget_key,
       l.page                              as page,
       coalesce(l.title_override, c.label) as label,
       c.category                          as category,
       c.icon                              as icon,
       c.table_ref                         as source,
       c.drill                             as drill,
       c.format                            as format,
       c.hot                               as hot,
       c.enabled                           as widget_enabled,
       l.x, l.y, l.w, l.h,
       l.visible                           as visible,
       true                                as personalised,
       l.updated_at                        as arranged_at,
       -- appended 12 Aug 2026, DBI-072
       l.instance_id                       as instance_id,
       c.widget_kind                       as widget_kind,
       c.multi_instance                    as multi_instance,
       c.options_schema                    as options_schema,
       l.config                            as config,
       c.label                             as catalogue_label
from widget_catalog c
join dashboard_layout l
  on l.widget_key = c.key and l.user_id = auth.uid()
where c.enabled;

create or replace view public.v_widget_catalog_available as
select key, category, label, icon, table_ref as source, drill, format, hot,
       (widget_kind = 'metric' and (drill is null or btrim(drill) = '')) as has_no_drill,
       -- appended 12 Aug 2026, DBI-072
       widget_kind    as widget_kind,
       multi_instance as multi_instance,
       options_schema as options_schema
from widget_catalog
where enabled
order by category, label;

comment on view public.v_widget_catalog_available is
 'Every widget a user may add, for the picker: what it is (widget_kind), whether it may be placed '
 'more than once, and what it lets them configure. has_no_drill flags a METRIC tile that cannot '
 'open its own records — a build defect, since the house rule is that every figure drills. Scoped '
 'to metrics deliberately: a message thread has no drill, and that is not a defect.';;
