create table if not exists open_questions (
  id bigserial primary key,
  question_key text unique not null,
  area text not null,
  question text not null,
  why_it_matters text not null,
  what_is_blocked text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  exposure_lb numeric,
  answered_by text, answer text, answered_at timestamptz,
  status text not null default 'open' check (status in ('open','answered','not applicable'))
);
alter table open_questions enable row level security;
drop policy if exists oq_all on open_questions;
create policy oq_all on open_questions for all to authenticated using (true) with check (true);

create table if not exists suppliers (
  origin_license text primary key,
  supplier_name text,
  bought_as text not null default 'not yet set'
    check (bought_as in ('not yet set','sound material','failed for remediation','biomass for extraction','our own licence')),
  contact text, typical_discount_pct numeric, notes text,
  first_received date, set_by text, set_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table suppliers enable row level security;
drop policy if exists sup_read on suppliers;
create policy sup_read on suppliers for select to authenticated using (true);
drop policy if exists sup_write on suppliers;
create policy sup_write on suppliers for all to authenticated
  using (exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')))
  with check (exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')));

create or replace function tg_sweep_unknowns()
returns int language plpgsql security definer set search_path=public as $$
declare v int := 0;
begin
  insert into suppliers (origin_license, supplier_name, first_received)
  select p.raw->>'ItemFromFacilityLicenseNumber', min(nullif(p.raw->>'ReceivedFromFacilityName','')), min(p.packaged_on)
  from metrc_packages p
  where coalesce(p.raw->>'ItemFromFacilityLicenseNumber','') <> ''
  group by 1
  on conflict (origin_license) do nothing;

  update suppliers set bought_as='our own licence', set_by='system', set_at=now()
  where origin_license in ('MC281714','MP281909') and bought_as='not yet set';

  insert into open_questions (question_key, area, question, why_it_matters, what_is_blocked, exposure_lb)
  select 'supplier_intent:'||s.origin_license, 'Purchasing',
    'What do we buy from '||coalesce(s.supplier_name,'licence '||s.origin_license)||'? Sound material, failed material bought at a discount to remediate, or biomass for extraction?',
    'Until this is answered the platform cannot tell a supplier quality problem from a deliberate discounted purchase, so it will not count either as a loss and every cost figure on that material is unreliable.',
    'Loss reporting and cost per pound on '||coalesce(s.supplier_name, s.origin_license),
    (select round(sum(pounds),1) from v_stock_on_hand v where v.origin_license = s.origin_license)
  from suppliers s where s.bought_as = 'not yet set'
  on conflict (question_key) do update set last_seen=now(), exposure_lb=excluded.exposure_lb;

  insert into open_questions (question_key, area, question, why_it_matters, what_is_blocked, exposure_lb)
  select 'supplier_unnamed:'||v.origin_license, 'Purchasing',
    'Who is licence '||v.origin_license||'? We hold material from them with no supplier name recorded.',
    'We cannot raise a quality issue, negotiate, or account for material when we do not know who sold it to us.',
    'Supplier accountability', round(sum(v.pounds),1)
  from v_stock_on_hand v
  where v.origin <> 'Grown by us' and coalesce(v.supplier,'') in ('','(supplier not recorded)')
  group by v.origin_license
  on conflict (question_key) do update set last_seen=now(), exposure_lb=excluded.exposure_lb;

  insert into open_questions (question_key, area, question, why_it_matters, what_is_blocked)
  select 'factor:'||c.key, 'Measurement',
    'What is the real value for "'||c.label||'"? It is on a default of '||c.value||' '||coalesce(c.unit,'')||'.',
    c.what_it_means, 'Every figure calculated from this factor'
  from conversion_factors c where c.set_by like 'default%'
  on conflict (question_key) do update set last_seen=now();

  insert into open_questions (question_key, area, question, why_it_matters, what_is_blocked, exposure_lb)
  select 'limit:'||l.stream, 'Inventory control',
    'What is the maximum '||l.stream||' we should ever hold, in pounds?',
    'Without a ceiling nothing can warn us we are over-stocked or holding material too long.',
    'Over-stock alerting on '||l.stream,
    (select round(sum(pounds),1) from v_stock_on_hand v where v.stream = l.stream)
  from storage_limits l where l.max_lb is null
  on conflict (question_key) do update set last_seen=now(), exposure_lb=excluded.exposure_lb;

  update open_questions q set status='answered', answered_at=now()
  where q.status='open' and (
    (q.question_key like 'supplier_intent:%' and exists (select 1 from suppliers s where 'supplier_intent:'||s.origin_license=q.question_key and s.bought_as<>'not yet set'))
    or (q.question_key like 'factor:%' and exists (select 1 from conversion_factors c where 'factor:'||c.key=q.question_key and c.set_by not like 'default%'))
    or (q.question_key like 'limit:%' and exists (select 1 from storage_limits l where 'limit:'||l.stream=q.question_key and l.max_lb is not null))
  );

  select count(*) into v from open_questions where status='open';
  return v;
end $$;

select tg_sweep_unknowns() as open_questions_now;;
