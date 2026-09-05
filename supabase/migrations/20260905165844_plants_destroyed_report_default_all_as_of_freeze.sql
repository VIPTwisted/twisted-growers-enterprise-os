-- Applied prod 20260905165844.
-- Period bus: Metrc Plants Destroyed is a freeze/truth view, not this-month activity.
-- Dates from v_plants_destroyed_truth (source_row). Do not rewrite destroyed_on.

update nav_registry set default_range = 'all' where view_key = 'rpt-plants-destroyed';

insert into os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket, reversible)
values (
  'grok-ceo',
  'nav',
  'nav_registry',
  'rpt-plants-destroyed',
  'this_month_td',
  'all',
  'Snapshot freeze. this_month hid the 2024-01-15 to 2026-07-29 source-dated rows. Ledger destroyed_on stays NULL.',
  'update nav_registry set default_range = ''this_month_td'' where view_key = ''rpt-plants-destroyed'';',
  'PERIOD-DEST',
  true
);
