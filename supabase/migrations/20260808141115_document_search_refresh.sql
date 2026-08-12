/* KEEPING THE INDEX HONEST. A search index that drifts from the documents is
   worse than no index: it answers confidently with yesterday's truth, and
   nobody thinks to doubt a search box.

   Rebuilt in place rather than dropped and recreated, so the Files tab never
   sees an empty table mid-refresh. Every statement is separate and bounded -
   the single big join is exactly what timed out and started all this. */
create or replace function f_refresh_document_search()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_before bigint; v_after bigint;
begin
  select count(*) into v_before from document_search;

  insert into document_search (id, doc_type, package_tag, manifest_number,
                               license, download_url, storage_path, search_text)
  select d.id, d.doc_type, d.package_tag, d.manifest_number, d.license,
         d.download_url, d.storage_path,
         lower(concat_ws(' ', d.doc_type, d.package_tag, d.manifest_number, d.license))
  from metrc_documents d
  on conflict (id) do update
    set doc_type = excluded.doc_type,
        package_tag = excluded.package_tag,
        manifest_number = excluded.manifest_number,
        license = excluded.license,
        download_url = excluded.download_url,
        storage_path = excluded.storage_path;

  /* A document whose row disappeared upstream must disappear here too. */
  delete from document_search ds
  where not exists (select 1 from metrc_documents d where d.id = ds.id);

  update document_search ds set item_name = p.item_name
  from (select distinct on (tag) tag, item_name from metrc_packages
        where tag is not null order by tag) p
  where p.tag = ds.package_tag
    and ds.item_name is distinct from p.item_name;

  update document_search ds
  set customer = m.destination_facility, strain = m.strain
  from (select distinct on (manifest_number::text)
               manifest_number::text as mn, destination_facility, strain
        from metrc_rpt_package_transfers
        where manifest_number is not null
        order by manifest_number::text, as_of_date desc nulls last) m
  where m.mn = ds.manifest_number
    and (ds.customer is distinct from m.destination_facility
         or ds.strain is distinct from m.strain);

  update document_search
  set search_text = lower(concat_ws(' ', doc_type, package_tag, manifest_number,
                                    license, item_name, strain, shipper, customer));

  select count(*) into v_after from document_search;
  return jsonb_build_object('before', v_before, 'after', v_after,
                            'added', greatest(v_after - v_before, 0),
                            'refreshed_at', now());
end $$;

comment on function f_refresh_document_search is
  'Rebuilds the Files tab search index in place. Safe to run any time - the table is never empty mid-refresh. Run after documents are fetched from Metrc.';

revoke all on function f_refresh_document_search() from public;
grant execute on function f_refresh_document_search() to authenticated;

select cron.schedule('refresh-document-search', '17 * * * *',
                     $$select f_refresh_document_search()$$);;
