-- OWNER DECISION, 10 August 2026. Asked directly, answered directly: admin and cfo are raised to
-- owner level — executive_all, admin_settings, read_compensation and read_roster.
--
-- This is the first change in this work that EXPANDS access rather than consolidating it, so it
-- is recorded as an approval with a date and an approver rather than left to be inferred from a
-- diff. That is the whole point of moving the role lists into a table: a permission change is now
-- a row with provenance instead of an edit inside a function body.
--
-- CONSEQUENCE THE OWNER WAS TOLD, RECORDED HERE SO IT IS NOT REDISCOVERED LATER. The policies
-- employees.exec_all and employee_rates.exec_all are FOR ALL, not FOR SELECT. So granting
-- executive_all to admin and cfo lets those roles INSERT, UPDATE and DELETE employee records and
-- wage rates, not merely read them. Four roles now hold total control over compensation data.
--
-- The alternative offered and declined was separation of duties: admin keeps system settings and
-- loses pay, cfo keeps pay and loses settings. Declined deliberately. Noted because a future
-- reader — or an auditor — should be able to see that the tighter option was on the table and
-- was considered, rather than assuming nobody thought about it.
--
-- Blast radius today: nil. app_users holds two rows, both already 'owner'. No live account gains
-- anything until someone is assigned admin or cfo.

alter table public.role_capability add column if not exists decided_by  text;
alter table public.role_capability add column if not exists decided_on  date;

comment on column public.role_capability.decided_by is
  'Who approved this row when it differs from the 10 Aug 2026 seed. A blank means the row still '
  'reproduces the legacy predicates and nobody has ruled on it.';

update public.role_capability
   set allowed    = true,
       decided_by = 'owner (Vincent), asked and answered 10 Aug 2026',
       decided_on = current_date,
       note       = 'Raised to owner level by owner decision. Separation of duties was offered '
                 || '(admin keeps settings without pay, cfo keeps pay without settings) and '
                 || 'declined. NOTE: employees.exec_all and employee_rates.exec_all are FOR ALL, '
                 || 'so this grants WRITE to employee records and wage rates, not just read.'
 where role in ('admin','cfo')
   and capability in ('executive_all','admin_settings','read_compensation','read_roster');

-- Verify the decision landed on all eight rows and that nothing else moved.
do $$
declare
  n_admin_cfo int;
  n_others    int;
begin
  select count(*) into n_admin_cfo from role_capability
   where role in ('admin','cfo')
     and capability in ('executive_all','admin_settings','read_compensation','read_roster')
     and allowed;
  if n_admin_cfo <> 8 then
    raise exception 'expected 8 granted rows for admin and cfo, found %', n_admin_cfo;
  end if;

  /* The roles the owner did NOT rule on must be untouched: hr, manager, dept_head and
     assistant_manager still cannot read the roster. Asserted so an unrelated edit cannot ride
     along inside an approved change. */
  select count(*) into n_others from role_capability
   where role in ('hr','manager','dept_head','assistant_manager')
     and capability = 'read_roster' and allowed;
  if n_others <> 0 then
    raise exception 'the roster gap changed without a decision: % roles now hold it', n_others;
  end if;

  raise notice 'admin and cfo raised to owner level; the roster gap is untouched and still open';
end $$;;
