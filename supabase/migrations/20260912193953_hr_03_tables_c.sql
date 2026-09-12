-- GROK-WHY: Already applied in production as 20260912193953 hr_03_tables_c.
-- Another desk ran this. Filed here so migration-drift can pass and the Bots paid key can ship on Sync.
-- Exact SQL from supabase_migrations.schema_migrations.statements. No ledger rewrite. Metrc read-only.

-- TG HR platform, part 03: tables 121–190 of 251 (schema only, from vip-hr-platform's catalog).
set local search_path to hr, public, extensions;
create table hr.hr_integration_logs (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  integration_id uuid,
  event_type text default 'sync'::text not null,
  records integer default 0 not null,
  duration_ms integer default 0 not null,
  status text default 'ok'::text not null,
  detail text default ''::text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint hr_integration_logs_pkey PRIMARY KEY (id)
);
create table hr.hr_integrations (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  provider_key text not null,
  name text not null,
  category text default ''::text not null,
  color text default '#333'::text not null,
  icon text default ''::text not null,
  description text default ''::text not null,
  sync_freq text default ''::text not null,
  direction text default 'inbound'::text not null,
  status text default 'disconnected'::text not null,
  config jsonb default '{}'::jsonb not null,
  last_sync_at timestamp with time zone,
  records_count integer default 0 not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint hr_integrations_pkey PRIMARY KEY (id)
);
create table hr.hr_learning_path_progress (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  path_id uuid not null,
  step_id uuid not null,
  person_id uuid not null,
  person_name text default ''::text not null,
  done boolean default true not null,
  completed_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  constraint hr_learning_path_progress_step_id_person_id_key UNIQUE (step_id, person_id),
  constraint hr_learning_path_progress_pkey PRIMARY KEY (id)
);
create table hr.hr_learning_path_steps (
  id uuid default gen_random_uuid() not null,
  path_id uuid not null,
  "position" integer default 0 not null,
  title text not null,
  kind text default 'course'::text not null,
  mins integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint hr_learning_path_steps_pkey PRIMARY KEY (id)
);
create table hr.hr_learning_paths (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  name text not null,
  description text default ''::text not null,
  role text default ''::text not null,
  color text default 'var(--t-accent)'::text not null,
  "position" integer default 0 not null,
  active boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint hr_learning_paths_pkey PRIMARY KEY (id)
);
create table hr.hr_location_benchmarks (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid not null,
  metric_key text not null,
  metric_value numeric,
  period text default ''::text not null,
  note text,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint hr_location_benchmarks_node_id_metric_key_period_key UNIQUE (node_id, metric_key, period),
  constraint hr_location_benchmarks_pkey PRIMARY KEY (id)
);
create table hr.hr_location_profiles (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid not null,
  address text default ''::text not null,
  phone text default ''::text not null,
  hours text default ''::text not null,
  status text default 'Active'::text not null,
  max_headcount integer,
  min_staffing integer,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint hr_location_profiles_node_id_key UNIQUE (node_id),
  constraint hr_location_profiles_pkey PRIMARY KEY (id)
);
create table hr.hr_nav_config (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  item_path text not null,
  visible boolean default true not null,
  custom_label text default ''::text not null,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint hr_nav_config_pkey PRIMARY KEY (id)
);
create table hr.hr_policies (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  category text default 'Employment'::text not null,
  title text not null,
  version text default 'v1.0'::text not null,
  effective_date date,
  ack_required boolean default false not null,
  role_level text default 'all'::text not null,
  content text default ''::text not null,
  status text default 'published'::text not null,
  release_at timestamp with time zone,
  change_annotation text,
  source text,
  is_active boolean default true not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  published_at timestamp with time zone,
  constraint hr_policies_pkey PRIMARY KEY (id)
);
create table hr.hr_policy_acknowledgments (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  policy_id uuid not null,
  person_id uuid not null,
  person_name text,
  version text default 'v1.0'::text not null,
  acknowledged_at timestamp with time zone default now() not null,
  constraint hr_policy_acknowledgments_policy_id_person_id_version_key UNIQUE (policy_id, person_id, version),
  constraint hr_policy_acknowledgments_pkey PRIMARY KEY (id)
);
create table hr.hr_policy_comments (
  id uuid default gen_random_uuid() not null,
  policy_id uuid not null,
  person_id uuid,
  author_name text,
  role_name text,
  body text not null,
  created_at timestamp with time zone default now() not null,
  constraint hr_policy_comments_pkey PRIMARY KEY (id)
);
create table hr.hr_policy_quiz_questions (
  id uuid default gen_random_uuid() not null,
  quiz_id uuid not null,
  ordinal integer default 0 not null,
  question text not null,
  answers jsonb default '[]'::jsonb not null,
  correct_index integer default 0 not null,
  constraint hr_policy_quiz_questions_pkey PRIMARY KEY (id)
);
create table hr.hr_policy_quiz_results (
  id uuid default gen_random_uuid() not null,
  quiz_id uuid not null,
  person_id uuid not null,
  person_name text,
  score integer default 0 not null,
  total integer default 0 not null,
  passed boolean default false not null,
  taken_at timestamp with time zone default now() not null,
  constraint hr_policy_quiz_results_quiz_id_person_id_key UNIQUE (quiz_id, person_id),
  constraint hr_policy_quiz_results_pkey PRIMARY KEY (id)
);
create table hr.hr_policy_quizzes (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  policy_id uuid,
  quiz_key text not null,
  label text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint hr_policy_quizzes_quiz_key_key UNIQUE (quiz_key),
  constraint hr_policy_quizzes_pkey PRIMARY KEY (id)
);
create table hr.hr_policy_versions (
  id uuid default gen_random_uuid() not null,
  policy_id uuid not null,
  version text not null,
  effective_date date,
  note text,
  require_re_ack boolean default false not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint hr_policy_versions_pkey PRIMARY KEY (id)
);
create table hr.hr_quick_links (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  "position" integer default 0 not null,
  emoji text default '📌'::text not null,
  label text default ''::text not null,
  path text default '/'::text not null,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint hr_quick_links_pkey PRIMARY KEY (id)
);
create table hr.hr_rehire_cases (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  separation_id uuid,
  node_id uuid,
  employee_name text,
  decision text,
  conditions text,
  decision_notes text,
  reference_note text,
  training_credits jsonb,
  fresh_i9 boolean,
  onboarding_initiated boolean default false not null,
  rehire_date date,
  current_status text default 'Pending'::text not null,
  orig_hire_date date,
  sep_date date,
  decided_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint hr_rehire_cases_pkey PRIMARY KEY (id)
);
create table hr.hr_security_settings (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  min_pw_len integer default 8 not null,
  session_timeout_min integer default 30 not null,
  max_failed_logins integer default 5 not null,
  require_2fa boolean default false not null,
  ip_whitelist jsonb default '[]'::jsonb not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  constraint hr_security_settings_tenant_id_key UNIQUE (tenant_id),
  constraint hr_security_settings_pkey PRIMARY KEY (id)
);
create table hr.hr_separations (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  person_id uuid,
  employee_name text not null,
  former_role text,
  sep_date date,
  sep_reason text,
  da_count integer default 0 not null,
  da_severity text default 'None'::text not null,
  former_manager text,
  prev_training jsonb default '{}'::jsonb not null,
  rehire_status text default 'eligible'::text not null,
  notes text,
  orig_hire_date date,
  created_at timestamp with time zone default now() not null,
  constraint hr_separations_pkey PRIMARY KEY (id)
);
create table hr.hr_theme_settings (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  tokens jsonb default '{}'::jsonb not null,
  typography jsonb default '{}'::jsonb not null,
  preset_id text default 'aurora-midnight'::text not null,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint hr_theme_settings_pkey PRIMARY KEY (id)
);
create table hr.huddle_announcements (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid not null,
  huddle_date date default CURRENT_DATE not null,
  body text not null,
  author_name text,
  author_id uuid,
  created_at timestamp with time zone default now() not null,
  constraint huddle_announcements_pkey PRIMARY KEY (id)
);
create table hr.huddle_boards (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid not null,
  huddle_date date default CURRENT_DATE not null,
  priorities jsonb default '[]'::jsonb not null,
  sales_goal numeric,
  training_goal integer,
  notes text,
  updated_by text,
  updated_by_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint huddle_boards_node_id_huddle_date_key UNIQUE (node_id, huddle_date),
  constraint huddle_boards_pkey PRIMARY KEY (id)
);
create table hr.huddle_posts (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid not null,
  huddle_date date default CURRENT_DATE not null,
  body text not null,
  author_name text,
  author_id uuid,
  created_at timestamp with time zone default now() not null,
  constraint huddle_posts_pkey PRIMARY KEY (id)
);
create table hr.huddle_tasks (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid not null,
  huddle_date date default CURRENT_DATE not null,
  description text not null,
  assignee_name text,
  assignee_id uuid,
  due_label text default 'End of shift'::text not null,
  priority text default 'normal'::text not null,
  is_complete boolean default false not null,
  created_by text,
  created_by_id uuid,
  created_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  constraint huddle_tasks_pkey PRIMARY KEY (id)
);
create table hr.i9_records (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  person_id uuid not null,
  work_auth_type text,
  original_i9_date date,
  reverify_date date,
  notes text,
  last_reminded_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint i9_records_person_id_key UNIQUE (person_id),
  constraint i9_records_pkey PRIMARY KEY (id)
);
create table hr.incidents (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  person_id uuid,
  reported_by uuid,
  date date default CURRENT_DATE not null,
  time_of_day time without time zone,
  type text not null,
  description text not null,
  witness text,
  medical_attention boolean default false,
  follow_up text,
  status text default 'open'::text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  severity text default 'minor'::text not null,
  incident_number text,
  reporter_name text,
  occurred_at timestamp with time zone,
  summary text,
  location_text text,
  employees_involved jsonb default '[]'::jsonb,
  witnesses text,
  customer_involved boolean default false,
  customer_name text,
  customer_contact text,
  police_called boolean default false,
  police_report_num text,
  estimated_loss numeric default 0,
  immediate_action text,
  follow_up_required boolean default false,
  notify_hr boolean default false,
  investigation_notes text,
  assigned_investigator text,
  escalated boolean default false,
  timeline jsonb default '[]'::jsonb,
  checklist jsonb default '{}'::jsonb,
  constraint incidents_pkey PRIMARY KEY (id),
  constraint incidents_status_check CHECK ((status = ANY (ARRAY['open'::text, 'investigating'::text, 'closed'::text, 'escalated'::text]))),
  constraint incidents_type_check CHECK ((type = ANY (ARRAY['injury'::text, 'accident'::text, 'property'::text, 'conduct'::text, 'security'::text, 'other'::text])))
);
create table hr.inventory_adjustments (
  id uuid default gen_random_uuid() not null,
  item_id uuid not null,
  node_id uuid not null,
  adjustment_type text default 'count'::text not null,
  quantity_change integer not null,
  quantity_after integer not null,
  reason text,
  adjusted_by uuid,
  adjusted_at timestamp with time zone default now() not null,
  constraint inventory_adjustments_pkey PRIMARY KEY (id)
);
create table hr.inventory_items (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  product_id uuid,
  name text not null,
  sku text,
  category text,
  quantity_on_hand integer default 0 not null,
  quantity_min integer default 0 not null,
  unit_cost numeric,
  last_counted_at timestamp with time zone,
  counted_by uuid,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint inventory_items_pkey PRIMARY KEY (id)
);
create table hr.job_postings (
  id uuid default gen_random_uuid() not null,
  node_id uuid,
  title text not null,
  description text,
  pay_min numeric,
  pay_max numeric,
  status text default 'open'::text,
  created_by uuid,
  created_at timestamp with time zone default now(),
  requirements text,
  dept text,
  employment_type text,
  hours_per_week integer,
  openings integer default 1 not null,
  deadline date,
  start_date text,
  benefits jsonb default '[]'::jsonb not null,
  post_to text,
  updated_at timestamp with time zone default now() not null,
  constraint job_postings_pkey PRIMARY KEY (id)
);
create table hr.label_overrides (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  label_key text not null,
  label_value text not null,
  context text,
  created_at timestamp with time zone default now() not null,
  constraint label_overrides_tenant_id_node_id_label_key_key UNIQUE (tenant_id, node_id, label_key),
  constraint label_overrides_pkey PRIMARY KEY (id)
);
create table hr.labor_entries (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  person_id uuid not null,
  work_date date not null,
  hours numeric(5,2) not null,
  rate numeric(8,2),
  type text default 'regular'::text not null,
  source text default 'shift'::text not null,
  shift_id uuid,
  approved_by uuid,
  approved_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone default now(),
  constraint labor_entries_pkey PRIMARY KEY (id),
  constraint labor_entries_hours_check CHECK (((hours >= (0)::numeric) AND (hours <= (24)::numeric))),
  constraint labor_entries_source_check CHECK ((source = ANY (ARRAY['shift'::text, 'manual'::text, 'import'::text]))),
  constraint labor_entries_type_check CHECK ((type = ANY (ARRAY['regular'::text, 'overtime'::text, 'holiday'::text, 'pto'::text, 'sick'::text])))
);
create table hr.leave_cases (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  person_id uuid not null,
  leave_type text default 'FMLA'::text not null,
  start_date date,
  expected_return date,
  actual_return date,
  status text default 'UPCOMING'::text not null,
  fmla_eligible boolean default false not null,
  intermittent boolean default false not null,
  medical_clearance boolean default false not null,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint leave_cases_pkey PRIMARY KEY (id)
);
create table hr.leave_requests (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  person_id uuid,
  leave_type text default 'FMLA'::text not null,
  requested_start date,
  requested_end date,
  reason text,
  docs_uploaded boolean default false not null,
  status text default 'PENDING'::text not null,
  decided_at timestamp with time zone,
  decided_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint leave_requests_pkey PRIMARY KEY (id)
);
create table hr.lms_courses (
  id text not null,
  tenant_id uuid,
  node_id uuid,
  title text not null,
  category text default 'Compliance'::text not null,
  description text default ''::text not null,
  level text default 'Beginner'::text not null,
  duration_hours numeric default 1 not null,
  required boolean default false not null,
  "position" integer default 0 not null,
  active boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint lms_courses_pkey PRIMARY KEY (id)
);
create table hr.lms_enrollments (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  course_id text not null,
  person_id uuid not null,
  person_name text default ''::text not null,
  node_id uuid,
  pct integer default 0 not null,
  completed boolean default false not null,
  due_date date,
  score integer,
  enrolled_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  constraint lms_enrollments_course_id_person_id_key UNIQUE (course_id, person_id),
  constraint lms_enrollments_pkey PRIMARY KEY (id)
);
create table hr.lms_lessons (
  id uuid default gen_random_uuid() not null,
  section_id uuid not null,
  title text default 'Lesson'::text not null,
  kind text default 'Text'::text not null,
  "position" integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint lms_lessons_pkey PRIMARY KEY (id)
);
create table hr.lms_sections (
  id uuid default gen_random_uuid() not null,
  course_id text not null,
  title text default 'Section'::text not null,
  "position" integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint lms_sections_pkey PRIMARY KEY (id)
);
create table hr.location_zones (
  id uuid default gen_random_uuid() not null,
  node_id uuid not null,
  tenant_id uuid,
  zone_key text not null,
  label text not null,
  is_register boolean default false not null,
  requires_keyholder boolean default false not null,
  sort_order integer default 0 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  min_staff integer default 1 not null,
  constraint location_zones_node_id_zone_key_key UNIQUE (node_id, zone_key),
  constraint location_zones_pkey PRIMARY KEY (id)
);
create table hr.maintenance_logs (
  id uuid default gen_random_uuid() not null,
  node_id uuid not null,
  equipment_name text not null,
  issue_description text not null,
  severity text default 'medium'::text not null,
  status text default 'open'::text not null,
  reported_by uuid,
  resolved_by uuid,
  reported_at timestamp with time zone default now(),
  resolved_at timestamp with time zone,
  notes text,
  constraint maintenance_logs_pkey PRIMARY KEY (id),
  constraint maintenance_logs_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
  constraint maintenance_logs_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text])))
);
create table hr.meeting_notes (
  meeting_id uuid not null,
  present_map jsonb default '{}'::jsonb not null,
  agenda_status jsonb default '{}'::jsonb not null,
  action_items jsonb default '[]'::jsonb not null,
  next_date date,
  shared boolean default false not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  constraint meeting_notes_pkey PRIMARY KEY (meeting_id)
);
create table hr.meeting_records (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  title text not null,
  meeting_date date not null,
  start_time time without time zone,
  end_time time without time zone,
  location text,
  agenda text,
  notes text,
  attendee_ids uuid[],
  status text default 'scheduled'::text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  type text default 'general'::text not null,
  room text default 'huddle'::text not null,
  video_link text,
  recurring text default 'none'::text not null,
  confidential boolean default false not null,
  organizer text,
  pre_note text,
  constraint meeting_records_pkey PRIMARY KEY (id)
);
create table hr.meeting_rsvps (
  meeting_id uuid not null,
  person_id uuid not null,
  status text not null,
  updated_at timestamp with time zone default now() not null,
  constraint meeting_rsvps_pkey PRIMARY KEY (meeting_id, person_id)
);
create table hr.merch_catalog (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  name text not null,
  description text,
  category text,
  price numeric,
  stock_qty integer default 0 not null,
  image_url text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  sizes text[],
  is_company boolean default false not null,
  emoji text,
  constraint merch_catalog_pkey PRIMARY KEY (id)
);
create table hr.merch_orders (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  person_id uuid not null,
  item_id uuid,
  item_name text not null,
  quantity integer default 1 not null,
  total_cost numeric,
  status text default 'pending'::text not null,
  notes text,
  ordered_by uuid,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  size text,
  constraint merch_orders_pkey PRIMARY KEY (id)
);
create table hr.module_config (
  id uuid default gen_random_uuid() not null,
  node_id uuid not null,
  tenant_id uuid not null,
  module text not null,
  config jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint module_config_node_id_module_key UNIQUE (node_id, module),
  constraint module_config_pkey PRIMARY KEY (id)
);
create table hr.modules (
  key text not null,
  label text not null,
  description text,
  is_spine boolean default false not null,
  constraint modules_pkey PRIMARY KEY (key)
);
create table hr.nav_layout (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  role_id uuid,
  nav_key text not null,
  label text,
  icon text,
  display_order integer default 100 not null,
  is_visible boolean default true not null,
  parent_key text,
  created_at timestamp with time zone default now() not null,
  constraint nav_layout_tenant_id_node_id_role_id_nav_key_key UNIQUE (tenant_id, node_id, role_id, nav_key),
  constraint nav_layout_pkey PRIMARY KEY (id)
);
create table hr.nine_box_placements (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  person_id uuid not null,
  node_id uuid,
  performance integer not null,
  potential integer not null,
  note text,
  rated_by uuid,
  rated_by_name text,
  updated_at timestamp with time zone default now() not null,
  constraint nine_box_placements_person_id_key UNIQUE (person_id),
  constraint nine_box_placements_pkey PRIMARY KEY (id),
  constraint nine_box_placements_performance_check CHECK (((performance >= 1) AND (performance <= 3))),
  constraint nine_box_placements_potential_check CHECK (((potential >= 1) AND (potential <= 3)))
);
create table hr.notification_reads (
  person_id uuid not null,
  notif_key text not null,
  read_at timestamp with time zone default now() not null,
  constraint notification_reads_pkey PRIMARY KEY (person_id, notif_key)
);
create table hr.notification_rules (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  event_type text not null,
  notify_roles jsonb default '[]'::jsonb not null,
  notify_people jsonb default '[]'::jsonb not null,
  channel_inapp boolean default true not null,
  channel_sms boolean default false not null,
  channel_email boolean default false not null,
  channel_push boolean default false not null,
  threshold_config jsonb default '{}'::jsonb not null,
  delay_minutes integer default 0 not null,
  urgency text default 'normal'::text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint notification_rules_pkey PRIMARY KEY (id)
);
create table hr.notifications (
  id uuid default gen_random_uuid() not null,
  node_id uuid,
  target_person uuid,
  title text not null,
  body text,
  category text not null,
  priority text default 'normal'::text not null,
  is_read boolean default false,
  proposal_id uuid,
  created_at timestamp with time zone default now(),
  constraint notifications_pkey PRIMARY KEY (id),
  constraint notifications_category_check CHECK ((category = ANY (ARRAY['ai_proposal'::text, 'alert'::text, 'reminder'::text, 'system'::text, 'ops'::text, 'attendance'::text]))),
  constraint notifications_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])))
);
create table hr.on_call (
  id uuid default gen_random_uuid() not null,
  person_id uuid not null,
  node_id uuid,
  shift_date date not null,
  shift_type text,
  available boolean default true,
  notified_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint on_call_person_id_shift_date_key UNIQUE (person_id, shift_date),
  constraint on_call_pkey PRIMARY KEY (id)
);
create table hr.on_call_attempts (
  id uuid default gen_random_uuid() not null,
  person_id uuid not null,
  exception_id uuid,
  called_by uuid,
  outcome text default 'called'::text not null,
  note text,
  created_at timestamp with time zone default now() not null,
  constraint on_call_attempts_pkey PRIMARY KEY (id),
  constraint on_call_attempts_outcome_check CHECK ((outcome = ANY (ARRAY['called'::text, 'accepted'::text, 'declined'::text, 'no_answer'::text])))
);
create table hr.onboarding_checklist_items (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  person_id uuid not null,
  task_id text not null,
  done boolean default false not null,
  done_at timestamp with time zone,
  done_by uuid,
  note text,
  updated_at timestamp with time zone default now() not null,
  constraint onboarding_checklist_items_person_id_task_id_key UNIQUE (person_id, task_id),
  constraint onboarding_checklist_items_pkey PRIMARY KEY (id)
);
create table hr.onboarding_hires (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  full_name text not null,
  start_date date,
  role_label text,
  pay_rate numeric,
  email text,
  phone text,
  emergency_name text,
  emergency_phone text,
  tasks jsonb,
  raw jsonb,
  status text default 'pending'::text not null,
  converted_person_id uuid,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  buddy text,
  role_id uuid,
  milestones jsonb default '{}'::jsonb not null,
  completed_at timestamp with time zone,
  constraint onboarding_hires_pkey PRIMARY KEY (id)
);
create table hr.onboarding_programs (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  person_id uuid not null,
  template_name text default 'Standard Onboarding'::text not null,
  status text default 'active'::text not null,
  started_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint onboarding_programs_pkey PRIMARY KEY (id)
);
create table hr.onboarding_tasks (
  id uuid default gen_random_uuid() not null,
  program_id uuid not null,
  label text not null,
  day integer,
  completed_at timestamp with time zone,
  completed_by uuid,
  sort_order integer default 0 not null,
  category text,
  constraint onboarding_tasks_pkey PRIMARY KEY (id)
);
create table hr.one_on_one_action_items (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  meeting_id uuid not null,
  description text not null,
  due_date date,
  completed boolean default false not null,
  created_at timestamp with time zone default now() not null,
  constraint one_on_one_action_items_pkey PRIMARY KEY (id)
);
create table hr.one_on_ones (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid not null,
  employee_person_id uuid,
  employee_name text not null,
  manager_person_id uuid,
  manager_name text,
  meeting_date date default CURRENT_DATE not null,
  duration_min integer default 30 not null,
  topics text[] default '{}'::text[] not null,
  notes text,
  employee_goals text,
  follow_up_date date,
  mood text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint one_on_ones_pkey PRIMARY KEY (id)
);
create table hr.ops_completions (
  id uuid default gen_random_uuid() not null,
  task_id uuid not null,
  node_id uuid not null,
  completed_by uuid not null,
  ops_date date default CURRENT_DATE not null,
  completed_at timestamp with time zone default now(),
  notes text,
  constraint ops_completions_task_id_node_id_ops_date_key UNIQUE (task_id, node_id, ops_date),
  constraint ops_completions_pkey PRIMARY KEY (id)
);
create table hr.ops_tasks (
  id uuid default gen_random_uuid() not null,
  node_id uuid not null,
  title text not null,
  category text not null,
  frequency text default 'daily'::text not null,
  shift_slot text,
  instructions text,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint ops_tasks_pkey PRIMARY KEY (id),
  constraint ops_tasks_category_check CHECK ((category = ANY (ARRAY['cultivation'::text, 'retail'::text, 'management'::text, 'compliance'::text, 'cleaning'::text]))),
  constraint ops_tasks_frequency_check CHECK ((frequency = ANY (ARRAY['daily'::text, 'shift'::text, 'weekly'::text]))),
  constraint ops_tasks_shift_slot_check CHECK ((shift_slot = ANY (ARRAY['opening'::text, 'midday'::text, 'closing'::text])))
);
create table hr.org_nodes (
  id uuid default gen_random_uuid() not null,
  parent_id uuid,
  node_type hr.node_type not null,
  name text not null,
  tenant_id uuid not null,
  state_code text,
  timezone text,
  config jsonb default '{}'::jsonb not null,
  path extensions.ltree,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint org_nodes_pkey PRIMARY KEY (id)
);
create table hr.pay_adjustments (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  person_id uuid not null,
  adj_type text default 'Bonus'::text not null,
  amount numeric default 0 not null,
  note text,
  status text default 'queued'::text not null,
  payroll_run_id uuid,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint pay_adjustments_pkey PRIMARY KEY (id)
);
create table hr.pay_stubs (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  person_id uuid not null,
  period_start date not null,
  period_end date not null,
  pay_date date,
  reg_hours numeric default 0 not null,
  ot_hours numeric default 0 not null,
  tips numeric default 0 not null,
  gross numeric default 0 not null,
  fed_tax numeric default 0 not null,
  state_tax numeric default 0 not null,
  ct_tax numeric default 0 not null,
  health numeric default 0 not null,
  retirement_401k numeric default 0 not null,
  other_deductions numeric default 0 not null,
  net numeric default 0 not null,
  status text default 'Paid'::text not null,
  created_at timestamp with time zone default now() not null,
  constraint pay_stubs_pkey PRIMARY KEY (id)
);
create table hr.payroll_runs (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  run_date date default CURRENT_DATE not null,
  pay_date date,
  employee_count integer default 0 not null,
  total_gross numeric default 0 not null,
  status text default 'completed'::text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint payroll_runs_pkey PRIMARY KEY (id)
);
create table hr.people (
  id uuid default gen_random_uuid() not null,
  auth_user_id uuid,
  login_id text not null,
  pin_hash text not null,
  full_name text not null,
  email text,
  phone text,
  notify_prefs jsonb default '{}'::jsonb not null,
  theme_pref jsonb default '{}'::jsonb not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  display_name text generated always as (full_name) stored,
  privacy_prefs jsonb default '{}'::jsonb,
  profile_extra jsonb default '{}'::jsonb,
  constraint people_auth_user_id_key UNIQUE (auth_user_id),
  constraint people_login_id_key UNIQUE (login_id),
  constraint people_pkey PRIMARY KEY (id)
);
create table hr.performance_reviews (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  person_id uuid not null,
  reviewer_id uuid,
  review_date date default CURRENT_DATE not null,
  period_start date,
  period_end date,
  attendance_score integer,
  punctuality_score integer,
  output_score integer,
  task_score integer,
  attitude_score integer,
  overall_score numeric(4,2),
  notes text,
  goals text,
  status text default 'draft'::text not null,
  acknowledged_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  period text,
  scores jsonb default '{}'::jsonb,
  raise_rec text default 'none'::text,
  promo text default 'not ready'::text,
  pip boolean default false,
  dispute_reason text,
  constraint performance_reviews_pkey PRIMARY KEY (id),
  constraint performance_reviews_attendance_score_check CHECK (((attendance_score >= 0) AND (attendance_score <= 10))),
  constraint performance_reviews_attitude_score_check CHECK (((attitude_score >= 0) AND (attitude_score <= 10))),
  constraint performance_reviews_output_score_check CHECK (((output_score >= 0) AND (output_score <= 10))),
  constraint performance_reviews_punctuality_score_check CHECK (((punctuality_score >= 0) AND (punctuality_score <= 10))),
  constraint performance_reviews_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'acknowledged'::text, 'disputed'::text]))),
  constraint performance_reviews_task_score_check CHECK (((task_score >= 0) AND (task_score <= 10)))
);
create table hr.pipeline_deals (
  id uuid default gen_random_uuid() not null,
  company text,
  contact text,
  email text,
  phone text,
  value numeric,
  products text,
  location text,
  rep text,
  close_date date,
  stage text default 'new'::text,
  notes text,
  node_id uuid,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint pipeline_deals_pkey PRIMARY KEY (id)
);
create table hr.position_assignments (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  position_id uuid not null,
  person_id uuid,
  node_id uuid not null,
  assignment_kind text default 'permanent'::text not null,
  start_date date default CURRENT_DATE not null,
  end_date date,
  created_at timestamp with time zone default now() not null,
  constraint position_assignments_pkey PRIMARY KEY (id),
  constraint position_assignments_assignment_kind_check CHECK ((assignment_kind = ANY (ARRAY['permanent'::text, 'acting'::text, 'interim'::text, 'temp'::text])))
);
create table hr.probation_periods (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  person_id uuid,
  employee_name text not null,
  role text,
  location text,
  hire_date date not null,
  probation_days integer default 90 not null,
  status text default 'on_track'::text not null,
  milestones jsonb default '{}'::jsonb not null,
  notes text default ''::text,
  extension_days integer,
  extension_reason text,
  outcome text,
  manager text,
  decided_by uuid,
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint probation_periods_pkey PRIMARY KEY (id)
);
