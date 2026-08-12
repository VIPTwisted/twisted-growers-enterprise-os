/* THE BRAIN REMEMBERS, AND A CORRECTION BECOMES PERMANENT.

   Owner: "the brain, second brain and loop always keep this at the most elite
   and advanced mode."

   What it does today: answers well, and forgets completely. Every question
   starts from nothing. Ask the same thing twice and it re-derives it twice; tell
   it that it was wrong and the correction lives exactly as long as the browser
   tab.

   THAT SECOND ONE IS THE EXPENSIVE PART. The most valuable data this company
   produces is the owner saying "those are not our strains and we did not sell
   trim" - a single sentence that overturned $25,027 of misattributed revenue on
   7 Aug 2026. That correction survived only because a person hand-edited four
   files and wrote a build gate to stop them drifting apart. It depended on
   somebody being in the room.

   So: three tables, and the third is the one that matters.

     brain_conversation   what was asked and answered, per person
     brain_fact           what the platform has LEARNED and can reuse
     brain_correction     what a human said was WRONG, and what is true instead

   A correction is not a note. It is a proposal that an owner approves, and once
   approved it travels with every question every assistant answers. The loop from
   "you are wrong" to "no assistant will say that again" stops running through a
   person editing files at midnight. */

create table if not exists brain_conversation (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  user_id      uuid not null default auth.uid(),
  surface      text not null,
  question     text not null,
  answer       text,
  answered_by  text,
  seconds      int,
  seat         text,
  helpful      boolean
);
comment on table brain_conversation is
  'What was asked and answered. Not a transcript for its own sake - it is what lets the assistant say "you asked this on Tuesday and the number was 4,259" instead of re-deriving it, and it is where repeated questions become obvious.';
comment on column brain_conversation.helpful is
  'Null until somebody says. A thumbs-down with no correction attached is a complaint; a thumbs-down WITH one is training.';

create index if not exists brain_conversation_mine on brain_conversation (user_id, at desc);

create table if not exists brain_fact (
  id            bigserial primary key,
  fact_key      text not null unique,
  fact          text not null,
  because       text not null,
  source_sql    text,
  learned_at    timestamptz not null default now(),
  learned_from  text,
  confirmed_by  uuid,
  retired_at    timestamptz,
  retired_why   text
);
comment on table brain_fact is
  'What the platform has learned and may reuse. Every row carries BECAUSE and the query behind it, so a fact can be re-derived rather than trusted. Retired, never deleted - a fact that turned out to be wrong is itself worth remembering.';

create table if not exists brain_correction (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  raised_by     uuid not null default auth.uid(),
  about         text not null,
  was_wrong     text not null,
  what_is_true  text not null,
  evidence      text,
  status        text not null default 'proposed'
                check (status in ('proposed','approved','rejected','retired')),
  decided_by    uuid,
  decided_at    timestamptz,
  decided_why   text
);
comment on table brain_correction is
  'A human said the assistant was wrong. PROPOSED until an owner approves it; once approved it is injected into every answer, so the loop from "you are wrong" to "no assistant will say that again" no longer runs through somebody hand-editing four files at midnight.';
comment on column brain_correction.status is
  'proposed | approved | rejected | retired. Rejected is kept: knowing a correction was considered and refused is worth as much as knowing one was accepted.';

alter table brain_conversation enable row level security;
alter table brain_fact         enable row level security;
alter table brain_correction   enable row level security;

drop policy if exists bc_own on brain_conversation;
create policy bc_own on brain_conversation for all to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from app_users u where u.user_id = (select auth.uid())
                    and u.role in ('owner','executive')))
  with check (user_id = (select auth.uid()));

drop policy if exists bf_read on brain_fact;
create policy bf_read on brain_fact for select to authenticated using (true);
drop policy if exists bf_write on brain_fact;
create policy bf_write on brain_fact for all to authenticated
  using (exists (select 1 from app_users u where u.user_id = (select auth.uid())
                 and u.role in ('owner','executive')))
  with check (exists (select 1 from app_users u where u.user_id = (select auth.uid())
                      and u.role in ('owner','executive')));

/* Anyone may RAISE a correction - the person who spots a wrong answer is usually
   not an owner. Only an owner may approve one. */
drop policy if exists bcorr_read on brain_correction;
create policy bcorr_read on brain_correction for select to authenticated using (true);
drop policy if exists bcorr_raise on brain_correction;
create policy bcorr_raise on brain_correction for insert to authenticated
  with check (raised_by = (select auth.uid()) and status = 'proposed');
drop policy if exists bcorr_decide on brain_correction;
create policy bcorr_decide on brain_correction for update to authenticated
  using (exists (select 1 from app_users u where u.user_id = (select auth.uid())
                 and u.role in ('owner','executive')));;
