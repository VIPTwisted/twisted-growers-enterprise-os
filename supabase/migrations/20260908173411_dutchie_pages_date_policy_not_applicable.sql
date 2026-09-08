-- GROK-WHY: L6. dutchie_cult / dutchie_mfg / os_users declared date_policy as_of with no table date.
-- v_report_standard called that DEFECT and date_defect moved 102 to 104.
-- These pages are overlays, not dated reports. Date is meaningless. Omit the control.
-- Same as os_help. No Metrc/Apex write. Cycle 56. No ledger rewrite. No GRANT to anon.

update public.nav_registry
   set date_policy = 'not_applicable',
       default_range = null,
       range_kind = 'snapshot'
 where view_key in ('dutchie_cult', 'dutchie_mfg', 'os_users')
   and date_policy is distinct from 'not_applicable';
