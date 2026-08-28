# Period bus — implement, do not invent

The bus already exists.
- RPC `f_date_presets` + `f_date_default`
- `app/web/src/lib/date-range.js` (`useDefaultRange`, `saveDateDefault`)
- `date-range-core.js` (exclusive To-day for PostgREST)
- `dashboard-range.js` → `f_department_dashboard(p_dept, p_from, p_to)`
  Failure must stay visible. Never fall back to an all-time MV under a selected range.

## A first landing (already assigned)
1. Control Tower
2. Command Center Dashboard
3. One department dashboard (Cultivation)

Mount the existing catalog + default hook. Changing the control must re-query every time-bound tile on that page.
Do not add a new root nav item. Do not omit tiles.

## Governed defaults (write to date-default policy if missing; no JSX hardcode)
| view_key family | preset |
|---|---|
| control_tower, command_center, *_dashboard | this_week (Monday → today) |
| finance, orders, sales, cost_* | this_month |
| xq_*, live rooms, stock on hand | as_of_now (control still visible; tiles that are position show As-of chip) |
| alerts | today + unresolved |

Presets the control must offer: All, Today, This week, This month, Last month, Last 12 months, Custom.
If `f_date_presets` is missing a key, add the row. Do not fork a second catalog in React.

## Inherit
Tower frame is the site default until a page saves its own `user_page_date_default`.
Override chip on the page when it differs from Tower.
Search sets range aside and says so (Orders already does this).
Undated rows are not dropped.

## Tower sections (do not rename)
Live Data KPIs · Today’s Operations · Compliance & Testing · Materials & Production · Cash & Finance · Commitments & Service

Command Center children stay: Open questions, My alerts, Issues flagged by agents, exception board, template dashboards, Brain, Planner, agents agree, code trap, report catalogue.

## Stop condition
Three pages inherit and re-query. Then list every remaining page that draws a number without the bus. Do not claim sitewide done.
