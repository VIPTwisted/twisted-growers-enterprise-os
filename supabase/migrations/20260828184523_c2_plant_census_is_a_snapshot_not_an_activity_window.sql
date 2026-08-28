-- OWNER RULING 28 Aug 2026: nav_registry for plant_census becomes
-- default_range = 'all', range_kind = 'snapshot'. Plants are not to be filtered
-- by sync time.
--
-- WHY THE OLD ROW WAS WRONG, from the view's own columns rather than taste.
-- v_plant_census carries: tag, room, phase, strain, source, in_api_mirror,
-- in_metrc_report, api_synced_at, report_as_of, report_age_days,
-- provenance_note, room_disagreement. There is NO activity date on a plant row.
-- The only dates are provenance - when the API mirror synced, and what day
-- Metrc's point-in-time report was as of.
--
-- The row said default_range = 'this_month_td' and range_kind = 'activity'. A
-- page honouring that literally could only filter on api_synced_at, which drops
-- a standing plant because its ROW synced before the 1st. That is a live plant
-- vanishing from a census for a reason that has nothing to do with the plant -
-- the "fake zeros" failure docs/TODO_EVERY_PAGE.md lists under Do not.
--
-- 'all' with range_kind 'snapshot' is what dept_dash_inventory already carries in
-- spirit (snapshot, today) and what 132 other rows already use as a kind. The
-- page itself declares as-of with a visible chip; this makes the registry agree
-- with the page instead of contradicting it.
--
-- Scope: exactly one row. No new nav entry, nothing enabled or disabled, no
-- other page's frame touched.
do $$
declare n integer;
begin
  update public.nav_registry
     set default_range = 'all',
         range_kind    = 'snapshot',
         updated_at    = now()
   where view_key = 'plant_census';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'PLANT_CENSUS_NAV: expected exactly 1 row for view_key plant_census, updated %', n;
  end if;

  -- Executable postcondition: the row reads what it was meant to read, and the
  -- preset it names actually exists. A migration that cannot prove its own
  -- result is a hope, not a change.
  if not exists (
    select 1 from public.nav_registry n2
     where n2.view_key = 'plant_census'
       and n2.default_range = 'all'
       and n2.range_kind = 'snapshot')
  then
    raise exception 'PLANT_CENSUS_NAV: the row did not end in the intended state';
  end if;

  if not exists (select 1 from public.date_range_presets where preset_key = 'all') then
    raise exception 'PLANT_CENSUS_NAV: preset ''all'' does not exist in date_range_presets';
  end if;

  -- Nothing else moved.
  if (select count(*) from public.nav_registry where view_key = 'plant_census') <> 1 then
    raise exception 'PLANT_CENSUS_NAV: plant_census is no longer a single nav row';
  end if;
end $$;;
