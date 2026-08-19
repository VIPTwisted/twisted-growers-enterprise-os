/* The mapping is configuration, not an application write surface. Supabase's
 * default privileges were broader than the RLS policy; make least privilege
 * explicit so safety does not depend on one layer. */
revoke all on table public.business_rule_surface from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.business_rule_surface from authenticated;
grant select on table public.business_rule_surface to authenticated;
grant select on table public.business_rule_surface to tg_desktop_reader;

revoke all on table public.v_moisture_business_rules from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.v_moisture_business_rules from authenticated;
grant select on table public.v_moisture_business_rules to authenticated;
grant select on table public.v_moisture_business_rules to tg_desktop_reader;

comment on table public.business_rule_surface is
  'Read-only configuration registry for application users. Service-role/database governance changes membership; authenticated users may read the page-to-rule mapping only.';
