-- Every finding can carry a written plan, a disposition, and a permanent history
-- that can be pulled back years later exactly as it stood.
create table if not exists finding_plans (
  id uuid primary key default gen_random_uuid(),
  finding_key text not null,
  finding_source text not null,
  headline text not null,
  snapshot jsonb,
  plan text,
  owner_assigned text,
  due_on date,
  disposition text not null default 'open'
    check (disposition in ('open','planned','saved_for_later','on_todo_list','shared','resolved','ignored')),
  disposition_reason text,
  decided_by text,
  decided_at timestamptz,
  dollars numeric,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table finding_plans enable row level security;
drop policy if exists fp_read on finding_plans;
drop policy if exists fp_write on finding_plans;
create policy fp_read on finding_plans for select to authenticated using (true);
create policy fp_write on finding_plans for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')));
create index if not exists fp_key on finding_plans (finding_key);
create index if not exists fp_disp on finding_plans (disposition, created_at desc);

-- Ignoring something needs a reason on the record, same discipline as a denial.
create or replace function tg_finding_plan_guard() returns trigger as $$
begin
  if new.disposition = 'ignored' and coalesce(length(trim(new.disposition_reason)),0) < 15 then
    raise exception 'Ignoring a finding needs a written reason of at least fifteen characters, so the decision is defensible later.';
  end if;
  if new.disposition <> coalesce(old.disposition, 'open') then
    new.decided_at := now();
    new.decided_by := coalesce(new.decided_by, auth.uid()::text);
  end if;
  new.updated_at := now();
  return new;
end $$ language plpgsql;
drop trigger if exists trg_finding_plan on finding_plans;
create trigger trg_finding_plan before insert or update on finding_plans
  for each row execute function tg_finding_plan_guard();

-- Snapshot the finding exactly as it stood, so it can be pulled back years later.
create or replace function tg_save_finding(
  p_key text, p_source text, p_headline text, p_snapshot jsonb,
  p_disposition text default 'saved_for_later', p_plan text default null,
  p_reason text default null, p_owner text default null, p_due date default null, p_dollars numeric default null
) returns uuid as $$
declare fid uuid;
begin
  insert into finding_plans (finding_key, finding_source, headline, snapshot, plan, disposition,
    disposition_reason, owner_assigned, due_on, dollars, created_by)
  values (p_key, p_source, p_headline, p_snapshot, p_plan, p_disposition,
    p_reason, p_owner, p_due, p_dollars, auth.uid()::text)
  returning id into fid;
  -- putting it on the to-do list creates a real task
  if p_disposition = 'on_todo_list' then
    insert into tasks (title, description, status, priority, due_on, created_by)
    values (p_headline, coalesce(p_plan,'') || ' [from a Chief Executive finding]', 'todo',
      case when coalesce(p_dollars,0) > 100000 then 'P0' else 'P1' end, p_due, auth.uid());
  end if;
  return fid;
end $$ language plpgsql;

create or replace view v_finding_history as
select fp.created_at::date as raised_on, fp.finding_source, fp.headline,
  fp.disposition, fp.disposition_reason, fp.plan, fp.owner_assigned, fp.due_on,
  fp.dollars, fp.decided_by, fp.decided_at::date as decided_on,
  case fp.disposition
    when 'resolved' then 'Closed - ' || coalesce(fp.disposition_reason,'resolved')
    when 'ignored' then 'Deliberately ignored - ' || coalesce(fp.disposition_reason,'no reason recorded')
    when 'on_todo_list' then 'On the to-do list' || case when fp.due_on is not null then ', due ' || fp.due_on else '' end
    when 'saved_for_later' then 'Saved for later review'
    when 'planned' then 'Plan written' || case when fp.owner_assigned is not null then ', assigned to ' || fp.owner_assigned else '' end
    when 'shared' then 'Shared with the team'
    else 'Open, no decision recorded' end as status_in_plain_english,
  fp.snapshot, fp.finding_key, fp.id
from finding_plans fp
order by fp.created_at desc;

create or replace view v_finding_accountability as
select disposition, count(*) as findings,
  round(sum(coalesce(dollars,0))::numeric,0) as dollars,
  count(*) filter (where due_on < current_date and disposition not in ('resolved','ignored')) as past_due,
  min(created_at)::date as oldest, max(created_at)::date as newest
from finding_plans group by disposition order by dollars desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, true, false
from (values
  ('Finding History & Plans', 8, 'clock', 'finding_history', 'v_finding_history', 'Every finding ever saved with the plan written for it, who it was assigned to, when it was due, the decision taken and by whom - including anything deliberately ignored and the reason. Searchable by date, filterable, and preserved exactly as it stood so it can be pulled back years later.'),
  ('Finding Accountability', 9, 'shield', 'finding_accountability', 'v_finding_accountability', 'How findings are being handled: how many are open, planned, saved, on the to-do list, resolved or ignored, the dollars behind each state, and how many are past their due date.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
insert into nav_role_visibility (view_key, role, visible)
select vk, r.role, r.role in ('owner','executive')
from (values ('finding_history'),('finding_accountability')) k(vk)
cross join (values ('owner'),('executive'),('manager'),('member'),('limited'),('guest')) r(role)
on conflict (view_key, role) do update set visible = excluded.visible;
select 'action layer ready' as ok;;
