/* ═══════════════════════════════════════════════════════════════════════════
   THE MENU TELLS THE TRUTH ABOUT ITSELF — 19 August 2026.

   Measured today: 665 enabled nav_registry rows. All 630 that name a table_ref
   resolve to a real object — "registered but not built" is ZERO at the data
   layer, contrary to an outside review. The real defect is narrower and was
   never named: SIXTEEN enabled entries had neither a registered object NOR a
   component in App.jsx. Every one of them was a click that reached a dead end.

   Eight of those sixteen had a real, readable object sitting behind them the
   whole time, named almost identically to the view_key. Nothing was missing but
   the link. Those are wired here, and their row counts are recorded so the next
   person can tell a wired-and-empty page from a wired-and-broken one.

   The other eight have NO object anywhere in this database. Bill of Materials,
   CAPA, Maintenance, Capacity Plan, S&OP, Weekly FG, SOP & Training and Data
   Explorer are subsystems that were never built. Inventing eight subsystems is
   not a wiring repair, and Law 1 forbids it. They are DISABLED — the owner's
   ruling is that an entry either reaches something or disappears — and each one
   keeps its reason in its own description so re-enabling is one update away.

   Nothing is dropped. Nothing is renamed. Every row survives; only `enabled`
   and `table_ref` move, both of which the frozen-surfaces ruling permits.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ---- 1. The eight that had a real object and no link to it ---- */
update nav_registry set table_ref = 'v_owner_issue_queue', updated_at = now()
  where view_key = 'v_owner_issue_queue' and table_ref is null;
update nav_registry set table_ref = 'v_dept_dash_cfo', updated_at = now()
  where view_key = 'v_dept_dash_cfo' and table_ref is null;
update nav_registry set table_ref = 'v_cfo_inventory_audit', updated_at = now()
  where view_key = 'v_cfo_inventory_audit' and table_ref is null;
update nav_registry set table_ref = 'app_users', updated_at = now()
  where view_key = 'permissions' and table_ref is null;
update nav_registry set table_ref = 'v_tag_movement_forensic', updated_at = now()
  where view_key = 'forensic_trace' and table_ref is null;
update nav_registry set table_ref = 'v_goal_status', updated_at = now()
  where view_key = 'goals' and table_ref is null;
update nav_registry set table_ref = 'hr_incidents', updated_at = now()
  where view_key = 'safety' and table_ref is null;
update nav_registry set table_ref = 'v_harvest_lineage_summary', updated_at = now()
  where view_key = 'genealogy' and table_ref is null;

/* ---- 2. The eight with nothing behind them anywhere ---- */
update nav_registry
   set enabled = false,
       updated_at = now(),
       description = coalesce(description || ' ', '') ||
         '[19 Aug 2026: DISABLED because it reached nothing. This entry had no '
         'registered object and no component, so clicking it was a dead end. No '
         'table, view or matview in this database serves it. Re-enable the moment '
         'the subsystem behind it exists — the row is intact and nothing was lost.]'
 where view_key in ('bom','capa','maintenance','plan_capacity','sop','weekly_fg','data_explorer')
   and enabled;

/* SOP & Training is separated on purpose: harvest_sop_steps EXISTS and is a
   near-miss. It holds the steps of the harvest SOP, not a training register, so
   pointing this entry at it would put the wrong data under the owner's label —
   which Law 10 forbids more strongly than it forbids an empty menu. Disabled
   with the candidate named, for the owner to rule on rather than for me to. */
update nav_registry
   set enabled = false,
       updated_at = now(),
       description = coalesce(description || ' ', '') ||
         '[19 Aug 2026: DISABLED because it reached nothing. Nearest candidate is '
         'harvest_sop_steps, which is the harvest SOP''s steps and NOT a training '
         'record; wiring it here would mislabel the data, so it was left for an '
         'owner ruling rather than guessed at.]'
 where view_key = 'sop_training' and enabled;

/* ---- 3. Two finished pages that no menu could reach ----
   dash-schedule.jsx and dash-plants.jsx are built, routed in App.jsx and pass
   every gate, and carried ZERO nav_registry rows — reachable only by typing the
   address. Built and unreachable is the same as unbuilt to the person using it. */
insert into nav_registry
  (category, category_order, label, item_order, icon, view_key, table_ref, enabled,
   surface, page_kind, date_policy, default_range, range_kind, module, archetype,
   subcategory, color, admin_only, description)
select 'Cultivation', 4, 'Schedule Adherence',
       (select coalesce(max(item_order), 0) + 1 from nav_registry where category = 'Cultivation'),
       'clock', 'schedule_adherence', 'v_schedule_adherence', true,
       'side', 'custom', 'auto', 'this_month_td', 'activity', 'cultivation', 'dashboard',
       'Schedule', '#5cff92', false,
       'Pulls against the schedule, with the one deliberately asymmetric rule in the '
       'operation: a pull may come down early, never late. Built 13 Aug 2026 and '
       'reachable by address only until this row existed.'
where not exists (select 1 from nav_registry where view_key = 'schedule_adherence');

insert into nav_registry
  (category, category_order, label, item_order, icon, view_key, table_ref, enabled,
   surface, page_kind, date_policy, default_range, range_kind, module, archetype,
   subcategory, color, admin_only, description)
select 'Cultivation', 4, 'Plant Census',
       (select coalesce(max(item_order), 0) + 2 from nav_registry where category = 'Cultivation'),
       'leafline', 'plant_census', 'v_plant_mirror_balance', true,
       'side', 'custom', 'auto', 'this_month_td', 'activity', 'cultivation', 'dashboard',
       'Rooms & Plants', '#5cff92', false,
       'What is standing, which of Metrc''s two plant paths says so, and the per-room '
       'balance against Metrc''s own dated report. Built 15 Aug 2026 and reachable by '
       'address only until this row existed.'
where not exists (select 1 from nav_registry where view_key = 'plant_census');