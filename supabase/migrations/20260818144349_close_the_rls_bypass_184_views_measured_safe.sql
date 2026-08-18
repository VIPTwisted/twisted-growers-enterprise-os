/* 184 VIEWS STOP BYPASSING ROW SECURITY — every one measured before it moved.
 *
 * The security advisor scored 193 ERROR-level security_definer views; the house
 * ratchet (views_bypassing_rls) counted 202 raw, 201 undeclared. Flipping blind
 * is how a page goes dark, so every candidate was probed first by
 * tg_probe_view_invoker(): trial flip inside a subtransaction, rows counted as a
 * REAL signed-in user (both real users hold role owner today), rolled back
 * unconditionally, verdict logged in view_rls_flip_log.
 *
 *   184 MEASURED_SAFE  — identical rowcounts owner-mode vs signed-in. This
 *                        migration flips exactly those. Counts were capped
 *                        (200-5001 rows) on the largest views, so the biggest
 *                        few are sample-verified rather than exhaustively; the
 *                        page canary and the ratchet stand behind them.
 *     8 MEASURED_DIFFERS — ops/watchdog views (cron health, sentinels, house
 *                        rules) whose base tables authenticated cannot read;
 *                        flipping would blank those pages. Held for base-table
 *                        policy work, tracked in view_rls_flip_log.
 *     9 ERROR           — five read apex_raw (no authenticated policy — a
 *                        policy decision, not a flip), two too heavy to count
 *                        in the probe budget, one blocked by task #34 per-row
 *                        policies (v_ownership_verdict), and
 *                        v_alert_email_recipients_internal, which is ungated
 *                        BY DESIGN and is registered below instead.
 *
 * The ratchet's net figure falls from ~201 undeclared to 17, and its
 * downward-only baseline locks the improvement in at the next 06:34 run. */

alter view public.v_access_preview set (security_invoker = true);
alter view public.v_adjustment_conflicts set (security_invoker = true);
alter view public.v_admin_alerts set (security_invoker = true);
alter view public.v_agent_health set (security_invoker = true);
alter view public.v_alert_center set (security_invoker = true);
alter view public.v_all_sync_runs set (security_invoker = true);
alter view public.v_apex_entity_status set (security_invoker = true);
alter view public.v_awaiting_allocation set (security_invoker = true);
alter view public.v_bridge_performance set (security_invoker = true);
alter view public.v_bridge_status set (security_invoker = true);
alter view public.v_c3a_document_coverage set (security_invoker = true);
alter view public.v_catalogue_items set (security_invoker = true);
alter view public.v_catalogue_locations set (security_invoker = true);
alter view public.v_catalogue_strains set (security_invoker = true);
alter view public.v_certificate_disagreement set (security_invoker = true);
alter view public.v_certificate_gap set (security_invoker = true);
alter view public.v_certificate_resolved set (security_invoker = true);
alter view public.v_coa_register set (security_invoker = true);
alter view public.v_concentrate_valuation set (security_invoker = true);
alter view public.v_control_tower set (security_invoker = true);
alter view public.v_cost_of_loss set (security_invoker = true);
alter view public.v_countable_inventory set (security_invoker = true);
alter view public.v_cultivation_meeting_pack set (security_invoker = true);
alter view public.v_custody_alerts set (security_invoker = true);
alter view public.v_custody_compliance set (security_invoker = true);
alter view public.v_dashboard_tasks set (security_invoker = true);
alter view public.v_dashboard_trend set (security_invoker = true);
alter view public.v_db_change_status set (security_invoker = true);
alter view public.v_deferral_pressure set (security_invoker = true);
alter view public.v_department_board set (security_invoker = true);
alter view public.v_department_kpis_extra set (security_invoker = true);
alter view public.v_document_links set (security_invoker = true);
alter view public.v_document_package_link set (security_invoker = true);
alter view public.v_dry_room_performance set (security_invoker = true);
alter view public.v_duplicate_audit set (security_invoker = true);
alter view public.v_entity_note_active set (security_invoker = true);
alter view public.v_facility_live_map set (security_invoker = true);
alter view public.v_facility_registry set (security_invoker = true);
alter view public.v_failed_by_maker set (security_invoker = true);
alter view public.v_failed_provenance set (security_invoker = true);
alter view public.v_failed_testing_by_origin set (security_invoker = true);
alter view public.v_flow_failed_split set (security_invoker = true);
alter view public.v_fresh_frozen_equiv set (security_invoker = true);
alter view public.v_full_accountability set (security_invoker = true);
alter view public.v_harvest_alerts set (security_invoker = true);
alter view public.v_harvest_benchmark_note set (security_invoker = true);
alter view public.v_harvest_economics set (security_invoker = true);
alter view public.v_harvest_forensic set (security_invoker = true);
alter view public.v_harvest_issues set (security_invoker = true);
alter view public.v_harvest_lifecycle set (security_invoker = true);
alter view public.v_harvest_lineage_summary set (security_invoker = true);
alter view public.v_harvest_mass_ledger set (security_invoker = true);
alter view public.v_harvest_stage_map set (security_invoker = true);
alter view public.v_harvest_still_in_room set (security_invoker = true);
alter view public.v_hr_delivery_backlog set (security_invoker = true);
alter view public.v_hr_document_standing set (security_invoker = true);
alter view public.v_hr_waiting_on_a_person set (security_invoker = true);
alter view public.v_import_outliers set (security_invoker = true);
alter view public.v_inventory_aging set (security_invoker = true);
alter view public.v_inventory_locator set (security_invoker = true);
alter view public.v_inventory_reconciliation set (security_invoker = true);
alter view public.v_inventory_report set (security_invoker = true);
alter view public.v_inventory_room_proof set (security_invoker = true);
alter view public.v_inventory_valuation set (security_invoker = true);
alter view public.v_issue_aging set (security_invoker = true);
alter view public.v_issue_attribution set (security_invoker = true);
alter view public.v_issue_attribution_summary set (security_invoker = true);
alter view public.v_issue_failed_testing set (security_invoker = true);
alter view public.v_issue_late set (security_invoker = true);
alter view public.v_issue_no_allocation set (security_invoker = true);
alter view public.v_issue_real_loss set (security_invoker = true);
alter view public.v_issue_unconfirmed_manifests set (security_invoker = true);
alter view public.v_issue_yield_by_harvest set (security_invoker = true);
alter view public.v_issue_yield_gap set (security_invoker = true);
alter view public.v_item_documents set (security_invoker = true);
alter view public.v_item_flag_summary set (security_invoker = true);
alter view public.v_item_flags set (security_invoker = true);
alter view public.v_item_flags_all set (security_invoker = true);
alter view public.v_kpi_staleness set (security_invoker = true);
alter view public.v_lab_analytes set (security_invoker = true);
alter view public.v_lab_fail_rate_by_origin set (security_invoker = true);
alter view public.v_lab_results set (security_invoker = true);
alter view public.v_lab_turnaround_packages set (security_invoker = true);
alter view public.v_late_violations set (security_invoker = true);
alter view public.v_licence_directory set (security_invoker = true);
alter view public.v_location_history set (security_invoker = true);
alter view public.v_loss_analysis set (security_invoker = true);
alter view public.v_loss_ledger set (security_invoker = true);
alter view public.v_loss_ranking set (security_invoker = true);
alter view public.v_manifest_custody set (security_invoker = true);
alter view public.v_manifest_discrepancy_summary set (security_invoker = true);
alter view public.v_manifest_ledger set (security_invoker = true);
alter view public.v_manifest_line_gaps set (security_invoker = true);
alter view public.v_material_ownership_conflict set (security_invoker = true);
alter view public.v_metrc_facility_names set (security_invoker = true);
alter view public.v_metrc_harvest_yields set (security_invoker = true);
alter view public.v_metrc_package_inventory set (security_invoker = true);
alter view public.v_metrc_plant_census set (security_invoker = true);
alter view public.v_metrc_seed_to_sale set (security_invoker = true);
alter view public.v_metrc_strain_census set (security_invoker = true);
alter view public.v_metrc_transfer_ledger set (security_invoker = true);
alter view public.v_metrc_vs_os set (security_invoker = true);
alter view public.v_metric_conformance set (security_invoker = true);
alter view public.v_missing_lab_results set (security_invoker = true);
alter view public.v_moisture_accounting set (security_invoker = true);
alter view public.v_moisture_loss_progress set (security_invoker = true);
alter view public.v_moisture_summary set (security_invoker = true);
alter view public.v_money_provenance set (security_invoker = true);
alter view public.v_monthly_conversion_truth set (security_invoker = true);
alter view public.v_monthly_yield set (security_invoker = true);
alter view public.v_never_tested_proof set (security_invoker = true);
alter view public.v_never_tested_reconciliation set (security_invoker = true);
alter view public.v_overdue_harvests set (security_invoker = true);
alter view public.v_own_vs_bought set (security_invoker = true);
alter view public.v_ownership_by_custody set (security_invoker = true);
alter view public.v_ownership_evidence set (security_invoker = true);
alter view public.v_ownership_vs_certificate set (security_invoker = true);
alter view public.v_package_dossier set (security_invoker = true);
alter view public.v_package_forensic set (security_invoker = true);
alter view public.v_package_manifest set (security_invoker = true);
alter view public.v_page_design_queue set (security_invoker = true);
alter view public.v_page_drilldown_coverage set (security_invoker = true);
alter view public.v_page_filter_coverage set (security_invoker = true);
alter view public.v_page_wiring set (security_invoker = true);
alter view public.v_pipeline_timing set (security_invoker = true);
alter view public.v_plan_vs_actual_harvest set (security_invoker = true);
alter view public.v_plant_history set (security_invoker = true);
alter view public.v_position_by_ownership set (security_invoker = true);
alter view public.v_potency_vs_coa set (security_invoker = true);
alter view public.v_product_identity set (security_invoker = true);
alter view public.v_production_tracker set (security_invoker = true);
alter view public.v_production_true_position set (security_invoker = true);
alter view public.v_provisional_standards set (security_invoker = true);
alter view public.v_pull_yield set (security_invoker = true);
alter view public.v_real_loss set (security_invoker = true);
alter view public.v_real_loss_summary set (security_invoker = true);
alter view public.v_real_loss_v2 set (security_invoker = true);
alter view public.v_reconciliation_status set (security_invoker = true);
alter view public.v_reconciliation_unresolved set (security_invoker = true);
alter view public.v_remediation_owed set (security_invoker = true);
alter view public.v_report_coverage set (security_invoker = true);
alter view public.v_report_standard set (security_invoker = true);
alter view public.v_report_upload_alerts set (security_invoker = true);
alter view public.v_role_menu_matrix set (security_invoker = true);
alter view public.v_room_best_vs_worst set (security_invoker = true);
alter view public.v_room_board set (security_invoker = true);
alter view public.v_room_canopy_status set (security_invoker = true);
alter view public.v_room_contents set (security_invoker = true);
alter view public.v_room_month_comparison set (security_invoker = true);
alter view public.v_room_plant_counts set (security_invoker = true);
alter view public.v_room_turn_audit set (security_invoker = true);
alter view public.v_room_yield set (security_invoker = true);
alter view public.v_room_yield_per_sqft set (security_invoker = true);
alter view public.v_sales_history_monthly set (security_invoker = true);
alter view public.v_schedule_discipline set (security_invoker = true);
alter view public.v_schedule_scorecard set (security_invoker = true);
alter view public.v_seed_to_sale_chain set (security_invoker = true);
alter view public.v_sheet_metrc_alerts set (security_invoker = true);
alter view public.v_sheet_metrc_reconciliation set (security_invoker = true);
alter view public.v_source_conflicts set (security_invoker = true);
alter view public.v_stock_summary set (security_invoker = true);
alter view public.v_storage_limit_status set (security_invoker = true);
alter view public.v_strain_performance set (security_invoker = true);
alter view public.v_supply_demand set (security_invoker = true);
alter view public.v_sync_digest set (security_invoker = true);
alter view public.v_sync_item set (security_invoker = true);
alter view public.v_sync_report set (security_invoker = true);
alter view public.v_tag_lifecycle set (security_invoker = true);
alter view public.v_third_party_chain set (security_invoker = true);
alter view public.v_third_party_cycle_time set (security_invoker = true);
alter view public.v_third_party_lifecycle set (security_invoker = true);
alter view public.v_third_party_stock set (security_invoker = true);
alter view public.v_tower_inventory set (security_invoker = true);
alter view public.v_tower_inventory_grouped set (security_invoker = true);
alter view public.v_truncate_exposure set (security_invoker = true);
alter view public.v_unrequested_material set (security_invoker = true);
alter view public.v_weekend_watch set (security_invoker = true);
alter view public.v_weight_audit set (security_invoker = true);
alter view public.v_wholesale_reconciliation set (security_invoker = true);
alter view public.v_year_end_2025 set (security_invoker = true);
alter view public.v_year_end_2025_summary set (security_invoker = true);
alter view public.v_yield_by_harvest set (security_invoker = true);
alter view public.v_yield_versus_industry set (security_invoker = true);
alter view public.v_yield_vs_target set (security_invoker = true);

/* Ungated by DESIGN — 'sealed' is the strongest intent this registry defines:
 * owner-mode with NO grants to any login role. The alert-email cron must resolve
 * recipients when no caller identity exists; flipping this view would break the
 * pipeline, granting it would leak recipient emails. The probe confirmed
 * authenticated gets permission denied. Declared during the 184-view closure. */
insert into public.rls_intent (table_name, intent, reason, declared_on)
values ('v_alert_email_recipients_internal', 'sealed',
        'Owner-mode with no grants to login roles, by design (18 Aug 2026): the alert-email cron '
        || 'resolves recipients with no caller identity. security_invoker would break the pipeline; '
        || 'a grant would leak recipient emails. Probe confirmed authenticated is denied. Agent I.',
        current_date)
on conflict do nothing;;
