-- Nothing closes on one agent's word.
--
-- To close a finding an agent must state what is now true, how it derived that, and
-- the SQL that proves it. Then a DIFFERENT agent must derive the same fact by a
-- DIFFERENT route and say whether it agrees. Both halves are enforced by constraint,
-- not by convention, because a convention is a hope (the meta-trap).
--
-- The design comes from a real event: v_potency_vs_coa caught four wrong potency
-- figures within minutes when no amount of re-reading the code had. An independent
-- derivation beats a careful second look, every time.

create table if not exists finding_closure (
  id                 bigserial primary key,
  finding_key        text not null references finding_state(finding_key) on delete cascade,

  -- first pass: the agent that believes it is done
  proposed_by        text not null check (length(btrim(proposed_by)) >= 3),
  claim              text not null check (length(btrim(claim))        >= 20),
  how_derived        text not null check (length(btrim(how_derived))  >= 20),
  proof_sql          text not null check (length(btrim(proof_sql))    >= 10),
  proposed_value     numeric,
  proposed_at        timestamptz not null default now(),

  -- second pass: somebody else, deriving it another way
  second_by          text,
  second_how_derived text,
  second_proof_sql   text,
  second_value       numeric,
  second_at          timestamptz,

  verdict            text not null default 'pending'
                     check (verdict in ('pending','agrees','disagrees','insufficient')),
  verdict_note       text,

  -- A second opinion from the same agent is not a second opinion.
  constraint second_must_be_someone_else check (
    second_by is null or lower(btrim(second_by)) <> lower(btrim(proposed_by))
  ),
  -- Re-running the first agent's query is not an independent derivation. The whole
  -- value of the check is that it takes a different road to the same place.
  constraint second_must_take_another_road check (
    second_proof_sql is null or btrim(second_proof_sql) <> btrim(proof_sql)
  ),
  -- Agreement is only agreement when the work behind it is on the record.
  constraint agreement_needs_its_working check (
    verdict <> 'agrees' or (
      second_by is not null
      and length(btrim(coalesce(second_how_derived,''))) >= 20
      and length(btrim(coalesce(second_proof_sql,'')))   >= 10
      and second_at is not null
    )
  ),
  -- Refusing is a decision too, and it must say why.
  constraint refusal_needs_a_reason check (
    verdict not in ('disagrees','insufficient')
    or length(btrim(coalesce(verdict_note,''))) >= 15
  )
);
alter table finding_closure enable row level security;

create index if not exists finding_closure_key_idx on finding_closure (finding_key, verdict);

create policy finding_closure_read on finding_closure
  for select to authenticated using (true);
create policy finding_closure_propose on finding_closure
  for insert to authenticated with check (true);
create policy finding_closure_second on finding_closure
  for update to authenticated using (true) with check (true);

comment on table finding_closure is
  'The two-pass closure record. One agent proposes with proof; a different agent '
  'derives the same fact another way and rules on it. finding_state cannot reach a '
  'terminal state without a row here carrying verdict = agrees.';;
