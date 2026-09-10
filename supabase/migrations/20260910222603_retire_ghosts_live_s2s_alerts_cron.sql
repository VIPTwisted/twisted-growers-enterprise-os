-- Owner GO 10 Sep 2026. Close the four open holes and keep them closed.
-- 1. Ghost actives: a completed packages full sweep on THAT licence that did not
--    rewrite a row means Metrc did not return it. Flip source_state inactive on
--    the same licence only. Other-licence inactive is a transfer origin, not a
--    finish. Criterion is synced_at < sweep.started_at (NOT finished_at — rows
--    written during the sweep are Metrc-confirmed). Log every tag. Not a Metrc POST.
-- 2. v_facility_s2s_rooms: live occupancy the map reads. Fail closed. Never a
--    frozen 9 Sep number dressed as today.
-- 3. Alerts: tracker counted sent_at is null (resolved + suppressed). Count only
--    truly queued. Honour sync_failures_only on insert so the inbox cannot refill.
-- 4. Cron: intelligence-sweep died at the default 2 min statement_timeout on
--    f_price_per_lb. Raise the timeout (120s is the default, a no-op) and keep
--    the supporting index if not exists.

create table if not exists public.metrc_package_retire_log (
  id bigserial primary key,
  license text not null,
  tag text not null,
  location text,
  quantity numeric,
  uom text,
  prev_state text,
  sweep_started_at timestamptz,
  retired_at timestamptz not null default now(),
  why text not null
);

comment on table public.metrc_package_retire_log is
  'OS-side retire of active package rows a completed same-licence full sweep did not rewrite. Not a Metrc POST.';

alter table public.metrc_package_retire_log enable row level security;

drop policy if exists metrc_package_retire_log_read on public.metrc_package_retire_log;
create policy metrc_package_retire_log_read
  on public.metrc_package_retire_log
  for select
  to authenticated
  using (true);

grant select on public.metrc_package_retire_log to authenticated;

create or replace function public.f_metrc_retire_untouched_after_full_sweep()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  logged int := 0;
  n int;
  r record;
begin
  for r in
    select distinct on (license) license, started_at, finished_at, records
    from metrc_sync_runs
    where endpoint like 'packages (full sweep)%'
      and status = 'ok'
      and finished_at is not null
    order by license, finished_at desc
  loop
    with gone as (
      update metrc_packages p
         set source_state = 'inactive',
             finished = true
       where p.license = r.license
         and p.source_state = 'active'
         and p.synced_at < r.started_at
      returning p.license, p.tag, p.location, p.quantity, p.uom, r.started_at as sweep_started_at
    )
    insert into metrc_package_retire_log (license, tag, location, quantity, uom, prev_state, sweep_started_at, why)
    select license, tag, location, quantity, uom, 'active', sweep_started_at,
           'Completed packages full sweep on this licence started after this row last synced. Metrc did not return it. OS copy flipped inactive. Same-licence only. Unique key is (license, tag). Other-licence inactive is a transfer origin, not a finish. Not a Metrc POST.'
    from gone;
    get diagnostics n = row_count;
    logged := logged + n;
  end loop;

  return jsonb_build_object('ok', true, 'logged', logged);
end
$fn$;

comment on function public.f_metrc_retire_untouched_after_full_sweep() is
  'Flip same-licence active packages a completed full sweep did not rewrite. Uses started_at, never finished_at. Not a Metrc POST.';

revoke all on function public.f_metrc_retire_untouched_after_full_sweep() from public, anon, authenticated;
grant execute on function public.f_metrc_retire_untouched_after_full_sweep() to postgres, service_role;

create or replace view public.v_facility_s2s_rooms as
with plants as (
  select license,
         room,
         count(*) filter (where source_state = 'flowering')  as tagged_flowering,
         count(*) filter (where source_state = 'vegetative') as tagged_veg
    from metrc_plants
   where source_state in ('flowering','vegetative')
   group by 1,2
),
pkgs as (
  select p.license,
         p.location as room,
         count(*) as pkg_n,
         coalesce(sum(case when p.uom = 'g' then p.quantity else 0 end), 0) as pkg_qty_g,
         count(*) filter (
           where p.synced_at < (
             select max(s.started_at) from metrc_sync_runs s
              where s.endpoint like 'packages (full sweep)%'
                and s.status = 'ok'
                and s.finished_at is not null
                and s.license = p.license
           )
         ) as pkg_stale_n
    from metrc_packages p
   where p.source_state = 'active'
     and not coalesce(p.finished, false)
   group by 1,2
),
harv as (
  select license,
         flower_room as room,
         count(*) as harvests_open,
         coalesce(sum(wet_weight), 0) as harvest_wet_lb
    from metrc_harvests
   where source_state is distinct from 'inactive'
     and coalesce(flower_room, '') <> ''
   group by 1,2
),
rooms as (
  select license, room from plants
  union
  select license, room from pkgs
  union
  select license, room from harv
)
select r.license as licence,
       r.room,
       coalesce(pl.tagged_flowering, 0)::int as tagged_flowering,
       coalesce(pl.tagged_veg, 0)::int as tagged_veg,
       coalesce(pk.pkg_n, 0)::int as pkg_n,
       coalesce(pk.pkg_qty_g, 0)::numeric as pkg_qty_g,
       coalesce(pk.pkg_stale_n, 0)::int as pkg_stale_n,
       coalesce(h.harvests_open, 0)::int as harvests_open,
       coalesce(h.harvest_wet_lb, 0)::numeric as harvest_wet_lb,
       (select max(synced_at) from metrc_packages p2 where p2.license = r.license) as packages_as_of,
       (select max(synced_at) from metrc_plants t2 where t2.license = r.license) as plants_as_of,
       case
         when coalesce(pl.tagged_flowering,0)+coalesce(pl.tagged_veg,0)+coalesce(pk.pkg_n,0)+coalesce(h.harvests_open,0) = 0
           then 'EMPTY'
         when coalesce(pk.pkg_stale_n,0) > 0 then 'ISSUE'
         when coalesce(pl.tagged_flowering,0)+coalesce(pl.tagged_veg,0) > 0 then 'CERTIFIED'
         else 'PARTIAL'
       end as status
  from rooms r
  left join plants pl on pl.license = r.license and pl.room = r.room
  left join pkgs pk on pk.license = r.license and pk.room = r.room
  left join harv h on h.license = r.license and h.room = r.room;

comment on view public.v_facility_s2s_rooms is
  'Live Metrc occupancy for the facility map. Tagged plants, active unfinished packages, open harvests. Not the 9 Sep seed. Clone/veg untagged batches are not in this view.';

grant select on public.v_facility_s2s_rooms to authenticated;
revoke all on public.v_facility_s2s_rooms from anon, public;

-- Supporting index for intelligence-sweep / f_price_per_lb. Idempotent if already applied.
create index if not exists metrc_rpt_package_transfers_category_price_idx
  on public.metrc_rpt_package_transfers
  using btree (lower(coalesce(category, ''::text)))
  include (shipper_wholesale_price, shipped_qty, shipped_uom)
  where shipper_wholesale_price > 0 and shipped_uom is not null;

-- 120s is the default statement_timeout. Jobs that die at 2 min need MORE than 2 min.
-- cron.job is not updatable by the migrator; unschedule + schedule is the public API.
do $cron$
declare
  v_sched text;
begin
  select schedule into v_sched from cron.job where jobname = 'refresh-tower-inventory';
  if v_sched is not null then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'refresh-tower-inventory';
    perform cron.schedule('refresh-tower-inventory', v_sched,
      $cmd$set statement_timeout = '5min'; refresh materialized view concurrently mv_tower_inventory$cmd$);
  end if;

  v_sched := null;
  select schedule into v_sched from cron.job where jobname = 'intelligence-sweep';
  if v_sched is not null then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'intelligence-sweep';
    perform cron.schedule('intelligence-sweep', v_sched,
      $cmd$set statement_timeout = '10min'; select tg_intelligence_sweep()$cmd$);
  end if;

  if not exists (select 1 from cron.job where jobname = 'retire-untouched-packages') then
    perform cron.schedule('retire-untouched-packages', '7,37 * * * *',
      'select public.f_metrc_retire_untouched_after_full_sweep()');
  end if;
end
$cron$;

-- Honour owner 17 Aug scope on every NEW outbox row so the inbox cannot refill.
create or replace function public.tg_alert_outbox_honour_email_scope()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $tg$
declare v_scope text;
begin
  select value->>'scope' into v_scope from configurations where key = 'alert_email';
  if new.channel = 'email'
     and new.email_suppressed_at is null
     and new.sent_at is null
     and coalesce(v_scope, '') = 'sync_failures_only'
     and coalesce(new.source, '') <> 'sync_digest' then
    new.email_suppressed_at := now();
    new.email_suppressed_why :=
      'Owner instruction 17 Aug 2026: only sync failures reach email. Recorded in the platform, excluded from the inbox. Not resolved, not deleted.';
  end if;
  return new;
end
$tg$;

drop trigger if exists trg_alert_outbox_honour_email_scope on public.alert_outbox;
create trigger trg_alert_outbox_honour_email_scope
  before insert on public.alert_outbox
  for each row
  execute procedure public.tg_alert_outbox_honour_email_scope();

-- Existing truly-queued non-digest rows: same policy. Do not delete them.
update public.alert_outbox
   set email_suppressed_at = now(),
       email_suppressed_why =
         'Owner instruction 17 Aug 2026: only sync failures reach email. This row was queued after that policy and is still open in the platform — excluded from the inbox, not from the record. Owner GO 10 Sep 2026. Carroll/Hendrix credential nags: they left; OS inactive; we do not POST to Metrc.'
 where channel = 'email'
   and sent_at is null
   and dispatched_at is null
   and resolved_at is null
   and email_suppressed_at is null
   and coalesce(source, '') <> 'sync_digest';
