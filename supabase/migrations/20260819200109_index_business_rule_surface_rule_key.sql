-- Cover the rule-surface foreign key used by configuration joins and deletes.
create index if not exists business_rule_surface_rule_key_idx
  on public.business_rule_surface (rule_key);
