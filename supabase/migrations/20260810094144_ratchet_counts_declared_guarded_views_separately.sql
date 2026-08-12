-- MY OWN METRIC NOW OVER-REPORTS BY ONE, AND I AM NOT LEAVING IT THAT WAY.
--
-- tg_view_rls_ratchet counts views that run as their owner. v_alert_email_recipients does exactly
-- that, deliberately and correctly: authenticated holds no grant on auth.users, so the caller's
-- own rights would raise permission denied instead of returning nothing. It authorises itself
-- with f_role_can('admin_settings') inside the view body instead.
--
-- That view is secure. Counting it as a leak is the same error as calling three sealed tables a
-- defect, and if I leave it the number drifts from the thing it claims to measure — which is the
-- failure I have corrected four times today in other people's work and twice in my own.
--
-- EXEMPTIONS ARE ALLOWED BUT MUST BE REGISTERED. Declaring one requires write access to
-- rls_intent, which only the service role has, and every row carries its reason and its date. The
-- ratchet now fails on the NET figure while still reporting the raw one, so an exemption cannot
-- hide a real regression and the two numbers can always be compared.
insert into public.rls_intent (table_name, intent, reason) values
  ('v_alert_email_recipients', 'admin_only',
   'Runs as owner ON PURPOSE and guards itself with f_role_can(''admin_settings''). It reads auth.users, where authenticated has no grant at all, so security_invoker would raise permission denied rather than return empty — an error on the alerts page instead of an empty list. Registered as an exemption so the RLS ratchet does not count a guarded view as a leak.')
on conflict (table_name) do update set intent = excluded.intent, reason = excluded.reason;

create or replace function public.tg_view_rls_ratchet(p_selftest_worse_by int default null)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_base int; v_raw int; v_declared int; v_net int; v_total int;
  v_verdict text; v_note text;
begin
  select baseline into v_base from ratchet_baseline where metric_key = 'views_bypassing_rls';
  if v_base is null then raise exception 'no baseline recorded for views_bypassing_rls'; end if;

  select count(*) filter (where bypassing),
         count(*) filter (where bypassing and declared),
         count(*)
    into v_raw, v_declared, v_total
    from (
      select coalesce((select option_value from pg_options_to_table(c.reloptions)
                        where option_name = 'security_invoker'), 'false') <> 'true' as bypassing,
             exists (select 1 from rls_intent i where i.table_name = c.relname)      as declared
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'
    ) s;

  v_net := v_raw - v_declared;

  /* Failing path, upward only, so it can never manufacture a pass. */
  if p_selftest_worse_by is not null then
    v_net := v_net + greatest(p_selftest_worse_by, 0);
    v_note := format('SELF-TEST: net inflated by %s. Not a measurement.', greatest(p_selftest_worse_by, 0));
  end if;

  if v_net > v_base then
    v_verdict := 'FAIL';
  else
    v_verdict := 'PASS';
    if v_net < v_base and p_selftest_worse_by is null then
      update ratchet_baseline
         set baseline = v_net, set_on = current_date,
             note = note || format(' Ratchet tightened from %s to %s on %s.', v_base, v_net, current_date)
       where metric_key = 'views_bypassing_rls';
    end if;
  end if;

  insert into conformance_ledger
    (checker_key, subject_kind, subject_ref, verdict, numerator, denominator,
     the_arithmetic, drill, note)
  values
    ('detect.view_rls_ratchet', 'metric', 'views_bypassing_rls', v_verdict,
     v_total - v_net, v_total,
     format('%s of %s views enforce row-level security. %s run as the view owner, of which %s are '
            || 'REGISTERED exemptions in rls_intent that guard themselves in the view body — so %s '
            || 'is the figure that must not rise. Baseline %s.',
            v_total - v_raw, v_total, v_raw, v_declared, v_net, v_base),
     'select c.relname, (select reason from rls_intent i where i.table_name = c.relname) as declared_reason from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=''public'' and c.relkind=''v'' and coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name=''security_invoker''),''false'') <> ''true''',
     v_note);

  return format('%s — %s bypassing raw, %s declared, %s net, baseline %s',
                v_verdict, v_raw, v_declared, v_net, v_base);
end $fn$;

do $$
declare real_run text; fail_run text;
begin
  select public.tg_view_rls_ratchet()  into real_run;
  select public.tg_view_rls_ratchet(1) into fail_run;
  if fail_run not like 'FAIL%' then
    raise exception 'the failing path stopped working: %', fail_run;
  end if;
  raise notice 'ratchet real: % / failing path: %', real_run, fail_run;
end $$;;
