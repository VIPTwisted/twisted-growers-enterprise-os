-- Monthly conversion measured ONLY on harvests that actually closed.
drop view if exists v_monthly_conversion_truth cascade;
create view v_monthly_conversion_truth as
select
  to_char(harvest_started,'YYYY-MM') as month,
  count(*) as harvests_cut,
  count(*) filter (where harvest_state='Finished') as harvests_closed,
  count(*) filter (where harvest_state like 'STILL OPEN%') as still_open,
  sum(plants) as plants,
  round(sum(wet_lb),1) as wet_lb,
  round(sum(packaged_lb),1) as packaged_lb,
  round(sum(still_in_room_lb),1) as sitting_unfinished_lb,
  round(sum(packaged_lb) filter (where harvest_state='Finished')
    /nullif(sum(wet_lb) filter (where harvest_state='Finished'),0)*100,1) as conversion_pct_closed_only,
  round(avg(dry_days_to_first_package),1) as avg_dry_days,
  count(*) filter (where dry_days_to_first_package > 16) as dried_too_long,
  count(*) filter (where dry_days_to_first_package < 7) as dried_too_fast,
  case
    when count(*) filter (where harvest_state like 'STILL OPEN%') > 0
      then count(*) filter (where harvest_state like 'STILL OPEN%')||' of '||count(*)||' harvests from this month are still open. This month CANNOT be judged yet - any conversion figure that includes them understates the result.'
    when round(sum(packaged_lb)/nullif(sum(wet_lb),0)*100,1) between 20 and 28
      then 'NORMAL. Wet-to-packaged inside the 20-25 percent commercial norm.'
    when round(sum(packaged_lb)/nullif(sum(wet_lb),0)*100,1) > 30
      then 'SUSPECT HIGH. Above 30 percent wet-to-packaged is not physically typical - check whether wet weight was recorded low at takedown.'
    else 'BELOW NORM. Investigate dry duration and trim standard.'
  end as how_to_read_this_month
from v_harvest_forensic where harvest_started is not null
group by 1 order by 1 desc;

-- The monthly meeting pack: one row per agenda item, with the number and the ask.
drop view if exists v_cultivation_meeting_pack cascade;
create view v_cultivation_meeting_pack as
select 1 as agenda_no, 'Open harvests not closed out' as agenda_item,
  (select count(*)::text||' harvests, '||round(sum(still_in_room_lb),0)::text||' lb sitting, oldest '||max(total_days_start_to_now)::text||' days'
     from v_harvest_forensic where harvest_state like 'STILL OPEN%' and total_days_start_to_now > 21) as the_number,
  'This is the single biggest problem in cultivation right now. Product that is cut but never closed cannot be sold, cannot be tested, and makes every conversion number in the business wrong.' as why_it_matters,
  'Name a date for each open lot. Anything past 21 days gets closed this week or gets a written reason.' as the_ask,
  'Cultivation lead' as owner, 'harvest_issues' as fix_report
union all select 2, 'Drying discipline',
  (select 'Average '||round(avg(dry_days_to_first_package),1)::text||' days to first package. '||
     count(*) filter (where dry_days_to_first_package>16)::text||' dried too long, '||
     count(*) filter (where dry_days_to_first_package<7)::text||' dried too fast, only '||
     count(*) filter (where dry_days_to_first_package between 7 and 16)::text||' inside the 10-14 day window'
   from v_harvest_forensic where dry_days_to_first_package is not null),
  'Over-drying burns off saleable weight permanently. Under-drying locks in moisture and risks mould. Neither is recoverable after the fact.',
  'Agree one written dry protocol and hold every room to it. Report exceptions weekly.',
  'Post-harvest lead', 'harvest_forensic'
union all select 3, 'Drying room comparison',
  (select string_agg(drying_room||': '||coalesce(avg_dry_days::text,'n/a')||' days avg, '||conversion_pct::text||' pct', ' | ' order by plants desc)
   from v_dry_room_performance),
  'Same company, same genetics, wildly different dry times and conversion by room. That gap is practice, not capacity.',
  'Explain why the rooms differ. Bring the room logs.',
  'Cultivation lead', 'dry_room_performance'
union all select 4, 'Harvests closed with zero packaged',
  (select count(*)::text||' harvests closed out with no package at all, '||round(sum(wet_lb),1)::text||' lb of wet weight unaccounted'
   from v_harvest_forensic where harvest_state='Finished' and packaged_lb = 0),
  'Weight went in and nothing came out on the record. This is the kind of gap a regulator asks about first.',
  'Account for every one of these in writing.',
  'Compliance', 'harvest_issues'
union all select 5, 'Weight recording integrity',
  (select count(*)::text||' harvests recorded above 35 percent wet-to-packaged, which is not physically typical'
   from v_harvest_forensic where conversion_pct > 35),
  'Fresh flower is 75 to 80 percent water. A conversion above roughly 30 percent means the wet weight was recorded too low at takedown, not that the harvest did unusually well. High conversion can be a reporting problem, not a win.',
  'One scale, one method, one person accountable at takedown.',
  'Cultivation lead', 'harvest_forensic'
union all select 6, 'Month by month, closed harvests only',
  (select string_agg(month||': '||coalesce(conversion_pct_closed_only::text,'n/a')||' pct ('||harvests_closed||' closed, '||still_open||' open)', ' | ' order by month desc)
   from (select * from v_monthly_conversion_truth limit 6) t),
  'Judging a month before its harvests close produces a false collapse. Only closed harvests can be measured.',
  'Review the trend on closed harvests only.',
  'Cultivation lead', 'monthly_conversion_truth';

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select max(category_order) from nav_registry where category='Cultivation'), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('MONTHLY MEETING PACK — Cultivation', 88, 'clipboard', 'cultivation_meeting_pack', 'v_cultivation_meeting_pack', 'The agenda for your monthly cultivation review. Six items, each with the live number, why it matters, the ask, who owns it and the report that proves it.'),
 ('Monthly Conversion — Closed Harvests Only', 89, 'trending-up', 'monthly_conversion_truth', 'v_monthly_conversion_truth', 'Conversion by month measured only on harvests that actually closed, so an unfinished month is never mistaken for a bad one.'),
 ('Drying Room Performance', 90, 'thermometer', 'dry_room_performance', 'v_dry_room_performance', 'Every drying room: harvests, plants, wet and packaged pounds, what is still sitting, average and worst dry days, how many dried too long or too fast, and conversion.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, true from (values ('cultivation_meeting_pack'),('monthly_conversion_truth'),('dry_room_performance')) x(k),
 (values ('owner'),('executive'),('manager'),('member')) r(role)
on conflict (view_key, role) do update set visible = true;;
