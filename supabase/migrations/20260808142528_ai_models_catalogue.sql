/* MODELS ARE DATA. Owner, 8 August 2026: "we get to select what model we use",
   "make sure all models are available even new ones as they get released".

   The choice was a hardcoded array in budz.jsx. Anthropic releases a model and
   the platform cannot offer it until somebody edits JavaScript, runs the gates
   and deploys - so the list is guaranteed to be out of date, and the day it
   matters is the day nobody has time. A row here and it appears in every picker
   on the next page load: the assistant page, the company default, and the
   desktop bridge all read the same table.

   `bridge_alias` exists because Claude Code on the desktop takes short names -
   opus, sonnet, haiku - while the API takes full identifiers. Same row, two
   names, so a person picks "Opus 5" once and both paths understand it. */
create table if not exists ai_models (
  id            text primary key,
  label         text not null,
  provider      text not null default 'anthropic',
  bridge_alias  text,
  why           text not null,
  speed         text not null default 'balanced',
  enabled       boolean not null default true,
  sort_order    int not null default 100,
  added_at      timestamptz not null default now()
);

comment on table ai_models is
  'Every model a person may choose. Owner ruling 8 Aug 2026: new models must appear WITHOUT a deploy - insert a row and every picker offers it. id is the API identifier; bridge_alias is the short name Claude Code takes on the desktop.';
comment on column ai_models.speed is
  'fastest | balanced | deepest. Shown so somebody choosing knows what they are trading, rather than guessing from the name.';

insert into ai_models (id, label, bridge_alias, why, speed, sort_order) values
  ('claude-opus-5', 'Claude Opus 5', 'opus',
   'The most capable. Use it when the answer matters more than the wait.', 'deepest', 10),
  ('claude-sonnet-5', 'Claude Sonnet 5', 'sonnet',
   'Strong and much faster. The right default for almost everything here.', 'balanced', 20),
  ('claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 'haiku',
   'Fastest. Short factual questions and lookups.', 'fastest', 30),
  ('claude-fable-5', 'Claude Fable 5', 'fable',
   'Writing and long-form drafting.', 'balanced', 40)
on conflict (id) do update
  set label = excluded.label, bridge_alias = excluded.bridge_alias,
      why = excluded.why, speed = excluded.speed, sort_order = excluded.sort_order;

alter table ai_models enable row level security;
drop policy if exists aim_read on ai_models;
create policy aim_read on ai_models for select to authenticated using (true);
drop policy if exists aim_write on ai_models;
create policy aim_write on ai_models for all to authenticated
  using (exists (select 1 from app_users u
                 where u.user_id = (select auth.uid()) and u.role in ('owner','executive')))
  with check (exists (select 1 from app_users u
                      where u.user_id = (select auth.uid()) and u.role in ('owner','executive')));

/* The bridge needs to be TOLD which model to run, or a person's choice stops at
   the browser and the desktop quietly runs whatever it defaults to - a setting
   that appears to work and changes nothing. */
alter table ai_bridge_jobs add column if not exists model text;
comment on column ai_bridge_jobs.model is
  'Short alias for Claude Code on the desktop (opus | sonnet | haiku), resolved from ai_models for whoever asked. Null means the bridge picks its own default.';

/* Resolve a person's choice all the way to the name the desktop understands. */
create or replace function f_bridge_model_for(p_user uuid)
returns text language sql stable as $$
  select coalesce(
    (select m.bridge_alias from ai_user_access a
       join ai_models m on m.id = a.preferred_model
      where a.user_id = p_user and m.enabled),
    (select m.bridge_alias from ai_settings s
       join ai_models m on m.id = s.model
      where m.enabled limit 1),
    'sonnet');
$$;

comment on function f_bridge_model_for is
  'The model the desktop bridge should run for this person: their own choice, then the company default, then sonnet. Returns the short alias Claude Code takes.';;
