-- Agent I, 12 Aug 2026. DBI-071.
--
-- OWNER: "WHAT ABOUT WIDGET SETTING UP SETTINGS AS WIDGETS AS i ASKED EARLIER" and
--        "SIMILAR TO TRADING PLATFORM i CAN MOVE AND RESIZE EACH AS I WANT".
--
-- WHAT ALREADY EXISTED, measured before building anything: widget_catalog holds 45 widgets, each
-- with its source table, aggregation, drill target and format. tg_save_dashboard_layout() exists.
-- v_my_dashboard_layout exists. And dashboard_widgets has ZERO ROWS - nobody has ever saved a
-- layout, because the front end was never wired to any of it.
--
-- WHY THAT SCHEMA CANNOT DO WHAT HE IS ASKING. dashboard_widgets stores (position, span): a
-- ONE-DIMENSIONAL flow. It can reorder tiles and set a width. It cannot express "put this panel
-- bottom-right, three columns wide by two rows tall", which is precisely what a trading terminal
-- does. It also has NO user column, so two executives cannot hold different views - and CLAUDE.md
-- hard rule 5 requires exactly that: "Saved per user, so two executives can hold completely
-- different views of the same data."
--
-- So this is a genuine gap, not a wiring job. A 2-D grid, per user, per page.
--
-- ADDITIVE ONLY. dashboard_widgets, widget_catalog, v_my_dashboard_layout and
-- tg_save_dashboard_layout are all left untouched - other surfaces may read them and I will not
-- break a thing tonight to tidy it.
--
-- UNDO: drop function tg_save_layout, tg_reset_layout; drop view v_my_layout; drop table
--       dashboard_layout.

create table if not exists dashboard_layout (
  user_id    uuid    not null default auth.uid(),
  page       text    not null,
  widget_key text    not null references widget_catalog(key) on delete cascade,
  x          int     not null default 0  check (x >= 0  and x  < 12),
  y          int     not null default 0  check (y >= 0),
  w          int     not null default 3  check (w >= 1  and w <= 12),
  h          int     not null default 2  check (h >= 1  and h <= 12),
  visible    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, page, widget_key),
  constraint fits_the_grid check (x + w <= 12)
);

create index if not exists dl_user_page on dashboard_layout (user_id, page);

alter table dashboard_layout enable row level security;
drop policy if exists dl_own on dashboard_layout;
create policy dl_own on dashboard_layout for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table dashboard_layout is
 'Per-user, per-page widget placement on a 12-column grid: x, y, w, h. Built 12 Aug 2026 — owner '
 'asked for trading-terminal behaviour, "I CAN MOVE AND RESIZE EACH AS I WANT". The pre-existing '
 'dashboard_widgets could not express it: it stores (position, span), a one-dimensional flow with '
 'no user column, so it can reorder and set a width but cannot place a panel in two dimensions '
 'and cannot give two executives different views. RLS binds every row to its own user — a layout '
 'is a personal preference and nobody can read or write anyone else''s. The 12-column grid is the '
 'contract: x + w <= 12 is enforced, so a saved layout can never overflow its own canvas.';

-- Save a whole page atomically. A layout is one arrangement, not a pile of independent rows:
-- saving half of it would leave the screen in a state the user never chose.
create or replace function tg_save_layout(p_page text, p_widgets jsonb)
returns int
language plpgsql security invoker set search_path = public as $$
declare n int; bad text;
begin
  if p_page is null or btrim(p_page) = '' then
    raise exception 'tg_save_layout needs a page name.';
  end if;
  if jsonb_typeof(p_widgets) <> 'array' then
    raise exception 'tg_save_layout expects a JSON ARRAY of {widget_key,x,y,w,h,visible}.';
  end if;

  -- Reject an unknown widget by NAME rather than letting the foreign key raise a cryptic error.
  select string_agg(distinct e->>'widget_key', ', ')
    into bad
    from jsonb_array_elements(p_widgets) e
   where not exists (select 1 from widget_catalog c where c.key = e->>'widget_key');
  if bad is not null then
    raise exception
      'Not in widget_catalog: %. A layout may only place widgets the catalogue defines — '
      'otherwise the saved screen references a tile nothing can render.', bad;
  end if;

  delete from dashboard_layout where user_id = auth.uid() and page = p_page;

  insert into dashboard_layout (user_id, page, widget_key, x, y, w, h, visible)
  select auth.uid(), p_page,
         e->>'widget_key',
         coalesce((e->>'x')::int, 0),
         coalesce((e->>'y')::int, 0),
         coalesce((e->>'w')::int, 3),
         coalesce((e->>'h')::int, 2),
         coalesce((e->>'visible')::boolean, true)
  from jsonb_array_elements(p_widgets) e;

  get diagnostics n = row_count;
  return n;
end $$;

comment on function tg_save_layout(text, jsonb) is
 'Saves one page''s widget arrangement for the CALLING user, atomically — delete then insert '
 'inside one transaction, because a half-saved layout leaves a screen the user never chose. '
 'security INVOKER, so RLS applies and nobody can write another person''s layout. Rejects a '
 'widget_key absent from widget_catalog by name.';

create or replace function tg_reset_layout(p_page text)
returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  delete from dashboard_layout where user_id = auth.uid() and page = p_page;
  get diagnostics n = row_count;
  return n;
end $$;

comment on function tg_reset_layout(text) is
 'Drops the caller''s personal layout for a page so it falls back to the house default. Every '
 'rearrangeable surface needs a way back — a user who drags a panel off-screen must not be stuck.';

create or replace view public.v_my_layout as
select c.key            as widget_key,
       l.page           as page,
       c.label          as label,
       c.category       as category,
       c.icon           as icon,
       c.table_ref      as source,
       c.drill          as drill,
       c.format         as format,
       c.hot            as hot,
       c.enabled        as widget_enabled,
       l.x, l.y, l.w, l.h,
       l.visible        as visible,
       (l.user_id is not null) as personalised,
       l.updated_at     as arranged_at
from widget_catalog c
join dashboard_layout l
  on l.widget_key = c.key and l.user_id = auth.uid()
where c.enabled;

comment on view public.v_my_layout is
 'The calling user''s own arrangement, joined to the catalogue so the front end gets placement '
 'AND the widget''s definition in one read. Returns nothing when the user has never personalised '
 'a page — that is the signal to render the house default, not an error. A widget disabled in the '
 'catalogue disappears from every saved layout at once, which is how a retired tile is retired.';

create or replace view public.v_widget_catalog_available as
select key, category, label, icon, table_ref as source, drill, format, hot,
       (drill is null or btrim(drill) = '') as has_no_drill
from widget_catalog
where enabled
order by category, label;

comment on view public.v_widget_catalog_available is
 'Every widget a user may add to a dashboard, for the "add widget" picker. has_no_drill flags a '
 'widget that would land on a page unable to open its own records — the house rule is that every '
 'tile drills, so that flag is a build defect to fix, not a property to design around.';;
