-- The owner must never be locked out of his own system, so an override exists. It is
-- not a back door: it requires an admin, it requires 25 characters of reason, and the
-- finding stays in the guard queue permanently marked as closed WITHOUT an independent
-- check. Hiding is impossible; overriding is merely visible.
alter table finding_state add column if not exists override_reason text;
alter table finding_state add column if not exists override_by      text;
alter table finding_state add column if not exists override_at      timestamptz;

create or replace function tg_require_double_check()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ok       boolean;
  v_proposed boolean;
begin
  -- Terminal states: the finding is being declared over.
  if new.state in ('closed','not_a_problem') then

    if length(btrim(coalesce(new.override_reason,''))) >= 25 then
      if not f_caller_is_admin() then
        raise exception
          'Only an administrator may override the independent check on %.', new.finding_key
          using hint = 'Have a second agent verify the closure instead.';
      end if;
      new.override_by := coalesce(new.override_by, current_app_role());
      new.override_at := coalesce(new.override_at, now());
      return new;
    end if;

    select exists (
      select 1 from finding_closure c
      where c.finding_key = new.finding_key and c.verdict = 'agrees'
    ) into v_ok;

    if not v_ok then
      raise exception
        'Finding % cannot be closed: no independent second check agrees with the closure.',
        new.finding_key
        using hint = 'Insert a finding_closure row with your proof, then have a DIFFERENT '
                     'agent derive the same fact another way and set verdict = agrees. '
                     'An administrator may instead set override_reason (25 characters or more), '
                     'which closes it but records that nobody verified it.';
    end if;
  end if;

  -- Claiming a fix is weaker than closing, but it still may not be a bare assertion.
  if new.state in ('fixed_in_os','fixed_in_metrc') then
    select exists (
      select 1 from finding_closure c
      where c.finding_key = new.finding_key and c.verdict <> 'disagrees'
    ) into v_proposed;

    if not v_proposed and length(btrim(coalesce(new.override_reason,''))) < 25 then
      raise exception
        'Finding % cannot be marked % without a closure record carrying the proof.',
        new.finding_key, new.state
        using hint = 'Insert a finding_closure row stating the claim, how it was derived, '
                     'and the SQL that proves it.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_aa_double_check on finding_state;
create trigger trg_aa_double_check
  before insert or update on finding_state
  for each row execute function tg_require_double_check();

comment on function tg_require_double_check() is
  'Rule H1 made mechanical: an issue cannot clear itself. Terminal states demand a '
  'finding_closure row verified by a different agent using a different derivation. '
  'An admin override is allowed, is recorded, and never leaves the guard queue.';;
