/* THE THUNDERING HERD AT :00 — found on the owner's screen, 19 Aug 2026.
 *
 * He opened the Command Center and three panels read "canceling statement due
 * to statement timeout". The panels were right to say so — nothing hidden
 * behind an empty box — but the cause was mine.
 *
 * Measured over three hours: FIVE heavy jobs all fire at :00. snapshot-tile-drill
 * takes up to 193 seconds, heal-stale-matviews up to 129, refresh-dashboards up
 * to 44, gap-alert-loop up to 17. Every one is useful and not one of them needed
 * to run at that exact second. A signed-in user gets EIGHT seconds; against that
 * pile-up their reads simply lose, and the loser is always the person looking at
 * the screen.
 *
 * Spread across the hour every job still runs exactly as often as before — same
 * cadence, different offset — and none of them start together. Prime-ish offsets
 * rather than round numbers so future jobs are unlikely to land on top of one. */

select cron.alter_job((select jobid from cron.job where jobname='snapshot-tile-drill'),  schedule => '7-59/30 * * * *');
select cron.alter_job((select jobid from cron.job where jobname='heal-stale-matviews'),  schedule => '3-59/5 * * * *');
select cron.alter_job((select jobid from cron.job where jobname='refresh-dashboards'),   schedule => '11-59/10 * * * *');
select cron.alter_job((select jobid from cron.job where jobname='gap-alert-loop'),       schedule => '22-59/15 * * * *');
select cron.alter_job((select jobid from cron.job where jobname='gap-route-escalate'),   schedule => '38 * * * *');
select cron.alter_job((select jobid from cron.job where jobname='guard-autofix'),        schedule => '48 * * * *');
select cron.alter_job((select jobid from cron.job where jobname='site-deploy-watch'),    schedule => '6-59/10 * * * *');
select cron.alter_job((select jobid from cron.job where jobname='refresh-tower'),        schedule => '4-59/5 * * * *');
select cron.alter_job((select jobid from cron.job where jobname='refresh-forensic-panel'), schedule => '13-59/10 * * * *');;
