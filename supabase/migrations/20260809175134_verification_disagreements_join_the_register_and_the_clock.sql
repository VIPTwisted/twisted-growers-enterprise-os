-- THE VERIFICATION FRAMEWORK IS ALREADY PRODUCING DISCREPANCIES — nothing was
-- collecting them.
--
-- 19 checks run hourly and 8 disagree, every run, including two marked critical.
-- They are two authoritative sources disagreeing about the same fact, which is
-- exactly the definition the register uses. They belong in the same register and
-- under the same one-week clock as everything else, not in a separate table
-- nobody opens.
--
-- Owner routing is deliberately honest: finding_owners maps ten departments and
-- every one of them resolves to Vincent, escalating to Vincent. That is a
-- placeholder, not a routing table, and the view says so rather than implying a
-- distribution that does not exist.
create or replace function public.tg_sweep_discrepancies()
returns table (out_class text, out_found int, out_newly_raised int, out_resolved int)
language plpgsql security definer set search_path to 'public' as $$
declare v_new int; v_res int;
begin
  create temp table _raw on commit drop as
  select 'strain'::text as class,
         'strain:' || d.package_tag || ':' || d.manifest_number as discrepancy_key,
         'Package ' || d.package_tag || ' on manifest ' || d.manifest_number as subject,
         'Metrc item name'::text as source_a, d.item_name_says as source_a_says,
         'Metrc strain field'::text as source_b, d.strain_column_says as source_b_says,
         'COA — the certificate names the strain that was tested'::text as resolved_by_doc,
         (select dc.storage_path from metrc_documents dc
           where dc.package_tag = d.package_tag and dc.doc_type ilike '%coa%' limit 1) as document_link
  from v_strain_conflicts d
  union all
  select 'ownership', 'ownership:' || o.tag,
         'Package ' || o.tag || ' — ' || left(o.item_name, 50),
         'Platform item field', case when o.platform_says_ours then 'ours' else 'third party' end,
         'Package lineage in Metrc',
         case when o.lineage_says_ours then 'ours'
              else 'third party — ' || coalesce(o.origins->>0,'origin not named') end,
         'Inbound manifest — it names who shipped it to us',
         (select dm.storage_path from metrc_documents dm
           where dm.manifest_number = (o.arrived_on->>0) and dm.doc_type ilike '%manifest%' limit 1)
  from v_ownership_misattribution o where o.verdict <> 'agrees'
  union all
  select 'missing_contents', 'contents:' || g.manifest_number,
         'Manifest ' || g.manifest_number || ' ' || g.direction || ' — '
           || coalesce(g.recipient, g.shipper, 'counterparty not named'),
         'Metrc transfer record', coalesce(g.packages_metrc_says::text,'?') || ' packages on board',
         'Package line export', '0 lines held',
         'Manifest PDF — it lists every package on the shipment',
         g.manifest_document
  from v_manifest_line_gaps g
  union all
  -- NEW: the verification framework's own disagreements.
  select 'verification', 'verify:' || v.check_key,
         v.title || ' — ' || round(l.pct_apart, 2) || '% apart',
         v.source_a_label, l.value_a::text,
         v.source_b_label, l.value_b::text,
         coalesce(v.what_it_proves, 'Two derivations of the same fact disagree.'),
         null
  from verification_checks v
  join lateral (
    select value_a, value_b, pct_apart, verdict
    from verification_runs r where r.check_key = v.check_key
    order by r.ran_at desc limit 1
  ) l on true
  where l.verdict ilike '%disagree%';

  create temp table _cur on commit drop as
  select distinct on (discrepancy_key) * from _raw order by discrepancy_key, document_link nulls last;

  insert into discrepancy_register as r
    (discrepancy_key, class, subject, source_a, source_a_says, source_b, source_b_says,
     resolved_by_doc, document_link, first_seen, last_seen)
  select c.discrepancy_key, c.class, c.subject, c.source_a, c.source_a_says,
         c.source_b, c.source_b_says, c.resolved_by_doc, c.document_link, now(), now()
  from _cur c
  on conflict (discrepancy_key) do update
    set last_seen = now(),
        document_link = coalesce(excluded.document_link, r.document_link),
        source_a_says = excluded.source_a_says,
        source_b_says = excluded.source_b_says,
        subject       = excluded.subject,
        resolved_at = null,
        resolution_note = case when r.resolved_at is not null
          then 'Reopened ' || to_char(now(),'DD Mon HH24:MI') || ' — it disagreed again. Previous note: '
            || coalesce(r.resolution_note,'(none)') else r.resolution_note end;
  get diagnostics v_new = row_count;

  update discrepancy_register r
     set resolved_at = now(), resolved_by = coalesce(r.resolved_by,'sweep'),
         resolution_note = coalesce(r.resolution_note,
           'The sources agree again as at ' || to_char(now(),'DD Mon YYYY HH24:MI')
           || '. Recorded, not deleted — this is the audit trail of what was wrong and when.')
   where r.resolved_at is null
     and not exists (select 1 from _cur c2 where c2.discrepancy_key = r.discrepancy_key);
  get diagnostics v_res = row_count;

  return query select c3.class::text, count(*)::int, v_new, v_res from _cur c3 group by c3.class;
end $$;

revoke all on function public.tg_sweep_discrepancies() from public, anon;
grant execute on function public.tg_sweep_discrepancies() to authenticated;;
