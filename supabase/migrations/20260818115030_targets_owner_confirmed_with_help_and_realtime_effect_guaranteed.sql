/* The two stock targets are owner-confirmed, and the ⓘ explains targets to every user.
 *
 * Owner, 18 Aug 2026: "YES SET" — 600 lb dried flower and 450 lb in-rooms are now HIS
 * numbers, not provisional. And: help question marks so users understand and can change
 * them, with any change taking effect OS-wide in real time, "as it would in QuickBooks."
 *
 * THE REAL-TIME GUARANTEE IS STRUCTURAL, NOT A PROMISE. Targets live in kpi_targets and
 * rules in conversion_factors; every consumer reads them at query time through the table
 * or f_rule(). There is no copy to go stale: change 180 to 200 on the Business Rules
 * screen and the next render of every schedule, forecast, tile and assertion carries 200.
 * The one thing that would break this is someone caching a rule into a matview or a
 * constant — which is exactly the two-definitions defect the DDC discipline forbids.
 */

update public.kpi_targets
   set set_by = 'OWNER CONFIRMED 18 Aug 2026 ("YES SET"). Originally derived from measurement: '
             || 'one month of sales cover, 11,595.4 lb over 19 months = 610/month. Change it '
             || 'here and every surface follows instantly.'
 where department='Command' and kpi='Dried flower on hand';

update public.kpi_targets
   set set_by = 'OWNER CONFIRMED 18 Aug 2026 ("YES SET"). Originally derived from measurement: '
             || 'the current month''s scheduled output, 448.6 lb. Change it here and every '
             || 'surface follows instantly.'
 where department='Command' and kpi='In the rooms, dry-equivalent';

insert into public.section_help
  (page, section_key, title, what_it_shows, how_to_read, common_misreading, source_note) values
('command','kpi_targets','Targets on the key figures',
 'Every key figure carries a target set by upper management. Defect counters — harvests '
 || 'open too long, unrecorded moisture, missing lab results, open findings — target ZERO, '
 || 'because any other number is a tolerance for a known fault. The two stock levels carry '
 || 'the owner''s numbers: dried flower at least 600 lb (one month of sales cover), '
 || 'in-rooms at least 450 lb (a month''s scheduled production).',
 'Green means at or better than the target, red means the floor or ceiling is breached. '
 || 'To CHANGE a target: Settings > Business Rules. The change takes effect across the '
 || 'entire OS the moment it is saved — every tile, schedule, forecast and check reads the '
 || 'rule live, exactly as a setting change behaves in QuickBooks. Nothing needs a refresh '
 || 'or a deploy, and there is no second copy anywhere to go stale.',
 'Thinking a zero target on a defect counter is "unrealistic". It is not a forecast — it '
 || 'is the definition of clean. Tolerating a number above zero is a real decision, and '
 || 'the platform requires it to be made here, visibly, not by silence.',
 'kpi_targets and conversion_factors, read live by every consumer. Rules: 180 lb per '
 || 'pull, 2 pulls a month, tables maximized, wet-to-dry 4.5 (4.17 held as the measured '
 || 'alternative).')
on conflict (page, section_key) do update
  set what_it_shows = excluded.what_it_shows, how_to_read = excluded.how_to_read,
      common_misreading = excluded.common_misreading, source_note = excluded.source_note,
      updated_at = now();;
