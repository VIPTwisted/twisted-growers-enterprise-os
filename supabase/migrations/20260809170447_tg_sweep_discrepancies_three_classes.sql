-- The sweep. Upserts the current discrepancies into the register, keeping
-- first_seen stable and marking anything that has stopped disagreeing as
-- resolved-by-disappearance (recorded as such, never silently deleted — the
-- register is the audit trail of what was wrong and when).
--
-- Three classes today, each with the document the owner named:
--   strain conflict   -> the COA names the tested strain
--   ownership         -> the inbound manifest names who shipped it
--   missing contents  -> the manifest PDF lists what was on board
create or replace function public.tg_sweep_discrepancies()
returns table (class text, found int, newly_raised int, resolved int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_new int; v_res int; v_found int;
begin
  create temp table _cur on commit drop as
  -- 1. The item name and the strain field name different strains.
  select 'strain'                                              as class,
         'strain:' || d.package_tag || ':' || d.manifest_number as discrepancy_key,
         'Package ' || d.package_tag || ' on manifest ' || d.manifest_number as subject,
         'Metrc item name'                                     as source_a,
         d.item_name_says                                      as source_a_says,
         'Metrc strain field'                                  as source_b,
         d.strain_column_says                                  as source_b_says,
         'COA — the certificate names the strain that was tested' as resolved_by_doc,
         (select dc.download_url from metrc_documents dc
           where dc.package_tag = d.package_tag and dc.doc_type ilike '%coa%' limit 1) as document_link
  from v_strain_conflicts d
  union all
  -- 2. The platform's ownership read disagrees with the package lineage.
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
  -- 3. A shipment moved but nothing records what was on it.
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
  select discrepancy_key, class, subject, source_a, source_a_says, source_b, source_b_says,
         resolved_by_doc, document_link, now(), now()
  from _cur
  on conflict (discrepancy_key) do update
    set last_seen      = now(),
        document_link  = coalesce(excluded.document_link, r.document_link),
        source_a_says  = excluded.source_a_says,
        source_b_says  = excluded.source_b_says,
        -- It disagrees again, so it is not resolved after all. Say so rather
        -- than leaving a resolved row that is quietly wrong.
        resolved_at    = null,
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
     and not exists (select 1 from _cur c where c.discrepancy_key = r.discrepancy_key);
  get diagnostics v_res = row_count;

  return query
    select c.class, count(*)::int, v_new, v_res
    from _cur c group by c.class;
end $$;

revoke all on function public.tg_sweep_discrepancies() from public, anon;
grant execute on function public.tg_sweep_discrepancies() to authenticated;;
