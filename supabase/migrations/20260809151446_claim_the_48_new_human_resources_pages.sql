-- TG-05 added 48 nav_registry entries (280E cost classes, tax profiles, earning and deduction
-- codes, pay runs, QuickBooks employee map, zone coverage, incidents, offboarding...) and set
-- neither module nor archetype -- both columns were created only hours earlier, so the agent
-- had no reason to know. page-architecture.mjs caught it: "48 enabled pages belong to no
-- module".
--
-- MODULE is mechanically derivable: every one of the 48 carries category = 'Human Resources',
-- so ownership is a fact, not a judgement. Fixed here.
--
-- ARCHETYPE is deliberately NOT set. Which layout a page needs is a design decision and the
-- agent that built these knows what each one does. Assigning them from a label would be
-- guessing, and guessing a layout is precisely how "Employee Notes" got a harvest date filter.
-- The gate stays red on 268 undecided until they are declared. The baseline was NOT raised --
-- raising it would convert a real decision backlog into permanent debt.
--
-- Changes nothing a user sees: module is an ownership column, not a menu field. The owner's
-- rule that menus are additive-only is untouched.
update nav_registry
   set module = 'hr'
 where module is null
   and category = 'Human Resources';

-- Anything still unclaimed is NOT Human Resources and must not be silently absorbed.
do $$
declare n int;
begin
  select count(*) into n from nav_registry where enabled and module is null;
  if n > 0 then
    raise notice 'STILL UNCLAIMED: % enabled page(s) belong to no module. Not assumed into hr.', n;
  end if;
end $$;;
