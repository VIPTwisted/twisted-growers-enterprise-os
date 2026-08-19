/*
 * MONEY_NAV_CONTRACT — 19 Aug 2026
 *
 * The invoice-grain quarantine repointed report_registry, but the enabled menu
 * entry is its own publication road and still opened v_forensic_sold_by_tag.
 * That line-grain object repeats invoice dollars once per tag and can therefore
 * display a false $54M sum. The safe wrapper retains every custody/detail
 * column while returning NULL for the two non-additive money columns.
 *
 * This is intentionally one guarded registry correction. The underlying view
 * remains available to its custody dependencies; only the user-facing route is
 * repointed. Rollback: restore the prior table_ref after proving the unsafe
 * money columns can no longer be subtotalled at line grain.
 */

do $$
begin
  if not exists (
    select 1
    from information_schema.views
    where table_schema = 'public'
      and table_name = 'v_forensic_sold_by_tag_safe'
  ) then
    raise exception 'MONEY_NAV_CONTRACT: safe sold-by-tag view is missing';
  end if;

  update public.nav_registry
     set table_ref = 'v_forensic_sold_by_tag_safe'
   where view_key = 'forensic_sold_by_tag'
     and enabled
     and table_ref = 'v_forensic_sold_by_tag';

  if not exists (
    select 1
    from public.nav_registry
    where view_key = 'forensic_sold_by_tag'
      and enabled
      and table_ref = 'v_forensic_sold_by_tag_safe'
  ) then
    raise exception 'MONEY_NAV_CONTRACT: enabled menu road is not quarantined';
  end if;
end $$;
