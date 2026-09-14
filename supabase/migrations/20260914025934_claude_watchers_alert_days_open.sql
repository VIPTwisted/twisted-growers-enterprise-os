-- alert_outbox.days_open is NOT NULL with no default. Found by the sync watcher's first sweep at 02:58 UTC, which
-- correctly tried to alert the owner that deploy_watch is missing its token and hit the constraint. Both watchers'
-- alert inserts now carry days_open = 0 (the alert is raised the day it opens). Re-defined by text substitution on
-- the live definitions so nothing else in either function changes.
do $$
declare src text;
begin
  src := pg_get_functiondef('public.f_deploy_watch()'::regprocedure);
  src := replace(src, $x$'PRODUCTION BUILD FAILED — ' || site.site || ' ' || left(coalesce(site.commit_ref,''), 7),
             coalesce(site.error_message, site.title, '') || E'\n\nBible §16.3: the on-call agent has a bridge job to fix it now. Rollback: previous Netlify deploy.', current_date$x$,
                      $y$'PRODUCTION BUILD FAILED — ' || site.site || ' ' || left(coalesce(site.commit_ref,''), 7),
             coalesce(site.error_message, site.title, '') || E'\n\nBible §16.3: the on-call agent has a bridge job to fix it now. Rollback: previous Netlify deploy.', current_date, 0$y$);
  src := replace(src, 'insert into public.alert_outbox (entity_type, entity_key, source, source_ref, severity, role, channel, subject, body, raised_on)
      select ''deploy''', 'insert into public.alert_outbox (entity_type, entity_key, source, source_ref, severity, role, channel, subject, body, raised_on, days_open)
      select ''deploy''');
  if src not like '%raised_on, days_open)%' then raise exception 'deploy watch alert insert not patched'; end if;
  execute src;
end $$;;
