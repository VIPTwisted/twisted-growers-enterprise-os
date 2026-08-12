-- PHASE 3: make the gain permanent. Wave 1 took views bypassing row-level security from 305 to
-- 231. Without a ratchet that is a one-off sweep, and this estate has already proved what
-- happens to one-off sweeps: the anon read surface was revoked once, and 214 objects have since
-- been granted REFERENCES and TRIGGER again by default privileges. A number nobody defends
-- returns to where it was.
--
-- Recorded as views_bypassing_rls, in the ratchet_baseline table that already exists for
-- exactly this, with the same direction as its existing row: may fall, may never rise.
insert into public.ratchet_baseline (metric_key, baseline, set_by, what_it_counts, note) values
  ('views_bypassing_rls', 231, 'agent-c 10 Aug 2026',
   'Views in public that run as their owner and therefore ignore every row-level security policy on their base tables. A signed-in user reading one of these sees rows a policy was written to withhold.',
   'Set immediately after wave 1 took it from 305 to 231 by flipping the 72 views whose base tables are open to all staff, where the change cannot alter what anyone sees. The remaining 231 touch at least one RESTRICTED table, so flipping them changes what staff see - for some the correct outcome is that staff see LESS, which is a decision per view and not a sweep.')
on conflict (metric_key) do nothing;

-- The enforcer. Measures, compares, records, and lowers the baseline itself when the estate
-- improves, so the ratchet tightens without anyone remembering to tighten it.
create or replace function public.tg_view_rls_ratchet(p_selftest_worse_by int default null)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_base      int;
  v_live      int;
  v_total     int;
  v_verdict   text;
  v_note      text;
begin
  select baseline into v_base from ratchet_baseline where metric_key = 'views_bypassing_rls';
  if v_base is null then
    raise exception 'no baseline recorded for views_bypassing_rls';
  end if;

  select count(*) filter (where coalesce((select option_value
                                            from pg_options_to_table(c.reloptions)
                                           where option_name = 'security_invoker'), 'false') <> 'true'),
         count(*)
    into v_live, v_total
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v';

  /* THE FAILING PATH, AND WHY IT CANNOT BE ABUSED. A check with no demonstrated failure is
     graded as enforced while proving nothing — rule C0b, applied to the checks themselves. This
     parameter lets the self-test push the count UPWARDS only. greatest() means a caller can
     never use it to manufacture a pass, so the only thing it can do is what it is for. */
  if p_selftest_worse_by is not null then
    v_live := v_live + greatest(p_selftest_worse_by, 0);
    v_note := format('SELF-TEST: count inflated by %s to prove the failing path. Not a measurement.',
                     greatest(p_selftest_worse_by, 0));
  end if;

  if v_live > v_base then
    v_verdict := 'FAIL';
  else
    v_verdict := 'PASS';
    /* Tighten. Only a real measurement may move the baseline, never a self-test. */
    if v_live < v_base and p_selftest_worse_by is null then
      update ratchet_baseline
         set baseline = v_live, set_on = current_date,
             note = note || format(' Ratchet tightened from %s to %s on %s.',
                                   v_base, v_live, current_date)
       where metric_key = 'views_bypassing_rls';
    end if;
  end if;

  insert into conformance_ledger
    (checker_key, subject_kind, subject_ref, verdict, numerator, denominator,
     the_arithmetic, drill, note)
  values
    ('detect.view_rls_ratchet', 'metric', 'views_bypassing_rls', v_verdict,
     v_total - v_live, v_total,
     format('%s of %s views enforce row-level security. %s still run as the view owner and '
            || 'ignore every policy on their base tables. Ratchet stands at %s and may only fall.',
            v_total - v_live, v_total, v_live, v_base),
     'select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=''public'' and c.relkind=''v'' and coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name=''security_invoker''),''false'') <> ''true''',
     v_note);

  return format('%s — %s bypassing, baseline %s', v_verdict, v_live, v_base);
end $fn$;

comment on function public.tg_view_rls_ratchet(int) is
  'Ratchets views_bypassing_rls: fails when the count rises above the recorded baseline, and '
  'lowers the baseline itself when the estate improves. The integer argument exists only to '
  'prove the failing path and can push the count upwards only, so it cannot fake a pass.';;
