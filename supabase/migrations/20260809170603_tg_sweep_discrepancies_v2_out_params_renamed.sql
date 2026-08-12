-- Dropping a FUNCTION, not a view. Rule E1 is about views and materialized views
-- — a cascade drop of one blanked every dashboard three times. This function was
-- created minutes ago, nothing depends on it, and Postgres will not let an OUT
-- parameter list change any other way.
drop function if exists public.tg_sweep_discrepancies();

create function public.tg_sweep_discrepancies()
returns table (out_class text, out_found int, out_newly_raised int, out_resolved int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_new int; v_res int;
begin
  create temp table _cur on commit drop as
  select 'strain'::text                                        as class,
         'strain:' || d.package_tag || ':' || d.manifest_number as discrepancy_key,
         'Package ' || d.package_tag || ' on manifest ' || d.manifest_number as subject,
         'Metrc item name'::text                               as source_a,
         d.item_name_says                                      as source_a_says,
         'Metrc strain field'::text                            as source_b,
         d.strain_column_says                                  as source_b_says,
         'COA — the certificate names the strain that was tested'::text as resolved_by_doc,
         (select dc.download_url from metrc_documents dc
           where dc.package_tag = d.package_tag and dc.doc_type ilike '%coa%' limit 1) as document_link
  from v_strain_conflicts d
  union all
  select 'ownership',
         'ownership:' || o.tag,
         'Package ' || o.tag || ' — ' || left(o.item_name, 50),
         'Platform item field',
         case when o.platform_says_ours then 'ours' else 'third party' end,
         'Package lineage in Metrc',
         case when o.lineage_says_ours then 'ours'
              else 'third party — ' || coalesce(o.origins->>0,'origin not named') end,
         'Inbound manifest — it names who shipped it to us',
         (select dm.download_url from metrc_documents dm
           where dm.manifest_number = (o.arrived_on->>0) and dm.doc_type ilike '%manifest%' limit 1)
  from v_ownership_misattribution o
  where o.verdict <> 'agrees'
  union all
  select 'missing_contents',
         'contents:' || g.manifest_number,
         'Manifest ' || g.manifest_number || ' ' || g.direction || ' — '
           || coalesce(g.recipient, g.shipper, 'counterparty not named'),
         'Metrc transfer record',
         coalesce(g.packages_metrc_says::text,'?') || ' packages on board',
         'Package line export',
         '0 lines held',
         'Manifest PDF — it lists every package on the shipment',
         g.manifest_document
  from v_manifest_line_gaps g;

  insert into discrepancy_register as r
    (discrepancy_key, class, subject, source_a, source_a_says, source_b, source_b_says,
     resolved_by_doc, document_link, first_seen, last_seen)
  select c.discrepancy_key, c.class, c.subject, c.source_a, c.source_a_says,
         c.source_b, c.source_b_says, c.resolved_by_doc, c.document_link, now(), now()
  from _cur c
  on conflict (discrepancy_key) do update
    set last_seen       = now(),
        document_link   = coalesce(excluded.document_link, r.document_link),
        source_a_says   = excluded.source_a_says,
        source_b_says   = excluded.source_b_says,
        resolved_at     = null,
        resolution_note = case when r.resolved_at is not null
                               then 'Reopened ' || to_char(now(),'DD Mon HH24:MI')
                                 || ' — it disagreed again. Previous note: '
                                 || coalesce(r.resolution_note,'(none)')
                               else r.resolution_note end;
  get diagnostics v_new = row_count;

  update discrepancy_register r
     set resolved_at = now(),
         resolved_by = coalesce(r.resolved_by, 'sweep'),
         resolution_note = coalesce(r.resolution_note,
           'The sources agree again as at ' || to_char(now(),'DD Mon YYYY HH24:MI')
           || '. Recorded, not deleted — this is the audit trail of what was wrong and when.')
   where r.resolved_at is null
     and not exists (select 1 from _cur c2 where c2.discrepancy_key = r.discrepancy_key);
  get diagnostics v_res = row_count;

  return query
    select c3.class::text, count(*)::int, v_new, v_res
    from _cur c3 group by c3.class;
end $$;

revoke all on function public.tg_sweep_discrepancies() from public, anon;
grant execute on function public.tg_sweep_discrepancies() to authenticated;;
