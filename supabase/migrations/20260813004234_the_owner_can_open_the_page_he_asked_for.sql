-- Agent I, 12 Aug 2026. DBI-091.
--
-- check:reportcontract - "reports no role can open: 115 (ratchet 113)". A page with no row in
-- page_permissions renders for NOBODY while still counting as delivered work. Two crossed the
-- ratchet; one of them is mine from 16:07 tonight.
--
-- v_owner_issue_queue is the page the owner asked for in his own words: "we should have a page
-- for agent to flag issues by date found and tracked when resolved with details so we can work
-- together and take each one by one as i have time". I built the view, added the menu entry, and
-- never granted a single role permission to open it. He would have clicked it and got nothing.
--
-- DELIBERATELY NARROW. I am granting to owner and executive ONLY, and I am NOT sweeping all 115.
-- Some of those 115 may be hidden on purpose and I cannot tell which from here; a blanket grant
-- across a permissions table is exactly the kind of change that should never be made to clear a
-- gate. The ratchet falls to 113, which is the recorded limit - it does not fall further, and it
-- must not be raised. The remaining 113 stay on the register as debt, honestly counted.
--
-- can_export is false: the issue queue carries agent findings about the business, and there is no
-- reason for it to leave the platform as a spreadsheet.
--
-- UNDO: delete from page_permissions where view_key = 'v_owner_issue_queue'.

insert into page_permissions (role, view_key, can_view, can_edit, can_approve, can_export, note)
values
 ('owner',     'v_owner_issue_queue', true, true,  true,  false,
  'The owner asked for this page by name on 12 Aug 2026 and decides every issue on it. can_edit '
  'and can_approve because deciding IS the purpose of the page.'),
 ('executive', 'v_owner_issue_queue', true, false, false, false,
  'Can read what agents have flagged. Deciding stays with the owner - his standing rule is that '
  'agents flag and he decides, and an executive approving on his behalf would defeat it.')
on conflict do nothing;;
