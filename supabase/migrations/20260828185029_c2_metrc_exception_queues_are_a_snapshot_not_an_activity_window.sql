-- OWNER RULING 28 Aug 2026, the same correction one row over: nav_registry for
-- xq_metrc_exceptions becomes default_range = 'all', range_kind = 'snapshot'.
--
-- WHY. These four queues are open work: harvests carrying a residual problem,
-- packages never submitted for testing, failed tests with no disposition, and
-- harvests open past the 28-day limit. An exception does not stop being an
-- exception because it is old. A page honouring an activity window over them
-- would answer "no results" for the honest-looking reason that the defect
-- started in July, which is the "fake zeros" failure docs/TODO_EVERY_PAGE.md
-- lists under Do not.
--
-- The row previously read default_range = null, range_kind = 'activity'. The
-- page already declares as-of with a visible chip and searches every queue with
-- no date predicate; this makes the registry agree with the page instead of
-- contradicting it, exactly as PR #41 did for plant_census.
--
-- Scope: exactly one row. No new nav entry, nothing enabled or disabled, no role
-- visibility touched, no other page's frame touched.
do $$
declare n integer;
begin
  update public.nav_registry
     set default_range = 'all',
         range_kind    = 'snapshot',
         updated_at    = now()
   where view_key = 'xq_metrc_exceptions';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'XQ_NAV: expected exactly 1 row for view_key xq_metrc_exceptions, updated %', n;
  end if;

  if not exists (
    select 1 from public.nav_registry n2
     where n2.view_key = 'xq_metrc_exceptions'
       and n2.default_range = 'all'
       and n2.range_kind = 'snapshot')
  then
    raise exception 'XQ_NAV: the row did not end in the intended state';
  end if;

  if not exists (select 1 from public.date_range_presets where preset_key = 'all') then
    raise exception 'XQ_NAV: preset ''all'' does not exist in date_range_presets';
  end if;

  -- The page stays exactly as reachable as it was. This migration is about the
  -- date frame and nothing else, so the visibility it was given on 28 Aug must
  -- be untouched: six roles may see it, eighteen may not.
  if (select count(*) from public.nav_role_visibility
       where view_key = 'xq_metrc_exceptions' and visible) <> 6 then
    raise exception 'XQ_NAV: role visibility changed - expected 6 roles able to see the page';
  end if;

  if (select count(*) from public.nav_registry where view_key = 'xq_metrc_exceptions') <> 1 then
    raise exception 'XQ_NAV: xq_metrc_exceptions is no longer a single nav row';
  end if;
end $$;;
