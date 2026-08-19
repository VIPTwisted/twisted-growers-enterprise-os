/* MY DEPLOY WATCHER HAS FAILED EVERY RUN SINCE I BUILT IT — 128 of them.
 *
 * tg_check_site_deploy() inserts a finding and hands the returned id to
 * f_alert_all_admins. When something suppresses that insert the id comes back
 * NULL, and f_alert_all_admins correctly refuses a null — "No finding with id
 * <NULL>" — which aborted the whole function before it could fire its next
 * probe. So the watcher built yesterday to make a deploy freeze impossible to
 * miss was itself failing, silently, all day: exactly the disease it exists to
 * cure, in the instrument meant to cure it.
 *
 * Applied by rewriting the live definition in place — replacing one PERFORM
 * with a guarded block — rather than re-typing 150 lines of it. A suppressed
 * insert is now REPORTED in the return value, never thrown on, because a
 * watcher that dies on its own alarm tells nobody anything. */

do $$
declare d text;
begin
  d := pg_get_functiondef('public.tg_check_site_deploy()'::regprocedure);

  if position('perform f_alert_all_admins(v_id);' in d) = 0 then
    raise exception 'the unguarded alert call is not where it was — refusing to guess at the fix';
  end if;

  d := replace(d,
    'perform f_alert_all_admins(v_id);
        v_out := v_out || ''RAISED '' || v_fp || '' finding '' || v_id || ''. '';',
    'if v_id is not null then
          perform f_alert_all_admins(v_id);
          v_out := v_out || ''RAISED '' || v_fp || '' finding '' || v_id || ''. '';
        else
          v_out := v_out || ''DETECTED '' || v_fp || '' but the finding insert returned NO ID, so no ''
                         || ''email was sent. The gap is REAL and UNALERTED — investigate the ''
                         || ''watchdog_findings triggers. Reported rather than thrown: a watcher that ''
                         || ''dies on its own alarm tells nobody anything. '';
        end if;');

  if position('if v_id is not null then' in d) = 0 then
    raise exception 'the guard did not apply — the surrounding text must differ from what was matched';
  end if;

  execute d;
end $$;;
