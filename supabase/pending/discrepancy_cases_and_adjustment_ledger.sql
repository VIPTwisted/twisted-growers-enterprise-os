/* DISCREPANCY CASES, AND A JOURNAL THAT CANNOT MOVE A NUMBER.
   Owner ticket, 29 August 2026. NOT APPLIED — draft, held.

   ─────────────────────────────────────────────────────────────────────────────
   WHY A NEW TABLE, WHEN THIS PLATFORM HAS FOUR TASK-SHAPED THINGS ALREADY.
   Measured before writing a line of it:

     tasks             0 rows   — tg_assign_from_tile writes here; never used
     agent_findings    2,164    — what an AGENT noticed
     finding_state     16,813   — the state machine over those findings
     clickup_tasks     63       — a READ-ONLY mirror, last synced 9 Aug 2026

   None of them is a case. agent_findings is what a machine saw, finding_state
   is how we routed it, tasks is a to-do. A CASE is the thing in between and it
   is the thing nobody has: a person saying "these two named systems disagree
   about this subject, here are both figures, I own it, here is how it ended."
   It cites a finding rather than replacing one.

   A case holds BOTH figures and NAMES THE SYSTEM OF RECORD for each. That is
   the point: Apex is the invoice book, Metrc is custody, and a discrepancy is a
   sentence about two named sources. A case recording one number would be a note.

   ─────────────────────────────────────────────────────────────────────────────
   THE JOURNAL RECORDS A DECISION. IT POSTS NOTHING, AND IT IS APPEND-ONLY.

   Owner: "No journal that changes Metrc or Apex numbers. CFO or CEO only,
   append-only, refuses otherwise."

   This platform is a read-only mirror of Metrc and holds no Apex or QBO write
   credential, so an entry here can only ever be OUR RECORD OF WHAT WE BELIEVE.
   That is not left to good intentions — it is enforced three ways:

     1. `posts_to` is pinned to 'nothing' by CHECK, so a later migration that
        tries to repoint it at Metrc or Apex fails loudly instead of changing
        behaviour quietly.
     2. UPDATE and DELETE raise from a trigger, which holds even for a role that
        bypasses RLS. A ledger you can edit is not a ledger. A decision is
        superseded by APPENDING a reversal, never by rewriting history.
     3. The data_assertion below fails if ANY view ever comes to depend on this
        table — which is exactly how a decision record quietly becomes an input
        to a published figure. Zero dependents at registration, verified.

   The third is the real guard. A table nobody reads cannot move a number; the
   moment something reads it, the assertion says so within the hour (P14).

   CFO AND CEO ONLY, read and write, with roles read from app_users exactly as
   metrc_report_unmapped already does it. There is no 'ceo' member of app_role —
   the CEO is 'owner', with 'executive' beside it. Stated here rather than left
   for the next reader to discover.

   ─────────────────────────────────────────────────────────────────────────────
   CLICKUP IS A SEAM, NOT A PROMISE. Measured: app_secrets holds
   ALERT_EMAIL_API_KEY (set) and ANTHROPIC_API_KEY (not set). There is NO
   ClickUp token, no ClickUp edge function, and clickup_tasks is a read-only
   mirror that last synced 9 August. So clickup_task_id is nullable and stays
   NULL; nothing here calls ClickUp. A case with no task says so, which is P11.
*/

create table if not exists public.discrepancy_case (
  case_id              bigint generated always as identity primary key,

  /* WHAT DISAGREES. subject_kind is closed deliberately: a case must be about
     something the platform can open again later, not free text. */
  subject_kind         text not null
                       check (subject_kind in ('apex_order_exception',
                                               'apex_sales_strip',
                                               'plant_mirror_room')),
  subject_key          text not null,
  subject_licence      text,
  headline             text not null,

  /* BOTH FIGURES, EACH WITH ITS SYSTEM OF RECORD. Nullable because a case is
     often opened precisely because one side has no figure — and a missing
     figure is the finding, not a zero. */
  our_figure           numeric,
  our_unit             text,
  our_source           text,
  their_figure         numeric,
  their_unit           text,
  their_source         text,

  /* THE OWNER'S NINE STATES, VERBATIM. Closed set: a state nobody defined is a
     state nobody can report on. */
  state                text not null default 'OPEN'
                       check (state in ('OPEN', 'ASSIGNED', 'EVIDENCE',
                                        'CFO_REVIEW', 'CEO_REVIEW', 'RESOLVED',
                                        'ESCALATED', 'ADJUSTED', 'WONT_FIX')),

  opened_at            timestamptz not null default now(),
  opened_by            uuid,
  assignee_employee_id uuid references public.employees(id),
  due_on               date,

  /* The link, never the creation. See the header. */
  clickup_task_id      text,
  clickup_linked_at    timestamptz,

  closed_at            timestamptz,
  closed_by            uuid,
  closure_note         text,

  /* A case cited from an agent finding keeps the thread rather than starting a
     parallel one. */
  finding_key          text,

  /* An ending has to say why. RESOLVED, WONT_FIX and ADJUSTED are endings; the
     other six are not. */
  constraint discrepancy_case_ending_says_why
    check (state not in ('RESOLVED', 'WONT_FIX', 'ADJUSTED')
           or (closed_at is not null and closure_note is not null)),
  constraint discrepancy_case_assigned_has_an_assignee
    check (state <> 'ASSIGNED' or assignee_employee_id is not null),
  constraint discrepancy_case_clickup_link_is_dated
    check ((clickup_task_id is null) = (clickup_linked_at is null))
);

comment on table public.discrepancy_case is
'A person''s record that two named systems disagree about one subject. Holds BOTH figures and names the system of record for each; Apex is the invoice book, Metrc is custody. Cites an agent finding rather than replacing one. Writes nothing to Metrc, Apex or QBO — this platform holds no write credential for any of them.';

create index if not exists discrepancy_case_open_idx
  on public.discrepancy_case (state, opened_at desc)
  where state not in ('RESOLVED', 'WONT_FIX', 'ADJUSTED');
create index if not exists discrepancy_case_subject_idx
  on public.discrepancy_case (subject_kind, subject_key);

alter table public.discrepancy_case enable row level security;

/* Anyone signed in may SEE a case — a discrepancy nobody can read is a
   discrepancy nobody fixes. Opening and editing belongs to the roles that own
   the books. */
drop policy if exists dc_read on public.discrepancy_case;
create policy dc_read on public.discrepancy_case
  for select using (auth.uid() is not null);

drop policy if exists dc_write on public.discrepancy_case;
create policy dc_write on public.discrepancy_case
  for all using (exists (
    select 1 from public.app_users u
    where u.user_id = (select auth.uid())
      and u.role::text = any (array['owner', 'executive', 'cfo', 'admin'])))
  with check (exists (
    select 1 from public.app_users u
    where u.user_id = (select auth.uid())
      and u.role::text = any (array['owner', 'executive', 'cfo', 'admin'])));


create table if not exists public.adjustment_ledger (
  entry_id       bigint generated always as identity primary key,
  case_id        bigint not null references public.discrepancy_case(case_id) on delete restrict,

  /* An entry is one of these and nothing else. A decision is superseded by
     appending REVERSAL, never by editing the entry that was wrong. */
  entry_kind     text not null check (entry_kind in ('PROPOSED', 'APPROVED', 'REVERSAL')),
  reverses_entry bigint references public.adjustment_ledger(entry_id),

  amount         numeric not null,
  unit           text not null,
  basis          text not null,

  /* THE QUARANTINE, WRITTEN INTO THE COLUMN. */
  posts_to       text not null default 'nothing' check (posts_to = 'nothing'),

  entered_by     uuid not null default auth.uid(),
  entered_at     timestamptz not null default now(),

  constraint adjustment_ledger_reversal_names_its_target
    check ((entry_kind = 'REVERSAL') = (reverses_entry is not null))
);

comment on table public.adjustment_ledger is
'Append-only journal of what the CFO or CEO decided about a discrepancy case. RECORDS A DECISION AND POSTS NOTHING: posts_to is pinned to ''nothing'' by CHECK, UPDATE and DELETE raise from a trigger even for a role that bypasses RLS, and the data_assertion adjustment_ledger.feeds_no_published_figure fails if any view ever comes to depend on it. A wrong entry is corrected by appending a REVERSAL, never by rewriting it.';

create index if not exists adjustment_ledger_case_idx
  on public.adjustment_ledger (case_id, entered_at);

alter table public.adjustment_ledger enable row level security;

/* CFO AND CEO ONLY, and read as well as write: unlike a case, the money
   decision is not for general viewing. 'owner' is the CEO. */
drop policy if exists adj_read on public.adjustment_ledger;
create policy adj_read on public.adjustment_ledger
  for select using (exists (
    select 1 from public.app_users u
    where u.user_id = (select auth.uid())
      and u.role::text = any (array['owner', 'executive', 'cfo'])));

/* INSERT ONLY. No UPDATE policy and no DELETE policy exist, so RLS denies both
   outright for every ordinary caller. The trigger below covers the roles that
   bypass RLS. */
drop policy if exists adj_append on public.adjustment_ledger;
create policy adj_append on public.adjustment_ledger
  for insert with check (exists (
    select 1 from public.app_users u
    where u.user_id = (select auth.uid())
      and u.role::text = any (array['owner', 'executive', 'cfo'])));

create or replace function public.tg_adjustment_ledger_is_append_only()
returns trigger language plpgsql as $$
begin
  raise exception
    'adjustment_ledger is append-only. % refused. Correct a wrong entry by appending a REVERSAL that names it; rewriting a decision destroys the record of what was decided and when.',
    tg_op;
end $$;

drop trigger if exists adjustment_ledger_no_rewrite on public.adjustment_ledger;
create trigger adjustment_ledger_no_rewrite
  before update or delete on public.adjustment_ledger
  for each row execute function public.tg_adjustment_ledger_is_append_only();


/* ─── THE GUARD THAT MAKES THE QUARANTINE REAL ─────────────────────────────
   A CHECK on posts_to stops a column being repointed. It does NOT stop someone
   writing `create view v_true_cogs as select ... from adjustment_ledger`, which
   is exactly how a decision record becomes an input to a published number. */
do $$
declare
  k_key constant text := 'adjustment_ledger.feeds_no_published_figure';
  k_sql constant text := $q$
    select dependent.relname::text as subject,
           format('%s reads adjustment_ledger. That table records a decision and posts nothing: this platform holds no write credential for Metrc, Apex or QBO, and a published figure depending on it would be our own opinion presented as a measurement.',
                  dependent.relname) as detail
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
    join pg_class dependent on dependent.oid = r.ev_class
    join pg_class source on source.oid = d.refobjid
    where source.relname = 'adjustment_ledger'
      and dependent.relname <> 'adjustment_ledger'
  $q$;
  v_live int;
begin
  execute format('select count(*) from (%s) x', k_sql) into v_live;
  if v_live <> 0 then
    raise exception 'adjustment_ledger already has % dependent(s) before the guard is registered. Rolling back.', v_live;
  end if;

  insert into public.data_assertion (
    assertion_key, title, domain, severity, violation_sql, max_allowed,
    fixture_shadows, fixture_positive_case, fixture_negative_case,
    fixture_proven_at, fixture_last_result, fixture_positive_min_rows,
    what_it_proves, why_it_matters, enabled, owner_agent, added_by, accountable_to)
  values (
    k_key,
    'A published view has come to depend on the adjustment ledger',
    'finance', 'critical', k_sql, 0,
    array['adjustment_ledger'],
    'A view created over adjustment_ledger returns one row naming that view.',
    'No view depends on it, which is the state this table ships in and the state verified at registration.',
    now(), 'proved against live: zero dependents', 1,
    'That the adjustment ledger stays a record of a decision and never becomes an input to a figure this platform publishes.',
    'Owner ruling 29 Aug 2026: no journal that changes Metrc or Apex numbers. A CHECK on posts_to stops a column being repointed and a trigger stops the rows being rewritten; neither stops somebody selecting from this table into a money view. This watches for exactly that.',
    true, 'Agent W', 'Agent I (Database COO)', 'Owner');

  raise notice 'discrepancy_case and adjustment_ledger created; % dependent(s) on the ledger.', v_live;
end $$;
