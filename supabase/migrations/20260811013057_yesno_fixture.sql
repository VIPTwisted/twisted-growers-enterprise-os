create or replace function public.tg_selftest_yesno()
returns table(half text, case_in text, expected text, got text, passed boolean)
language plpgsql
stable
set search_path to 'public','pg_temp'
as $$
declare r record; v boolean;
begin
  -- positive: both encodings, both directions, and the casing/padding seen live
  for r in select * from (values
      ('True','t'),('Yes','t'),('yes','t'),('  TRUE ','t'),('Pass','t'),('1','t'),
      ('False','f'),('No','f'),('no','f'),('FALSE','f'),('Fail','f'),('0','f')
    ) v(a,b)
  loop
    half := 'positive - must decode'; case_in := r.a; expected := r.b;
    v := f_yesno(r.a); got := case when v then 't' when not v then 'f' else 'null' end;
    passed := (got = r.b); return next;
  end loop;

  -- negative: anything it was never taught must come back NULL, never false.
  -- Guessing false on an unknown is how a failed test becomes a pass.
  for r in select * from (values ('maybe'),('N/A'),('pending'),(''),('  '),('Not Tested')) v(a)
  loop
    half := 'negative - unknown must be NULL, not false'; case_in := quote_literal(r.a);
    expected := 'null'; v := f_yesno(r.a);
    got := case when v is null then 'null' when v then 't' else 'f' end;
    passed := (v is null); return next;
  end loop;

  half := 'negative - unknown must be NULL, not false'; case_in := 'NULL input';
  expected := 'null'; v := f_yesno(null);
  got := case when v is null then 'null' when v then 't' else 'f' end;
  passed := (v is null); return next;

  -- derived: every value actually present in the live column must decode.
  -- If a future import introduces a third encoding, this fires on its own.
  for r in
    select distinct overall_passed a from metrc_rpt_lab_results
    where overall_passed is not null and f_yesno(overall_passed) is null
  loop
    half := 'derived - every live value must decode'; case_in := r.a;
    expected := 'decodes'; got := 'NULL - unrecognised encoding'; passed := false;
    return next;
  end loop;

  half := 'derived - every live value must decode';
  case_in := format('%s distinct values live in overall_passed',
              (select count(distinct overall_passed) from metrc_rpt_lab_results));
  expected := 'all decode';
  got := format('%s undecodable',
          (select count(distinct overall_passed) from metrc_rpt_lab_results
            where overall_passed is not null and f_yesno(overall_passed) is null));
  passed := not exists (select 1 from metrc_rpt_lab_results
            where overall_passed is not null and f_yesno(overall_passed) is null);
  return next;
end;
$$;

comment on function public.tg_selftest_yesno() is
  'Fixture for f_yesno -- both halves (K2). The negative half asserts that an '
  'unrecognised value returns NULL and never false: guessing false on an unknown '
  'turns a failed laboratory test into a pass. The derived block re-reads every '
  'value live in overall_passed, so a third encoding arriving in a future import '
  'fires without anyone having anticipated it.';
;
