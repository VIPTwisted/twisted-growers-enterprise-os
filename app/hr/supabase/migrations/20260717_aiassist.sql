-- AI HR Assistant backend (real, RPC-only) for src/screens/AiAssist.jsx.
-- The screen previously fabricated its KPI strip from a deterministic seed()
-- (questions today / quality / adoption scores), served hardcoded fallback
-- answers (fake schedule/PTO/training rows, invented phone numbers), a
-- hardcoded 8-article knowledge base, and a fully fake "action items" list
-- with invented employee names. The rewrite reuses EXISTING RPCs for all of
-- that (get_my_home, get_week_schedule, get_pending_requests, get_incidents,
-- get_performance_reviews, get_attendance_overview, get_training_overview,
-- get_employee_manual, get_roster, benefits_my_summary, forensic_callouts,
-- get_my_assigned_documents, get_my_availability).
--
-- The ONLY missing capability is a real question log: it powers the
-- "Questions Today / Answer Rate / Most Asked / Askers This Week" KPIs and
-- the persistent per-person "Recent" history in the chat sidebar.
--
-- Model follows the app's pin_login/anon convention: RLS ON, no anon policy,
-- SECURITY DEFINER RPCs (which bypass RLS) granted to anon + authenticated.
-- Tenant is always derived from the node, never trusted from the client.
-- Column shapes reused from live schema: people(id, full_name, is_active),
-- org_nodes(id, name, tenant_id). Idempotent — safe to re-run.

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Question log
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ai_assist_questions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  node_id     uuid,
  person_id   uuid,
  question    text not null,
  topic       text,
  answered    boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists ai_assist_questions_tenant_idx
  on public.ai_assist_questions(tenant_id, created_at desc);
create index if not exists ai_assist_questions_person_idx
  on public.ai_assist_questions(person_id, created_at desc);
alter table public.ai_assist_questions enable row level security;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Log a question (write)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.log_ai_question(
  p_person_id uuid, p_node_id uuid, p_question text,
  p_topic text default null, p_answered boolean default true
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_tenant uuid; v_id uuid;
begin
  if p_question is null or btrim(p_question) = '' then
    raise exception 'Question text is required';
  end if;
  select tenant_id into v_tenant from org_nodes where id = p_node_id limit 1;
  insert into public.ai_assist_questions(tenant_id, node_id, person_id, question, topic, answered)
  values (v_tenant, p_node_id, p_person_id, left(btrim(p_question), 2000), p_topic, coalesce(p_answered, true))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) My recent questions (read — persistent "Recent" sidebar)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.get_ai_assist_history(p_person_id uuid, p_limit int default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(j), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', q.id,
      'question', q.question,
      'topic', q.topic,
      'answered', q.answered,
      'created_at', to_char(q.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF')
    ) as j
    from ai_assist_questions q
    where q.person_id = p_person_id
    order by q.created_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) s;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Tenant-scoped usage stats (read — KPI strip)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.get_ai_assist_stats(p_node_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_tenant uuid; v_out jsonb;
begin
  select tenant_id into v_tenant from org_nodes where id = any(coalesce(p_node_ids, '{}')) limit 1;
  select jsonb_build_object(
    'questions_today', count(*) filter (where q.created_at::date = current_date),
    'questions_week',  count(*) filter (where q.created_at >= now() - interval '7 days'),
    'askers_week',     count(distinct q.person_id) filter (where q.created_at >= now() - interval '7 days'),
    'answer_rate_pct', case
      when count(*) filter (where q.created_at >= now() - interval '7 days') = 0 then null
      else round(100.0 * count(*) filter (where q.answered and q.created_at >= now() - interval '7 days')
                 / count(*) filter (where q.created_at >= now() - interval '7 days'))
    end,
    'top_topic', (
      select q2.topic from ai_assist_questions q2
      where q2.tenant_id is not distinct from v_tenant
        and q2.topic is not null
        and q2.created_at >= now() - interval '7 days'
      group by q2.topic
      order by count(*) desc, q2.topic
      limit 1
    )
  ) into v_out
  from ai_assist_questions q
  where q.tenant_id is not distinct from v_tenant;
  return coalesce(v_out, jsonb_build_object(
    'questions_today', 0, 'questions_week', 0, 'askers_week', 0,
    'answer_rate_pct', null, 'top_topic', null));
end; $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Grants (app auth = pin_login → anon role)
-- ════════════════════════════════════════════════════════════════════════════
grant execute on function public.log_ai_question(uuid, uuid, text, text, boolean) to anon, authenticated;
grant execute on function public.get_ai_assist_history(uuid, int) to anon, authenticated;
grant execute on function public.get_ai_assist_stats(uuid[]) to anon, authenticated;
