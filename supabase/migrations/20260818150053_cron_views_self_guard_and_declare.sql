/* THE FOUR CRON-READING VIEWS GUARD THEMSELVES AND DECLARE IT.
 *
 * v_cron_health, v_loop_health, v_sentinel_coverage and v_sentinel_cron_silence
 * read cron.job / cron.job_run_details — pg_cron's own tables, whose RLS
 * (username = current_user) cannot sensibly take our policies. Flipped to
 * security_invoker they would show every signed-in user an empty watchers page:
 * the probe measured 65 rows owner-mode against 0 as a signed-in user.
 *
 * So they stay owner-mode and take the ratchet's OTHER sanctioned exit: guard
 * yourself in the view body, then register in rls_intent. Each body is wrapped
 * server-side as `select * from (original) guarded_body where (select
 * public.is_executive())` — identical column list (rule E1), the guard hoisted
 * to an InitPlan, and non-executives see nothing rather than everything. Both
 * real users today are owners; executives keep exactly what they had. */

do $$
declare
  v text;
  def text;
begin
  foreach v in array array['v_cron_health','v_loop_health','v_sentinel_coverage','v_sentinel_cron_silence'] loop
    def := pg_get_viewdef(('public.' || v)::regclass);
    if def ilike '%guarded_body%' then
      raise notice '% is already guarded — skipped', v;
      continue;
    end if;
    def := regexp_replace(def, ';\s*$', '');
    execute format(
      'create or replace view public.%I as select * from ( %s ) guarded_body where (select public.is_executive())',
      v, def);
  end loop;
end $$;

insert into public.rls_intent (table_name, intent, reason, declared_on) values
('v_cron_health', 'admin_only',
 'Reads cron.job/cron.job_run_details, whose pg_cron RLS (username = current_user) cannot take our policies — security_invoker would blank the watchers page (probe: 65 owner-mode vs 0 as-user). Owner-mode retained; the body self-guards with is_executive(). Agent I, 18 Aug 2026.', current_date),
('v_loop_health', 'admin_only',
 'Same basis as v_cron_health: pg_cron tables, self-guarded body, owner-mode by necessity. Agent I, 18 Aug 2026.', current_date),
('v_sentinel_coverage', 'admin_only',
 'Same basis as v_cron_health: reads cron.job, self-guarded body, owner-mode by necessity. Agent I, 18 Aug 2026.', current_date),
('v_sentinel_cron_silence', 'admin_only',
 'Same basis as v_cron_health: pg_cron tables, self-guarded body, owner-mode by necessity. Agent I, 18 Aug 2026.', current_date)
on conflict do nothing;;
