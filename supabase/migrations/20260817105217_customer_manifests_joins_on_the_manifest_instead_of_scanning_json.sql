/* v_customer_manifests MATCHED PACKAGES BY SUBSTRING-SCANNING A JSON BLOB. IT TIMED OUT.
 *
 * Four correlated subqueries each did:
 *
 *     where t.raw::text like '%' || p.tag || '%'
 *
 * against metrc_packages, once per outgoing transfer. 2,616 transfers x 19,517 packages
 * is roughly 51 million substring comparisons over serialised JSON, with no index that
 * can help - `like '%x%'` cannot use one. It was survivable when metrc_packages held
 * 4,595 rows. It quadrupled on 15 Aug when every package Metrc's reports name was
 * loaded, and the view stopped returning at all: "canceling statement due to statement
 * timeout" on the owner's own screen.
 *
 * My load exposed it. The join was always wrong; it was merely small enough to hide.
 *
 * THE RIGHT KEY ALREADY EXISTS. metrc_rpt_package_transfers is Metrc's own report of
 * which package tag travelled on which manifest - 19,256 rows, manifest_number and
 * package_tag side by side, already reconciling at 15,496 of 15,496 tags. Joining on
 * manifest_number is exact, indexed, and is what the data was for. Guessing at
 * containment inside a JSON string was never a join, it was a hope.
 *
 * SAME SHALLOW-READ BUG AS v_sales_history, fixed in the same pass. Metrc returns the
 * DELIVERY - recipient licence, received timestamp, transporter, driver, plate - under
 * raw->'_delivery', and this view read only the top level where all of them are null on
 * every row. So it too stamped almost every shipment NOT CONFIRMED RECEIVED, and showed
 * no transporter, no driver and no vehicle on any manifest in the platform. Shallow
 * first, then the delivery object, so a future Metrc change needs no migration.
 *
 * DOCUMENT LINKS PREFER THE STORED COPY. download_url is a pre-signed Metrc URL and all
 * 3,666 of them expire on one day; storage_path is our own copy and does not. The URL
 * remains as the fallback rather than being dropped, because a link that works today is
 * better than none - but manifest_copy_held now tells the reader which they are getting.
 *
 * Nineteen columns, same names, same order, same types. create or replace forbids
 * otherwise.
 */

create or replace view public.v_customer_manifests as
select t.created_on                                             as shipped_on,
       t.manifest_number,
       t.recipient                                              as customer,
       coalesce(t.raw ->> 'RecipientFacilityLicenseNumber',
                t.raw -> '_delivery' ->> 'RecipientFacilityLicenseNumber') as customer_license,
       coalesce((t.raw ->> 'PackageCount')::numeric,
                (t.raw -> '_delivery' ->> 'PackageCount')::numeric, 0::numeric) as packages,
       coalesce((t.raw ->> 'ReceivedPackageCount')::numeric,
                (t.raw -> '_delivery' ->> 'ReceivedPackageCount')::numeric, 0::numeric) as packages_received,
       (coalesce(t.raw ->> 'ReceivedDateTime',
                 t.raw -> '_delivery' ->> 'ReceivedDateTime'))::date as received_on,
       case
         when coalesce(t.raw ->> 'ReceivedDateTime',
                       t.raw -> '_delivery' ->> 'ReceivedDateTime') is not null
           then 'Delivered and confirmed'
         when t.created_on < (current_date - 3) then 'NOT CONFIRMED RECEIVED'
         else 'In transit'
       end                                                      as delivery_status,
       coalesce(t.raw ->> 'TransporterFacilityName',
                t.raw -> '_delivery' ->> 'TransporterFacilityName')   as transporter,
       coalesce(t.raw ->> 'DriverName',
                t.raw -> '_delivery' ->> 'DriverName')                as driver,
       coalesce(t.raw ->> 'VehicleLicensePlateNumber',
                t.raw -> '_delivery' ->> 'VehicleLicensePlateNumber') as vehicle_plate,
       coalesce(doc.stored_path, doc.any_url,
                case when coalesce(t.raw ->> 'Id', t.raw -> '_delivery' ->> 'Id') is not null
                     then 'https://ma.metrc.com/reports/transfers/'
                          || coalesce(t.raw ->> 'Id', t.raw -> '_delivery' ->> 'Id') || '/manifest'
                end)                                            as manifest_download,
       coalesce(pk.tags_on_manifest, 0)                          as packages_matched,
       pk.products                                               as products_on_manifest,
       coa.links                                                 as certificate_of_analysis_links,
       coalesce(coa.tags_with_result, 0)                         as packages_with_certificate,
       t.license,
       coalesce(doc.copies_held, 0)                              as manifest_copy_held,
       case when doc.stored_path is not null then 'Held here - download, print or send'
            when doc.any_url    is not null then 'Metrc link only - expires, no copy held'
            else 'Not downloaded yet - pulls overnight'
       end                                                       as document_status
  from public.metrc_transfers t
  /* One pass over Metrc's own manifest-to-tag report, keyed and indexable. */
  left join lateral (
      select count(distinct r.package_tag)                        as tags_on_manifest,
             string_agg(distinct nullif(r.item,''), ' · ')        as products
        from public.metrc_rpt_package_transfers r
       where r.manifest_number = t.manifest_number
  ) pk on true
  left join lateral (
      select string_agg(distinct d.download_url, ' | ')           as links,
             count(distinct d.package_tag)                        as tags_with_result
        from public.metrc_documents d
       where d.doc_type = 'coa'
         and d.download_url is not null
         and d.package_tag in (select r2.package_tag
                                 from public.metrc_rpt_package_transfers r2
                                where r2.manifest_number = t.manifest_number)
  ) coa on true
  left join lateral (
      select max(d.storage_path)                                  as stored_path,
             max(d.download_url)                                  as any_url,
             count(*) filter (where d.storage_path is not null)   as copies_held
        from public.metrc_documents d
       where d.doc_type = 'manifest'
         and d.manifest_number = t.manifest_number
  ) doc on true
 where t.direction = 'outgoing'
 order by t.created_on desc nulls last;

comment on view public.v_customer_manifests is
  'Outgoing manifests with their packages, products and certificates. Packages are matched by joining metrc_rpt_package_transfers on manifest_number - Metrc''s own record of which tag travelled on which manifest. It previously matched with `t.raw::text like ''%''||p.tag||''%''`, roughly 51 million unindexable substring scans over JSON, which timed out entirely once metrc_packages quadrupled on 15 Aug. Every Metrc field is read shallow-first then from raw->''_delivery'', where the recipient licence, received timestamp, transporter, driver and plate actually live. Document links prefer our own stored copy; all 3,666 Metrc pre-signed URLs expire on one day.';;
