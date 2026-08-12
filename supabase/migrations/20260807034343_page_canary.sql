/* THE CANARY
   ----------
   Every page on this site reads a table or view named in nav_registry. When one
   of those breaks, App.jsx swallows the error with "k.data ?? []" and the page
   renders empty - looking fine, showing nothing. That is how the dashboards
   stayed dead for hours without anyone knowing.

   This walks every enabled page's data source and reports three states:
     ok        - the source exists and has rows
     EMPTY     - it exists and returns nothing (may be correct, may be a break)
     MISSING   - it does not exist at all; the page will render blank
     ERROR     - it exists but will not read

   It is cheap: an existence probe, not a count. Run after every change, and on
   a schedule. */

create table if not exists canary_runs (
  id          bigserial primary key,
  ran_at      timestamptz not null default now(),
  pages       integer,
  ok          integer,
  empty       integer,
  missing     integer,
  errored     integer,
  detail      jsonb
);
alter table canary_runs enable row level security;
drop policy if exists canary_read on canary_runs;
create policy canary_read on canary_runs for select to authenticated using (true);
grant select on canary_runs to authenticated;

create or replace function tg_canary()
returns table (page text, category text, source text, status text, note text)
language plpgsql
security definer
set search_path = public
as $$
declare r record; has_rows boolean;
begin
  for r in
    select label, nav_registry.category, table_ref
    from nav_registry
    where enabled and table_ref is not null
    order by nav_registry.category, label
  loop
    if to_regclass('public.'||r.table_ref) is null then
      page := r.label; category := r.category; source := r.table_ref;
      status := 'MISSING'; note := 'object does not exist - page renders blank';
      return next; continue;
    end if;
    begin
      execute format('select exists(select 1 from %I limit 1)', r.table_ref) into has_rows;
      page := r.label; category := r.category; source := r.table_ref;
      if has_rows then status := 'ok'; note := null;
      else status := 'EMPTY'; note := 'exists but returns no rows';
      end if;
      return next;
    exception when others then
      page := r.label; category := r.category; source := r.table_ref;
      status := 'ERROR'; note := left(sqlerrm,120);
      return next;
    end;
  end loop;
end $$;

grant execute on function tg_canary() to authenticated;

/* Records a run so a break has a timestamp and a history, not just a moment. */
create or replace function tg_canary_record()
returns canary_runs
language plpgsql
security definer
set search_path = public
as $$
declare row canary_runs;
begin
  with c as (select * from tg_canary())
  insert into canary_runs (pages, ok, empty, missing, errored, detail)
  select count(*),
         count(*) filter (where status='ok'),
         count(*) filter (where status='EMPTY'),
         count(*) filter (where status='MISSING'),
         count(*) filter (where status='ERROR'),
         coalesce(jsonb_agg(jsonb_build_object('page',page,'source',source,'status',status,'note',note))
                  filter (where status <> 'ok'), '[]'::jsonb)
  from c
  returning * into row;
  return row;
end $$;

grant execute on function tg_canary_record() to authenticated;

comment on function tg_canary() is
  'Probes every enabled page''s data source. ok / EMPTY / MISSING / ERROR. Run after every change.';;
