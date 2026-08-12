-- DASHBOARDS MUST HAVE A DATE RANGE, AND EACH USER SETS THEIR OWN DEFAULT.
-- Owner, 8 Aug 2026:
--   "Right now dashboards are pulling ALL DATA. That is not functional or the way
--    dashboards are meant to function... I may want to login and see week, someone
--    else may want to see day, another may want to see annual, and we must have the
--    ability to change date and date range in ALL dashboards. And also set the default."
--
-- A dashboard showing all data since 2023 cannot answer "how are we doing this week",
-- which is the only question a dashboard exists to answer. It also quietly mixes
-- periods: a tile reading 2,519 lb across three years looks like a current position
-- and is not one.
--
-- THREE LEVELS, most specific wins:
--   1. this user, this page   - user_page_date_default   ("Control Tower always annual")
--   2. this user, everywhere  - user_settings.default_date_preset  ("I work in weeks")
--   3. the page's own default - report_registry / 'this_month'
-- A user who has set nothing gets the page default, never "all data".
--
-- UNDO: alter table user_settings drop column default_date_preset, drop column
--       date_default_scope; drop table user_page_date_default.

alter table user_settings
  add column if not exists default_date_preset text
    references date_range_presets(preset_key),
  add column if not exists date_default_scope text not null default 'remember_last';

comment on column user_settings.default_date_preset is
  'This user''s date range on login, for every dashboard and report unless the page '
  'overrides it. One of date_range_presets.preset_key. NULL means use the page default. '
  'This is why one person opens to This Week and another to This Fiscal Year.';
comment on column user_settings.date_default_scope is
  'remember_last - reopen with whatever range was last used on that page. '
  'always_default - always reopen at default_date_preset, ignoring the last use. '
  'People who work to a fixed rhythm want always_default; people who investigate want '
  'remember_last.';

create table if not exists public.user_page_date_default (
  user_id     uuid not null,
  view_key    text not null,
  preset_key  text not null references date_range_presets(preset_key),
  custom_from date,
  custom_to   date,
  set_at      timestamptz not null default now(),
  primary key (user_id, view_key)
);
alter table public.user_page_date_default enable row level security;

drop policy if exists updd_own on public.user_page_date_default;
create policy updd_own on public.user_page_date_default
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.user_page_date_default is
  'Per user, per page date default - the most specific level. Lets one person keep '
  'Control Tower on This Fiscal Year while their inventory pages open on Today. '
  'RLS restricts every row to its own user: a saved view is personal.';

-- Resolve the three levels in one place so no page implements the precedence itself.
create or replace function public.f_date_default(p_user uuid, p_view_key text)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'preset_key', coalesce(
        (select p.preset_key from user_page_date_default p
          where p.user_id = p_user and p.view_key = p_view_key),
        (select u.default_date_preset from user_settings u where u.user_id = p_user),
        (select case when r.date_column is null then 'all' else 'this_month' end
           from report_registry r
           join nav_registry n on n.table_ref = r.fact_view
          where n.view_key = p_view_key limit 1),
        'this_month'),
    'custom_from', (select p.custom_from from user_page_date_default p
                     where p.user_id = p_user and p.view_key = p_view_key),
    'custom_to',   (select p.custom_to from user_page_date_default p
                     where p.user_id = p_user and p.view_key = p_view_key),
    'scope', coalesce((select u.date_default_scope from user_settings u
                        where u.user_id = p_user), 'remember_last'),
    'source', case
       when exists (select 1 from user_page_date_default p
                     where p.user_id = p_user and p.view_key = p_view_key)
            then 'this user, this page'
       when exists (select 1 from user_settings u
                     where u.user_id = p_user and u.default_date_preset is not null)
            then 'this user, everywhere'
       else 'page default' end
  );
$$;

comment on function public.f_date_default(uuid, text) is
  'The date range a page opens on, resolving three levels: this user on this page, '
  'then this user everywhere, then the page default. Call it once per page load - '
  'never re-implement the precedence in the UI, or the levels will disagree. Returns '
  'source so the UI can show WHY it opened on that range.';;
