# Custom JSX still not on lib/range-search.js
Scan of app/web/src after #49. ReportScreen (~619) already fixed in #48.

## Next (list pages / dashboards)
- myschedule.jsx
- commandcenter.jsx
- budz.jsx
- tgworkspace.jsx
- kiosk.jsx
- terminals.jsx
- keysconnections.jsx
- syncitems.jsx
- docreader.jsx
- wcanvas.jsx / wcanvas-live.jsx / wcanvas-kinds.jsx
- business-rule-editor.jsx (declare if no list)
- fin-kit.jsx (kit — skip unless it lists)
- cult-kit.jsx (kit — skip)

## Already on bus or shared control
HR six + empfile/onboard/hrqueue/staffforms
cult six + loss-ledger + room-turn + harvest-detail
dash-cultivation, dash-schedule, dash-inventory, dash-plants
fin-orders, fin-sales-history, fin-customers, fin-customer-manifests
metrc-exceptions
ReportScreen

## Empty SoR (not a UI bug)
work_orders, work_order_stages, pipeline_runs, schedule_assignments = 0 rows
