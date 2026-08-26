-- A nav row with no visibility row is visible to EVERY role: App.jsx builds a
-- hidden set from visible = false and a missing row is not in it. Left alone,
-- this compliance page would have been the only Metrc page open to hr,
-- qb_time_only, qb_standard_none and qb_standard_sales. It inherits the
-- visibility its sibling Metrc pages already carry rather than inventing a
-- policy of its own.
insert into nav_role_visibility (view_key, role, visible, created_at, updated_at)
select 'xq_metrc_exceptions', v.role, v.visible, now(), now()
from nav_role_visibility v
where v.view_key = 'rpt-harvest-moisture'
  and not exists (
    select 1 from nav_role_visibility x
    where x.view_key = 'xq_metrc_exceptions' and x.role = v.role
  );;
