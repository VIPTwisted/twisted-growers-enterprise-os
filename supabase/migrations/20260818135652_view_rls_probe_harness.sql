/* THE PROBE THAT MAKES THE 202-VIEW RLS CLOSURE SAFE TO DO.
 *
 * 202 public views run as their owner and bypass row security (the ratchet's
 * views_bypassing_rls, advisor ERROR level). Flipping them blind is how a page
 * goes dark: a view whose base tables filter rows under RLS suddenly shows a
 * logged-in user less than the page was built to show. The 11-13 Aug lesson,
 * paraphrased: a fix you did not measure is a defect you have not met yet.
 *
 * So every candidate is PROBED first, and the probe never keeps anything:
 * inside a subtransaction it flips the view to security_invoker, impersonates a
 * real signed-in user (role authenticated + request.jwt.claims, the exact way
 * PostgREST does), counts rows both ways with a cap, then RAISES to roll the
 * flip back unconditionally. The verdict lands in view_rls_flip_log. Views whose
 * counts match for every real user are then flipped for real in ONE recorded
 * migration, so the migration trail — not this function — is what changed the
 * schema. Today both real users hold role owner, so a match means no visible
 * change for anyone who can sign in; when admin/cfo/ceo users arrive, the same
 * probe reruns against theirs before any further batch. */

create table if not exists public.view_rls_flip_log (
  id           bigint generated always as identity primary key,
  probed_at    timestamptz not null default now(),
  view_name    text not null,
  probe_uid    uuid,
  owner_rows   bigint,
  invoker_rows bigint,
  row_cap      int,
  verdict      text not null,   -- MEASURED_SAFE | MEASURED_DIFFERS | ERROR
  note         text
);
comment on table public.view_rls_flip_log is
  'One row per probe of a view for the security_invoker closure (task #36). The probe flips '
  'inside a subtransaction, counts as a real signed-in user, and always rolls back — verdicts '
  'here decide which views the follow-up migration flips for real. Agent I, 18 Aug 2026.';
alter table public.view_rls_flip_log enable row level security;
create policy vfl_read on public.view_rls_flip_log for select to authenticated using (true);

create or replace function public.tg_probe_view_invoker(p_views text[], p_uid uuid, p_cap int default 5001)
returns table (view_name text, owner_rows bigint, invoker_rows bigint, verdict text, note text)
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v text;
  v_owner bigint; v_invoker bigint; v_verdict text; v_note text;
begin
  foreach v in array p_views loop
    v_owner := null; v_invoker := null; v_note := null;
    begin
      /* owner-mode count, capped: what the page shows TODAY */
      execute format('select count(*) from (select 1 from public.%I limit %s) s', v, p_cap) into v_owner;

      /* trial flip + impersonated count, then unconditional rollback */
      begin
        execute format('alter view public.%I set (security_invoker = true)', v);
        perform set_config('request.jwt.claims',
                           json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
        execute 'set local role authenticated';
        execute format('select count(*) from (select 1 from public.%I limit %s) s', v, p_cap) into v_invoker;
        execute 'reset role';
        raise exception using errcode = 'P0999', message = 'measured — rolling the trial flip back';
      exception
        when sqlstate 'P0999' then null;              -- expected: flip rolled back, counts kept
        when others then
          v_note := 'as-user query failed: ' || sqlerrm; -- flip also rolled back by the error
      end;

      if v_note is not null then v_verdict := 'ERROR';
      elsif v_invoker = v_owner then v_verdict := 'MEASURED_SAFE';
      else v_verdict := 'MEASURED_DIFFERS';
           v_note := format('owner sees %s, signed-in user would see %s', v_owner, v_invoker);
      end if;
    exception when others then
      v_verdict := 'ERROR';
      v_note := 'owner-mode count failed: ' || sqlerrm;
    end;

    insert into view_rls_flip_log (view_name, probe_uid, owner_rows, invoker_rows, row_cap, verdict, note)
    values (v, p_uid, v_owner, v_invoker, p_cap, v_verdict, v_note);

    view_name := v; owner_rows := v_owner; invoker_rows := v_invoker; verdict := v_verdict; note := v_note;
    return next;
  end loop;
end $$;

comment on function public.tg_probe_view_invoker(text[], uuid, int) is
  'Measure-only probe for the RLS closure: trial-flips each view to security_invoker in a '
  'subtransaction, counts rows as the given signed-in user (claims impersonation, capped), and '
  'ALWAYS rolls the flip back — the real flips happen in a recorded migration using these '
  'verdicts. Agent I, 18 Aug 2026.';;
