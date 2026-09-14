-- Owner, 17 Aug 2026: only sync failures reach email (configurations.alert_email.scope = sync_failures_only; the
-- trigger let only source 'sync_digest' through). Owner, 14 Sep 2026: every deployment is watched and a failure is
-- addressed immediately; every sync issue is addressed the moment it appears. The two watchers built today file
-- alerts with source 'deploy-watch' and 'sync-watch'; both were being suppressed by the 17 Aug scope. The scope
-- row now carries an explicit allow-list (a row the owner edits, never code), and the trigger reads it.
update public.configurations
   set value = coalesce(value, '{}'::jsonb) || jsonb_build_object('allowed_sources', jsonb_build_array('sync_digest', 'deploy-watch', 'sync-watch'),
                                                                  'allowed_sources_why', 'Owner 17 Aug: sync failures only. Owner 14 Sep (Bible §16.3/§16.4): deploy watch and sync watch alerts reach email too.'),
       updated_at = now()
 where key = 'alert_email';
create or replace function public.tg_alert_outbox_honour_email_scope() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_scope text; v_allowed jsonb;
begin
  select value->>'scope', coalesce(value->'allowed_sources', '["sync_digest"]'::jsonb) into v_scope, v_allowed from configurations where key = 'alert_email';
  if new.channel = 'email'
     and new.email_suppressed_at is null
     and new.sent_at is null
     and coalesce(v_scope, '') = 'sync_failures_only'
     and not (v_allowed ? coalesce(new.source, '')) then
    new.email_suppressed_at := now();
    new.email_suppressed_why :=
      'Owner instruction 17 Aug 2026: only sync failures reach email (allowed sources: ' || (select string_agg(x, ', ') from jsonb_array_elements_text(v_allowed) x) || '). Recorded in the platform, excluded from the inbox. Not resolved, not deleted.';
  end if;
  return new;
end $$;
-- the two alerts raised at 02:58 before the allow-list existed are re-released to the inbox
update public.alert_outbox set email_suppressed_at = null, email_suppressed_why = null where source in ('deploy-watch','sync-watch') and sent_at is null and email_suppressed_at is not null;;
