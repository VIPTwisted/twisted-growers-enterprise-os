# Reference Screens Inventory — owner-shared screenshots, 2026-08-05
*Every screenshot shared in the build session, catalogued from the images themselves: what it showed,
the design language to adopt (patterns only — never their assets), the features visible, and where each
landed in the Action Register. This is the authoritative sweep; agents cannot see images — this catalog
was built by direct inspection of every one.*

## Design language to adopt (across all references)
- **Card-grid galleries** for templates/dashboards/skills: icon chip top-left, bold title, one-line muted
  description, hover lift. (Adopted in Template Center, Dashboards gallery, Launcher.)
- **Colored status pills** with white text (Working on it amber / Done green / Stuck red) → TG preset
  pipelines with Color Code v2 tones. (Views engine spec.)
- **Grouped board tables**: colored group rail + title, per-group column headers, add-row affix,
  group rollup bar (status distribution + date range chip). (Views engine spec.)
- **Left icon rail with tiny labels** + secondary panel. (Shipped: collapsed rail redesign.)
- **Full-screen modal flows** for create (task/doc/whiteboard/dashboard tabs in one composer). (Work layer.)
- **Stat-card rows** (big number, label, filter chip per widget). (Shipped in dashboards/qcards.)
- **Onboarding pickers**: chip-select for roles/columns/widgets/views. (Shipped: Brain roles; spec: board pickers.)
- **Settings console**: left nav grouped Admin / Features / Integrations / My Settings. (Admin Console spec.)
- **Soft violet-blue AI identity** distinct from the main product. (Shipped: TG Workspace violet realm.)

## Screens, in order shared
1. **ClickUp Home overview** (widget cards Recent/Docs/Bookmarks/Folders, Add card, auto-refresh) → My Work home P0.
2. **Brain² intro modal** (floating app icons, "Your company's Brain", personalize) → SHIPPED: Brain intro orbit + roles.
3. **Brain role picker** (What's your role chips) → SHIPPED.
4. **Brain Ask screen** (big wordmark, Ask/Agents tabs, suggestion cards) → SHIPPED: live Ask bar + quick cards; Agents tab M5.
5. **Connect your apps** (Calendar/Gmail/Outlook, admin-gated) → SHIPPED connections section; QuickBooks/Monday slots.
6. **Import memory** (paste from other AI, admin-only) → SHIPPED (admin-only memory import).
7. **Teams Hub marketing** (align teams, capacity views, activity feed) → SHIPPED Teams Hub; workload/activity registered.
8. **Create Team modal** (icon+name+description) → SHIPPED custom teams.
9. **Teams: All People / Org Chart / Analytics rail** → registered (org chart from manager_id; analytics).
10. **Planner calendar marketing** (connect calendar, time-block, AI notes) → SHIPPED ops calendar; connects+notetaker registered.
11. **Whiteboard create modal** (Task/Doc/Reminder/Whiteboard/Dashboard tabs, private toggle) → SHIPPED whiteboards;
    unified create composer registered.
12. **Whiteboard template gallery** (Org Chart, Action Plan, Journey Map, Flow Chart, Root Cause) → registered addendum.
13. **Dashboard template gallery** (Simple, AI Team Center, Time Tracking, Project Mgmt, scratch) → SHIPPED TG gallery.
14. **Dashboards hub** (All/My/Shared/Private, favorites, recents, templates row) → registered (dashboards manager).
15. **Task creation modal** (name, /commands, AI description, status/assignee/due/priority/tags, templates) → Tasks v2 spec.
16. **Tasks board List/Board/Calendar tabs + group by status** → views engine spec.
17. **Time tracking panel** (timer entry, task select, notes, tags, billable, My Timesheet/Dashboard) → SHIPPED tracker v1; timesheets suite P0.
18. **Timesheets: My / All / Approvals** (week grid per task/day, member rows vs capacity, approvals w/ tracked/capacity/billable/over-capacity) → registered P0 (full 3-tab spec).
19. **Forms template gallery** (Feedback, Project Intake, Order, Job Application, IT Requests) → Forms builder P0.
20. **Clips hub** (video/voice clips, SyncUps, AI Notetaker rail) → Clips + SyncUps registered.
21. **Workspace More popover** (Spaces, Chat, Docs, Goals, Apps, Customize navigation) → all homed.
22. **Pricing tier feature lists ×3** → capability checklist register row (no pricing, own build).
23. **Workspace Settings — General** (avatar/name, custom branding logos, color scheme, custom URL, personal layout) → Admin Console.
24. **Settings left nav full console** (Admin/Features/Integrations/ClickApps/My Settings) → Admin Console.
25. **Security & Permissions full spec** (2FA modes, SSO providers, session mgmt, chat retention, public-view auth,
    invite matrix, custom role permission grid, advanced toggles) → RBAC framework SHIPPED as data; sweep P0.
26. **Custom Field Manager ×2** (All/Workspace/Task-Type/Personal, by location, by task type w/ counts) → Admin Console addendum.
27. **Work Schedule** (workweek toggles, working hours, capacity, holidays/days off) → SHIPPED per-employee schedules + defaults.
28. **Template Center** (featured/workspace/ClickUp, types, complexity, categories) → SHIPPED TG-native center (24 templates).
29. **Spaces admin** (spaces list w/ owner, shared-with, statuses, ClickApps, required views; archived/inaccessible) → Spaces SHIPPED; manage pages registered.
30. **AI Notetaker settings** (auto-schedule, bot name/join message, summary/recording/transcript, Zoom) → Meetings addendum.
31. **Automations Manager** (Browse/Manage/Usage/Activity/Webhooks/Recurring, trigger/condition/action) → Work layer addendum + cannabis recipes.
32. **Tag Manager** (tags by location, usage counts, bulk delete) → Admin Console addendum; taxonomy seeded.
33. **Avatar menu full** (status, mute, settings, notifications, themes, shortcuts, download, help, personal tools list, trash, logout) → SHIPPED full-parity menu (SOON tags on unbuilt).
34. **Super Agents / AI context / hierarchy / reporting cards** → M5 agents enrichment.
35. **Task feature cards ×2** (sprints, goals, milestones, relationships, multi-assignee, custom statuses/types,
    priorities, templates, checklists, tags) → Tasks v2 checklist.
36. **My Tasks / Home / subtasks / nested / sprint points / task tray / epics / personal priorities / subfolders** → views+work layer.
37. **Views cards** (15+ views, Kanban, Gantt, List, Calendar, Table, Whiteboards, Mind Maps, Canvas, Map, Portfolios, Workload ×2) → views engine spec.
38. **Chat / Inbox / Assign comments** → Chat v1 SHIPPED; inbox + assign-comments registered.
39. **Clips / SyncUps / Reminders cards** → registered.
40. **Email PM / Forms / Collaboration detection** → work layer addendum.
41. **Monday: board column picker ×2** (Owner/Status/Due/Timeline/Notes/Files/Priority/Last updated/Budget) → default column set registered.
42. **Monday: dashboard widget picker + Project overview** (tasks overview/by status/by owner/overdue/by due date) → dashboards addendum.
43. **Monday: view layout picker** (Table/Kanban/Calendar/Gantt/Timeline/Cards) → views engine.
44. **Monday: full board shell** (workspace rail, groups To-Do/Completed, status pills, rollup bars, toolbar) → views engine.
45. **Monday: Manage workspace** (Recents/Content/Collaborators/Permissions, asset table, cleanup mode, rename/change type/leave/delete) → workspace manage addendum.
46. **Monday: Dashboard & reporting live** (Add widget, connected board, per-widget filters, export) → dashboards addendum.

## Cross-check status
Every screen above maps to a SHIPPED feature or a register row (sources: owner_directive, chat_audit,
workbook_audit, planning_audit, monday_audit pending sweep). Anything newly spotted in future screenshots
gets appended here first, then registered.
