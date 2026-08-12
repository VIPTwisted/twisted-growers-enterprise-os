-- FISCAL YEAR IS AN ADMIN SETTING, AS IN QUICKBOOKS. Owner, 8 Aug 2026:
--   "January is start of year" and "allow fiscal year to be changed in admin setting
--    as QuickBooks does."
--
-- QuickBooks holds the fiscal year start under Account and Settings > Advanced, and
-- every fiscal report follows it. It is a company fact, not a code constant.
-- ANYTHING HARDCODED IS A SERIOUS VIOLATION OF THE OWNER'S RULES - so the month lives
-- in configurations, f_fiscal_year_start() reads it, and the 3 fiscal presets follow
-- automatically. Changing it in Settings changes every fiscal report on the platform
-- with no code change and no page missed.
--
-- v_admin_settings is the editable surface: what it is, what it does, what it affects,
-- so nobody changes it without seeing the consequence.
-- UNDO: drop view v_admin_settings.

create or replace view public.v_admin_settings as
select 'fiscal_year_start_month'::text                      as setting_key,
       'Fiscal year starts in'::text                        as label,
       'Company'::text                                      as section,
       coalesce((select value #>> '{}' from configurations
                  where key='fiscal_year_start_month'),'1') as current_value,
       to_char(to_date(coalesce((select value #>> '{}' from configurations
                  where key='fiscal_year_start_month'),'1'),'MM'),'FMMonth') as shows_as,
       'number 1-12'::text                                  as value_type,
       '1 (January)'::text                                  as default_value,
       f_fiscal_year_start()::text                          as takes_effect_as,
       'Every fiscal preset on the platform: This Fiscal Year, This Fiscal Year-to-date '
       'and Last Fiscal Year. Changing it changes what those three mean on all 518 '
       'report pages at once.'                              as what_it_affects,
       'QuickBooks holds this under Account and Settings > Advanced. It is a company '
       'fact, not a code constant - never hardcode it.'     as note
union all
select 'default_date_preset', 'Default date range', 'Reports',
       coalesce((select value #>> '{}' from configurations where key='default_date_preset'),'this_month_td'),
       coalesce((select p.label from date_range_presets p
                  where p.preset_key = (select value #>> '{}' from configurations
                                         where key='default_date_preset')),'This Month-to-date'),
       'one of date_range_presets.preset_key', 'this_month_td (This Month-to-date)',
       coalesce((select p.label from date_range_presets p
                  where p.preset_key = (select value #>> '{}' from configurations
                                         where key='default_date_preset')),'This Month-to-date'),
       'What a report opens on when neither the user nor the page has set anything. '
       'Users still override it per page or globally; this is only the floor.',
       'The QuickBooks convention for activity reports. Snapshot pages - stock on '
       'hand, ageing, registries - stay on Today, because applying a RANGE to a '
       'balance changes what the number means.'
union all
select 'fresh_frozen_wet_to_dry', 'Fresh frozen wet-to-dry ratio', 'Cultivation',
       coalesce((select value #>> '{}' from configurations where key='fresh_frozen_wet_to_dry'),'4.5'),
       coalesce((select value #>> '{}' from configurations where key='fresh_frozen_wet_to_dry'),'4.5'),
       'number', '4.5',
       coalesce((select value #>> '{}' from configurations where key='fresh_frozen_wet_to_dry'),'4.5'),
       'Every dry-equivalent figure. 603.9 lb of fresh frozen becomes 134.2 lb at 4.5. '
       'Measured across our own 380 harvests it is 4.17; the briefing says 5.03.',
       'The three sources disagree and the owner has not ruled. Report the ratio used '
       'alongside any dry-equivalent figure.';

comment on view public.v_admin_settings is
  'Company settings an admin may change, with what each one affects. Fiscal year start '
  'is here for the same reason QuickBooks puts it in Advanced settings: it is a '
  'company fact and hardcoding it is a rules violation. Changing a value here changes '
  'every report that depends on it, with no code change and no page missed.';;
