/* THE TWO THINGS THE DOCUMENT SCHEMA DOES NOT ALREADY DO.

   Owner, 9 August 2026: Human Resources must "create employee handbooks, edit,
   track employees progress in reading it, send reminders, messages, create
   documents, memo, forms".

   Most of that exists already and is another agent's work - hr_documents carries
   versions, supersedes_id and requires_signature; hr_document_sections holds the
   body; hr_document_progress records who read which section and for how long;
   hr_document_acknowledgements captures a signature with name, time and IP;
   hr_document_assignments sets who must read it and by when. Handbooks, memos
   and documents are all `kind` on hr_documents. None of that is rebuilt here.

   Two things are genuinely missing:
     1. SENDING. Nothing could send a reminder or a message to anybody.
     2. FORMS THAT COLLECT AN ANSWER. A form can be stored as a document, but a
        document has no fields and no responses, so nothing could be filled in.

   Keys are uuid throughout, matching the tables they point at. The first attempt
   used bigserial and Postgres refused the foreign key - worth stating because a
   type that merely LOOKS right is how a table ends up joined on nothing. */

create table if not exists hr_message (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  drafted_by     text not null default 'agent:human-resources',
  employee_id    uuid,
  audience       text,
  kind           text not null default 'reminder',
  subject        text not null,
  body           text not null,
  about_document uuid references hr_documents(id),
  queue_id       uuid references hr_review_queue(id),
  approved_by    uuid,
  approved_at    timestamptz,
  sent_at        timestamptz,
  read_at        timestamptz,
  cancelled_at   timestamptz,
  cancelled_why  text
);
comment on table hr_message is
  'Reminders, memos and messages to staff. DRAFTED by the agent, APPROVED by a person, then sent - owner ruling 9 Aug 2026 that all Human Resources action requires a human, reminders explicitly included. sent_at is never set by the agent: a message that sent itself would be an action without a person. Cancelled rather than deleted, because a message drafted and pulled is part of the record of what was considered.';
comment on column hr_message.audience is
  'A department or role, when it is not one person. Either this or employee_id, never both - no addressee cannot be sent, and two is ambiguous about who was actually told.';

create index if not exists hr_message_to_send on hr_message (approved_at)
  where sent_at is null and cancelled_at is null and approved_at is not null;

create table if not exists hr_form_field (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references hr_documents(id) on delete cascade,
  ordinal     int not null,
  label       text not null,
  field_type  text not null default 'text'
              check (field_type in ('text','long_text','number','date','yes_no','choice','signature')),
  choices     text[],
  required    boolean not null default false,
  help        text,
  unique (document_id, ordinal)
);
comment on table hr_form_field is
  'The questions on a form. Held apart from the document body so the same form can be reissued and the answers stay attached to the version actually filled in.';

create table if not exists hr_form_response (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references hr_documents(id),
  document_version int,
  employee_id      uuid not null,
  submitted_at     timestamptz not null default now(),
  answers          jsonb not null,
  signature_name   text,
  signed_at        timestamptz,
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  note             text
);
comment on table hr_form_response is
  'What somebody actually answered. document_version is recorded because a form reissued with different wording is a different form, and an answer to the old wording must never be read as an answer to the new.';

create index if not exists hr_form_response_by_doc on hr_form_response (document_id, employee_id);

alter table hr_message       enable row level security;
alter table hr_form_field    enable row level security;
alter table hr_form_response enable row level security;

drop policy if exists hrm_manage on hr_message;
create policy hrm_manage on hr_message for all to authenticated
  using (exists (select 1 from app_users u where u.user_id = (select auth.uid())
                 and u.role in ('owner','executive','hr')))
  with check (exists (select 1 from app_users u where u.user_id = (select auth.uid())
                      and u.role in ('owner','executive','hr')));

drop policy if exists hrff_read on hr_form_field;
create policy hrff_read on hr_form_field for select to authenticated using (true);
drop policy if exists hrff_write on hr_form_field;
create policy hrff_write on hr_form_field for all to authenticated
  using (exists (select 1 from app_users u where u.user_id = (select auth.uid())
                 and u.role in ('owner','executive','hr')))
  with check (exists (select 1 from app_users u where u.user_id = (select auth.uid())
                      and u.role in ('owner','executive','hr')));

drop policy if exists hrfr_own on hr_form_response;
create policy hrfr_own on hr_form_response for all to authenticated
  using (employee_id = (select auth.uid())
         or exists (select 1 from app_users u where u.user_id = (select auth.uid())
                    and u.role in ('owner','executive','hr')))
  with check (employee_id = (select auth.uid())
              or exists (select 1 from app_users u where u.user_id = (select auth.uid())
                         and u.role in ('owner','executive','hr')));

/* Who has not read what, and who has not signed - the question Human Resources
   actually asks, answered without anybody writing a query. */
create or replace view v_hr_document_standing as
select d.id as document_id, d.title, d.kind, d.version, d.requires_signature,
       a.employee_id, a.due_on,
       (ack.signed_at is not null) as signed, ack.signed_at,
       (select count(*) from hr_document_sections s where s.document_id = d.id) as sections,
       (select count(distinct p.section_id) from hr_document_progress p
         where p.document_id = d.id and p.employee_id = a.employee_id) as sections_read,
       case
         when ack.signed_at is not null then 'done'
         when a.due_on is not null and a.due_on < current_date then 'overdue'
         when (select count(distinct p.section_id) from hr_document_progress p
                where p.document_id = d.id and p.employee_id = a.employee_id) = 0 then 'not started'
         else 'in progress'
       end as standing
from hr_documents d
join hr_document_assignments a on a.document_id = d.id
left join hr_document_acknowledgements ack
       on ack.document_id = d.id and ack.employee_id = a.employee_id
      and ack.document_version = d.version
where d.retired_at is null;

comment on view v_hr_document_standing is
  'Who has read what, how far they got, and who has signed. Matched on VERSION: signing last year''s handbook is not signing this year''s, and treating it as such is what makes a signature worthless on the day it is needed.';

grant select on v_hr_document_standing to authenticated;;
