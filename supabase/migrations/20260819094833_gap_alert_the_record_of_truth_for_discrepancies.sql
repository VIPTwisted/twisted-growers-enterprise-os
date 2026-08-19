/* gap_alert — THE RECORD OF TRUTH FOR EVERY DISCREPANCY. Owner directive §14,
 * §16, §17, 19 Aug 2026: "All alerts must be stored in Supabase. No ephemeral
 * logs only. This gives you full audit trail and the ability to show CCC
 * auditors here are all discrepancies we detected and here is how and when we
 * resolved them."
 *
 * v_tag_gap DETECTS live. This table REMEMBERS: when a gap first appeared, who
 * resolved it, when, and why. Detection alone cannot answer an auditor's
 * "when did you know" — a view recomputed every time has no memory.
 *
 * f_raise_gap_alerts() is the loop step: it opens alerts for newly detected
 * gaps, leaves existing open ones alone (so first_seen and any human work
 * survive), and AUTO-RESOLVES alerts whose gap no longer detects — with
 * 'resolved by the data' recorded, never silently deleted. Idempotent: safe to
 * run every five minutes forever. */

create table if not exists public.gap_alert (
  alert_id            bigint generated always as identity primary key,
  fingerprint         text not null unique,
  gap_type            text not null,
  severity            text not null check (severity in ('info','warning','critical')),
  tag_id              text,
  lot_id              text,
  package_id          text,
  strain_id           text,
  harvest_id          text,
  room_id             text,
  description         text not null,
  required_action     text,
  lb_at_stake         numeric,
  created_timestamp   timestamptz not null default now(),
  last_seen_timestamp timestamptz not null default now(),
  resolved_timestamp  timestamptz,
  resolved_by_user_id text,
  resolution_notes    text,
  status              text not null default 'open' check (status in ('open','in_progress','resolved'))
);

create index if not exists gap_alert_open on public.gap_alert (gap_type, severity) where status <> 'resolved';
create index if not exists gap_alert_tag  on public.gap_alert (tag_id);

comment on table public.gap_alert is
  'Owner directive §14/§17: the stored record of every discrepancy the OS has ever detected, with '
  'when it appeared, who resolved it and why. v_tag_gap detects live; THIS remembers. Alerts '
  'whose gap stops detecting are auto-resolved with a written reason, never deleted — an auditor '
  'asking "when did you know" needs the history, and a view recomputed on every read has none. '
  'Agent I, 19 Aug 2026.';

alter table public.gap_alert enable row level security;
create policy gap_read  on public.gap_alert for select to authenticated using (true);
create policy gap_write on public.gap_alert for update to authenticated
  using ((select f_caller_is_admin())) with check ((select f_caller_is_admin()));

create or replace function public.f_raise_gap_alerts(p_by text default 'loop')
returns table (opened int, still_open int, auto_resolved int)
language plpgsql security definer
set search_path to 'public','pg_temp'
as $$
declare v_opened int := 0; v_resolved int := 0; v_open int := 0;
begin
  create temporary table _detected on commit drop as
  with tagged as (
    select
      case rule_code when 'A' then 'missing_coa' when 'B' then 'missing_manifest'
                     when 'C' then 'missing_invoice' when 'D' then 'orphan_tag'
                     when 'E' then 'location_gap' when 'F' then 'timestamp_gap'
                     when 'G' then 'metrc_chain_mismatch' end as gap_type,
      case when severity='critical' then 'critical' else 'warning' end as severity,
      tag as tag_id, null::text as strain_id, null::text as harvest_id, room as room_id,
      what_is_wrong as description, required_action, lb as lb_at_stake
    from v_tag_gap
  ),
  potency as (
    select 'potency_gap', 'critical', null::text, strain, null::text, null::text,
           'Strain ' || strain || ' averages ' || avg_thc || ' % THC on ' || coas
             || ' flower certificates, below the ' || thc_floor || ' % company floor',
           'Owner decision: disable the strain for planting, or record why it stays on the grow list.',
           null::numeric
    from v_strain_gate where recommendation like 'RECOMMEND DISABLING%'
  ),
  under_target as (
    select 'harvest_under_target', 'warning', null::text, h.strain, h.harvest_name, h.drying_room,
           'Harvest ' || h.harvest_name || ' packaged ' || round(h.packaged_lb,1)
             || ' lb against the ' || f_rule('required_lb_per_pull') || ' lb minimum per pull',
           'Review plant count, strain choice and room conditions for this pull.',
           round(h.packaged_lb,1)
    from v_harvest_forensic h
    where h.harvest_closed is not null
      and h.packaged_lb is not null
      and h.packaged_lb < f_rule('required_lb_per_pull')
      and h.harvest_closed >= current_date - 365
  ),
  over_cycle as (
    select 'harvest_over_cycle', 'warning', null::text, h.strain, h.harvest_name, h.drying_room,
           'Harvest ' || h.harvest_name || ' ran ' || h.total_days_start_to_now
             || ' days from cut, past the ' || f_rule('flower_cycle_days') || '-day cycle',
           'Close the harvest in Metrc or explain the hold. A cycle overrun blocks the room turn.',
           null::numeric
    from v_harvest_issues h
    where h.harvest_closed is null
      and h.total_days_start_to_now > f_rule('flower_cycle_days')
  )
  select * from tagged
  union all select * from potency
  union all select * from under_target
  union all select * from over_cycle;

  alter table _detected rename column gap_type to gt;

  insert into gap_alert (fingerprint, gap_type, severity, tag_id, strain_id, harvest_id, room_id,
                         description, required_action, lb_at_stake)
  select distinct on (fp) fp, gt, severity, tag_id, strain_id, harvest_id, room_id,
         description, required_action, lb_at_stake
  from (select *, gt || ':' || coalesce(tag_id, strain_id, harvest_id, description) as fp from _detected) d
  on conflict (fingerprint) do update
     set last_seen_timestamp = now(),
         description         = excluded.description,
         lb_at_stake         = excluded.lb_at_stake;
  get diagnostics v_opened = row_count;

  update gap_alert a
     set status = 'resolved', resolved_timestamp = now(),
         resolved_by_user_id = p_by,
         resolution_notes = coalesce(a.resolution_notes,'')
           || case when a.resolution_notes is null then '' else ' | ' end
           || 'Auto-resolved ' || to_char(now(),'DD Mon YYYY HH24:MI')
           || ': the gap no longer detects. The underlying record was corrected or the material moved on.'
   where a.status <> 'resolved'
     and a.last_seen_timestamp < now() - interval '1 minute';
  get diagnostics v_resolved = row_count;

  select count(*) into v_open from gap_alert where status <> 'resolved';
  return query select v_opened, v_open, v_resolved;
end $$;

comment on function public.f_raise_gap_alerts(text) is
  'The loop step (owner §7/§16): opens gap_alert rows for newly detected gaps, refreshes '
  'last_seen on ones still detecting, and auto-resolves those that stopped — with the reason '
  'written, never deleted. Covers missing_coa, missing_manifest, missing_invoice, orphan_tag, '
  'location_gap, timestamp_gap, metrc_chain_mismatch, potency_gap, harvest_under_target and '
  'harvest_over_cycle. Idempotent. Agent I, 19 Aug 2026.';

grant select on public.gap_alert to authenticated;
grant execute on function public.f_raise_gap_alerts(text) to authenticated;

select cron.schedule('gap-alert-loop', '*/15 * * * *',
  $$set statement_timeout = '10min'; select public.f_raise_gap_alerts('loop')$$);;
