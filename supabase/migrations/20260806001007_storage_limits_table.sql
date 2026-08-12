create table if not exists storage_limits (
  id bigserial primary key,
  stream text not null,
  location text not null default '',
  license text not null default '',
  max_lb numeric,
  warn_at_pct numeric not null default 80,
  max_age_days int,
  note text,
  set_by text,
  updated_at timestamptz not null default now(),
  unique (stream, location, license)
);
alter table storage_limits enable row level security;
drop policy if exists sl_read on storage_limits;
create policy sl_read on storage_limits for select to authenticated using (true);
drop policy if exists sl_write on storage_limits;
create policy sl_write on storage_limits for all to authenticated
  using (exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')))
  with check (exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')));

insert into storage_limits (stream, location, max_lb, max_age_days, note, set_by) values
 ('Fresh frozen','Freezer/Biomass Storage', null, 60, 'Maximum pounds the freezer may hold, and how many days frozen material may sit before it must be processed.', 'awaiting Vincent'),
 ('Dried flower','', null, 90, 'Maximum dried flower on hand and maximum package age.', 'awaiting Vincent'),
 ('Concentrate','', null, 120, 'Maximum concentrate held and maximum age.', 'awaiting Vincent'),
 ('Shake and trim','', null, 120, 'Maximum shake and trim held and maximum age.', 'awaiting Vincent')
on conflict (stream, location, license) do nothing;

drop view if exists v_storage_limit_status cascade;
create view v_storage_limit_status as
select l.stream, nullif(l.location,'') as location, l.max_lb, l.max_age_days, l.warn_at_pct, l.note,
  round(coalesce(s.on_hand_lb,0),1) as on_hand_lb,
  coalesce(s.oldest_days,0) as oldest_days,
  case when l.max_lb is null then null else round(100*coalesce(s.on_hand_lb,0)/l.max_lb,1) end as pct_of_limit,
  case
    when l.max_lb is null and l.max_age_days is null then 'NO LIMIT SET - an owner needs to decide this'
    when l.max_lb is not null and coalesce(s.on_hand_lb,0) > l.max_lb then 'OVER THE STORAGE LIMIT'
    when l.max_age_days is not null and coalesce(s.oldest_days,0) > l.max_age_days then 'MATERIAL OLDER THAN THE LIMIT'
    when l.max_lb is not null and coalesce(s.on_hand_lb,0) > l.max_lb * l.warn_at_pct/100 then 'APPROACHING THE LIMIT'
    else 'Within limits'
  end as status
from storage_limits l
left join (select stream, sum(pounds) on_hand_lb, max(oldest_days) oldest_days from v_stock_on_hand group by 1) s
  on s.stream = l.stream;;
