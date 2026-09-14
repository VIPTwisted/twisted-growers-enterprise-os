-- Company Policies — real backend for src/screens/Policies.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- Replaces the screen's former seed()/FULL_POLICIES/EMPLOYEES/VERSION_HISTORY/
-- QUIZ_* synthetic catalogs and its localStorage "datastore" (vip_policy_edits,
-- vip_scheduled_policies, vip_published_drafts, vip_policy_comments_*,
-- vip_quiz_results, vip_policy_edit_meta) with real relational tables served
-- through SECURITY DEFINER RPCs. Matches the app's pin_login/anon model:
-- RLS ON, no anon table policies; definer RPCs bypass RLS. Idempotent.
--
-- Live-schema facts (verified against get_roster / handbook_builder migration):
--   people(id uuid, full_name text, is_active bool)   -- NO node_id column
--   assignments(person_id, node_id, role_id, effective_from) -- location lives here
--   org_nodes(id, name, tenant_id)   roles(id, name)
--
-- NOTE: no policy rows are seeded. Tables start empty; HR authors real policies
-- through the Edit / Scheduled tabs (policies_upsert). Screen shows honest
-- empty states until real content exists.

create extension if not exists pgcrypto;

-- ── Tables ───────────────────────────────────────────────────────────────────

-- The policy catalog. One row per policy; also holds drafts + scheduled items.
create table if not exists public.hr_policies (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid,
  category          text not null default 'Employment',
  title             text not null,
  version           text not null default 'v1.0',
  effective_date    date,
  ack_required      boolean not null default false,
  role_level        text not null default 'all',   -- all | keyholder | manager | admin
  content           text not null default '',
  status            text not null default 'published', -- draft | scheduled | published
  release_at        timestamptz,                    -- when status='scheduled'
  change_annotation text,
  source            text,                           -- null | 'import'
  is_active         boolean not null default true,
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  published_at      timestamptz
);
create index if not exists hr_policies_status_idx   on public.hr_policies(status) where is_active;
create index if not exists hr_policies_category_idx on public.hr_policies(category);

-- One acknowledgment per person per policy version.
create table if not exists public.hr_policy_acknowledgments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid,
  node_id         uuid,
  policy_id       uuid not null references public.hr_policies(id) on delete cascade,
  person_id       uuid not null,
  person_name     text,
  version         text not null default 'v1.0',
  acknowledged_at timestamptz not null default now(),
  unique (policy_id, person_id, version)
);
create index if not exists hr_policy_acks_person_idx on public.hr_policy_acknowledgments(person_id);
create index if not exists hr_policy_acks_policy_idx on public.hr_policy_acknowledgments(policy_id);

-- Threaded discussion per policy.
create table if not exists public.hr_policy_comments (
  id          uuid primary key default gen_random_uuid(),
  policy_id   uuid not null references public.hr_policies(id) on delete cascade,
  person_id   uuid,
  author_name text,
  role_name   text,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists hr_policy_comments_policy_idx on public.hr_policy_comments(policy_id);

-- Version history entries (appended when HR publishes a new version).
create table if not exists public.hr_policy_versions (
  id             uuid primary key default gen_random_uuid(),
  policy_id      uuid not null references public.hr_policies(id) on delete cascade,
  version        text not null,
  effective_date date,
  note           text,
  require_re_ack boolean not null default false,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists hr_policy_versions_policy_idx on public.hr_policy_versions(policy_id);

-- Knowledge quizzes attached to a policy.
create table if not exists public.hr_policy_quizzes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid,
  policy_id  uuid references public.hr_policies(id) on delete set null,
  quiz_key   text not null unique,
  label      text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_policy_quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.hr_policy_quizzes(id) on delete cascade,
  ordinal       int not null default 0,
  question      text not null,
  answers       jsonb not null default '[]'::jsonb,
  correct_index int not null default 0
);
create index if not exists hr_policy_quiz_q_quiz_idx on public.hr_policy_quiz_questions(quiz_id);

create table if not exists public.hr_policy_quiz_results (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.hr_policy_quizzes(id) on delete cascade,
  person_id   uuid not null,
  person_name text,
  score       int not null default 0,
  total       int not null default 0,
  passed      boolean not null default false,
  taken_at    timestamptz not null default now(),
  unique (quiz_id, person_id)
);
create index if not exists hr_policy_quiz_res_quiz_idx on public.hr_policy_quiz_results(quiz_id);

alter table public.hr_policies                 enable row level security;
alter table public.hr_policy_acknowledgments   enable row level security;
alter table public.hr_policy_comments          enable row level security;
alter table public.hr_policy_versions          enable row level security;
alter table public.hr_policy_quizzes           enable row level security;
alter table public.hr_policy_quiz_questions    enable row level security;
alter table public.hr_policy_quiz_results      enable row level security;

-- ── Helper: default tenant ───────────────────────────────────────────────────
create or replace function public._policies_tenant()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.org_nodes order by tenant_id limit 1;
$$;

-- ── Reads ────────────────────────────────────────────────────────────────────

-- All active policies (client filters by status per tab).
create or replace function public.policies_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',                p.id,
    'category',          p.category,
    'title',             p.title,
    'version',           p.version,
    'effective_date',    p.effective_date,
    'ack_required',      p.ack_required,
    'role_level',        p.role_level,
    'content',           p.content,
    'status',            p.status,
    'release_at',        p.release_at,
    'change_annotation', p.change_annotation,
    'source',            p.source,
    'created_at',        p.created_at,
    'updated_at',        p.updated_at,
    'published_at',      p.published_at
  ) order by p.category, p.title), '[]'::jsonb)
  from public.hr_policies p
  where p.is_active;
$$;

-- One person's acknowledgments.
create or replace function public.policies_my_acks(p_person_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'policy_id',       policy_id,
    'version',         version,
    'acknowledged_at', acknowledged_at
  )), '[]'::jsonb)
  from public.hr_policy_acknowledgments
  where person_id = p_person_id;
$$;

-- Discussion for one policy (oldest first).
create or replace function public.policies_comments(p_policy_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          id,
    'author_name', author_name,
    'role_name',   role_name,
    'body',        body,
    'created_at',  created_at
  ) order by created_at asc), '[]'::jsonb)
  from public.hr_policy_comments
  where policy_id = p_policy_id;
$$;

-- Team compliance: employees in scope, required policies, and who signed them.
create or replace function public.policies_team_compliance(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  with ppl as (
    select distinct on (p.id)
      p.id                 as person_id,
      p.full_name          as full_name,
      n.name               as location,
      coalesce(r.name,'—') as role
    from people p
    join assignments a on a.person_id = p.id
      and (p_node_ids is null or a.node_id = any(p_node_ids))
    join org_nodes n on n.id = a.node_id
    left join roles r on r.id = a.role_id
    where coalesce(p.is_active, true) = true
    order by p.id, a.effective_from desc nulls last
  ),
  req as (
    select id, title, category, version
    from public.hr_policies
    where is_active and status = 'published' and ack_required
  )
  select jsonb_build_object(
    'employees', coalesce((select jsonb_agg(jsonb_build_object(
        'person_id', person_id, 'name', full_name,
        'location', location, 'role', role) order by full_name) from ppl), '[]'::jsonb),
    'policies', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'category', category) order by title) from req), '[]'::jsonb),
    'acks', coalesce((select jsonb_agg(jsonb_build_object(
        'person_id', k.person_id, 'policy_id', k.policy_id))
      from public.hr_policy_acknowledgments k
      join req on req.id = k.policy_id and req.version = k.version
      where k.person_id in (select person_id from ppl)), '[]'::jsonb)
  );
$$;

-- Per-policy signature summary (current version) scoped to headcount.
create or replace function public.policies_signature_summary(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  with ppl as (
    select distinct p.id as person_id
    from people p
    join assignments a on a.person_id = p.id
      and (p_node_ids is null or a.node_id = any(p_node_ids))
    where coalesce(p.is_active, true) = true
  ),
  total as (select count(*)::int as headcount from ppl)
  select coalesce(jsonb_agg(jsonb_build_object(
    'policy_id',    pol.id,
    'version',      pol.version,
    'signed_count', coalesce(s.signed, 0),
    'headcount',    (select headcount from total)
  )), '[]'::jsonb)
  from public.hr_policies pol
  left join lateral (
    select count(distinct k.person_id)::int as signed
    from public.hr_policy_acknowledgments k
    where k.policy_id = pol.id and k.version = pol.version
      and k.person_id in (select person_id from ppl)
  ) s on true
  where pol.is_active and pol.status = 'published';
$$;

-- Version history for one policy (newest first).
create or replace function public.policies_versions(p_policy_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'version',        version,
    'effective_date', effective_date,
    'note',           note,
    'require_re_ack', require_re_ack,
    'created_at',     created_at
  ) order by created_at desc), '[]'::jsonb)
  from public.hr_policy_versions
  where policy_id = p_policy_id;
$$;

-- All active quizzes with their questions.
create or replace function public.policies_quiz_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'quiz_id',   q.id,
    'policy_id', q.policy_id,
    'quiz_key',  q.quiz_key,
    'label',     q.label,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qq.id, 'ordinal', qq.ordinal, 'question', qq.question,
        'answers', qq.answers, 'correct_index', qq.correct_index) order by qq.ordinal)
      from public.hr_policy_quiz_questions qq where qq.quiz_id = q.id), '[]'::jsonb)
  ) order by q.label), '[]'::jsonb)
  from public.hr_policy_quizzes q
  where q.is_active;
$$;

-- Quiz results (optionally filtered by quiz and/or person).
create or replace function public.policies_quiz_results(
  p_quiz_id uuid default null, p_person_id uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'quiz_id',     quiz_id,
    'person_id',   person_id,
    'person_name', person_name,
    'score',       score,
    'total',       total,
    'passed',      passed,
    'taken_at',    taken_at
  )), '[]'::jsonb)
  from public.hr_policy_quiz_results
  where (p_quiz_id is null or quiz_id = p_quiz_id)
    and (p_person_id is null or person_id = p_person_id);
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────

-- Create or edit a policy (also used for drafts + scheduling).
create or replace function public.policies_upsert(
  p_id uuid default null,
  p_category text default 'Employment',
  p_title text default '',
  p_version text default 'v1.0',
  p_effective date default null,
  p_ack_required boolean default false,
  p_role_level text default 'all',
  p_content text default '',
  p_status text default 'published',
  p_release_at timestamptz default null,
  p_annotation text default null,
  p_source text default null,
  p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tenant uuid; v_status text;
begin
  if coalesce(btrim(p_title), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Title is required');
  end if;
  v_tenant := public._policies_tenant();
  v_status := coalesce(nullif(p_status, ''), 'published');

  if p_id is null then
    insert into public.hr_policies(
      tenant_id, category, title, version, effective_date, ack_required,
      role_level, content, status, release_at, change_annotation, source,
      created_by, updated_by, published_at)
    values (v_tenant, coalesce(nullif(p_category,''),'Employment'), p_title,
      coalesce(nullif(p_version,''),'v1.0'), p_effective, coalesce(p_ack_required,false),
      coalesce(nullif(p_role_level,''),'all'), coalesce(p_content,''), v_status,
      p_release_at, p_annotation, p_source, p_actor, p_actor,
      case when v_status = 'published' then now() else null end)
    returning id into v_id;

    insert into public.hr_policy_versions(policy_id, version, effective_date, note, created_by)
    values (v_id, coalesce(nullif(p_version,''),'v1.0'), p_effective, p_annotation, p_actor);
  else
    update public.hr_policies set
      category          = coalesce(nullif(p_category,''), category),
      title             = p_title,
      version           = coalesce(nullif(p_version,''), version),
      effective_date    = p_effective,
      ack_required      = coalesce(p_ack_required, ack_required),
      role_level        = coalesce(nullif(p_role_level,''), role_level),
      content           = coalesce(p_content, content),
      status            = v_status,
      release_at        = p_release_at,
      change_annotation = p_annotation,
      updated_by        = p_actor,
      updated_at        = now(),
      published_at      = case when v_status = 'published' and published_at is null
                               then now() else published_at end
    where id = p_id and is_active
    returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'error', 'Policy not found');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- Publish a draft/scheduled policy now.
create or replace function public.policies_publish(p_id uuid, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.hr_policies
     set status = 'published', release_at = null,
         published_at = coalesce(published_at, now()),
         updated_by = p_actor, updated_at = now()
   where id = p_id and is_active
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'Policy not found'); end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- Delete a policy (hard delete; acks/comments/versions cascade).
create or replace function public.policies_delete(p_id uuid, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from public.hr_policies where id = p_id;
  return jsonb_build_object('ok', true);
end; $$;

-- Record an acknowledgment.
create or replace function public.policies_acknowledge(
  p_policy_id uuid, p_person_id uuid, p_person_name text default null,
  p_version text default null, p_node_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_ver text; v_id uuid;
begin
  if p_policy_id is null or p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing params');
  end if;
  v_tenant := public._policies_tenant();
  v_ver := coalesce(nullif(p_version,''),
           (select version from public.hr_policies where id = p_policy_id), 'v1.0');
  insert into public.hr_policy_acknowledgments(
    tenant_id, node_id, policy_id, person_id, person_name, version)
  values (v_tenant, p_node_id, p_policy_id, p_person_id, p_person_name, v_ver)
  on conflict (policy_id, person_id, version) do update
    set acknowledged_at = now(), person_name = excluded.person_name
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'version', v_ver);
end; $$;

-- Add a discussion comment.
create or replace function public.policies_add_comment(
  p_policy_id uuid, p_person_id uuid, p_author text, p_role text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_policy_id is null or coalesce(btrim(p_body),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing params');
  end if;
  insert into public.hr_policy_comments(policy_id, person_id, author_name, role_name, body)
  values (p_policy_id, p_person_id, p_author, p_role, btrim(p_body))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- Publish a new version of an existing policy.
create or replace function public.policies_new_version(
  p_policy_id uuid, p_version text, p_effective date default null,
  p_note text default null, p_require_re_ack boolean default false,
  p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_exists boolean;
begin
  if p_policy_id is null or coalesce(btrim(p_version),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing params');
  end if;
  select true into v_exists from public.hr_policies where id = p_policy_id and is_active;
  if v_exists is null then return jsonb_build_object('ok', false, 'error', 'Policy not found'); end if;

  update public.hr_policies
     set version = p_version, effective_date = coalesce(p_effective, effective_date),
         change_annotation = p_note, updated_by = p_actor, updated_at = now()
   where id = p_policy_id;

  insert into public.hr_policy_versions(policy_id, version, effective_date, note, require_re_ack, created_by)
  values (p_policy_id, p_version, p_effective, p_note, coalesce(p_require_re_ack,false), p_actor);
  return jsonb_build_object('ok', true);
end; $$;

-- Create/replace a quiz and its questions.
create or replace function public.policies_quiz_upsert(
  p_quiz_id uuid, p_policy_id uuid, p_key text, p_label text,
  p_questions jsonb, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tenant uuid; q jsonb; i int := 0;
begin
  if coalesce(btrim(p_label),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'Label is required');
  end if;
  v_tenant := public._policies_tenant();
  if p_quiz_id is null then
    insert into public.hr_policy_quizzes(tenant_id, policy_id, quiz_key, label)
    values (v_tenant, p_policy_id,
            coalesce(nullif(p_key,''), 'quiz_' || substr(gen_random_uuid()::text,1,8)), p_label)
    on conflict (quiz_key) do update set label = excluded.label, updated_at = now()
    returning id into v_id;
  else
    update public.hr_policy_quizzes
       set label = p_label, policy_id = coalesce(p_policy_id, policy_id), updated_at = now()
     where id = p_quiz_id
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'Quiz not found'); end if;
  end if;

  if p_questions is not null then
    delete from public.hr_policy_quiz_questions where quiz_id = v_id;
    for q in select * from jsonb_array_elements(p_questions) loop
      insert into public.hr_policy_quiz_questions(quiz_id, ordinal, question, answers, correct_index)
      values (v_id, i, coalesce(q->>'question',''),
              coalesce(q->'answers','[]'::jsonb),
              coalesce((q->>'correct_index')::int, (q->>'correct')::int, 0));
      i := i + 1;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'quiz_id', v_id);
end; $$;

-- Submit quiz answers; scored server-side against stored correct_index.
create or replace function public.policies_quiz_submit(
  p_quiz_id uuid, p_person_id uuid, p_person_name text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_score int := 0; v_total int := 0; v_passed boolean;
begin
  if p_quiz_id is null or p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing params');
  end if;
  select count(*)::int into v_total from public.hr_policy_quiz_questions where quiz_id = p_quiz_id;
  select count(*)::int into v_score
  from public.hr_policy_quiz_questions qq
  where qq.quiz_id = p_quiz_id
    and qq.correct_index = coalesce((p_answers->>(qq.ordinal::text))::int, -1);
  v_passed := (v_total > 0 and v_score = v_total);

  insert into public.hr_policy_quiz_results(quiz_id, person_id, person_name, score, total, passed)
  values (p_quiz_id, p_person_id, p_person_name, v_score, v_total, v_passed)
  on conflict (quiz_id, person_id) do update
    set score = excluded.score, total = excluded.total,
        passed = excluded.passed, person_name = excluded.person_name, taken_at = now();
  return jsonb_build_object('ok', true, 'score', v_score, 'total', v_total, 'passed', v_passed);
end; $$;

-- ── Grants (RPC-only surface; tables stay RLS-locked) ────────────────────────
grant execute on function public._policies_tenant()                                                     to anon, authenticated;
grant execute on function public.policies_list()                                                        to anon, authenticated;
grant execute on function public.policies_my_acks(uuid)                                                 to anon, authenticated;
grant execute on function public.policies_comments(uuid)                                                to anon, authenticated;
grant execute on function public.policies_team_compliance(uuid[])                                       to anon, authenticated;
grant execute on function public.policies_signature_summary(uuid[])                                     to anon, authenticated;
grant execute on function public.policies_versions(uuid)                                                to anon, authenticated;
grant execute on function public.policies_quiz_list()                                                   to anon, authenticated;
grant execute on function public.policies_quiz_results(uuid, uuid)                                       to anon, authenticated;
grant execute on function public.policies_upsert(uuid,text,text,text,date,boolean,text,text,text,timestamptz,text,text,uuid) to anon, authenticated;
grant execute on function public.policies_publish(uuid, uuid)                                            to anon, authenticated;
grant execute on function public.policies_delete(uuid, uuid)                                             to anon, authenticated;
grant execute on function public.policies_acknowledge(uuid, uuid, text, text, uuid)                      to anon, authenticated;
grant execute on function public.policies_add_comment(uuid, uuid, text, text, text)                      to anon, authenticated;
grant execute on function public.policies_new_version(uuid, text, date, text, boolean, uuid)             to anon, authenticated;
grant execute on function public.policies_quiz_upsert(uuid, uuid, text, text, jsonb, uuid)               to anon, authenticated;
grant execute on function public.policies_quiz_submit(uuid, uuid, text, jsonb)                           to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname like 'policies\_%';
