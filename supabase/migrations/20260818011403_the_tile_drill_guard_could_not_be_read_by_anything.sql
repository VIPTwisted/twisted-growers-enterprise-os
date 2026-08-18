/* The tile-drill guard could not be read by anything.
 *
 * v_tile_drill_status is the reconciliation that compares every tile against the rows its
 * own drilldown opens — the guard that found the 1,099 lb dried-flower gap and the
 * Settings tile that could never fire. It takes OVER 20 SECONDS, because it executes each
 * contract's tile_sql AND drill_sql live: 88 contracts, 176 dynamic queries per read,
 * several against views that are themselves seconds each.
 *
 * Nothing can read that. The role authenticated has an 8-second ceiling, so a page
 * rendering it gets a timeout. The guard existed, produced correct answers, and was
 * unreachable — which is why the owner has been finding tile defects himself.
 *
 * It had been hidden behind a permission error: tg_desktop_reader lacked EXECUTE on
 * tg_check_tile_drill, so an agent reading the view got "permission denied" INSTANTLY and
 * never discovered it would also have timed out. Granting the execute surfaced the real
 * fault. A fast wrong error masked a slow right one.
 *
 * THE FIX IS THE ONE ALREADY USED FOR mv_forensic_audit_panel, whose own comment records
 * the same lesson: "was 9,037 ms per page load". Compute on a schedule, read from storage.
 *
 * tile_drill_result holds the last computed verdict per contract with the timestamp of
 * the computation. v_tile_drill_status keeps its name and column shape so every existing
 * reader is unaffected, but now reads stored rows. The live recomputation stays available
 * as v_tile_drill_status_live for the scheduled job and for diffing a cached figure
 * against a fresh one.
 *
 * A STALE GUARD MUST SAY SO. computed_at travels with every row and v_tile_drill_freshness
 * reports the age, because a reconciliation that is quietly hours old is exactly the kind
 * of reassurance that let the dashboard sit three days stale under a live-looking header.
 */

create table if not exists public.tile_drill_result (
  contract_key text primary key,
  page         text,
  tile_label   text,
  tile_value   numeric,
  drill_value  numeric,
  gap          numeric,
  verdict      text not null,
  computed_at  timestamptz not null default now(),
  computed_ms  integer
);

comment on table public.tile_drill_result is
  'Last computed tile-versus-drill verdict per contract. The live view executes 176 dynamic '
  'queries and exceeds 20s, far past the 8s ceiling role authenticated carries, so it could '
  'not be read by any page. Same remedy as mv_forensic_audit_panel. Agent I, 18 Aug 2026.';

alter table public.tile_drill_result enable row level security;
drop policy if exists tdr_read on public.tile_drill_result;
create policy tdr_read on public.tile_drill_result for select to authenticated using (true);
grant select on public.tile_drill_result to tg_desktop_reader;

/* The live definition, kept and named honestly. */
create or replace view public.v_tile_drill_status_live as
  select * from public.tg_check_tile_drill();

comment on view public.v_tile_drill_status_live is
  'THE definition of the tile-drill reconciliation. Executes every contract''s tile and '
  'drill SQL — 176 dynamic queries, over 20 seconds. NEVER read this from a page. Pages and '
  'agents read v_tile_drill_status, which serves tile_drill_result. This exists so the '
  'stored table has a source and so a cached verdict can be diffed against a fresh one.';

create or replace function public.tg_snapshot_tile_drill(p_by text default 'cron')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare t0 timestamptz := clock_timestamp(); v_n int; v_bad int;
begin
  delete from tile_drill_result;
  insert into tile_drill_result (contract_key, page, tile_label, tile_value, drill_value,
                                 gap, verdict, computed_at, computed_ms)
  select contract_key, page, tile_label, tile_value, drill_value, gap, verdict, now(),
         round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int
    from tg_check_tile_drill();

  select count(*), count(*) filter (where verdict <> 'AGREE') into v_n, v_bad
    from tile_drill_result;

  return jsonb_build_object('contracts', v_n, 'disagree', v_bad, 'by', p_by,
    'ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int);
end $function$;

comment on function public.tg_snapshot_tile_drill(text) is
  'Recomputes every tile-drill contract and stores the verdicts. Scheduled, because the '
  'live computation exceeds every page timeout. Agent I, 18 Aug 2026.';

create or replace view public.v_tile_drill_freshness as
select max(computed_at)                                   as computed_at,
       now() - max(computed_at)                            as age,
       count(*)                                            as contracts,
       count(*) filter (where verdict <> 'AGREE')          as disagreeing,
       case when max(computed_at) is null
              then 'NEVER COMPUTED — the reconciliation has not run since this table was created'
            when now() - max(computed_at) > interval '2 hours'
              then 'STALE — older than 2 hours, treat these verdicts as of ' || max(computed_at)::text
            else 'ok' end                                  as verdict
from public.tile_drill_result;

comment on view public.v_tile_drill_freshness is
  'Age of the stored tile-drill verdicts. A reconciliation that is quietly hours old is the '
  'kind of reassurance that let the Command dashboard sit three days stale under a '
  'live-looking header. Agent I.';

grant select on public.v_tile_drill_freshness to tg_desktop_reader;;
