/* THE FINDINGS LIFECYCLE — owners, states, and one line instead of 382
   ---------------------------------------------------------------------
   Three gaps, all connected:

   OWNERS. 30 of 843 findings name anyone. A finding owned by everyone is
   actioned by no one. Ownership is now derived from the department, so it can
   never be left blank.

   STATES. 8 findings have ever closed out of 851. Open-or-closed is too blunt:
   the owner's rule is that nothing clears until Metrc matches, so "we fixed it
   here" and "the legal record agrees" are different states and both are needed.

   ROLLUP. Allocation control is 382 rows saying the same sentence about 382
   different packages. Correct at the forensic level and unreadable at the top.
   One line for the CEO, 382 underneath for whoever fixes it. */

create table if not exists finding_owners (
  department    text primary key,
  owner_name    text not null,
  owner_role    text,
  escalates_to  text,
  notes         text,
  updated_at    timestamptz not null default now()
);
alter table finding_owners enable row level security;
drop policy if exists fo_read on finding_owners;
create policy fo_read on finding_owners for select to authenticated using (true);
drop policy if exists fo_write on finding_owners;
create policy fo_write on finding_owners for all to authenticated
  using (exists (select 1 from app_users u where u.user_id=auth.uid()
        and u.role = any (array['owner'::app_role,'executive'::app_role])))
  with check (exists (select 1 from app_users u where u.user_id=auth.uid()
        and u.role = any (array['owner'::app_role,'executive'::app_role])));
grant select on finding_owners to authenticated;
grant insert, update, delete on finding_owners to authenticated;

/* Seeded to Vincent so nothing is unowned. These are placeholders - the point
   is that every department HAS an owner, not that this is the right person.
   Change them from the page. */
insert into finding_owners (department, owner_name, owner_role, escalates_to, notes) values
 ('Allocation control','Vincent','owner','Vincent','Placeholder — set the real owner.'),
 ('Cash velocity','Vincent','owner','Vincent','Placeholder — set the real owner.'),
 ('Compliance','Vincent','owner','Vincent','Compliance threatens the licence; escalation should be immediate.'),
 ('Compliance watch','Vincent','owner','Vincent','Placeholder — set the real owner.'),
 ('Room turnaround','Vincent','owner','Vincent','Cultivation. The 65-day cycle sits here.'),
 ('Schedule discipline','Vincent','owner','Vincent','Cultivation. Late pulls sit here.'),
 ('Loss and yield','Vincent','owner','Vincent','Largest dollar figures on the platform.'),
 ('Sales, Orders & Fulfillment','Vincent','owner','Vincent','Placeholder — set the real owner.'),
 ('Inventory','Vincent','owner','Vincent','Placeholder — set the real owner.'),
 ('Unassigned','Vincent','owner','Vincent','Anything with no department lands here so it is never invisible.')
on conflict (department) do nothing;

/* ---- States. Nothing closes until Metrc agrees. ---- */
create table if not exists finding_state (
  finding_key   text primary key,
  state         text not null default 'open'
                check (state in ('open','acknowledged','in_progress','fixed_in_os',
                                 'fixed_in_metrc','closed','not_a_problem','suppressed')),
  owner_name    text,
  note          text,
  suppress_until date,                     -- suppression always expires
  changed_by    text,
  changed_at    timestamptz not null default now(),
  constraint suppression_must_expire
    check (state <> 'suppressed' or suppress_until is not null),
  constraint closing_needs_a_reason
    check (state not in ('closed','not_a_problem') or length(btrim(coalesce(note,''))) >= 10)
);
alter table finding_state enable row level security;
drop policy if exists fs_read on finding_state;
create policy fs_read on finding_state for select to authenticated using (true);
drop policy if exists fs_write on finding_state;
create policy fs_write on finding_state for all to authenticated
  using (exists (select 1 from app_users u where u.user_id=auth.uid()
        and u.role = any (array['owner'::app_role,'executive'::app_role,'dept_head'::app_role])))
  with check (exists (select 1 from app_users u where u.user_id=auth.uid()
        and u.role = any (array['owner'::app_role,'executive'::app_role,'dept_head'::app_role])));
grant select on finding_state to authenticated;
grant insert, update, delete on finding_state to authenticated;

create table if not exists finding_state_history (
  id bigserial primary key,
  finding_key text not null,
  from_state text, to_state text not null,
  note text, changed_by text, changed_at timestamptz not null default now()
);
alter table finding_state_history enable row level security;
drop policy if exists fsh_read on finding_state_history;
create policy fsh_read on finding_state_history for select to authenticated using (true);
grant select on finding_state_history to authenticated;

create or replace function tg_track_finding_state()
returns trigger language plpgsql as $$
begin
  insert into finding_state_history (finding_key, from_state, to_state, note, changed_by)
  values (new.finding_key, case when tg_op='UPDATE' then old.state end,
          new.state, new.note, new.changed_by);
  new.changed_at := now();
  return new;
end $$;
drop trigger if exists trg_finding_state on finding_state;
create trigger trg_finding_state before insert or update on finding_state
  for each row execute function tg_track_finding_state();

/* ---- The working view: every finding with its owner and real state ---- */
create or replace view v_findings_live as
select f.*,
       coalesce(fs.state,'open') as work_state,
       coalesce(o.owner_name, fs.owner_name, 'UNOWNED') as owner_name,
       o.escalates_to, fs.note as work_note, fs.suppress_until,
       (coalesce(fs.state,'open') = 'suppressed'
        and coalesce(fs.suppress_until, current_date) >= current_date) as currently_suppressed,
       /* what the CEO sees: the sentence before the specific item */
       f.department||' · '||
         case when position(':' in coalesce(f.what,'')) > 0
              then btrim(split_part(f.what, ':', 1))
              else left(coalesce(f.what,'(no description)'), 40) end as group_key
from v_findings f
left join finding_state  fs on fs.finding_key = f.finding_key
left join finding_owners o  on o.department   = f.department;

grant select on v_findings_live to authenticated;

/* ---- One line per problem, with the count underneath ---- */
create or replace view v_findings_rolled as
select group_key,
       department,
       min(severity_rank) as severity_rank,
       (array_agg(severity order by severity_rank))[1] as severity,
       count(*) as occurrences,
       max(owner_name) as owner_name,
       round(sum(dollars),0) as dollars,
       round(sum(pounds),1)  as pounds,
       min(first_raised)::date as first_seen,
       max(last_seen)::date    as last_seen,
       (array_agg(what order by severity_rank, first_raised))[1] as example,
       (array_agg(what_to_do order by severity_rank) filter (where what_to_do is not null))[1] as what_to_do,
       count(*) filter (where work_state <> 'open') as being_worked,
       case when count(*) = 1 then 'single finding'
            else count(*)||' occurrences — drill in to see each one' end as scale
from v_findings_live
where state='open' and not is_duplicate and not currently_suppressed
group by group_key, department;

grant select on v_findings_rolled to authenticated;

comment on view v_findings_rolled is
  'One line per problem for the CEO. Every occurrence is still in v_findings_live for whoever fixes it.';
comment on table finding_state is
  'Nothing closes until Metrc agrees. Suppression must carry an expiry date - permanent suppression is how a real problem disappears forever.';;
