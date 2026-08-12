create table if not exists agent_findings (
  id uuid primary key default gen_random_uuid(),
  detected_at timestamptz default now(),
  agent text not null,
  severity text not null check (severity in ('critical','elevated','watch','good')),
  headline text not null, detail text, metric numeric, units text, dollars numeric,
  scope text, action text, drill_to text, fingerprint text,
  resolved_at timestamptz, resolution text
);
alter table agent_findings enable row level security;
drop policy if exists af_read on agent_findings;
drop policy if exists af_write on agent_findings;
create policy af_read on agent_findings for select to authenticated using (true);
create policy af_write on agent_findings for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')));
create unique index if not exists af_open_fp on agent_findings (fingerprint) where resolved_at is null;

create or replace view v_intelligence_briefing as
select agent, severity, count(*) as findings,
  round(sum(coalesce(dollars,0))::numeric,0) as dollars_at_stake,
  string_agg(distinct scope, ', ') filter (where scope is not null and scope <> '') as areas,
  max(detected_at) as latest
from agent_findings where resolved_at is null
group by agent, severity
order by case severity when 'critical' then 0 when 'elevated' then 1 else 2 end, findings desc;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Intelligence Findings', 2, 'bell', 'agent_findings', 'agent_findings', 'Everything the watching agents have found: schedule violations, waste above the limit priced in dollars, rooms being blocked, missing weights, compliance exposure, cash sitting too long, and material with no approved allocation - each with exactly what to do about it.'),
  ('Intelligence Briefing', 3, 'gauge', 'intelligence_briefing', 'v_intelligence_briefing', 'The briefing: how many findings each watching agent has open, at what severity, the dollars at stake, and which rooms or areas are affected.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);;
