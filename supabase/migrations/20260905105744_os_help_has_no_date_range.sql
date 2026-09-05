-- Applied prod 20260905105744.
-- Help is not a dated book. default_range=today painted a fake period on a walkthrough page.
update public.nav_registry
   set default_range = null,
       date_policy = 'not_applicable',
       range_kind = 'snapshot'
 where view_key = 'os_help'
   and default_range is distinct from null;
