-- ONE HOME PER FIGURE — owner ruling, 7 Aug 2026, guarded 8 Aug 2026.
--
-- HANDOFF.md defect D5 asked whether lab_result_values should be populated from
-- metrc_rpt_lab_results, or whether the report table is canonical and lab_result_values
-- obsolete. Its own words: "There must be exactly one home. Two homes for potency, one
-- empty, is how a platform starts contradicting itself."
--
-- The owner settled it: metrc_lab_results is canonical, v_lab_results reads it DIRECTLY,
-- and lab_result_values and coa_documents stay EMPTY BY DECISION. Measured today:
-- 101,608 rows canonical, 4,259 rows served by the view, 0 and 0 in the obsolete pair.
--
-- The risk now is the OPPOSITE of the original defect. An agent reading D5's unresolved
-- wording - it is still written as an open question - would "helpfully" backfill the
-- empty tables and hand potency two homes again. Nothing was watching for that.
create or replace function public.f_one_home_per_figure()
returns table(figure text, canonical_table text, canonical_rows bigint,
              obsolete_table text, obsolete_rows bigint, verdict text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record; n bigint; c bigint;
begin
  for r in
    select 'potency and terpenes'::text as fig, 'metrc_lab_results'::text as canon,
           'lab_result_values'::text as obsolete
    union all
    select 'certificates of analysis', 'metrc_documents', 'coa_documents'
  loop
    execute format('select count(*) from %I', r.canon) into c;
    execute format('select count(*) from %I', r.obsolete) into n;
    figure := r.fig; canonical_table := r.canon; canonical_rows := c;
    obsolete_table := r.obsolete; obsolete_rows := n;
    verdict := case
      when n > 0 then 'TWO HOMES - ' || r.obsolete || ' has been repopulated'
      when c = 0 then 'CANONICAL TABLE IS EMPTY'
      else 'ok' end;
    return next;
  end loop;
end $$;

comment on function public.f_one_home_per_figure() is
  'Asserts the owner ruling that each figure has exactly one home. lab_result_values '
  'and coa_documents are obsolete and must stay empty; metrc_lab_results is canonical. '
  'Guards against an agent "fixing" HANDOFF.md D5, which is still written as an open '
  'question even though the owner settled it on 7 Aug 2026.';

grant execute on function public.f_one_home_per_figure() to tg_desktop_reader;
grant execute on function public.f_one_home_per_figure() to authenticated;;
