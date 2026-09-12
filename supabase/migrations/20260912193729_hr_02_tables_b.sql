-- GROK-WHY: Already applied in production as 20260912193729 hr_02_tables_b.
-- Another desk ran this. Filed here so migration-drift can pass and the Bots paid key can ship on Sync.
-- Exact SQL from supabase_migrations.schema_migrations.statements. No ledger rewrite. Metrc read-only.

-- TG HR platform, part 02: tables 46–120 of 251 (schema only, from vip-hr-platform's catalog).
set local search_path to hr, public, extensions;
create table hr.chat_reactions (
  id uuid default gen_random_uuid() not null,
  message_id uuid not null,
  person_id uuid,
  person_name text,
  emoji text not null,
  created_at timestamp with time zone default now() not null,
  constraint chat_reactions_pkey PRIMARY KEY (id)
);
create table hr.chat_read_state (
  person_id uuid not null,
  channel_key text not null,
  last_read_at timestamp with time zone default now() not null,
  constraint chat_read_state_pkey PRIMARY KEY (person_id, channel_key)
);
create table hr.cleaning_issues (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  log_date date default CURRENT_DATE not null,
  area text,
  item text,
  note text,
  reported_by text,
  reported_by_id uuid,
  status text default 'Open'::text not null,
  resolved_at timestamp with time zone,
  resolved_by text,
  created_at timestamp with time zone default now() not null,
  constraint cleaning_issues_pkey PRIMARY KEY (id)
);
create table hr.cleaning_logs (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid not null,
  log_date date not null,
  shift text not null,
  area_id text not null,
  item_id text not null,
  checked boolean default false not null,
  note text,
  photo text,
  completed_at timestamp with time zone,
  completed_by text,
  completed_by_id uuid,
  updated_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  constraint cleaning_logs_node_id_log_date_shift_area_id_item_id_key UNIQUE (node_id, log_date, shift, area_id, item_id),
  constraint cleaning_logs_pkey PRIMARY KEY (id)
);
create table hr.cleaning_signoffs (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid not null,
  log_date date not null,
  shift text not null,
  manager_name text,
  manager_id uuid,
  signed_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  constraint cleaning_signoffs_node_id_log_date_shift_key UNIQUE (node_id, log_date, shift),
  constraint cleaning_signoffs_pkey PRIMARY KEY (id)
);
create table hr.close_times (
  id uuid default gen_random_uuid() not null,
  node_id uuid not null,
  day_of_week integer not null,
  close_time time without time zone not null,
  constraint close_times_node_id_day_of_week_key UNIQUE (node_id, day_of_week),
  constraint close_times_pkey PRIMARY KEY (id),
  constraint close_times_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);
create table hr.coaching_log (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  person_id uuid,
  employee_name text,
  location_name text,
  coaching_type text default 'verbal'::text not null,
  occurred_on date default CURRENT_DATE not null,
  occurred_time text,
  description text not null,
  discussed text,
  employee_response text,
  follow_up_required boolean default false not null,
  follow_up_date date,
  witnessed_by text,
  managed_by text,
  managed_by_id uuid,
  status text default 'open'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint coaching_log_pkey PRIMARY KEY (id)
);
create table hr.comments (
  id uuid default gen_random_uuid() not null,
  entity_type text not null,
  entity_id uuid not null,
  author_id uuid not null,
  body text not null,
  mentions uuid[] default '{}'::uuid[],
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint comments_pkey PRIMARY KEY (id),
  constraint comments_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)))
);
create table hr.company_branding (
  id uuid default gen_random_uuid() not null,
  node_id uuid not null,
  tenant_id uuid not null,
  company_display_name text,
  tagline text,
  logo_url text,
  logo_dark_url text,
  favicon_url text,
  theme text default 'aurora'::text not null,
  mode text default 'dark'::text not null,
  custom_tokens jsonb default '{}'::jsonb not null,
  font_sans text,
  font_mono text,
  brand_primary text,
  brand_secondary text,
  brand_accent text,
  login_bg_url text,
  login_headline text,
  login_subhead text,
  support_email text,
  support_phone text,
  legal_name text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint company_branding_node_id_key UNIQUE (node_id),
  constraint company_branding_pkey PRIMARY KEY (id)
);
create table hr.competencies (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  key text not null,
  label text not null,
  description text,
  sort_order integer default 0,
  constraint competencies_key_key UNIQUE (key),
  constraint competencies_pkey PRIMARY KEY (id)
);
create table hr.competency_status (
  id uuid default gen_random_uuid() not null,
  person_id uuid not null,
  competency_key text not null,
  node_id uuid,
  status text default 'not_trained'::text not null,
  trained_at date,
  trainer_id uuid,
  notes text,
  updated_at timestamp with time zone default now(),
  constraint competency_status_person_id_competency_key_key UNIQUE (person_id, competency_key),
  constraint competency_status_pkey PRIMARY KEY (id),
  constraint competency_status_status_check CHECK ((status = ANY (ARRAY['not_trained'::text, 'in_training'::text, 'trained'::text])))
);
create table hr.compliance_checklist (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  item_key text not null,
  checked boolean default false not null,
  note text,
  reviewed_by uuid,
  last_reviewed_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  constraint compliance_checklist_tenant_id_node_id_item_key_key UNIQUE (tenant_id, node_id, item_key),
  constraint compliance_checklist_pkey PRIMARY KEY (id)
);
create table hr.compliance_deadlines (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  requirement text not null,
  due_date date,
  status text default 'Pending'::text not null,
  responsible text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint compliance_deadlines_pkey PRIMARY KEY (id)
);
create table hr.compliance_rules (
  id uuid default gen_random_uuid() not null,
  state_code text not null,
  domain text not null,
  rule_key text not null,
  rule_value jsonb not null,
  applies_business_types jsonb default '["all"]'::jsonb,
  citation text,
  effective_from date default CURRENT_DATE,
  constraint compliance_rules_state_code_domain_rule_key_applies_busines_key UNIQUE (state_code, domain, rule_key, applies_business_types),
  constraint compliance_rules_pkey PRIMARY KEY (id),
  constraint compliance_rules_domain_check CHECK ((domain = ANY (ARRAY['labor'::text, 'tax'::text, 'commerce'::text, 'scheduling'::text])))
);
create table hr.compliment_reactions (
  id uuid default gen_random_uuid() not null,
  compliment_id uuid not null,
  person_id uuid not null,
  kind text not null,
  created_at timestamp with time zone default now() not null,
  constraint compliment_reactions_pkey PRIMARY KEY (id)
);
create table hr.compliment_restrictions (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  person_id uuid not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint compliment_restrictions_pkey PRIMARY KEY (id)
);
create table hr.compliment_settings (
  tenant_id uuid not null,
  system_enabled boolean default true not null,
  associates_can_submit boolean default true not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  constraint compliment_settings_pkey PRIMARY KEY (tenant_id)
);
create table hr.compliments (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  from_person_id uuid,
  from_node_id uuid,
  to_person_id uuid,
  to_node_id uuid,
  category text default 'Teamwork'::text not null,
  message text not null,
  customer_quote text,
  is_customer_sourced boolean default false not null,
  visibility text default 'public'::text not null,
  status text default 'pending'::text not null,
  points integer default 10 not null,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint compliments_pkey PRIMARY KEY (id)
);
create table hr.coverage_rules (
  id uuid default gen_random_uuid() not null,
  node_id uuid not null,
  rule_type text not null,
  value integer default 2 not null,
  applies_to text default 'all'::text,
  effective_from date default CURRENT_DATE,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  constraint coverage_rules_node_id_rule_type_applies_to_key UNIQUE (node_id, rule_type, applies_to),
  constraint coverage_rules_pkey PRIMARY KEY (id)
);
create table hr.cultivation_customers (
  id uuid default gen_random_uuid() not null,
  node_id uuid,
  name text,
  email text,
  phone text,
  tier integer default 1,
  notes text,
  created_at timestamp with time zone default now(),
  assigned_to uuid,
  preferences jsonb default '[]'::jsonb not null,
  visit_freq text default 'occasional'::text not null,
  birthday_month integer,
  next_followup_date date,
  created_by uuid,
  updated_at timestamp with time zone default now() not null,
  is_active boolean default true not null,
  constraint cultivation_customers_pkey PRIMARY KEY (id)
);
create table hr.cultivation_visits (
  id uuid default gen_random_uuid() not null,
  customer_id uuid not null,
  node_id uuid,
  logged_by uuid,
  visited_at date default CURRENT_DATE not null,
  tier integer,
  note text,
  created_at timestamp with time zone default now() not null,
  constraint cultivation_visits_pkey PRIMARY KEY (id)
);
create table hr.custom_field_values (
  id uuid default gen_random_uuid() not null,
  field_id uuid not null,
  entity_id uuid not null,
  entity_type text not null,
  value_text text,
  value_number numeric,
  value_bool boolean,
  value_date date,
  value_json jsonb,
  created_by uuid,
  updated_at timestamp with time zone default now() not null,
  constraint custom_field_values_field_id_entity_id_key UNIQUE (field_id, entity_id),
  constraint custom_field_values_pkey PRIMARY KEY (id)
);
create table hr.custom_fields (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  entity_type text not null,
  field_key text not null,
  field_label text not null,
  field_type text not null,
  options jsonb,
  required boolean default false not null,
  visible_to jsonb default '["all"]'::jsonb not null,
  editable_by jsonb default '["admin"]'::jsonb not null,
  display_order integer default 100 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  constraint custom_fields_tenant_id_entity_type_field_key_key UNIQUE (tenant_id, entity_type, field_key),
  constraint custom_fields_pkey PRIMARY KEY (id)
);
create table hr.dd_change_requests (
  id uuid default gen_random_uuid() not null,
  person_id uuid not null,
  node_id uuid not null,
  bank_name text,
  routing_number_last4 text,
  account_last4 text,
  account_type text default 'checking'::text,
  status text default 'pending'::text not null,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_note text,
  submitted_at timestamp with time zone default now() not null,
  routing_last4 text,
  effective_date date,
  constraint dd_change_requests_pkey PRIMARY KEY (id)
);
create table hr.department_heads (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  entity_id uuid,
  node_id uuid not null,
  head_person uuid not null,
  head_role text default 'head'::text not null,
  effective_from date default CURRENT_DATE not null,
  effective_to date,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint department_heads_pkey PRIMARY KEY (id),
  constraint department_heads_head_role_check CHECK ((head_role = ANY (ARRAY['head'::text, 'assistant'::text, 'acting'::text])))
);
create table hr.direct_messages (
  id uuid default gen_random_uuid() not null,
  from_id uuid not null,
  to_id uuid not null,
  body text not null,
  read_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  archived_at timestamp with time zone,
  constraint direct_messages_pkey PRIMARY KEY (id),
  constraint direct_messages_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)))
);
create table hr.disciplinary_records (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  person_id uuid not null,
  issued_by uuid,
  type text not null,
  date date default CURRENT_DATE not null,
  description text not null,
  policy_cited text,
  witness text,
  status text default 'active'::text not null,
  file_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint disciplinary_records_pkey PRIMARY KEY (id),
  constraint disciplinary_records_status_check CHECK ((status = ANY (ARRAY['active'::text, 'appealed'::text, 'overturned'::text, 'expired'::text]))),
  constraint disciplinary_records_type_check CHECK ((type = ANY (ARRAY['verbal'::text, 'written'::text, 'final'::text, 'suspension'::text, 'termination'::text])))
);
create table hr.dm_conversation_state (
  person_id uuid not null,
  other_id uuid not null,
  starred boolean default false not null,
  archived boolean default false not null,
  updated_at timestamp with time zone default now() not null,
  constraint dm_conversation_state_pkey PRIMARY KEY (person_id, other_id)
);
create table hr.doc_templates (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  template_type text not null,
  name text not null,
  description text,
  schema jsonb default '[]'::jsonb not null,
  body text,
  requires_signature boolean default false not null,
  is_active boolean default true not null,
  version integer default 1 not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint doc_templates_pkey PRIMARY KEY (id)
);
create table hr.document_acknowledgments (
  id uuid default gen_random_uuid() not null,
  document_id uuid not null,
  person_id uuid not null,
  acked_at timestamp with time zone default now(),
  constraint document_acknowledgments_document_id_person_id_key UNIQUE (document_id, person_id),
  constraint document_acknowledgments_pkey PRIMARY KEY (id)
);
create table hr.document_distribution_recipients (
  id uuid default gen_random_uuid() not null,
  distribution_id uuid not null,
  person_id uuid,
  person_name text,
  signed boolean default false not null,
  signed_at timestamp with time zone,
  last_reminded_at timestamp with time zone,
  constraint document_distribution_recipients_pkey PRIMARY KEY (id)
);
create table hr.document_distributions (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  doc_id uuid,
  doc_name text,
  sent_by_id uuid,
  sent_by_name text,
  sent_to_label text,
  require_sig boolean default false not null,
  due_date date,
  message text,
  sent_at timestamp with time zone default now() not null,
  constraint document_distributions_pkey PRIMARY KEY (id)
);
create table hr.document_events (
  id uuid default gen_random_uuid() not null,
  document_id uuid not null,
  document_version integer default 1 not null,
  tenant_id uuid not null,
  entity_id uuid,
  person_id uuid not null,
  status hr.doc_event_status default 'assigned'::hr.doc_event_status not null,
  assigned_at timestamp with time zone default now() not null,
  delivered_at timestamp with time zone,
  opened_at timestamp with time zone,
  read_at timestamp with time zone,
  acknowledged_at timestamp with time zone,
  signed_at timestamp with time zone,
  sig_version integer,
  sig_ip text,
  sig_method text,
  reacted_at timestamp with time zone,
  expired_at timestamp with time zone,
  due_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  constraint document_events_document_id_document_version_person_id_key UNIQUE (document_id, document_version, person_id),
  constraint document_events_pkey PRIMARY KEY (id)
);
create table hr.document_targets (
  id uuid default gen_random_uuid() not null,
  document_id uuid not null,
  tenant_id uuid not null,
  entity_id uuid,
  target_type hr.doc_target_type not null,
  target_value text,
  created_at timestamp with time zone default now() not null,
  constraint document_targets_pkey PRIMARY KEY (id)
);
create table hr.document_versions (
  id uuid default gen_random_uuid() not null,
  document_id uuid not null,
  tenant_id uuid not null,
  version integer not null,
  title text,
  body text,
  content_ref text,
  meta jsonb default '{}'::jsonb not null,
  diff jsonb,
  change_note text,
  changed_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint document_versions_document_id_version_key UNIQUE (document_id, version),
  constraint document_versions_pkey PRIMARY KEY (id)
);
create table hr.documents (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  person_id uuid,
  name text not null,
  type text not null,
  version text default 1 not null,
  content text,
  file_url text,
  requires_ack boolean default false not null,
  created_by uuid,
  status text default 'draft'::text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by_id uuid,
  category text,
  location text,
  constraint documents_pkey PRIMARY KEY (id),
  constraint documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'superseded'::text, 'archived'::text]))),
  constraint documents_type_check CHECK ((type = ANY (ARRAY['policy'::text, 'handbook'::text, 'offer'::text, 'agreement'::text, 'cert'::text, 'form'::text, 'verification'::text, 'custom'::text])))
);
create table hr.drill_completions (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  person_id uuid not null,
  node_id uuid,
  drill_id uuid not null,
  iso_week integer not null,
  iso_year integer not null,
  score_pct integer default 0 not null,
  time_sec integer default 0 not null,
  points_earned integer default 0 not null,
  completed_at timestamp with time zone default now() not null,
  constraint drill_completions_person_id_drill_id_iso_year_iso_week_key UNIQUE (person_id, drill_id, iso_year, iso_week),
  constraint drill_completions_pkey PRIMARY KEY (id)
);
create table hr.drill_definitions (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  slug text,
  title text not null,
  category text default 'Sales'::text not null,
  minutes integer default 5 not null,
  points integer default 50 not null,
  week_order integer,
  assign_to text default 'all'::text not null,
  questions jsonb default '[]'::jsonb not null,
  active boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint drill_definitions_slug_key UNIQUE (slug),
  constraint drill_definitions_pkey PRIMARY KEY (id)
);
create table hr.emergency_contacts (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  person_id uuid not null,
  contact_name text not null,
  relationship text,
  phone_primary text not null,
  phone_alternate text,
  address text,
  priority text default '1st Contact'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint emergency_contacts_pkey PRIMARY KEY (id)
);
create table hr.employee_certifications (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  person_id uuid,
  node_id uuid,
  cert_name text not null,
  issued_date date,
  expiry_date date,
  status text default 'active'::text not null,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint employee_certifications_pkey PRIMARY KEY (id)
);
create table hr.employee_documents (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  person_id uuid not null,
  doc_type text not null,
  title text,
  file_url text,
  uploaded_by_id uuid,
  uploaded_by_name text,
  uploaded_at timestamp with time zone default now() not null,
  last_accessed_at timestamp with time zone,
  last_accessed_by text,
  constraint employee_documents_pkey PRIMARY KEY (id)
);
create table hr.employee_suspensions (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  person_id uuid,
  susp_type text default 'unpaid'::text not null,
  start_date date default CURRENT_DATE not null,
  duration_days integer default 1 not null,
  end_date date,
  reason text,
  related_da text,
  witnessed_by text,
  issued_by uuid,
  manager_notes text,
  status text default 'active'::text not null,
  returned_at date,
  returned_on_time boolean,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint employee_suspensions_pkey PRIMARY KEY (id)
);
create table hr.entity_break_policy (
  node_id uuid not null,
  tenant_id uuid,
  jurisdiction text,
  mode text default 'auto_legal'::text not null,
  meal_default_min integer default 30 not null,
  rest_default_min integer default 15 not null,
  custom_rules jsonb default '[]'::jsonb not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  constraint entity_break_policy_pkey PRIMARY KEY (node_id),
  constraint entity_break_policy_mode_check CHECK ((mode = ANY (ARRAY['auto_legal'::text, 'manual'::text, 'off'::text])))
);
create table hr.entity_modules (
  id uuid default gen_random_uuid() not null,
  node_id uuid not null,
  tenant_id uuid,
  module_key text not null,
  enabled boolean default true not null,
  config jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint entity_modules_node_id_module_key_key UNIQUE (node_id, module_key),
  constraint entity_modules_pkey PRIMARY KEY (id)
);
create table hr.entity_profiles (
  node_id uuid not null,
  tenant_id uuid,
  entity_type_key text not null,
  legal_name text,
  ein text,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint entity_profiles_pkey PRIMARY KEY (node_id)
);
create table hr.entity_types (
  key text not null,
  label text not null,
  description text,
  default_modules text[] default '{}'::text[] not null,
  operating_model text not null,
  sort_order integer default 0 not null,
  constraint entity_types_pkey PRIMARY KEY (key)
);
create table hr.escalations (
  id uuid default gen_random_uuid() not null,
  shift_id uuid not null,
  exception_id uuid,
  step integer default 1 not null,
  notified_person uuid,
  message_body text,
  sent_at timestamp with time zone default now(),
  resolved_at timestamp with time zone,
  resolved_by uuid,
  constraint escalations_pkey PRIMARY KEY (id)
);
create table hr.feature_flags (
  id uuid default gen_random_uuid() not null,
  node_id uuid,
  tenant_id uuid,
  feature text not null,
  enabled boolean default true not null,
  config jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint feature_flags_node_id_feature_key UNIQUE (node_id, feature),
  constraint feature_flags_pkey PRIMARY KEY (id)
);
create table hr.feature_grants (
  id uuid default gen_random_uuid() not null,
  feature text not null,
  person_id uuid not null,
  granted_by uuid,
  granted_at timestamp with time zone default now() not null,
  constraint feature_grants_feature_person_id_key UNIQUE (feature, person_id),
  constraint feature_grants_pkey PRIMARY KEY (id)
);
create table hr.financial_facts (
  id uuid default gen_random_uuid() not null,
  node_id uuid not null,
  tenant_id uuid,
  fact_date date not null,
  category text not null,
  subcategory text,
  amount numeric(14,2) not null,
  source_module text,
  ref_id uuid,
  meta jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint financial_facts_pkey PRIMARY KEY (id)
);
create table hr.gamification_badge_awards (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  person_id uuid not null,
  badge_code text not null,
  node_id uuid,
  awarded_by uuid,
  awarded_at timestamp with time zone default now() not null,
  constraint gamification_badge_awards_person_id_badge_code_key UNIQUE (person_id, badge_code),
  constraint gamification_badge_awards_pkey PRIMARY KEY (id)
);
create table hr.gamification_badges (
  code text not null,
  icon text default '⭐'::text,
  name text not null,
  rarity text default 'Common'::text not null,
  description text default ''::text,
  how_to text default ''::text,
  sort_order integer default 0 not null,
  constraint gamification_badges_pkey PRIMARY KEY (code)
);
create table hr.gamification_points_ledger (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  person_id uuid not null,
  points numeric default 0 not null,
  reason text,
  category text default 'Bonus'::text not null,
  awarded_by uuid,
  awarded_by_name text,
  created_at timestamp with time zone default now() not null,
  constraint gamification_points_ledger_pkey PRIMARY KEY (id)
);
create table hr.gamification_reward_redemptions (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  person_id uuid not null,
  reward_id uuid,
  reward_name text not null,
  cost numeric default 0 not null,
  status text default 'Pending'::text not null,
  requested_at timestamp with time zone default now() not null,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  constraint gamification_reward_redemptions_pkey PRIMARY KEY (id)
);
create table hr.gamification_rewards (
  id uuid default gen_random_uuid() not null,
  icon text default '🎁'::text,
  name text not null,
  description text default ''::text,
  cost numeric default 0 not null,
  category text default 'Experience'::text not null,
  availability text default 'in-stock'::text not null,
  is_active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint gamification_rewards_pkey PRIMARY KEY (id)
);
create table hr.gamification_rules (
  id uuid default gen_random_uuid() not null,
  action text not null,
  category text default 'General'::text not null,
  points numeric default 0 not null,
  is_active boolean default true not null,
  sort_order integer default 0 not null,
  constraint gamification_rules_action_key UNIQUE (action),
  constraint gamification_rules_pkey PRIMARY KEY (id)
);
create table hr.gamification_settings (
  id boolean default true not null,
  monthly_budget_points integer default 50000 not null,
  constraint gamification_settings_pkey PRIMARY KEY (id),
  constraint gamification_settings_id_check CHECK (id)
);
create table hr.gross_profit (
  id uuid default gen_random_uuid() not null,
  node_id uuid not null,
  stream text not null,
  period_start date not null,
  period_end date not null,
  revenue numeric default 0,
  cost_grow numeric default 0,
  cost_labor numeric default 0,
  cost_vendor numeric default 0,
  gross_profit numeric generated always as ((((revenue - cost_grow) - cost_labor) - cost_vendor)) stored,
  margin_pct numeric generated always as (CASE WHEN (revenue > (0)::numeric) THEN round((((((revenue - cost_grow) - cost_labor) - cost_vendor) / revenue) * (100)::numeric), 2) ELSE (0)::numeric END) stored,
  created_by uuid,
  created_at timestamp with time zone default now(),
  constraint gross_profit_node_id_stream_period_start_period_end_key UNIQUE (node_id, stream, period_start, period_end),
  constraint gross_profit_pkey PRIMARY KEY (id),
  constraint gross_profit_stream_check CHECK ((stream = ANY (ARRAY['ours'::text, 'purchased'::text])))
);
create table hr.handbook_documents (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  slug text default 'default'::text not null,
  design jsonb default '{}'::jsonb not null,
  content jsonb default '[]'::jsonb not null,
  access_matrix jsonb default '{}'::jsonb not null,
  version text default '1.0'::text not null,
  effective_date date,
  notes text,
  audience jsonb default '{}'::jsonb not null,
  require_sig boolean default true not null,
  sig_deadline date,
  status text default 'draft'::text not null,
  published_at timestamp with time zone,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint handbook_documents_slug_key UNIQUE (slug),
  constraint handbook_documents_pkey PRIMARY KEY (id)
);
create table hr.handbook_law_alert_status (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  alert_key text not null,
  status text default 'unreviewed'::text not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  constraint handbook_law_alert_status_alert_key_key UNIQUE (alert_key),
  constraint handbook_law_alert_status_pkey PRIMARY KEY (id)
);
create table hr.handbook_read_progress (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  person_id uuid not null,
  policy_key text not null,
  read_at timestamp with time zone default now() not null,
  constraint handbook_read_progress_person_id_policy_key_key UNIQUE (person_id, policy_key),
  constraint handbook_read_progress_pkey PRIMARY KEY (id)
);
create table hr.handbook_signatures (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  person_id uuid not null,
  person_name text,
  version text,
  acknowledgment text,
  signed_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  constraint handbook_signatures_person_id_version_key UNIQUE (person_id, version),
  constraint handbook_signatures_pkey PRIMARY KEY (id)
);
create table hr.handoff_notes (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  shift_date date not null,
  outgoing_person uuid,
  incoming_person uuid,
  note text not null,
  ai_summary text,
  flagged boolean default false,
  created_at timestamp with time zone default now(),
  constraint handoff_notes_pkey PRIMARY KEY (id)
);
create table hr.helpdesk_tickets (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  subject text not null,
  category text default 'Other'::text not null,
  priority text default 'normal'::text not null,
  status text default 'new'::text not null,
  description text,
  requester_id uuid,
  requester_name text,
  assignee_id uuid,
  assignee_name text,
  resolved_at timestamp with time zone,
  resolved_by_id uuid,
  resolved_by_name text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint helpdesk_tickets_pkey PRIMARY KEY (id)
);
create table hr.hr_data_flows (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  integration_id uuid,
  source text not null,
  dest text not null,
  data_type text default ''::text not null,
  freq text default ''::text not null,
  enabled boolean default true not null,
  last_success_at timestamp with time zone,
  error_rate numeric default 0 not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint hr_data_flows_pkey PRIMARY KEY (id)
);
create table hr.hr_document_distributions (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  document_id uuid not null,
  document_title text,
  person_id uuid not null,
  person_name text,
  node_id uuid,
  location_name text,
  role_name text,
  sig_required boolean default false not null,
  sent_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint hr_document_distributions_document_id_person_id_key UNIQUE (document_id, person_id),
  constraint hr_document_distributions_pkey PRIMARY KEY (id)
);
create table hr.hr_documents (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  title text not null,
  category text default 'Policies'::text not null,
  version text default 'v1.0'::text not null,
  access_level text default 'All Employees'::text not null,
  required boolean default false not null,
  description text,
  effective_date date,
  file_url text,
  author text,
  created_by uuid,
  archived boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint hr_documents_pkey PRIMARY KEY (id)
);
create table hr.hr_exit_interviews (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  separation_id uuid,
  node_id uuid,
  person_id uuid,
  employee_name text not null,
  exit_date date,
  status text default 'SCHEDULED'::text not null,
  interviewed_by text,
  interviewer_id uuid,
  would_rehire boolean,
  primary_reason text,
  overall_experience integer,
  management_rating integer,
  recommend_employer text,
  what_could_do_better text,
  suggestions text,
  confidential_notes text,
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint hr_exit_interviews_pkey PRIMARY KEY (id)
);
create table hr.hr_form_submissions (
  id uuid default gen_random_uuid() not null,
  form_type text not null,
  person_id uuid,
  node_id uuid,
  form_month integer,
  form_year integer,
  form_data jsonb default '{}'::jsonb not null,
  status text default 'draft'::text not null,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint hr_form_submissions_pkey PRIMARY KEY (id),
  constraint hr_form_submissions_form_month_check CHECK (((form_month >= 1) AND (form_month <= 12)))
);
create table hr.hr_forms (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  person_id uuid,
  form_type text,
  status text,
  created_at timestamp with time zone default now() not null,
  constraint hr_forms_pkey PRIMARY KEY (id)
);
create table hr.hr_goal_nudges (
  id uuid default gen_random_uuid() not null,
  person_id uuid not null,
  from_id uuid,
  message text,
  created_at timestamp with time zone default now() not null,
  constraint hr_goal_nudges_pkey PRIMARY KEY (id)
);
create table hr.hr_goals (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  person_id uuid not null,
  node_id uuid,
  category text default 'Personal'::text not null,
  title text not null,
  description text,
  target_value numeric default 0 not null,
  current_value numeric default 0 not null,
  unit text default 'count'::text not null,
  priority text default 'Medium'::text not null,
  stretch boolean default false not null,
  start_date date,
  due_date date,
  status text default 'on-track'::text not null,
  set_by text,
  notes text,
  milestones jsonb default '[]'::jsonb not null,
  contest_link text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint hr_goals_pkey PRIMARY KEY (id)
);
create table hr.hr_greeting_batches (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  generated_at timestamp with time zone default now() not null,
  proposed_count integer default 0 not null,
  generated_by uuid,
  constraint hr_greeting_batches_pkey PRIMARY KEY (id)
);
create table hr.hr_greetings (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  text text not null,
  status text default 'pending'::text not null,
  source text default 'ai'::text not null,
  proposed_at timestamp with time zone default now() not null,
  decided_at timestamp with time zone,
  decided_by_id uuid,
  decided_by_name text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint hr_greetings_pkey PRIMARY KEY (id)
);
create table hr.hr_import_jobs (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  template_key text not null,
  file_name text default ''::text not null,
  attempted integer default 0 not null,
  imported integer default 0 not null,
  failed integer default 0 not null,
  status text default 'success'::text not null,
  errors jsonb default '[]'::jsonb not null,
  imported_by text default ''::text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint hr_import_jobs_pkey PRIMARY KEY (id)
);
