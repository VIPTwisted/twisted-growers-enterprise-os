-- The Metrc employee record carries far more than the sync was unpacking:
-- two email addresses, badge expiry, hire date, role flags and last login.
-- All of it was already landing in raw jsonb and being thrown away.

alter table public.metrc_employees
  add column if not exists last_name        text,
  add column if not exists first_name       text,
  add column if not exists notification_email text,
  add column if not exists login_email      text,
  add column if not exists employee_role    text,
  add column if not exists license_status   text,
  add column if not exists license_type     text,
  add column if not exists granted_on       date,
  add column if not exists expires_on       date,
  add column if not exists hired_on         date,
  add column if not exists home_page        text,
  add column if not exists is_owner         boolean,
  add column if not exists is_manager       boolean,
  add column if not exists is_financial     boolean,
  add column if not exists has_access       boolean,
  add column if not exists is_locked        boolean,
  add column if not exists last_login_at    timestamptz;

create unique index if not exists metrc_employees_lic_key
  on public.metrc_employees(employee_license) where employee_license is not null;

comment on table public.metrc_employees is
  'Mirror of Metrc /employees. Carries the agent licence number, badge expiry and '
  'the login email — the only authoritative source for all three. The sync worker '
  'previously stored only full_name and licence and dropped the rest into raw.';

-- Work email on the employee record itself, sourced from Metrc.
alter table public.employees
  add column if not exists email text,
  add column if not exists metrc_license_status text;

create unique index if not exists employees_email_key
  on public.employees(lower(email)) where email is not null;

comment on column public.employees.email is
  'Login and account email, sourced from Metrc. This is what invites are sent to.';;
