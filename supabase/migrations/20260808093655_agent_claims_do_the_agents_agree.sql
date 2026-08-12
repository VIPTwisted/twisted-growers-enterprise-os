-- DO THE AGENTS AGREE? Owner, 8 Aug 2026.
--
-- The double-check design only pays if disagreement SURFACES. On the night of
-- 7-8 Aug five agents plus the Inspector produced findings, and several
-- contradicted each other AND contradicted Agent D. Nothing recorded that.
-- Without this table the contradictions live only in chat transcripts and are lost.
--
-- One row per CLAIM: an agent, a subject, a number, and the query or document that
-- produced it. Two agents claiming different numbers for the SAME subject is a
-- disagreement, and the house rule is absolute: report both, never average, never
-- pick silently. The disagreement IS the finding.
--
-- UNDO: drop view v_agent_agreement; drop table agent_claims;

create table if not exists public.agent_claims (
  id            bigserial primary key,
  subject       text not null,          -- the question, identical wording across agents
  agent         text not null,          -- who claimed it
  claimed_value numeric,                -- the number
  claimed_text  text,                   -- or the statement, when not numeric
  how_derived   text not null,          -- the query, file or method. No claim without one.
  proof_sql     text,                   -- re-derivable now, where possible
  live_value    numeric,                -- filled by tg_check_agent_claims()
  status        text,                   -- CONFIRMED / REFUTED / UNVERIFIABLE
  claimed_at    timestamptz not null default now(),
  checked_at    timestamptz
);

alter table public.agent_claims enable row level security;
drop policy if exists agent_claims_read on public.agent_claims;
create policy agent_claims_read on public.agent_claims for select to authenticated using (true);

comment on table public.agent_claims is
  'Every factual claim an agent makes, with how it was derived. Two agents claiming '
  'different numbers for the same subject is a DISAGREEMENT and must be reported as '
  'both figures, never averaged and never silently resolved. how_derived is NOT NULL '
  'on purpose: a claim without a method is an opinion.';

create or replace function public.tg_check_agent_claims()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v numeric; n integer := 0;
begin
  for r in select * from agent_claims where proof_sql is not null loop
    begin execute r.proof_sql into v; exception when others then v := null; end;
    update agent_claims
       set live_value = v, checked_at = now(),
           status = case when v is null then 'UNVERIFIABLE'
                         when claimed_value is null then 'UNVERIFIABLE'
                         when abs(v - claimed_value) < 0.005 then 'CONFIRMED'
                         else 'REFUTED' end
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace view public.v_agent_agreement as
with by_subject as (
  select subject,
         count(*)                                    as claims,
         count(distinct agent)                       as agents,
         count(distinct claimed_value)               as distinct_values,
         min(claimed_value)                          as lowest,
         max(claimed_value)                          as highest,
         max(live_value)                             as live_now,
         string_agg(distinct agent || ' says ' ||
                    coalesce(claimed_value::text, claimed_text, '?'), '  |  '
                    order by agent || ' says ' || coalesce(claimed_value::text, claimed_text, '?')) as positions,
         string_agg(distinct status, ', ')           as verdicts
  from agent_claims group by subject
)
select subject,
       agents, claims, positions,
       lowest, highest,
       case when highest is not null and lowest is not null and lowest <> 0
            then round(abs(highest - lowest) / abs(lowest) * 100, 1) end as pct_apart,
       live_now,
       verdicts,
       case
         when agents < 2                    then 'UNCORROBORATED - only one agent has looked at this'
         when distinct_values <= 1          then 'AGREED - every agent reached the same number'
         else 'DISAGREE - ' || distinct_values || ' different answers from ' || agents || ' agents'
       end                                  as agreement,
       case when distinct_values > 1
            then 'THE ISSUE: agents disagree on the same question. Report BOTH figures with both methods. Never average, never pick silently - the disagreement IS the finding.'
       end                                  as what_is_wrong
from by_subject;

comment on view public.v_agent_agreement is
  'Do the agents agree? One row per question. AGREED means every agent reached the '
  'same number independently. DISAGREE means they did not, and both figures must be '
  'reported. UNCORROBORATED means only one agent has looked - which is not agreement, '
  'it is an unchecked claim.';;
