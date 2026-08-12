-- Every headline number must declare its source, its assumptions and its known limits.
create table if not exists metric_provenance (
  metric_key text primary key,
  metric_label text not null,
  shown_on text not null,
  source_tables text not null,
  source_view text,
  how_it_is_calculated text not null,
  assumptions text not null,
  known_limits text,
  benchmark_source text,
  benchmark_is_sourced boolean not null default false,
  status text not null default 'UNVERIFIED'
    check (status in ('UNVERIFIED','UNDER REVIEW','VERIFIED','DISPUTED','WITHDRAWN')),
  last_verified_at timestamptz,
  last_verified_by text,
  updated_at timestamptz not null default now()
);
alter table metric_provenance enable row level security;
drop policy if exists mp_read on metric_provenance;
create policy mp_read on metric_provenance for select to authenticated using (true);
drop policy if exists mp_write on metric_provenance;
create policy mp_write on metric_provenance for all to authenticated using (true) with check (true);

-- A user challenge against a number, and the agent's answer, kept forever.
create table if not exists metric_challenges (
  id bigserial primary key,
  metric_key text not null references metric_provenance(metric_key),
  raised_by uuid default auth.uid(),
  raised_at timestamptz not null default now(),
  challenge text not null,
  agent_finding text,
  evidence jsonb,
  verdict text check (verdict in ('CONFIRMED CORRECT','CORRECTED','WITHDRAWN','INCONCLUSIVE')),
  what_changed text,
  resolved_at timestamptz,
  resolved_by text
);
alter table metric_challenges enable row level security;
drop policy if exists mc_all on metric_challenges;
create policy mc_all on metric_challenges for all to authenticated using (true) with check (true);

create or replace function tg_challenge_metric(p_key text, p_challenge text)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
  if length(coalesce(p_challenge,'')) < 10 then
    raise exception 'A challenge needs a written question of at least ten characters.';
  end if;
  insert into metric_challenges (metric_key, challenge) values (p_key, p_challenge) returning id into v_id;
  update metric_provenance set status='UNDER REVIEW', updated_at=now() where metric_key=p_key;
  return v_id;
end $$;

create or replace function tg_resolve_challenge(p_id bigint, p_verdict text, p_finding text, p_changed text, p_by text)
returns void language plpgsql security definer set search_path=public as $$
declare v_key text;
begin
  if length(coalesce(p_finding,'')) < 20 then
    raise exception 'Resolving a challenge needs a written finding of at least twenty characters.';
  end if;
  update metric_challenges set verdict=p_verdict, agent_finding=p_finding, what_changed=p_changed,
    resolved_at=now(), resolved_by=p_by where id=p_id returning metric_key into v_key;
  update metric_provenance set
    status = case p_verdict when 'CONFIRMED CORRECT' then 'VERIFIED' when 'CORRECTED' then 'VERIFIED'
                            when 'WITHDRAWN' then 'WITHDRAWN' else 'DISPUTED' end,
    last_verified_at = now(), last_verified_by = p_by, updated_at = now()
  where metric_key = v_key;
end $$;

insert into metric_provenance (metric_key, metric_label, shown_on, source_tables, source_view,
  how_it_is_calculated, assumptions, known_limits, benchmark_source, benchmark_is_sourced, status) values
('conversion_pct','Wet to packaged conversion','Chief Executive Dashboard, Yield vs Industry',
 'metrc_harvests','v_monthly_conversion_truth',
 'TotalPackagedWeight divided by TotalWetWeight, from the raw Metrc harvest record, counting ONLY harvests where FinishedDate is set.',
 'Assumes a harvest that has not closed has not finished packaging, so including it would understate conversion.',
 'Cannot separate A bud, B bud and trim - Metrc reports one packaged total per harvest.',
 'Fresh cannabis is 75-80 percent water, giving a 4:1 to 5:1 wet:dry ratio, so 20-25 percent is the commercial norm.',
 true,'VERIFIED'),
('grams_per_plant','Grams per plant','Chief Executive Dashboard',
 'metrc_harvests',null,
 'TotalPackagedWeight divided by PlantCount.',
 'None valid. This measure is determined by plant density and veg time, not by cultivation performance.',
 'NOT A VALID BENCHMARK. An earlier version of the dashboard compared this against 130 g/plant. That figure was never sourced and has been withdrawn.',
 'Published benchmark is grams per square foot of canopy: 35 for start-ups, 50-70 established, at 0.65-1.0 plants per sq ft. That implies roughly 50-75 g/plant.',
 true,'WITHDRAWN'),
('dry_days','Days from cut to first package','Drying Room Performance, Chief Executive Dashboard',
 'metrc_harvests, metrc_packages','v_harvest_forensic',
 'Earliest PackagedDate of any package whose SourceHarvestNames contains the harvest, minus HarvestStartDate.',
 'Assumes the first package off a harvest marks the end of drying.',
 'A harvest with no packages yet has no measurable dry time and is excluded.',
 'Ten to fourteen days is the standard commercial dry window.',
 true,'UNVERIFIED'),
('room_performance','Room comparison','Drying Room Performance',
 'metrc_harvests','v_dry_room_performance',
 'Grouped by DryingLocationName from the raw Metrc harvest record.',
 'These are DRYING locations, not grow rooms.',
 'IMPORTANT: an earlier version of this report was described as comparing GROW rooms. It does not. Metrc records only the drying location on a harvest. Grow room is not available in this data.',
 null,false,'DISPUTED'),
('open_harvests','Harvests open past 21 days','Chief Executive Dashboard',
 'metrc_harvests','v_harvest_forensic',
 'Harvests where FinishedDate is null, counted by days since HarvestStartDate.',
 'Assumes Metrc FinishedDate is kept current by staff.',
 'If staff do not close harvests in Metrc promptly, this overstates the problem. That is itself worth knowing.',
 null,false,'UNVERIFIED'),
('real_loss','Genuine loss in dollars','Chief Executive Dashboard',
 'metrc_harvests, metrc_packages','v_real_loss',
 'Underperforming harvests and failed-testing product valued at target cost per pound.',
 'Assumes a target cost per pound supplied by the owner. Routine trim waste is deliberately EXCLUDED because it is already inside cost per pound.',
 'An earlier version valued routine trim waste at $1,100/lb and reported $1,715,890. That was wrong and was withdrawn.',
 null,false,'UNVERIFIED')
on conflict (metric_key) do update set
  how_it_is_calculated=excluded.how_it_is_calculated, assumptions=excluded.assumptions,
  known_limits=excluded.known_limits, benchmark_source=excluded.benchmark_source,
  benchmark_is_sourced=excluded.benchmark_is_sourced, status=excluded.status, updated_at=now();

drop view if exists v_metric_trust cascade;
create view v_metric_trust as
select p.metric_key, p.metric_label, p.shown_on, p.status,
  case p.status
    when 'VERIFIED' then 'Checked against source and confirmed. Safe to act on.'
    when 'UNVERIFIED' then 'Computed from Metrc but not yet independently checked. Treat as indicative, not as grounds for a personnel decision.'
    when 'UNDER REVIEW' then 'A challenge has been raised and is being investigated.'
    when 'DISPUTED' then 'A known problem is recorded against this number. Read the limits before using it.'
    when 'WITHDRAWN' then 'This measure has been withdrawn and must not be used.'
  end as what_the_status_means,
  case when p.benchmark_is_sourced then 'Benchmark is sourced' else 'NO SOURCED BENCHMARK - do not state a comparison' end as benchmark_check,
  p.source_view, p.source_tables, p.how_it_is_calculated, p.assumptions, p.known_limits, p.benchmark_source,
  p.last_verified_at, p.last_verified_by,
  (select count(*) from metric_challenges c where c.metric_key=p.metric_key) as challenges_raised,
  (select count(*) from metric_challenges c where c.metric_key=p.metric_key and c.resolved_at is null) as challenges_open
from metric_provenance p
order by case p.status when 'WITHDRAWN' then 1 when 'DISPUTED' then 2 when 'UNDER REVIEW' then 3 when 'UNVERIFIED' then 4 else 5 end;

drop view if exists v_metric_challenge_log cascade;
create view v_metric_challenge_log as
select c.id, c.metric_key, p.metric_label, c.raised_at, c.challenge,
  coalesce(c.verdict,'OPEN') as verdict, c.agent_finding, c.what_changed, c.resolved_at, c.resolved_by
from metric_challenges c join metric_provenance p using (metric_key) order by c.raised_at desc;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='ceo_dashboard' limit 1), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('TRUST LEDGER — Can I Believe This Number?', 3, 'shield', 'metric_trust', 'v_metric_trust',
  'Every headline number on this platform with its exact source, how it is calculated, what it assumes, what it cannot tell you, and whether its benchmark is actually sourced. Anything marked UNVERIFIED must not be used for a personnel decision until it is checked.'),
 ('Challenge Log — Numbers Questioned', 4, 'message-square', 'metric_challenge_log', 'v_metric_challenge_log',
  'Every challenge raised against a number, what the investigation found, and what changed as a result. Kept permanently.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, true from (values ('metric_trust'),('metric_challenge_log')) x(k),
 (values ('owner'),('executive'),('manager'),('member')) r(role)
on conflict (view_key, role) do update set visible = true;;
