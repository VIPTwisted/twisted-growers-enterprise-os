/* WHY THE MATVIEW REFUSED TO BUILD, AND THE REAL LESSON UNDERNEATH.
 *
 * CREATE/REFRESH MATERIALIZED VIEW runs its query under the hardened
 * maintenance search_path (pg_catalog only — the CVE-2018-1058 protection), so
 * every function in the chain must either qualify its references or pin its own
 * search_path. f_quantity_text calls f_is_weight unqualified and pins nothing —
 * the matview build died there three times while the plain view worked. This is
 * the security advisor's "function_search_path_mutable" warning (74 functions)
 * failing in practice, not in theory: an unpinned function is a function that
 * breaks the moment it runs in a maintenance context.
 *
 * The four helpers this view needs are pinned here; the remaining unpinned
 * functions stay on the advisor worklist. Then the ownership-verdict page gets
 * its fix: the ~43-second, 187-row lineage computation (measured identical as
 * postgres and as a signed-in user, so it is the view's design, not row
 * security) moves into a matview refreshed off the user path, and
 * v_ownership_verdict is redefined (same columns, rule E1) to read it. The
 * page's budget is 8 seconds; it had been timing out for every user since it
 * was wired. Found by today's RLS probe, not by a user report. */

alter function public.f_quantity_text(numeric, text) set search_path = public, pg_temp;
alter function public.f_is_weight(text)              set search_path = public, pg_temp;
alter function public.f_to_pounds(numeric, text)     set search_path = public, pg_temp;
alter function public.f_licence_in_set(text, text)   set search_path = public, pg_temp;

do $$
declare def text;
begin
  perform set_config('search_path', 'public, pg_temp', true);
  def := regexp_replace(pg_get_viewdef('public.v_ownership_verdict'::regclass), ';\s*$', '');
  execute 'create materialized view public.mv_ownership_verdict as ' || def;
  execute 'create unique index mv_ownership_verdict_tag on public.mv_ownership_verdict (package_tag)';
  execute 'create or replace view public.v_ownership_verdict as select * from public.mv_ownership_verdict';
  execute $c$comment on view public.v_ownership_verdict is
    'Reads mv_ownership_verdict — the 43-second per-tag lineage computation runs in the matview '
    'refresh, off the user path, because the signed-in budget is 8 seconds and this page timed out '
    'for every user until 18 Aug 2026. Refresh is watcher-governed (matview_heal_policy). Agent I.'$c$;
  execute 'grant select on public.mv_ownership_verdict to authenticated';

  insert into public.matview_heal_policy (matview, max_age, refresh_fn, heals_per_day_ok, why, active)
  values ('mv_ownership_verdict', interval '60 minutes', null, 48,
          'Ownership audit coverage for the Quality page ownership-verdict: 187 rows that cost ~43s to '
          || 'derive (per-tag lineage walk). Hourly freshness is ample for an audit surface; the page '
          || 'itself now loads in milliseconds. Registered at creation, 18 Aug 2026, Agent I.',
          true)
  on conflict (matview) do nothing;
end $$;;
