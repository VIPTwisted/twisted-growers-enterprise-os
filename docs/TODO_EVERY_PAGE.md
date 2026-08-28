# Must finish — every page

Owner 28 Aug 2026: period bus and search are not optional chrome.

## Period bus — EVERY page
Not just Tower / Command / Cultivation / four Finance pages.

Every page, section, tile, KPI, report, and printout either:
- uses the active frame from f_date_presets / useDefaultRange, or
- declares as-of / undated / snapshot with a visible chip.

Presets: All, Today, This week (this_week_td Mon→today), This month (this_month_td), Last month, Last 12 calendar months, Custom.

Still off the bus (~30+): HR/payroll, schedbuild/myschedule/myweek (hardcoded Monday), cult drills, Budz, workspace, kiosk, terminals, remaining finance widgets, 103 nav rows with null default_range.

## Search on EVERY page that lists records
Same rule as Orders: a search box that finds any invoice/tag/harvest/name across time.
Typing search sets the date range aside and says so on the page.
Undated rows are not dropped by a range.
No page answers "no results" only because this-month is selected.

## Do not
Second date catalog in React. New root nav. Blended Apex+Metrc $. Fake zeros from RLS.
