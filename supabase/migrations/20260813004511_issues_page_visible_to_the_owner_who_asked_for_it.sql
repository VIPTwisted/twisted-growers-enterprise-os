-- Agent I, 12 Aug 2026. DBI-092. Correcting my own DBI-091 within the hour.
--
-- DBI-091 granted rows in page_permissions and the count did not move. The check does not read
-- that table: v_report_standard reads v_page_wiring, which counts
--   (select count(*) from nav_role_visibility where view_key = p.view_key and visible)
-- I assumed page_permissions was the source because of its name, applied a migration, and only
-- then measured. The right order is measure, then apply - which is the discipline I have spent
-- all day enforcing on other agents. The page_permissions rows are correct in their own right
-- (they govern edit/approve/export) and are left in place; they were simply not what the check
-- reads.
--
-- v_owner_issue_queue is the page the owner asked for by name: "we should have a page for agent
-- to flag issues by date found and tracked when resolved with details so we can work together and
-- take each one by one as i have time". Without a nav_role_visibility row it renders for nobody.
--
-- STILL DELIBERATELY NARROW: owner and executive only, and NOT the other 114. Some of those may
-- be hidden on purpose and I cannot tell which from here. A blanket visibility grant to clear a
-- gate is exactly the move this platform forbids. The ratchet falls by one and the rest stay on
-- the register as honestly counted debt.
--
-- UNDO: delete from nav_role_visibility where view_key = 'v_owner_issue_queue'.

insert into nav_role_visibility (view_key, role, visible)
values ('v_owner_issue_queue', 'owner', true),
       ('v_owner_issue_queue', 'executive', true)
on conflict (view_key, role) do update set visible = true, updated_at = now();;
