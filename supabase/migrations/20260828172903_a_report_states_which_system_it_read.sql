/* Every registered report must say which system it read — owner ruling, 28 Aug 2026:
 * "Every registered report must print: title, company, period from the bus, as-of,
 * source (Apex/Metrc/TG)."
 *
 * THE SLOT EXISTED AND WAS EMPTY. f_report_registry_runtime already returns
 * measure_contracts.<measure>.source_system, and on every enabled report today it is
 * null with source_verified false. Printing the source from it would print nothing,
 * so the header would either be blank or be filled in by guessing.
 *
 * A NAME IS NOT A SOURCE. The obvious shortcut is to read the fact_view's name —
 * v_metrc_* is Metrc, v_apex_* is Apex. Every enabled report's fact_view begins with
 * a bare `v_`, so that rule identifies almost nothing, and where it does fire it is
 * still a guess about a name rather than a fact about the data.
 *
 * Measured instead, and the measurement is the reason this file exists. Following the
 * dependency graph ONE level deep says v_inventory_report reads cost_model,
 * metrc_packages, mv_tag_documents, v_certificate_resolved, v_document_package_link
 * and v_ownership_by_custody — no Apex anywhere. Following it to the bottom finds
 * 21 relations and Apex among them, five levels down. A report that quietly carries
 * Apex money while its header says Metrc is exactly the mislabelling this ruling is
 * meant to stop, and only recursion finds it.
 *
 * WHAT "TG" MEANS HERE. Anything that is neither Metrc's mirror nor Apex's: this
 * platform's own tables — cost_model, agent_claims, brain_claims. A report reading
 * metrc_packages and cost_model genuinely reads two systems and says so, rather than
 * being flattened to whichever one somebody thought of first.
 *
 * DEPTH IS BOUNDED AT 8. The graph is a DAG in practice, and `union` already stops a
 * cycle from looping forever, but an unbounded recursive walk over pg_depend on a
 * database with 520 views is a page nobody can open. Nothing measured today reaches
 * past 5. If a report ever does, truncated_at_depth says so on the row instead of
 * silently reporting a shorter source list than the truth.
 */

create or replace view public.v_report_provenance
with (security_invoker = true) as
with recursive walk as (
  /* Depth 0 is the fact object itself. A registry row may point at a TABLE rather
     than a view, and such a row has no pg_rewrite entry at all — without this arm it
     would report no sources whatever, which reads identically to "reads nothing". */
  /* COLLATE "C" is load-bearing, not decoration. The recursive arm carries
     pg_class.relname, which is `name` and collates as "C"; report_registry.fact_view
     is `text` and collates as the database default. Postgres refuses the whole
     recursive CTE for that mismatch — 42P21, "column 3 has collation default in
     non-recursive term but collation C overall" — so without this the view does not
     create at all. Found by running the query before shipping the migration. */
  select r.report_key,
         r.fact_view,
         r.fact_view::text collate "C" as relation,
         0 as depth
    from public.report_registry r
   where r.enabled

  union

  select w.report_key,
         w.fact_view,
         c.relname::text,
         w.depth + 1
    from walk w
    join pg_class v          on v.relname = w.relation
    join pg_namespace nv     on nv.oid = v.relnamespace and nv.nspname = 'public'
    join pg_rewrite rw       on rw.ev_class = v.oid
    join pg_depend d         on d.objid = rw.oid
    join pg_class c          on c.oid = d.refobjid
    join pg_namespace nc     on nc.oid = c.relnamespace and nc.nspname = 'public'
   where c.relkind in ('r', 'p', 'v', 'm')
     and c.relname <> w.relation
     and w.depth < 8
)
select
  w.report_key,
  w.fact_view,
  /* Ordered so the header reads the same way twice for the same report. */
  array_remove(array[
    case when bool_or(w.relation ilike 'metrc%'
                   or w.relation ilike 'v_metrc%'
                   or w.relation ilike 'mv_metrc%') then 'Metrc' end,
    case when bool_or(w.relation ilike 'apex%'
                   or w.relation ilike 'v_apex%'
                   or w.relation ilike 'mv_apex%') then 'Apex' end,
    case when bool_or(w.depth > 0
                  and w.relation not ilike 'metrc%'
                  and w.relation not ilike 'v_metrc%'
                  and w.relation not ilike 'mv_metrc%'
                  and w.relation not ilike 'apex%'
                  and w.relation not ilike 'v_apex%'
                  and w.relation not ilike 'mv_apex%') then 'TG' end
  ], null) as sources,
  count(*) filter (where w.depth > 0)::int          as relations_read,
  max(w.depth)::int                                 as deepest,
  bool_or(w.depth >= 8)                             as truncated_at_depth,
  array_agg(distinct w.relation order by w.relation)
    filter (where w.depth > 0)                      as base_relations
from walk w
group by w.report_key, w.fact_view;

comment on view public.v_report_provenance is
  'Which systems each enabled report actually reads, measured by walking pg_depend to '
  'the bottom rather than inferred from the fact_view name. Metrc, Apex and TG are '
  'reported together when a report reads more than one, because it does. Feeds the '
  'source line in the report header.';

grant select on public.v_report_provenance to authenticated;

/* A report that reads nothing is a broken registry row, not a sourceless report.
   Proven at apply time so it cannot be discovered later on a printed page. */
do $$
declare orphans text;
begin
  select string_agg(report_key, ', ')
    into orphans
    from public.v_report_provenance
   where relations_read = 0;

  if orphans is not null then
    raise warning
      'v_report_provenance: these enabled reports resolve to no base relation at all, '
      'so their header will state no source: %. Their fact_view is probably missing '
      'from public, which is a registry defect rather than a provenance one.', orphans;
  end if;
end $$;
