-- Agent I, 12 Aug 2026. DBI-088.
--
-- The owner opened Settings -> Integration Secrets looking for somewhere to paste his Resend key
-- and got "permission denied for table integration_secrets".
--
-- The page is a data_browser pointed straight at the raw integration_secrets table. That table is
-- correctly locked - forced RLS, zero policies, no grant to `authenticated`, only service_role
-- can read it. It holds 8 live credentials in clear text and it SHOULD refuse. The defect is that
-- a menu entry exists at all: it can only ever show a permission error, and the day it stops
-- doing that is the day eight credentials become readable from a browser.
--
-- This is the TWIN of `app-secrets`, which I retired in the Keys & Connections migration for
-- exactly this reason. I retired one and missed the other, and the owner found it - the same
-- "two pages over one table, delete one, do not improve both" that hold_the_ddc_discipline names.
-- Two definitions of one idea, and I removed one of them.
--
-- Keys & Connections (view_key app_secrets, archetype rules_editor) is the surviving page and the
-- only one that can accept a key. The 11 Aug menu freeze permits REMOVE of an entry.
--
-- UNDO: set enabled = true. It will resume showing a permission error.

update nav_registry
   set enabled = false,
       description = 'Retired 12 Aug 2026. It browsed the raw integration_secrets table, which is '
                     'correctly locked to service_role only, so the page could never show '
                     'anything but a permission error — and if it ever succeeded, eight '
                     'credentials would be readable from a browser. Use Settings → Keys & '
                     'Connections, which shows what is set, its last four characters, and when '
                     'and by whom, and lets you paste a new one.'
 where view_key = 'integration-secrets';

-- Make the surviving page easy to find rather than buried among 40+ Settings entries.
update nav_registry
   set item_order = 1,
       label = 'Keys & Connections'
 where view_key = 'app_secrets';;
