-- Applied prod 20260905103835. Enables Command → Help for every signed-in role.
update public.nav_registry
   set enabled = true,
       description = 'Pictured walkthroughs for every signed-in role. Nothing here writes to Metrc or Apex. Users and Permissions have their own guides.'
 where view_key = 'os_help'
   and enabled is distinct from true;
