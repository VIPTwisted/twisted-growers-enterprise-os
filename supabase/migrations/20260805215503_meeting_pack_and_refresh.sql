create or replace view v_cultivation_meeting_pack as
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
  'Account for every one of these in writing.', 'Compliance', 'harvest_issues'
union all select 5, 'Weight recording integrity',
  (select count(*)::text||' harvests recorded above 35 percent wet-to-packaged, which is not physically typical'
   from v_harvest_forensic where conversion_pct > 35),
  'Fresh flower is 75 to 80 percent water. A conversion above roughly 30 percent means the wet weight was recorded too low at takedown, not that the harvest did unusually well.',
  'One scale, one method, one person accountable at takedown.', 'Cultivation lead', 'harvest_forensic'
union all select 6, 'Month by month, closed harvests only',
  (select string_agg(month||': '||coalesce(conversion_pct_closed_only::text,'n/a')||' pct ('||harvests_closed||' closed, '||still_open||' open)', ' | ' order by month desc)
   from (select * from v_monthly_conversion_truth limit 6) t),
  'Judging a month before its harvests close produces a false collapse. Only closed harvests can be measured.',
  'Review the trend on closed harvests only.', 'Cultivation lead', 'monthly_conversion_truth';

select cron.schedule('refresh-harvest-links', '*/10 * * * *', $$select tg_refresh_harvest_links();$$);;
