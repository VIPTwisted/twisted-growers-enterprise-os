/* THE ROOM DRILL STOPS HANGING — task #38 item 1.
 *
 * "Reading every package in the room…" never finished because v_stock_proof
 * takes 11.89 seconds for SIX rows as a signed-in user (measured 18 Aug 2026,
 * 23:5x) against the 8-second budget: its dedup and evidence joins do the full
 * 19k-package pass before the room filter applies, so every room drill dies at
 * the gateway and the panel spins forever.
 *
 * Same disease as the ownership-verdict page this morning, same proven cure:
 * the computation moves into mv_stock_proof, refreshed off the user path on
 * the 10-minute heal cadence (it feeds live room drills), and v_stock_proof is
 * redefined (same columns, rule E1) as a read of the matview. Room drills
 * land in milliseconds. */

do $$
declare def text;
begin
  perform set_config('search_path', 'public, pg_temp', true);
  def := regexp_replace(pg_get_viewdef('public.v_stock_proof'::regclass), ';\s*$', '');
  execute 'create materialized view public.mv_stock_proof as ' || def;
  execute 'create unique index mv_stock_proof_tag on public.mv_stock_proof (package_tag)';
  execute 'create index mv_stock_proof_room on public.mv_stock_proof (location, license)';
  execute 'create or replace view public.v_stock_proof as select * from public.mv_stock_proof';
  execute $c$comment on view public.v_stock_proof is
    'Reads mv_stock_proof — the full-lineage per-package computation (certificate, manifest, '
    'potency, value on every row) runs in the matview refresh, off the user path, because it '
    'took 11.9s for six rows under the signed-in 8s budget and every room drill hung until '
    '18 Aug 2026. Refresh is watcher-governed at 10 minutes (matview_heal_policy). Agent I.'$c$;
  execute 'grant select on public.mv_stock_proof to authenticated';

  insert into public.matview_heal_policy (matview, max_age, refresh_fn, heals_per_day_ok, why, active)
  values ('mv_stock_proof', interval '10 minutes', null, 200,
          'Feeds every ROOMS HOLDING STOCK drill and the stock detail pages: 1,395 live packages '
          || 'with certificate and manifest on every row, ~12s to derive. Ten-minute freshness so '
          || 'the room drill tracks the floor; the drill itself lands in milliseconds. Registered '
          || 'at creation, 18 Aug 2026, Agent I (task #38).',
          true)
  on conflict (matview) do nothing;
end $$;;
