-- BP-12g · the clone's "CT Law Reference" tab printed Connecticut statutes (minimum wage
-- history, CT FMLA, a Hartford ordinance) on a Massachusetts company's platform. Statutory
-- reference is ROWS: hr.compliance_rules (state_code, domain, rule_key, rule_value, citation,
-- effective_from) for the company's own state (hr.org_nodes.state_code = MA). Nothing is typed
-- into the screen and no law text is invented here — HR / counsel enter the rows.
set search_path = hr, public, extensions;

create or replace function hr.compliance_reference()
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  with st as (select coalesce((select state_code from hr.org_nodes where node_type = 'company' and tenant_id = hr.tg_tenant_id() limit 1),
                              (select state_code from hr.org_nodes where node_type = 'location' and tenant_id = hr.tg_tenant_id() limit 1), 'MA') code)
  select jsonb_build_object(
    'state_code', (select code from st),
    'company', (select name from hr.org_nodes where node_type = 'company' and tenant_id = hr.tg_tenant_id() limit 1),
    'rules', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'domain', r.domain, 'rule_key', r.rule_key, 'rule_value', r.rule_value,
                          'citation', r.citation, 'effective_from', r.effective_from, 'applies_business_types', r.applies_business_types) order by r.domain, r.rule_key)
                       from hr.compliance_rules r, st where r.state_code = st.code), '[]'::jsonb));
$$;
revoke all on function hr.compliance_reference() from public, anon;
grant execute on function hr.compliance_reference() to authenticated;
notify pgrst, 'reload schema';;
