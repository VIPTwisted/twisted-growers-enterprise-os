-- DOCUMENTS, SIGNATURES, INCIDENTS, CCC COMPLIANCE.
-- The question this answers months later, to a regulator or a lawyer:
-- "was this person told, WHICH VERSION were they told, and can you prove it."
-- An acknowledgement binds to a document VERSION, never a title. Revising a
-- manual un-acknowledges everyone by design — that is the point.
-- Named hr_* so it cannot be confused with the 3,675 Metrc COAs already in
-- document_search and metrc_documents.

create sequence if not exists public.hr_incident_seq;

create table if not exists public.hr_documents (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  kind           text not null default 'policy'
                 check (kind in ('manual','policy','sop','addendum','form','notice','training')),
  version        text not null default '1.0',
  body           text,
  storage_path   text,
  mime_type      text,
  parent_id      uuid references public.hr_documents(id) on delete cascade,
  supersedes_id  uuid references public.hr_documents(id) on delete set null,
  requires_signature boolean not null default true,
  effective_from date not null default current_date,
  retired_at     timestamptz,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (title, version)
);
create index if not exists hrdoc_live_idx on public.hr_documents(kind, effective_from desc) where retired_at is null;
comment on table public.hr_documents is
  'Manual, policies, SOPs, addendums. An addendum sets parent_id to the manual it '
  'amends. A revision sets supersedes_id and takes a new version string — old '
  'acknowledgements stay bound to the old version and everyone is asked again.';

create table if not exists public.hr_document_sections (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.hr_documents(id) on delete cascade,
  ordinal     integer not null,
  heading     text not null,
  body        text,
  created_at  timestamptz not null default now(),
  unique (document_id, ordinal)
);
comment on table public.hr_document_sections is
  'A manual split into sections so progress is a percentage, not a yes/no, and a '
  'person can stop and come back.';

create table if not exists public.hr_document_assignments (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.hr_documents(id) on delete cascade,
  employee_id   uuid references public.employees(id) on delete cascade,
  role_id       uuid references public.roles_catalog(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  due_on        date,
  assigned_by   uuid references auth.users(id),
  assigned_at   timestamptz not null default now(),
  check (employee_id is not null or role_id is not null or department_id is not null)
);
create index if not exists hrda_doc_idx on public.hr_document_assignments(document_id);

create table if not exists public.hr_document_acknowledgements (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references public.hr_documents(id) on delete cascade,
  document_version text not null,
  employee_id      uuid not null references public.employees(id) on delete cascade,
  read_at          timestamptz,
  signed_at        timestamptz,
  signature_name   text,
  ip               inet,
  user_agent       text,
  note             text,
  created_at       timestamptz not null default now(),
  unique (document_id, employee_id, document_version)
);
create index if not exists hrack_emp_idx on public.hr_document_acknowledgements(employee_id, signed_at desc);
comment on table public.hr_document_acknowledgements is
  'One row per person per document VERSION. document_version is copied in, not '
  'joined, so the record survives revision. This is the row you hand an inspector.';

create table if not exists public.hr_document_progress (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.hr_documents(id) on delete cascade,
  section_id    uuid references public.hr_document_sections(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  read_at       timestamptz not null default now(),
  seconds_spent integer,
  unique (section_id, employee_id)
);

create table if not exists public.hr_incidents (
  id                uuid primary key default gen_random_uuid(),
  incident_no       text not null unique
                    default ('INC-' || to_char(now(),'YYYY') || '-' ||
                             lpad(nextval('public.hr_incident_seq')::text, 4, '0')),
  occurred_at       timestamptz not null,
  reported_at       timestamptz not null default now(),
  reported_by       uuid references public.employees(id) on delete set null,
  involved_employee uuid references public.employees(id) on delete set null,
  zone_id           uuid references public.zones(id) on delete set null,
  kind              text not null check (kind in
                      ('injury','near_miss','illness','spill','equipment','security','product','other')),
  severity          text not null default 'low' check (severity in ('low','medium','high','critical')),
  description       text not null,
  witnesses         text,
  body_part         text,
  treatment         text check (treatment is null or treatment in
                      ('none','first_aid','medical','er','hospitalised')),
  lost_time         boolean not null default false,
  days_away         integer,
  osha_recordable   boolean not null default false,
  ccc_reportable    boolean not null default false,
  corrective_action text,
  status            text not null default 'open'
                    check (status in ('open','investigating','corrective_action','closed')),
  closed_by         uuid references auth.users(id),
  closed_at         timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists hrinc_open_idx on public.hr_incidents(status, occurred_at desc);
comment on table public.hr_incidents is
  'Injuries, near misses, spills, equipment faults. osha_recordable feeds the OSHA '
  '300 log; ccc_reportable flags what the Commission must be told. A near miss is '
  'worth recording precisely because nothing happened that time.';

create table if not exists public.compliance_requirements (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  authority     text not null default 'CCC',
  applies_to    text not null default 'all' check (applies_to in ('all','role','department')),
  role_id       uuid references public.roles_catalog(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  renews_months integer,
  blocks_work   boolean not null default false,
  note          text,
  active        boolean not null default true
);
comment on table public.compliance_requirements is
  'What each person must hold — agent registration, gowning, forklift, food '
  'handler. blocks_work=true means an expired one stops that person working, which '
  'is how the roster decides who is legally schedulable.';

create table if not exists public.employee_compliance (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  requirement_id uuid not null references public.compliance_requirements(id) on delete cascade,
  status         text not null default 'outstanding'
                 check (status in ('outstanding','in_progress','held','expired','waived')),
  granted_on     date,
  expires_on     date,
  evidence_path  text,
  verified_by    uuid references auth.users(id),
  verified_at    timestamptz,
  note           text,
  updated_at     timestamptz not null default now(),
  unique (employee_id, requirement_id)
);
create index if not exists empcomp_exp_idx on public.employee_compliance(expires_on) where status='held';

create or replace view public.v_document_compliance
with (security_invoker = on) as
select d.id as document_id, d.title, d.kind, d.version, d.requires_signature,
       e.id as employee_id, e.employee_code, e.full_name, dep.name as department,
       a.due_on, ack.signed_at, ack.read_at, ack.signature_name,
       (select count(*) from public.hr_document_sections s where s.document_id=d.id) as sections,
       (select count(*) from public.hr_document_progress p
          join public.hr_document_sections s2 on s2.id=p.section_id
         where s2.document_id=d.id and p.employee_id=e.id) as sections_read,
       case
         when ack.signed_at is not null then 'signed'
         when ack.read_at   is not null then 'read, not signed'
         when exists (select 1 from public.hr_document_progress p2
                        join public.hr_document_sections s3 on s3.id=p2.section_id
                       where s3.document_id=d.id and p2.employee_id=e.id) then 'in progress'
         when a.due_on is not null and a.due_on < current_date then 'overdue'
         else 'not started'
       end as state
from public.hr_documents d
join public.hr_document_assignments a on a.document_id=d.id
join public.employees e
  on (a.employee_id=e.id)
  or (a.role_id is not null and (e.primary_role_id=a.role_id or e.secondary_role_id=a.role_id))
  or (a.department_id is not null and (e.primary_department_id=a.department_id or e.secondary_department_id=a.department_id))
left join public.departments dep on dep.id=e.primary_department_id
left join public.hr_document_acknowledgements ack
  on ack.document_id=d.id and ack.employee_id=e.id and ack.document_version=d.version
where d.retired_at is null and e.status::text='active';

comment on view public.v_document_compliance is
  'Every person who must read every live document and exactly how far they got. '
  'Joined on the CURRENT version, so revising a manual moves everyone back to '
  '"not started" — correct, and the whole reason this exists.';

alter table public.hr_documents                 enable row level security;
alter table public.hr_document_sections         enable row level security;
alter table public.hr_document_assignments      enable row level security;
alter table public.hr_document_acknowledgements enable row level security;
alter table public.hr_document_progress         enable row level security;
alter table public.hr_incidents                 enable row level security;
alter table public.compliance_requirements      enable row level security;
alter table public.employee_compliance          enable row level security;

drop policy if exists hrdoc_read on public.hr_documents;
create policy hrdoc_read on public.hr_documents for select to authenticated
  using (retired_at is null or public.f_can_read_hr());
drop policy if exists hrsec_read on public.hr_document_sections;
create policy hrsec_read on public.hr_document_sections for select to authenticated using (true);
drop policy if exists hrreq_read on public.compliance_requirements;
create policy hrreq_read on public.compliance_requirements for select to authenticated using (true);
drop policy if exists hrack_self on public.hr_document_acknowledgements;
create policy hrack_self on public.hr_document_acknowledgements for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
drop policy if exists hrack_sign on public.hr_document_acknowledgements;
create policy hrack_sign on public.hr_document_acknowledgements for insert to authenticated
  with check (employee_id = public.f_my_employee_id());
drop policy if exists hrprog_self on public.hr_document_progress;
create policy hrprog_self on public.hr_document_progress for all to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr())
  with check (employee_id = public.f_my_employee_id());
drop policy if exists hrinc_read on public.hr_incidents;
create policy hrinc_read on public.hr_incidents for select to authenticated
  using (reported_by = public.f_my_employee_id()
      or involved_employee = public.f_my_employee_id()
      or public.f_can_read_hr());
drop policy if exists hrinc_report on public.hr_incidents;
create policy hrinc_report on public.hr_incidents for insert to authenticated
  with check (reported_by = public.f_my_employee_id());
drop policy if exists empcomp_self on public.employee_compliance;
create policy empcomp_self on public.employee_compliance for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
drop policy if exists hrda_read on public.hr_document_assignments;
create policy hrda_read on public.hr_document_assignments for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());

grant select on public.hr_documents, public.hr_document_sections,
                public.compliance_requirements, public.v_document_compliance,
                public.employee_compliance, public.hr_document_assignments to authenticated;
grant select, insert on public.hr_document_acknowledgements to authenticated;
grant select, insert, update on public.hr_document_progress to authenticated;
grant select, insert on public.hr_incidents to authenticated;;
