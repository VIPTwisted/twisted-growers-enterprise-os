-- GROK-WHY: Already applied in production as 20260912193458 hr_01_tables_a.
-- Another desk ran this. Filed here so migration-drift can pass and the Bots paid key can ship on Sync.
-- Exact SQL from supabase_migrations.schema_migrations.statements. No ledger rewrite. Metrc read-only.

-- TG HR platform, part 01: tables 1–45 of 251 (generated from vip-hr-platform's catalog, schema only, rewritten for hr).
set local search_path to hr, public, extensions;
create table hr.academy_courses (
  id text not null,
  tenant_id uuid,
  node_id uuid,
  title text not null,
  category text default 'General'::text not null,
  level text default 'Beginner'::text not null,
  duration_min integer default 30 not null,
  required boolean default false not null,
  due_date date,
  color text default '#00e5ff'::text not null,
  icon text default '🎓'::text not null,
  "position" integer default 0 not null,
  active boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint academy_courses_pkey PRIMARY KEY (id)
);
create table hr.academy_progress (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  course_id text not null,
  person_id uuid not null,
  person_name text default ''::text not null,
  node_id uuid,
  lessons_completed integer default 0 not null,
  pct integer default 0 not null,
  certified boolean default false not null,
  score integer,
  enrolled_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  constraint academy_progress_course_id_person_id_key UNIQUE (course_id, person_id),
  constraint academy_progress_pkey PRIMARY KEY (id)
);
create table hr.af_alert_dismissals (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  alert_key text not null,
  dismissed_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint af_alert_dismissals_tenant_id_alert_key_key UNIQUE (tenant_id, alert_key),
  constraint af_alert_dismissals_pkey PRIMARY KEY (id)
);
create table hr.af_bradford_thresholds (
  tenant_id uuid not null,
  warn integer default 200 not null,
  final_warn integer default 500 not null,
  term_risk integer default 900 not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  constraint af_bradford_thresholds_pkey PRIMARY KEY (tenant_id)
);
create table hr.af_employee_flags (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  person_id uuid not null,
  note text,
  flagged_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint af_employee_flags_tenant_id_person_id_key UNIQUE (tenant_id, person_id),
  constraint af_employee_flags_pkey PRIMARY KEY (id)
);
create table hr.af_rtw_checkins (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  person_id uuid not null,
  callout_date date,
  return_date date,
  absence_type text,
  illness_related boolean default false not null,
  needs_accommodation boolean default false not null,
  accommodation_note text,
  medical_clearance boolean default false not null,
  notes text,
  completed_by uuid,
  completed_by_name text,
  completed_at timestamp with time zone default now() not null,
  constraint af_rtw_checkins_pkey PRIMARY KEY (id)
);
create table hr.af_warning_actions (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  person_id uuid,
  warning_key text not null,
  status text default 'pending'::text not null,
  message text,
  decided_by uuid,
  decided_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint af_warning_actions_tenant_id_warning_key_key UNIQUE (tenant_id, warning_key),
  constraint af_warning_actions_pkey PRIMARY KEY (id),
  constraint af_warning_actions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'ignored'::text])))
);
create table hr.ai_agent_access (
  id uuid default gen_random_uuid() not null,
  agent_id uuid not null,
  grant_type text not null,
  grant_value text,
  created_at timestamp with time zone default now() not null,
  constraint ai_agent_access_pkey PRIMARY KEY (id),
  constraint ai_agent_access_grant_type_check CHECK ((grant_type = ANY (ARRAY['role'::text, 'lens'::text, 'person'::text, 'node'::text, 'all_entity'::text])))
);
create table hr.ai_agent_tools (
  id uuid default gen_random_uuid() not null,
  agent_id uuid not null,
  tool_name text not null,
  constraint ai_agent_tools_pkey PRIMARY KEY (id)
);
create table hr.ai_agents (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  entity_node_id uuid not null,
  name text not null,
  description text,
  provider_id uuid,
  model text,
  system_prompt text,
  params jsonb default '{}'::jsonb not null,
  agent_type text default 'assistant'::text not null,
  autonomy text default 'suggest_only'::text not null,
  enabled boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ai_agents_pkey PRIMARY KEY (id),
  constraint ai_agents_agent_type_check CHECK ((agent_type = ANY (ARRAY['assistant'::text, 'operational'::text]))),
  constraint ai_agents_autonomy_check CHECK ((autonomy = ANY (ARRAY['suggest_only'::text, 'auto_with_log'::text])))
);
create table hr.ai_assist_questions (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  node_id uuid,
  person_id uuid,
  question text not null,
  topic text,
  answered boolean default true not null,
  created_at timestamp with time zone default now() not null,
  constraint ai_assist_questions_pkey PRIMARY KEY (id)
);
create table hr.ai_conversations (
  id uuid default gen_random_uuid() not null,
  node_id uuid,
  person_id uuid,
  role text not null,
  content text not null,
  proposals jsonb,
  created_at timestamp with time zone default now(),
  constraint ai_conversations_pkey PRIMARY KEY (id),
  constraint ai_conversations_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);
create table hr.ai_invocations (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  entity_node_id uuid,
  agent_id uuid,
  provider_id uuid,
  model text,
  actor_person uuid,
  tokens_in integer default 0,
  tokens_out integer default 0,
  status text,
  error text,
  created_at timestamp with time zone default now() not null,
  constraint ai_invocations_pkey PRIMARY KEY (id)
);
create table hr.ai_proposals (
  id uuid default gen_random_uuid() not null,
  node_id uuid,
  tier integer not null,
  title text not null,
  description text,
  action_type text not null,
  action_payload jsonb,
  context_data jsonb,
  status text default 'pending'::text not null,
  responded_by uuid,
  responded_at timestamp with time zone,
  response_notes text,
  remind_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint ai_proposals_pkey PRIMARY KEY (id),
  constraint ai_proposals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'edited'::text, 'ignored'::text, 'remind'::text, 'collaborating'::text, 'auto_executed'::text, 'expired'::text]))),
  constraint ai_proposals_tier_check CHECK ((tier = ANY (ARRAY[1, 2, 3])))
);
create table hr.ai_providers (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  entity_node_id uuid not null,
  name text not null,
  kind text not null,
  base_url text,
  api_key_encrypted bytea,
  models jsonb default '[]'::jsonb not null,
  cost_tier text default 'free'::text not null,
  enabled boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ai_providers_pkey PRIMARY KEY (id),
  constraint ai_providers_cost_tier_check CHECK ((cost_tier = ANY (ARRAY['free'::text, 'paid'::text]))),
  constraint ai_providers_kind_check CHECK ((kind = ANY (ARRAY['ollama'::text, 'openai'::text, 'anthropic'::text, 'openai_compatible'::text])))
);
create table hr.allocations (
  id uuid default gen_random_uuid() not null,
  batch_id uuid not null,
  product text not null,
  grams numeric not null,
  ai_suggested boolean default false,
  decided_by uuid,
  decided_at timestamp with time zone,
  notes text,
  status text default 'proposed'::text,
  created_at timestamp with time zone default now(),
  constraint allocations_pkey PRIMARY KEY (id),
  constraint allocations_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'manufacturing'::text, 'done'::text])))
);
create table hr.announcement_reads (
  announcement_id uuid not null,
  person_id uuid not null,
  read_at timestamp with time zone default now() not null,
  acked_at timestamp with time zone,
  constraint announcement_reads_pkey PRIMARY KEY (announcement_id, person_id)
);
create table hr.announcements (
  id uuid default gen_random_uuid() not null,
  author_id uuid not null,
  node_id uuid,
  scope_type text default 'location'::text not null,
  scope_value text,
  title text not null,
  body text not null,
  requires_ack boolean default false not null,
  expires_at date,
  created_at timestamp with time zone default now() not null,
  post_type text default 'announcement'::text not null,
  pinned boolean default false not null,
  priority text default 'FYI'::text,
  kind text default 'Announcement'::text,
  shift_target text default 'All Shifts'::text,
  node_ids uuid[],
  role_names text[],
  person_ids uuid[],
  scheduled_at timestamp with time zone,
  constraint announcements_pkey PRIMARY KEY (id),
  constraint announcements_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 5000))),
  constraint announcements_scope_type_check CHECK ((scope_type = ANY (ARRAY['location'::text, 'role'::text, 'company'::text]))),
  constraint announcements_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200)))
);
create table hr.anonymous_feedback (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  message text not null,
  category text default 'general'::text not null,
  status text default 'new'::text not null,
  created_at timestamp with time zone default now(),
  constraint anonymous_feedback_pkey PRIMARY KEY (id),
  constraint anonymous_feedback_category_check CHECK ((category = ANY (ARRAY['general'::text, 'safety'::text, 'conduct'::text, 'scheduling'::text, 'management'::text, 'other'::text]))),
  constraint anonymous_feedback_status_check CHECK ((status = ANY (ARRAY['new'::text, 'reviewed'::text, 'actioned'::text, 'resolved'::text])))
);
create table hr.app_audit_log (
  id uuid default gen_random_uuid() not null,
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text not null,
  target text,
  node_name text,
  result text default 'Success'::text,
  meta jsonb,
  created_at timestamp with time zone default now() not null,
  node_id uuid,
  constraint app_audit_log_pkey PRIMARY KEY (id)
);
create table hr.app_state (
  key text not null,
  value jsonb not null,
  updated_by text,
  updated_at timestamp with time zone default now() not null,
  constraint app_state_pkey PRIMARY KEY (key)
);
create table hr.applicant_availability (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  applicant_id uuid not null,
  node_id uuid,
  raw_text text,
  grid jsonb default '{}'::jsonb not null,
  preferred_shift text,
  notes jsonb default '[]'::jsonb not null,
  approved boolean default false not null,
  approved_by text,
  approved_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint applicant_availability_applicant_uniq UNIQUE (applicant_id),
  constraint applicant_availability_pkey PRIMARY KEY (id)
);
create table hr.applicant_records (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  full_name text not null,
  email text,
  phone text,
  "position" text,
  source text,
  stage text default 'applied'::text not null,
  notes text,
  resume_url text,
  assigned_to uuid,
  created_by uuid,
  applied_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  rating integer,
  hired_date date,
  rejection_reason text,
  bg_check_status text default 'not_requested'::text not null,
  bg_check_requested_at timestamp with time zone,
  bg_check_resolved_at timestamp with time zone,
  availability_raw text,
  constraint applicant_records_pkey PRIMARY KEY (id)
);
create table hr.appraisal_cycles (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  name text not null,
  period text,
  due date,
  audience jsonb default '{}'::jsonb not null,
  status text default 'open'::text not null,
  created_by text,
  created_by_person uuid,
  created_at timestamp with time zone default now() not null,
  constraint appraisal_cycles_pkey PRIMARY KEY (id)
);
create table hr.appraisal_records (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  cycle_id uuid not null,
  person_id uuid,
  person_name text,
  person_role text,
  node_id uuid,
  self_scores jsonb,
  accomplishments text,
  goals text,
  support text,
  self_submitted_at timestamp with time zone,
  manager_scores jsonb,
  manager_summary text,
  manager_raise text,
  manager_by text,
  manager_at timestamp with time zone,
  finalized_at timestamp with time zone,
  status text default 'not_started'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint appraisal_records_cycle_id_person_id_key UNIQUE (cycle_id, person_id),
  constraint appraisal_records_pkey PRIMARY KEY (id)
);
create table hr.assignments (
  id uuid default gen_random_uuid() not null,
  person_id uuid not null,
  role_id uuid not null,
  node_id uuid not null,
  status hr.assignment_status default 'active'::hr.assignment_status not null,
  effective_from date default CURRENT_DATE not null,
  effective_to date,
  created_at timestamp with time zone default now() not null,
  constraint assignments_pkey PRIMARY KEY (id)
);
create table hr.ats_applicant_events (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  applicant_id uuid not null,
  node_id uuid,
  event text not null,
  note text,
  actor text,
  created_at timestamp with time zone default now() not null,
  constraint ats_applicant_events_pkey PRIMARY KEY (id)
);
create table hr.ats_interviews (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  applicant_id uuid not null,
  node_id uuid,
  interviewer_id uuid,
  interviewer_name text,
  scheduled_date date not null,
  scheduled_time text,
  format text default 'In-Person'::text not null,
  status text default 'scheduled'::text not null,
  result text,
  ratings jsonb,
  notes text,
  created_by text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ats_interviews_pkey PRIMARY KEY (id)
);
create table hr.attendance_events (
  id uuid default gen_random_uuid() not null,
  person_id uuid,
  node_id uuid,
  type text,
  event_date date,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now(),
  constraint attendance_events_pkey PRIMARY KEY (id)
);
create table hr.attendance_incidents (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid not null,
  person_id uuid not null,
  incident_type text not null,
  points numeric default 0 not null,
  incident_date date default CURRENT_DATE not null,
  expiry_months integer default 6 not null,
  expiry_date date,
  reason text,
  recorded_by uuid,
  recorded_by_name text,
  created_at timestamp with time zone default now() not null,
  constraint attendance_incidents_pkey PRIMARY KEY (id),
  constraint attendance_incidents_incident_type_check CHECK ((incident_type = ANY (ARRAY['tardy'::text, 'callout'::text, 'ncns'::text])))
);
create table hr.attendance_patterns (
  id uuid default gen_random_uuid() not null,
  person_id uuid,
  pattern_type text not null,
  evidence jsonb default '{}'::jsonb,
  severity text default 'medium'::text,
  detected_at timestamp with time zone default now(),
  resolved_at timestamp with time zone,
  constraint attendance_patterns_pkey PRIMARY KEY (id)
);
create table hr.audit_dismissals (
  id uuid default gen_random_uuid() not null,
  event_id uuid not null,
  actor_id uuid,
  actor_name text,
  reason text,
  created_at timestamp with time zone default now() not null,
  constraint audit_dismissals_event_id_key UNIQUE (event_id),
  constraint audit_dismissals_pkey PRIMARY KEY (id)
);
create table hr.audit_log (
  id bigint generated always as identity not null,
  actor_person uuid,
  assignment_id uuid,
  node_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  detail jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint audit_log_pkey PRIMARY KEY (id)
);
create table hr.availability_meta (
  person_id uuid not null,
  node_id uuid,
  preferred_shift text,
  max_hours integer,
  blackout_weeks jsonb default '[]'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  constraint availability_meta_pkey PRIMARY KEY (person_id)
);
create table hr.availability_prefs (
  id uuid default gen_random_uuid() not null,
  person_id uuid not null,
  node_id uuid not null,
  day_of_week integer not null,
  start_time time without time zone,
  end_time time without time zone,
  available boolean default true not null,
  note text,
  updated_at timestamp with time zone default now() not null,
  constraint availability_prefs_person_id_node_id_day_of_week_key UNIQUE (person_id, node_id, day_of_week),
  constraint availability_prefs_pkey PRIMARY KEY (id)
);
create table hr.availability_requests (
  id uuid default gen_random_uuid() not null,
  person_id uuid,
  node_id uuid,
  requested jsonb,
  status text default 'pending'::text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint availability_requests_pkey PRIMARY KEY (id)
);
create table hr.batch_documents (
  id uuid default gen_random_uuid() not null,
  batch_id uuid,
  node_id uuid,
  doc_type text,
  source text,
  original_url text,
  parsed_data jsonb default '{}'::jsonb,
  mapping jsonb default '{}'::jsonb,
  confidence numeric,
  status text default 'pending'::text,
  mismatch boolean default false,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint batch_documents_pkey PRIMARY KEY (id),
  constraint batch_documents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'review'::text, 'approved'::text, 'rejected'::text])))
);
create table hr.batches (
  id uuid default gen_random_uuid() not null,
  node_id uuid not null,
  batch_number text not null,
  strain text,
  room text,
  stream text not null,
  harvest_date date,
  wet_weight_g numeric,
  dry_weight_g numeric,
  trim_weight_g numeric,
  status text default 'growing'::text not null,
  test_status text default 'pending'::text not null,
  vendor_lot text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint batches_pkey PRIMARY KEY (id),
  constraint batches_status_check CHECK ((status = ANY (ARRAY['growing'::text, 'harvested'::text, 'drying'::text, 'cured'::text, 'testing'::text, 'allocation'::text, 'manufacturing'::text, 'archived'::text]))),
  constraint batches_stream_check CHECK ((stream = ANY (ARRAY['ours'::text, 'purchased'::text]))),
  constraint batches_test_status_check CHECK ((test_status = ANY (ARRAY['pending'::text, 'submitted'::text, 'passed'::text, 'failed'::text, 'retest'::text])))
);
create table hr.benefit_beneficiaries (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  enrollment_id uuid,
  person_id uuid not null,
  name text not null,
  relationship text,
  dob date,
  is_primary boolean default true not null,
  created_at timestamp with time zone default now() not null,
  constraint benefit_beneficiaries_pkey PRIMARY KEY (id)
);
create table hr.benefit_enrollment_drafts (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  person_id uuid not null,
  plan_year integer default ((EXTRACT(year FROM now()))::integer + 1) not null,
  draft jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  constraint benefit_enrollment_drafts_pkey PRIMARY KEY (id)
);
create table hr.benefit_enrollments (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  person_id uuid not null,
  plan_year integer default (EXTRACT(year FROM now()))::integer not null,
  health_plan text,
  dental_plan text,
  vision_plan text,
  coverage_type text,
  contrib_pct numeric default 0 not null,
  premium numeric default 0 not null,
  status text default 'ENROLLED'::text not null,
  effective_date date,
  submitted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint benefit_enrollments_pkey PRIMARY KEY (id)
);
create table hr.benefit_leave_balances (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  node_id uuid,
  person_id uuid not null,
  plan_year integer default (EXTRACT(year FROM now()))::integer not null,
  accrued_hours numeric default 0 not null,
  used_hours numeric default 0 not null,
  ytd_hours_worked numeric default 0 not null,
  last_used_date date,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint benefit_leave_balances_pkey PRIMARY KEY (id)
);
create table hr.break_rules (
  id uuid default gen_random_uuid() not null,
  jurisdiction text not null,
  break_type text not null,
  min_shift_hours numeric not null,
  duration_min integer not null,
  paid boolean default false not null,
  required boolean default true not null,
  note text,
  source text,
  created_at timestamp with time zone default now() not null,
  constraint break_rules_jurisdiction_break_type_min_shift_hours_duratio_key UNIQUE (jurisdiction, break_type, min_shift_hours, duration_min),
  constraint break_rules_pkey PRIMARY KEY (id),
  constraint break_rules_break_type_check CHECK ((break_type = ANY (ARRAY['meal'::text, 'rest'::text])))
);
create table hr.business_types (
  id uuid default gen_random_uuid() not null,
  key text not null,
  label text not null,
  description text,
  default_roles jsonb default '[]'::jsonb not null,
  default_zones jsonb default '[]'::jsonb not null,
  default_shift_slots jsonb default '[]'::jsonb not null,
  default_competencies jsonb default '[]'::jsonb not null,
  vocabulary jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now(),
  constraint business_types_key_key UNIQUE (key),
  constraint business_types_pkey PRIMARY KEY (id)
);
create table hr.chat_messages (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  channel_key text not null,
  node_id uuid,
  parent_id uuid,
  sender_id uuid,
  sender_name text,
  body text not null,
  created_at timestamp with time zone default now() not null,
  constraint chat_messages_pkey PRIMARY KEY (id)
);
