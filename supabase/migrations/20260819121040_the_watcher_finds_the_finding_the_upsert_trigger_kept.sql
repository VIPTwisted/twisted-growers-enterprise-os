/* WHY THE INSERT RETURNED NO ID — the answer, and the proper fix.
 *
 * watchdog_findings carries trg_watchdog_upsert_by_fingerprint: when a finding
 * with the same fingerprint already exists it UPDATES that row and returns
 * NULL, suppressing the insert. That is correct behaviour — one fingerprint,
 * one finding, re-observed rather than duplicated — and my watcher simply did
 * not know about it. It passed the NULL straight to f_alert_all_admins, which
 * refused it, and the whole function aborted. 128 failed runs.
 *
 * The guard I added an hour ago stopped it dying. This finishes the job: when
 * the insert is suppressed the watcher now LOOKS UP the finding the trigger
 * kept and alerts on that, so a re-observed deploy failure still reaches the
 * inbox. Reporting "unalerted" was honest but it was not the outcome anybody
 * wants twice. */

do $$
declare d text;
begin
  d := pg_get_functiondef('public.tg_check_site_deploy()'::regprocedure);

  if position('DETECTED '' || v_fp || '' but the finding insert returned NO ID' in d) = 0 then
    raise exception 'the guarded branch is not where it was — refusing to guess at the fix';
  end if;

  d := replace(d,
    'else
          v_out := v_out || ''DETECTED '' || v_fp || '' but the finding insert returned NO ID, so no ''
                         || ''email was sent. The gap is REAL and UNALERTED — investigate the ''
                         || ''watchdog_findings triggers. Reported rather than thrown: a watcher that ''
                         || ''dies on its own alarm tells nobody anything. '';
        end if;',
    'else
          /* trg_watchdog_upsert_by_fingerprint folded this into the existing
             finding and returned NULL. Find the row it kept and alert on that:
             a re-observed failure is still a failure somebody must see. */
          select f.id into v_id from watchdog_findings f
           where f.fingerprint = v_fp and f.cleared_at is null
           order by f.id desc limit 1;
          if v_id is not null then
            perform f_alert_all_admins(v_id);
            v_out := v_out || ''RE-OBSERVED '' || v_fp || '' on existing finding '' || v_id || ''. '';
          else
            v_out := v_out || ''DETECTED '' || v_fp || '' but no finding row could be found or created. ''
                           || ''The gap is REAL and UNALERTED — investigate the watchdog_findings ''
                           || ''triggers. Reported rather than thrown: a watcher that dies on its own ''
                           || ''alarm tells nobody anything. '';
          end if;
        end if;');

  if position('RE-OBSERVED' in d) = 0 then
    raise exception 'the lookup did not apply — surrounding text must differ from what was matched';
  end if;

  execute d;
end $$;;
