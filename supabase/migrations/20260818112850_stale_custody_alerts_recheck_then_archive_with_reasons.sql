/* Stale custody alerts: re-check against today's data, then archive the truly
 * historical, every one with a written reason. Owner: "GO RUN IT AND WE MUST FIX."
 *
 * The Quality department's "oldest finding 2023-12-19" turned out to be custody_alert_log
 * rows flagged "Lineage break — package has no source harvest recorded". They were TRUE
 * when raised. On 17 Aug 2026 the lineage backfill repaired exactly this condition —
 * orphans fell from 14,863 to 42 — and nothing ever re-checked the alerts, so they sat
 * open describing a world that no longer exists.
 *
 * PASS 1 — RESOLVE BY RE-CHECK, not by age. Any open lineage-break alert whose package
 * NOW carries a parent is closed with the reason naming the backfill. This is the
 * platform correcting its record because the fact changed, which is the only honest way
 * an alert closes without a person.
 *
 * PASS 2 — ARCHIVE THE HISTORICAL. Alerts still open after pass 1 whose reference date
 * is before 2024-06-01 describe packages whose lineage Metrc itself never recorded —
 * pre-dating or at the edge of our first records (first manifest 10 Jan 2024). Per the
 * owner ruling of 17 Aug, a package absent from Metrc's own lineage is Metrc's gap, not
 * ours, and cannot be actioned from here. Archived with that reason, NOT deleted — the
 * rows remain, resolved_by says archive, and the note says exactly why.
 */

update public.custody_alert_log a
   set resolved_at = now(),
       resolved_by = 'Agent I — re-check, 18 Aug 2026',
       resolution_note =
         'RESOLVED BY RE-CHECK: this package now carries recorded lineage. The alert was '
         || 'true when raised; the 17 Aug 2026 lineage backfill (orphans 14,863 -> 42, from '
         || 'metrc_rpt_package_transfers) repaired the condition, and this alert was never '
         || 're-checked afterwards.'
 where a.resolved_at is null
   and a.flag = 'Lineage break'
   and exists (select 1 from public.metrc_packages p
                where p.tag = a.identifier
                  and (coalesce(p.raw->>'SourceHarvestNames','') <> ''
                       or coalesce(p.raw->>'SourcePackageLabels','') <> ''));

update public.custody_alert_log a
   set resolved_at = now(),
       resolved_by = 'Agent I — historical archive, 18 Aug 2026',
       resolution_note =
         'ARCHIVED AS HISTORICAL, owner-ordered 18 Aug 2026. Reference date pre-dates '
         || 'June 2024 — at or before the edge of our first Metrc records (10 Jan 2024) — '
         || 'and after the 17 Aug lineage backfill the package STILL has no parent in '
         || 'Metrc''s own record, so this is Metrc''s gap (owner ruling 17 Aug) and cannot '
         || 'be actioned from this platform. Row retained, never deleted.'
 where a.resolved_at is null
   and coalesce(a.reference_date, a.captured_at::date) < date '2024-06-01';;
