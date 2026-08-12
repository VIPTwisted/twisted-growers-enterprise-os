-- THE TRAINING MUST CHECK ITSELF. Owner, 7 Aug 2026: "train agents to address
-- these issues in future."
--
-- WHAT WENT WRONG. On 7 Aug I wrote two statements into brain/AGENT_BRIEFING.md -
-- the file the SessionStart hook prints VERBATIM to every agent - and both were
-- false within two hours:
--   "coa_extract does NOT hold the client/licence ... open the PDF yourself"
--        -> 980 of 983 now hold it. An agent following that would have hand-opened
--           PDFs for an answer already in the database.
--   "1,919 tested packages have no certificate fetched"
--        -> coverage is 2,088 packages.
--
-- A briefing that lies to agents is WORSE than no briefing, because it is trusted.
-- And it is the meta-trap in its purest form: I recorded a fact and nothing enforced
-- that it stayed true.
--
-- SO: every NUMBER in the brain is a CLAIM, and a claim carries the query that
-- proves it. tg_check_brain_claims() re-derives them all and raises a finding on
-- drift. The training is now falsifiable.
--
-- UNDO: drop function tg_check_brain_claims(); drop table brain_claims;

create table if not exists public.brain_claims (
  claim_key     text primary key,
  brain_file    text not null,
  claim_text    text not null,          -- what the document asserts, in words
  written_value numeric,                -- the number as written
  proof_sql     text not null,          -- re-derives it from the live system
  tolerance_pct numeric not null default 0,
  severity      text not null default 'elevated',
  last_checked  timestamptz,
  last_value    numeric,
  drifted       boolean,
  added_on      timestamptz not null default now()
);

alter table public.brain_claims enable row level security;
drop policy if exists brain_claims_read on public.brain_claims;
create policy brain_claims_read on public.brain_claims for select to authenticated using (true);

comment on table public.brain_claims is
  'Every NUMBER asserted in the brain, paired with the query that proves it. The '
  'SessionStart hook prints brain/AGENT_BRIEFING.md verbatim to every agent, so a '
  'stale figure there is not a documentation problem - it is wrong training, '
  'trusted. Two claims written on 7 Aug 2026 were false within two hours. A rule '
  'with no check expires; this is the check.';
comment on column public.brain_claims.proof_sql is
  'Must return exactly ONE numeric value. Re-derived by tg_check_brain_claims().';

create or replace function public.tg_check_brain_claims()
returns table (claim_key text, brain_file text, written numeric, live numeric, drifted boolean)
language plpgsql security definer set search_path = public as $$
declare r record; v numeric; drift boolean;
begin
  for r in select * from brain_claims loop
    begin
      execute r.proof_sql into v;
    exception when others then
      v := null;
    end;
    drift := case
               when v is null or r.written_value is null then true
               when r.written_value = 0 then v <> 0
               else abs(v - r.written_value) / nullif(abs(r.written_value),0) * 100 > r.tolerance_pct
             end;
    update brain_claims
       set last_checked = now(), last_value = v, drifted = drift
     where brain_claims.claim_key = r.claim_key;

    if drift then
      insert into watchdog_findings (fingerprint, severity, what, where_it_is,
             who_is_accountable, why_it_matters, how_it_was_detected, what_to_do,
             the_arithmetic, record_count)
      values ('brain:stale-claim:' || r.claim_key, r.severity,
              'The brain states a figure the live system no longer supports: ' || r.claim_text,
              r.brain_file,
              'Agent D (brain owner)',
              'brain/AGENT_BRIEFING.md is printed VERBATIM to every agent by the '
              'SessionStart hook. A stale number there is not a documentation '
              'problem - it is wrong training that every agent trusts. Two claims '
              'written on 7 Aug 2026 were false within two hours.',
              'tg_check_brain_claims() re-ran the claim''s own proof query.',
              'Re-measure, correct the figure in ' || r.brain_file || ', and update '
              'written_value in brain_claims. Do NOT delete the claim to silence it.',
              'written ' || coalesce(r.written_value::text,'null') ||
              ' vs live ' || coalesce(v::text,'query failed'),
              1)
      on conflict do nothing;
    end if;

    claim_key := r.claim_key; brain_file := r.brain_file;
    written := r.written_value; live := v; drifted := drift;
    return next;
  end loop;
end $$;

comment on function public.tg_check_brain_claims() is
  'Re-derives every number asserted in the brain and raises a finding on drift. Run '
  'nightly. Empty drift is the good state. Never silence a claim by deleting it - '
  'correct the document.';;
