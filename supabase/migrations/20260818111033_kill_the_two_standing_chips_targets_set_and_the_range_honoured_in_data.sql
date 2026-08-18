/* Kill the two standing chips: every Command KPI gets a target, and the date range gets
 * a data layer the page can honour. Second attempt — finding_lane_owner requires a WHY,
 * which its own constraint just enforced against me, correctly.
 *
 * Six of the eight Command figures are DEFECT COUNTERS: zero is the only defensible
 * target, any other number is a tolerance the owner must set explicitly. The two stock
 * positions get PROVISIONAL measured targets labelled in set_by for the owner to
 * override: dried flower at one month of genuine sales cover (11,595.4 lb over 19
 * months = 610/month, rounded 600), in-rooms dry-equivalent at the current month's
 * scheduled output (measured 448.6, rounded 450).
 *
 * The two lane rows are the fixes the Global Management screen names itself. And
 * tg_command_range() gives the date chips a real data layer: every flow figure for the
 * window in one call, sales filtered on counts_as_sale.
 */

insert into public.kpi_targets (department, kpi, target, direction, set_by) values
('Command','Harvests open too long',            0, 'at_most',
 'Zero by definition — a defect counter. Owner may set a tolerance explicitly; a silent one is a decision nobody made. Agent I, 18 Aug 2026'),
('Command','Moisture loss not recorded',        0, 'at_most',
 'Zero by definition — closed harvests still showing water are bookkeeping debt. Agent I, 18 Aug 2026'),
('Command','Out at the laboratory, no result',  0, 'at_most',
 'Zero by definition — every submitted sample should come back. Agent I, 18 Aug 2026'),
('Command','Never submitted for testing',       0, 'at_most',
 'Zero by definition — material that cannot sell until submitted. Agent I, 18 Aug 2026'),
('Command','Failed testing on hand',            0, 'at_most',
 'Zero by definition — failed material awaits a disposition decision, not storage. Agent I, 18 Aug 2026'),
('Command','Open watchdog findings',            0, 'at_most',
 'Zero by definition — a finding is open until someone records fix, leave, ignore or reset. Agent I, 18 Aug 2026'),
('Command','Dried flower on hand',            600, 'at_least',
 'PROVISIONAL, measured: one month of genuine sales cover. 11,595.4 lb sold over 19 months = 610 lb/month. Owner to confirm or override. Agent I, 18 Aug 2026'),
('Command','In the rooms, dry-equivalent',    450, 'at_least',
 'PROVISIONAL, measured: the scheduled output of the current month, 448.6 lb from the harvest schedule. Owner to confirm or override. Agent I, 18 Aug 2026')
on conflict (department, kpi) do nothing;

insert into public.finding_lane_owner (lane, department, why) values
('Watchdog & Silent Failures', 'Command',
 'Watchdog findings are platform-integrity findings. Command is the owner''s own view and '
 || 'the watchdog reports to it — the Global Management screen showed this lane arriving '
 || 'with no owning department. Added 18 Aug 2026, Agent I.'),
('Sales & Cash',               'Sales & Cash',
 'Finding classes raised under the Sales & Cash lane name had no owning department row, '
 || 'so 238 findings showed under NOBODY OWNS THESE. The department exists; the mapping '
 || 'row did not. Added 18 Aug 2026, Agent I.')
on conflict (lane) do nothing;

create or replace function public.tg_command_range(p_from date, p_to date)
returns table (metric text, value numeric, unit text, basis text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select 'Harvests started', count(*)::numeric, 'harvests',
         'metrc_harvests.harvest_start within the window'
    from metrc_harvests where harvest_start between p_from and p_to
  union all
  select 'Wet weight harvested', round((sum(wet_weight)/453.59237)::numeric,1), 'lb',
         'metrc_harvests.wet_weight, grams converted, harvest_start within the window'
    from metrc_harvests where harvest_start between p_from and p_to
  union all
  select 'Packages created', count(*)::numeric, 'packages',
         'metrc_packages.packaged_on within the window, one row per tag'
    from (select distinct on (tag) tag, packaged_on from metrc_packages
           where tag is not null order by tag, synced_at desc) p
   where p.packaged_on between p_from and p_to
  union all
  select 'Sold to customers', round(coalesce(sum(pounds),0)::numeric,1), 'lb',
         'v_forensic_sold_by_tag, counts_as_sale only — internal moves, labs and transport legs excluded'
    from v_forensic_sold_by_tag
   where counts_as_sale and shipped_on between p_from and p_to
  union all
  select 'Invoiced', round(coalesce(sum(distinct_usd),0)::numeric,0), 'USD',
         'Apex invoice totals on manifests shipped in the window, counted once per invoice'
    from (select distinct invoice_number, max(total_usd) as distinct_usd
            from v_forensic_sold_by_tag
           where counts_as_sale and invoice_number is not null
             and shipped_on between p_from and p_to
           group by invoice_number) x
  union all
  select 'Lab samples sent', count(*)::numeric, 'samples',
         'v_lab_samples_out.sent_on within the window'
    from v_lab_samples_out where sent_on between p_from and p_to
  union all
  select 'Findings raised', count(*)::numeric, 'findings',
         'watchdog_findings.observed_at within the window'
    from watchdog_findings where observed_at::date between p_from and p_to
$function$;

comment on function public.tg_command_range(date, date) is
  'Every FLOW figure for a date window, in one call, so the Command page can honour the '
  'date chips. Positions (stock on hand) cannot be ranged — "flower on hand between '
  'January and August" is not a number — but flows can and now are. Sales filter on '
  'counts_as_sale. Built 18 Aug 2026 to kill the standing "does not honour the date '
  'range" chip; the front-end wiring is the other half. Agent I.';

grant execute on function public.tg_command_range(date, date) to authenticated;;
