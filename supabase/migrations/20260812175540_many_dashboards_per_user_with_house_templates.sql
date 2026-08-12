-- Agent I, 12 Aug 2026. DBI-074.
--
-- OWNER: "STUFF FROM LETS SAY OUR WORK PLACE OR IF IT IS YEAR END I MAY WANT TO SET UP DASH MORE
-- FOR FINANCE TOO VERY VERY FLEXIBLE" ... "OR CULTIVATION, OR PACKAGING, OR HR".
--
-- He is not asking for one rearrangeable dashboard. He is asking for MANY, each set up for a
-- different job, switchable — Finance at year end, Cultivation in season, Packaging when supply
-- is tight. dashboard_layout.page is already text so several can coexist, but nothing NAMES them,
-- nothing lists them, and there is no way to create, rename, copy or delete one. A dashboard the
-- user cannot name is a dashboard they cannot find again.
--
-- HOUSE TEMPLATES so he never starts from an empty grid. A template references CATEGORIES, not a
-- hardcoded list of widget keys: the catalogue holds 50 widgets and will grow, and a template
-- naming keys would rot the first time one is renamed or retired. Seed by category and a new
-- Finance widget joins the Finance starter automatically.
--
-- UNDO: drop functions tg_create_dashboard, tg_rename_dashboard, tg_delete_dashboard,
--       tg_set_default_dashboard; drop view v_my_dashboards; drop table dashboard_template,
--       user_dashboard.

create table if not exists user_dashboard (
  user_id       uuid    not null default auth.uid(),
  dashboard_key text    not null,
  name          text    not null,
  purpose       text,
  is_default    boolean not null default false,
  sort          int     not null default 100,
  from_template text,
  created_at    timestamptz not null default now(),
  primary key (user_id, dashboard_key),
  constraint dashboard_key_is_a_slug check (dashboard_key ~ '^[a-z0-9_-]{2,40}$')
);

create unique index if not exists one_default_per_user
  on user_dashboard (user_id) where is_default;

alter table user_dashboard enable row level security;
drop policy if exists ud_own on user_dashboard;
create policy ud_own on user_dashboard for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table user_dashboard is
 'The dashboards a user has created, each a named arrangement of widgets. Built 12 Aug 2026 — the '
 'owner wants Finance at year end, Cultivation, Packaging, HR, switchable. dashboard_key joins to '
 'dashboard_layout.page. A partial unique index enforces exactly one default per user, so opening '
 'the platform can never be ambiguous. RLS binds every row to its owner: a dashboard is a personal '
 'arrangement and nobody sees anyone else''s.';

create table if not exists dashboard_template (
  template_key text primary key,
  name         text not null,
  purpose      text not null,
  categories   text[] not null,
  sort         int not null default 100,
  active       boolean not null default true
);

alter table dashboard_template enable row level security;
drop policy if exists dt_read on dashboard_template;
create policy dt_read on dashboard_template for select to authenticated using (true);

comment on table dashboard_template is
 'House starters so nobody begins at an empty grid. A template names CATEGORIES, never widget '
 'keys: the catalogue holds 50 widgets and will grow, and a template listing keys would rot the '
 'first time one is renamed or retired. Seed by category and a new Finance widget joins the '
 'Finance starter by itself.';

insert into dashboard_template (template_key, name, purpose, categories, sort) values
('command','Command — everything','The whole company at a glance. The default when nothing else is chosen.',
 array['Command','Inventory','Compliance','Workspace'],10),
('finance','Finance and year end','Money, cost, margin and what an auditor will ask for. Set this up ahead of year end.',
 array['Command','Inventory','Workspace'],20),
('cultivation','Cultivation','Rooms, plants, pulls and cycle discipline.',
 array['Cultivation','Compliance'],30),
('packaging','Packaging and supply','Finished goods, what is ready to ship, what is expiring, and what needs reordering.',
 array['Inventory','Quality','Workspace'],40),
('hr','People','Who is on, who is missing, and what payroll is carrying. Several of these read tables that are not yet fed.',
 array['Human Resources','Workspace'],50),
('sales','Sales','What is ready to ship, what is going out, and what is committed.',
 array['Inventory','Command'],60)
on conflict (template_key) do update set
  name = excluded.name, purpose = excluded.purpose,
  categories = excluded.categories, sort = excluded.sort;

create or replace function tg_create_dashboard(
  p_name text, p_template text default null, p_key text default null)
returns text
language plpgsql security invoker set search_path = public as $$
declare v_key text; v_cats text[]; n int := 0; w record; v_first boolean;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'A dashboard needs a name — one you can find again in a list of six.';
  end if;

  v_key := coalesce(nullif(btrim(p_key),''),
                    left(regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '_', 'g'), 40));
  v_key := btrim(v_key, '_-');
  if v_key !~ '^[a-z0-9_-]{2,40}$' then
    raise exception 'Could not make a usable key from "%". Try a name with some letters in it.', p_name;
  end if;
  if exists (select 1 from user_dashboard where user_id = auth.uid() and dashboard_key = v_key) then
    raise exception 'You already have a dashboard called "%". Rename that one or pick another name.', p_name;
  end if;

  if p_template is not null then
    select categories into v_cats from dashboard_template
     where template_key = p_template and active;
    if v_cats is null then
      raise exception 'No template "%". Choose one from dashboard_template, or omit it for an empty grid.', p_template;
    end if;
  end if;

  select not exists (select 1 from user_dashboard where user_id = auth.uid()) into v_first;

  insert into user_dashboard (dashboard_key, name, purpose, from_template, is_default)
  values (v_key, btrim(p_name),
          (select purpose from dashboard_template where template_key = p_template),
          p_template, v_first);

  -- Seed the grid: 4 across, each 3 wide by 2 tall. Hot widgets first so the loudest thing is
  -- top-left, where the eye lands.
  if v_cats is not null then
    for w in
      select key, widget_kind from widget_catalog
       where enabled and category = any(v_cats)
       order by hot desc nulls last, category, label
    loop
      insert into dashboard_layout (page, widget_key, instance_id, x, y, w, h)
      values (v_key, w.key, 1, (n % 4) * 3, (n / 4) * 2, 3, 2);
      n := n + 1;
    end loop;
  end if;

  return v_key;
end $$;

comment on function tg_create_dashboard(text, text, text) is
 'Creates a named dashboard for the caller, optionally seeded from a house template. The first '
 'dashboard a user creates becomes their default automatically — otherwise they would have one '
 'dashboard and no default, and the platform would open to nothing.';

create or replace function tg_rename_dashboard(p_key text, p_name text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'A dashboard needs a name.';
  end if;
  update user_dashboard set name = btrim(p_name)
   where user_id = auth.uid() and dashboard_key = p_key;
  if not found then raise exception 'You have no dashboard "%".', p_key; end if;
end $$;

create or replace function tg_delete_dashboard(p_key text)
returns void language plpgsql security invoker set search_path = public as $$
declare was_default boolean;
begin
  select is_default into was_default from user_dashboard
   where user_id = auth.uid() and dashboard_key = p_key;
  if was_default is null then raise exception 'You have no dashboard "%".', p_key; end if;

  delete from dashboard_layout where user_id = auth.uid() and page = p_key;
  delete from user_dashboard  where user_id = auth.uid() and dashboard_key = p_key;

  -- Never leave the user with dashboards but no default — the platform would open to nothing.
  if was_default then
    update user_dashboard set is_default = true
     where user_id = auth.uid()
       and dashboard_key = (select dashboard_key from user_dashboard
                             where user_id = auth.uid() order by sort, name limit 1);
  end if;
end $$;

create or replace function tg_set_default_dashboard(p_key text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from user_dashboard where user_id = auth.uid() and dashboard_key = p_key)
    then raise exception 'You have no dashboard "%".', p_key; end if;
  update user_dashboard set is_default = false where user_id = auth.uid() and is_default;
  update user_dashboard set is_default = true  where user_id = auth.uid() and dashboard_key = p_key;
end $$;

create or replace view public.v_my_dashboards as
select d.dashboard_key, d.name, d.purpose, d.is_default, d.sort, d.from_template, d.created_at,
       count(l.widget_key)                                  as widgets,
       count(l.widget_key) filter (where not l.visible)     as hidden,
       max(l.updated_at)                                    as last_arranged
from user_dashboard d
left join dashboard_layout l on l.user_id = d.user_id and l.page = d.dashboard_key
where d.user_id = auth.uid()
group by d.dashboard_key, d.name, d.purpose, d.is_default, d.sort, d.from_template, d.created_at
order by d.is_default desc, d.sort, d.name;

comment on view public.v_my_dashboards is
 'The caller''s dashboards for the switcher: name, purpose, widget count and when it was last '
 'rearranged. Default first. Returns nothing for a user who has never made one — the signal to '
 'offer the template picker, not an error.';

create or replace view public.v_dashboard_templates as
select t.template_key, t.name, t.purpose, t.categories,
       (select count(*) from widget_catalog c
         where c.enabled and c.category = any(t.categories))       as widgets_it_would_add,
       (select string_agg(distinct c.category, ', ' order by c.category)
          from widget_catalog c
         where c.enabled and c.category = any(t.categories))       as covers
from dashboard_template t where t.active order by t.sort;

comment on view public.v_dashboard_templates is
 'The starter picker, with a live count of how many widgets each template would place — computed '
 'from the catalogue, so the number is never a stale promise.';;
