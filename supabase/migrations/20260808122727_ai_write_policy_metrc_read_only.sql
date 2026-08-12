/* WHAT BUDZ MAY WRITE, AND WHERE. Owner ruling, 8 August 2026:
   "for now do not approve any write to Metrc only to quickbooks, apex and this
   platform all other platform exclude metrc. Whatever he would write user must
   do so manually he will give step by step instructions how to and what to do
   and explain. any writes must be approved by user for all others where it is
   permitted", and "must ask for permissions each time or for session".

   Policy lives in DATA, not in a paragraph somebody has to remember. A decision
   recorded is not a decision implemented - the whole point of this table is that
   the action layer has to ASK it, and the build gate proves no AI runtime can
   reach Metrc's write endpoints regardless of what any prompt says. */
create table if not exists ai_write_policy (
  system              text primary key,
  label               text not null,
  writes_allowed      boolean not null,
  requires_approval   boolean not null default true,
  manual_only         boolean not null default false,
  why                 text not null,
  updated_at          timestamptz not null default now()
);

comment on table ai_write_policy is
  'Owner ruling 8 Aug 2026. Metrc is READ ONLY to the assistant - it explains the steps and the person performs them. Every other system may be written to, and every write needs the user''s approval, once or for the session.';
comment on column ai_write_policy.manual_only is
  'True means the assistant must never perform the write itself. It produces step-by-step instructions and explains them; the person carries them out in the real system.';

insert into ai_write_policy (system, label, writes_allowed, requires_approval, manual_only, why) values
  ('metrc', 'Metrc (seed to sale)', false, true, true,
   'Owner ruling 8 Aug 2026: no assistant writes to Metrc. It is the regulator''s record, visible to the CCC, and a wrong entry is hard to reverse and reportable. The assistant explains exactly what to do, step by step, and the person does it.'),
  ('quickbooks', 'QuickBooks', true, true, false,
   'Permitted with the user''s approval on each action, or for the session.'),
  ('apex', 'Apex', true, true, false,
   'Permitted with the user''s approval on each action, or for the session.'),
  ('platform', 'Twisted Growers Enterprise OS', true, true, false,
   'Permitted with the user''s approval. The assistant acts as the SIGNED-IN USER, never with service-role rights, so it can never do anything that person could not do themselves.')
on conflict (system) do update
  set label = excluded.label, writes_allowed = excluded.writes_allowed,
      requires_approval = excluded.requires_approval, manual_only = excluded.manual_only,
      why = excluded.why, updated_at = now();

alter table ai_write_policy enable row level security;
drop policy if exists awp_read on ai_write_policy;
create policy awp_read on ai_write_policy for select using (true);
drop policy if exists awp_write on ai_write_policy;
create policy awp_write on ai_write_policy for all
  using (exists (select 1 from app_users u
                 where u.user_id = (select auth.uid()) and u.role in ('owner','executive')))
  with check (exists (select 1 from app_users u
                      where u.user_id = (select auth.uid()) and u.role in ('owner','executive')));

/* A GRANT, not a setting. "each time or for session" - once means no row is
   written at all; for the session writes one row that dies with the session. */
create table if not exists ai_write_approval (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  system      text not null references ai_write_policy(system),
  action      text,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);
create index if not exists ai_write_approval_live
  on ai_write_approval (user_id, system) where revoked_at is null;

comment on table ai_write_approval is
  'Session-scoped permission. A null action covers every action in that system for the session; a named action covers only that one. Nothing here can grant what ai_write_policy forbids.';

alter table ai_write_approval enable row level security;
drop policy if exists awa_own on ai_write_approval;
create policy awa_own on ai_write_approval for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

/* EVERY action, proposed or performed, lands here. An assistant nobody can
   audit is a liability at scale, and this platform has already shipped
   confident wrong findings that took a day to unpick. */
create table if not exists ai_action_log (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  user_id       uuid,
  system        text,
  action        text not null,
  payload       jsonb,
  outcome       text not null,
  approval      text,
  error         text
);
comment on column ai_action_log.outcome is
  'proposed | approved | performed | refused_by_policy | manual_instructions_given | failed';

alter table ai_action_log enable row level security;
drop policy if exists aal_read on ai_action_log;
create policy aal_read on ai_action_log for select
  using (user_id = (select auth.uid())
         or exists (select 1 from app_users u
                    where u.user_id = (select auth.uid()) and u.role in ('owner','executive')));;
