-- THE GATE. A check may not be born enabled without a fixture proving it can fail.
--
-- Seven defects were recorded on 9 Aug 2026 and every single one was a false alarm or an
-- overstatement. NOT ONE was "the check missed something real". The checks were not failing
-- to catch problems - they were inventing them, at 4x to 15x. Six of the seven would have
-- been caught before producing a number if somebody had been made to watch the check fail
-- once, and watch it stay quiet on a legitimate case once.
--
-- RATCHET, NOT CLIFF (the house rule). 32 enabled checkers have no fixture today. Demanding
-- one immediately would switch them all off, and a switched-off gate is worse than none. So
-- they are GRANDFATHERED: recorded as debt, allowed to fall, never allowed to rise.

alter table checker_registry add column if not exists fixture_selftest_fn text;
alter table checker_registry add column if not exists fixture_positive_case text;
alter table checker_registry add column if not exists fixture_negative_case text;
alter table checker_registry add column if not exists grandfathered boolean not null default false;
alter table checker_registry add column if not exists grandfathered_reason text;

comment on column checker_registry.fixture_selftest_fn is
  'The function that PROVES this check works: it must demonstrate the check firing on a real '
  'violation AND staying quiet on a legitimate case. Recorded in guard_selftest on every run.';
comment on column checker_registry.fixture_negative_case is
  'The legitimate case the check must NOT fire on. This is the half everybody skips, and it '
  'is where all seven recorded defects lived - blends, safety screens, in-transit packages, '
  'fresh-frozen suffixes, two readings minutes apart.';

-- The gate itself.
create or replace function tg_require_fixture()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not new.enabled then
    return new;   -- a disabled check harms nobody
  end if;

  if coalesce(new.fixture_proves_it_fails,false) then
    -- Claiming a fixture means naming it. "Yes we tested it" is not a test.
    if coalesce(btrim(new.fixture_selftest_fn),'') = '' then
      raise exception
        'Checker % claims a fixture but names no function to prove it.', new.checker_key
        using hint = 'Set fixture_selftest_fn to the function that demonstrates this check '
                     'FIRING on a real violation and STAYING QUIET on a legitimate case.';
    end if;
    if coalesce(btrim(new.fixture_negative_case),'') = '' then
      raise exception
        'Checker % has no negative case. Name the legitimate thing it must NOT fire on.',
        new.checker_key
        using hint = 'Every defect recorded on 9 Aug 2026 was a false alarm - a check firing '
                     'on something legitimate. The negative case is the half that catches it.';
    end if;
    return new;
  end if;

  -- No fixture. Only allowed as recorded, reasoned debt.
  if new.grandfathered then
    if length(btrim(coalesce(new.grandfathered_reason,''))) < 25 then
      raise exception
        'Checker % is grandfathered without a reason.', new.checker_key
        using hint = 'Grandfathering is debt on the record, not a shrug. Say why it has no '
                     'fixture and what would be needed to write one.';
    end if;
    return new;
  end if;

  raise exception
    'Checker % cannot be enabled: nothing proves it can fail.', new.checker_key
    using hint = 'Write a fixture showing it FIRES on a real violation and STAYS QUIET on a '
                 'legitimate case, set fixture_selftest_fn, fixture_positive_case and '
                 'fixture_negative_case, then set fixture_proves_it_fails. A check nobody has '
                 'watched fail is a hypothesis, not a check. If it genuinely cannot be tested '
                 'yet, set grandfathered with 25 characters of reason - that is debt, and the '
                 'ratchet will not let the count rise.';
end;
$$;

drop trigger if exists trg_require_fixture on checker_registry;
create trigger trg_require_fixture
  before insert or update on checker_registry
  for each row execute function tg_require_fixture();;
