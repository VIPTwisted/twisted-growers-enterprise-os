-- Ten more enabled pages arrived with no module, so page-architecture.mjs failed again:
--   Command Center 5  Discrepancies - the one-week clock | Manifests With No Contents Recorded |
--                     Ownership - three independent sources | Position - Ours, Third Party,
--                     Collectively | Strain Conflicts - item vs record
--   Human Resources 4 Employee File | Schedule Builder | Timesheets | Wall Terminal
--   Settings 1        Rule C3a - Documents On Every Item Row
--
-- Module is a fact derived from category, not a judgement, so it is set here. ARCHETYPE is
-- deliberately left NULL: which layout each page needs is a design decision belonging to the
-- agent that built it, and guessing one is how a roster ends up with a harvest date filter.
--
-- This is the second time in one day that pages have been added without ownership. The gate
-- catches it every time, but catching is not the same as preventing -- the durable fix is for
-- whoever inserts a nav_registry row to set module and archetype in the same statement.
update nav_registry
   set module = case category
                  when 'Command Center'  then 'command'
                  when 'Human Resources' then 'hr'
                  when 'Settings'        then 'settings'
                end
 where module is null
   and category in ('Command Center', 'Human Resources', 'Settings');

do $$
declare n int;
begin
  select count(*) into n from nav_registry where enabled and module is null;
  if n > 0 then
    raise notice 'STILL UNCLAIMED: % page(s) in categories not mapped above.', n;
  end if;
end $$;;
