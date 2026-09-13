-- Owner, 13 Sep 2026: "I need the sync page back — the page I keep all the tokens and Metrc, Apex, Sheets
-- tokens, keys and syncs." The page (view_key integrations) exists in the published build; it is named
-- "Integrations" under Settings › Connections. It now carries the name he uses, at the top of Settings.
-- view_key unchanged, so the live build resolves it — no deploy needed for this row.
update public.nav_registry
   set label = 'Sync — tokens, keys & syncs', item_order = 0,
       description = 'Metrc, Apex, Google Sheets and every other connection: the keys, the tokens and the sync buttons, on one page. Called "the Sync page".'
 where view_key = 'integrations';
select category, subcategory, label, item_order, enabled from public.nav_registry where view_key in ('integrations','app_secrets') order by item_order;
