/* THE LAST TWELVE FLIPPABLE VIEWS STOP BYPASSING ROW SECURITY.
 *
 * Every one re-probed MEASURED_SAFE after the access repairs
 * (ops_reference_read_policies_and_apex_raw_grant): identical rowcounts
 * owner-mode vs signed-in user. The two document views and v_ownership_verdict
 * were verified at a tiny cap (50) because their full scans exceed the probe
 * budget — v_ownership_verdict's full-page cost remains a task #34 item
 * (per-row policy evaluation), which is about speed now, not rows. */

alter view public.v_assertion_coverage set (security_invoker = true);
alter view public.v_examination_readiness set (security_invoker = true);
alter view public.v_glossary_conflicts set (security_invoker = true);
alter view public.v_house_rules set (security_invoker = true);
alter view public.v_apex_field_coverage set (security_invoker = true);
alter view public.v_apex_metrc_coverage set (security_invoker = true);
alter view public.v_apex_order_metrc_link set (security_invoker = true);
alter view public.v_manifest_discrepancy_audit set (security_invoker = true);
alter view public.v_material_requirement set (security_invoker = true);
alter view public.v_document_library set (security_invoker = true);
alter view public.v_package_documents set (security_invoker = true);
alter view public.v_ownership_verdict set (security_invoker = true);;
