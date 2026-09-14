/* THE TAX CENTER GETS A ROAD INTO IT.
   Owner, 29 August 2026. NOT APPLIED — held for GO.

   A PAGE WITH NO NAV ROW IS A PAGE NOBODY CAN OPEN. Two Apex truth reports
   were registered and unreachable for days for exactly this reason, so the row
   ships with the page rather than after it.

   IT GOES UNDER THE EXISTING Finance › Tax SUBCATEGORY. No new side-bar
   category: the frozen-surfaces ruling of 11 Aug allows rename, consolidate,
   add and remove on menu entries, and this is an add beside the four tax
   entries already there (year_end_2025, year_end_2025_summary,
   year_end_coverage, inventory_valuation).

   THE DEFAULT RANGE IS this_year AND range_kind IS activity, matching the CFO
   Dashboard, because tax is a year question. The page states plainly that
   nothing on it is narrowed by the period YET — the doctrine, the cost classes
   and the certified positions are each a standing position rather than a flow —
   and that the period will govern the COGS computation once the general ledger
   is connected. Declaring the frame it will use, and saying what it does not
   yet move, is the rule; giving it no frame at all is not.

   table_ref IS tax_280e_doctrine, THE ONE RELATION IT LEADS WITH. The page is
   not a report over a single relation and does not go through ReportScreen —
   App.jsx routes view_key `tax_center` to its own component — but nav_registry
   requires a table_ref and pointing it at the doctrine is truthful: that is
   what its banner and its first panel read.

   VISIBILITY IS COPIED FROM AN EXISTING FINANCE TAX PAGE rather than invented,
   so this page is visible to exactly the roles that can already see the year-end
   tax pages and to no others. Inventing a visibility set is how a money surface
   ends up readable by someone who should not have it.
*/

do $$
declare
  k_view   constant text := 'tax_center';
  k_model  constant text := 'year_end_coverage';
  v_model  nav_registry;
  v_vis    integer;
begin
  if exists (select 1 from nav_registry where view_key = k_view) then
    raise notice 'nav_registry already carries %, leaving it alone.', k_view;
    return;
  end if;

  select * into v_model from nav_registry where view_key = k_model;
  if not found then
    raise exception 'The model row % is gone, so this page cannot inherit its category, order or visibility. Refusing to guess them.', k_model;
  end if;

  insert into nav_registry (
    category, category_order, label, item_order, icon, view_key, table_ref,
    description, enabled, subcategory, surface, page_kind,
    default_range, range_kind, module)
  values (
    v_model.category, v_model.category_order,
    'Tax Center',
    v_model.item_order + 1,
    v_model.icon, k_view, 'tax_280e_doctrine',
    'The 280E doctrine, the cost classes, and the certified Metrc positions, with every general-ledger figure named as QuickBooks Online''s and left empty until QBO is connected. No second ledger.',
    true, v_model.subcategory, v_model.surface, v_model.page_kind,
    'this_year', 'activity', v_model.module);

  /* The same roles that can already open the year-end tax pages, copied rather
     than chosen — AND `visible` copied with them.

     THE TRAP THIS AVOIDS, measured before writing it. year_end_coverage has 24
     visibility rows and only 11 are visible = true; the other 13 are an
     explicit NO for assistant_manager, dept_head, employee, hr, manager,
     planner and six QuickBooks roles. Copying (view_key, role) alone would
     take the column default for `visible` and turn thirteen deliberate noes
     into yeses — publishing a tax surface to the shop floor as a side effect
     of adding a menu row. The flag is part of the decision, not metadata. */
  insert into nav_role_visibility (view_key, role, visible)
  select k_view, role, visible from nav_role_visibility where view_key = k_model;
  get diagnostics v_vis = row_count;

  if v_vis = 0 then
    raise exception 'No visibility row was copied from %, so the Tax Center would be registered and openable by nobody. Refusing to publish a page no role can reach.', k_model;
  end if;

  /* The copy must be exact in both directions, or the page is either hidden
     from someone who should see it or shown to someone who should not. */
  if exists (
    select 1
    from nav_role_visibility a
    full join nav_role_visibility b
      on b.view_key = k_view and b.role = a.role
    where a.view_key = k_model
      and (b.role is null or a.visible is distinct from b.visible))
  then
    raise exception 'The visibility copy does not match % role for role. Rolling back rather than guessing who may open a tax page.', k_model;
  end if;

  raise notice 'Tax Center registered under % › %. % visibility row(s) copied, % of them visible.',
    v_model.category, v_model.subcategory, v_vis,
    (select count(*) from nav_role_visibility where view_key = k_view and visible);
end $$;
