/* TAG_GRAIN_MONEY_CONTAINMENT
   Apex owns sales. Metrc owns custody. A tag may carry an exact invoice identity,
   but invoice dollars and payment status are not tag-grain facts and must never be
   repeated through the document trinity.

   This is an in-place containment. It does not drop, rename, swap, or rebuild either
   v_tag_lifecycle or mv_tag_documents. Their OIDs, signatures, grants, indexes, and
   dependant graph are release invariants. The lifecycle semantic changes are:
     1. invoice identity comes from the exact Metrc invoice-number ↔ Apex bridge;
     2. invoice dollars and payment status are typed NULL at tag grain.
   The authenticated raw sold-by-tag view is replaced in place under the same
   exact-identity and NULL-money contract so it cannot bypass the safe route.

   apply_migration owns the single transaction and migration-history write. This
   file deliberately contains no nested BEGIN or COMMIT.

   ROLLBACK: presentation or guards may be rolled back, but tag-grain dollars and
   proximity-matched invoice identities must never be restored. Reintroduction needs
   a new owner-approved, invoice-grain design and Guard approval.
 */

set local lock_timeout = '15s';
set local statement_timeout = '5min';

create temporary table _tag_money_before on commit drop as
with root as (
  select 'public.mv_tag_documents'::regclass::oid as oid
), direct_deps as (
  select distinct d.oid, d.relname, d.reloptions, d.relacl, d.relowner
  from root
  join pg_depend dep on dep.refobjid = root.oid
  join pg_rewrite rw on rw.oid = dep.objid
  join pg_class d on d.oid = rw.ev_class
  where d.oid <> root.oid
), root_money as (
  select c.oid, a.attnum
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
    and a.attname = 'apex_invoice_usd'
    and not a.attisdropped
  where n.nspname = 'public'
    and c.relname = 'mv_tag_documents'
), money_deps as (
  select distinct d.oid, d.relname
  from root_money r
  join pg_depend dep on dep.refobjid = r.oid and dep.refobjsubid = r.attnum
  join pg_rewrite rw on rw.oid = dep.objid
  join pg_class d on d.oid = rw.ev_class
  where d.oid <> r.oid
), nav_money_roads as (
  select distinct n.table_ref
  from public.nav_registry n
  join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = n.table_ref
   and c.column_name = 'apex_invoice_usd'
  where n.enabled
), report_money_roads as (
  select distinct r.fact_view
  from public.report_registry r
  join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = r.fact_view
   and c.column_name = 'apex_invoice_usd'
  where r.enabled
), all_money_relations as (
  select distinct c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
    and a.attname = 'apex_invoice_usd'
    and not a.attisdropped
  where n.nspname = 'public'
    and c.relkind in ('v','m')
)
select
  'public.v_tag_lifecycle'::regclass::oid as lifecycle_oid,
  'public.mv_tag_documents'::regclass::oid as document_oid,
  'public.v_forensic_sold_by_tag'::regclass::oid as sold_oid,
  'public.v_metrc_manifest_invoice_truth'::regclass::oid as bridge_oid,
  md5(pg_get_viewdef('public.v_tag_lifecycle'::regclass, true)) as lifecycle_definition_md5,
  md5(pg_get_viewdef('public.v_forensic_sold_by_tag'::regclass, true)) as sold_definition_md5,
  md5(pg_get_viewdef('public.v_metrc_manifest_invoice_truth'::regclass, true)) as bridge_definition_md5,
  (select relowner from pg_class where oid = 'public.v_tag_lifecycle'::regclass) as lifecycle_owner,
  (select relacl::text from pg_class where oid = 'public.v_tag_lifecycle'::regclass) as lifecycle_acl,
  (select coalesce(array_to_string(reloptions, ','), '') from pg_class where oid = 'public.v_tag_lifecycle'::regclass) as lifecycle_options,
  (select relowner from pg_class where oid = 'public.mv_tag_documents'::regclass) as document_owner,
  (select relacl::text from pg_class where oid = 'public.mv_tag_documents'::regclass) as document_acl,
  (select coalesce(array_to_string(reloptions, ','), '') from pg_class where oid = 'public.mv_tag_documents'::regclass) as document_options,
  (select relowner from pg_class where oid = 'public.v_forensic_sold_by_tag'::regclass) as sold_owner,
  (select relacl::text from pg_class where oid = 'public.v_forensic_sold_by_tag'::regclass) as sold_acl,
  (select coalesce(array_to_string(reloptions, ','), '') from pg_class where oid = 'public.v_forensic_sold_by_tag'::regclass) as sold_options,
  (select relowner from pg_class where oid = 'public.v_metrc_manifest_invoice_truth'::regclass) as bridge_owner,
  (select relacl::text from pg_class where oid = 'public.v_metrc_manifest_invoice_truth'::regclass) as bridge_acl,
  (select coalesce(array_to_string(reloptions, ','), '') from pg_class where oid = 'public.v_metrc_manifest_invoice_truth'::regclass) as bridge_options,
  (select md5(string_agg(a.attnum::text || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod), '|' order by a.attnum))
     from pg_attribute a where a.attrelid = 'public.v_tag_lifecycle'::regclass and a.attnum > 0 and not a.attisdropped) as lifecycle_columns_md5,
  (select md5(string_agg(a.attnum::text || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod), '|' order by a.attnum))
     from pg_attribute a where a.attrelid = 'public.mv_tag_documents'::regclass and a.attnum > 0 and not a.attisdropped) as document_columns_md5,
  (select md5(string_agg(a.attnum::text || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod), '|' order by a.attnum))
     from pg_attribute a where a.attrelid = 'public.v_forensic_sold_by_tag'::regclass and a.attnum > 0 and not a.attisdropped) as sold_columns_md5,
  (select md5(string_agg(a.attnum::text || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod), '|' order by a.attnum))
     from pg_attribute a where a.attrelid = 'public.v_metrc_manifest_invoice_truth'::regclass and a.attnum > 0 and not a.attisdropped) as bridge_columns_md5,
  (select md5(string_agg(indexname || ':' || indexdef, '|' order by indexname))
     from pg_indexes where schemaname = 'public' and tablename = 'mv_tag_documents') as document_indexes_md5,
  (select count(*) from (
     select distinct d.oid from pg_depend dep join pg_rewrite rw on rw.oid = dep.objid
     join pg_class d on d.oid = rw.ev_class
     where dep.refobjid = 'public.v_forensic_sold_by_tag'::regclass
       and d.oid <> 'public.v_forensic_sold_by_tag'::regclass) x) as sold_deps,
  (select md5(string_agg(x.relname, '|' order by x.relname)) from (
     select distinct d.relname from pg_depend dep join pg_rewrite rw on rw.oid = dep.objid
     join pg_class d on d.oid = rw.ev_class
     where dep.refobjid = 'public.v_forensic_sold_by_tag'::regclass
       and d.oid <> 'public.v_forensic_sold_by_tag'::regclass) x) as sold_deps_md5,
  (select count(*) from direct_deps) as direct_deps,
  (select md5(string_agg(relname, '|' order by relname)) from direct_deps) as direct_deps_md5,
  (select count(*) from direct_deps where 'security_invoker=true' = any(coalesce(reloptions, '{}'::text[]))) as invoker_deps,
  (select count(*) from direct_deps where has_table_privilege('anon', oid, 'SELECT')) as anon_deps,
  (select count(*) from direct_deps where has_table_privilege('authenticated', oid, 'SELECT')) as authenticated_deps,
  (select count(*) from direct_deps d where exists (
     select 1 from aclexplode(coalesce(d.relacl, acldefault('r', d.relowner))) x
     where x.grantee = 0 and x.privilege_type = 'SELECT')) as public_deps,
  (select count(*) from money_deps) as money_deps,
  (select md5(string_agg(relname, '|' order by relname)) from money_deps) as money_deps_md5,
  (select count(*) from nav_money_roads) as nav_money_roads,
  (select md5(string_agg(table_ref, '|' order by table_ref)) from nav_money_roads) as nav_money_roads_md5,
  (select count(*) from report_money_roads) as report_money_roads,
  (select md5(string_agg(fact_view, '|' order by fact_view)) from report_money_roads) as report_money_roads_md5,
  (select count(*) from all_money_relations) as all_money_relations,
  (select md5(string_agg(relname, '|' order by relname)) from all_money_relations) as all_money_relations_md5,
  (select count(*) from public.nav_registry) as all_nav_rows,
  (select md5(string_agg(to_jsonb(n)::text, '|' order by n.view_key)) from public.nav_registry n) as all_nav_md5,
  (select count(*) from public.nav_registry n where n.surface in ('finance','tax','hr','reports')) as top_menu_rows,
  (select md5(string_agg(to_jsonb(n)::text, '|' order by n.surface,n.category_order,n.item_order,n.view_key)
    filter (where n.surface in ('finance','tax','hr','reports'))) from public.nav_registry n) as top_menu_md5,
  (select md5(string_agg(to_jsonb(n)::text, '|' order by n.view_key)
    filter (where n.view_key = 'tg_workspace')) from public.nav_registry n) as tg_workspace_md5,
  (select count(*) from public.nav_role_visibility) as role_visibility_rows,
  (select md5(string_agg(to_jsonb(v)::text, '|' order by v.view_key,v.role)) from public.nav_role_visibility v) as role_visibility_md5,
  (select sum(recognized_total_usd) from public.v_apex_invoice_truth) as apex_truth_total;

do $$
declare
  b _tag_money_before%rowtype;
begin
  select * into strict b from _tag_money_before;

  if b.lifecycle_oid <> 339485 or b.document_oid <> 384269 or b.sold_oid <> 121919 or b.bridge_oid <> 405481 then
    raise exception 'TAG_MONEY_CONTRACT: protected object identity drifted before containment';
  end if;
  if b.lifecycle_definition_md5 <> '3d868a79ffff100f20be660cf8526e33' then
    raise exception 'TAG_MONEY_CONTRACT: v_tag_lifecycle definition changed before reviewed replacement';
  end if;
  if b.sold_definition_md5 <> '919b03ad28f5f7812e8ef0f27d5a415d' then
    raise exception 'TAG_MONEY_CONTRACT: v_forensic_sold_by_tag definition changed before reviewed replacement';
  end if;
  if b.bridge_definition_md5 <> '623cf2d6b0ce24d39509e78528ae6337' then
    raise exception 'TAG_MONEY_CONTRACT: exact invoice bridge definition drifted';
  end if;
  if b.lifecycle_columns_md5 <> 'e5d2ae87e98652625f37be4ff4aa31bd'
     or b.document_columns_md5 <> '3b3550f9c0829363599034c1f05c69f9'
     or b.sold_columns_md5 <> '6899517bcd08dc3e0c6a5f0f5cf485e0'
     or b.bridge_columns_md5 <> '29b05b931243bf0b3bc617aa147db156' then
    raise exception 'TAG_MONEY_CONTRACT: protected column signature drifted';
  end if;
  if b.lifecycle_owner <> 'postgres'::regrole or b.document_owner <> 'postgres'::regrole or b.sold_owner <> 'postgres'::regrole or b.bridge_owner <> 'postgres'::regrole
     or b.lifecycle_options <> 'security_invoker=true' or b.document_options <> '' or b.sold_options <> 'security_invoker=true' or b.bridge_options <> 'security_invoker=true' then
    raise exception 'TAG_MONEY_CONTRACT: protected owner or view options drifted';
  end if;
  if b.lifecycle_acl <> '{postgres=arwdDxtm/postgres,anon=xtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres,tg_desktop_reader=r/postgres}'
     or b.document_acl <> '{postgres=arwdDxtm/postgres,anon=xtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres,tg_desktop_reader=r/postgres}'
     or b.sold_acl <> '{postgres=arwdDxtm/postgres,anon=xtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres,tg_desktop_reader=r/postgres}'
     or b.bridge_acl <> '{postgres=arwdDxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres,tg_desktop_reader=r/postgres}' then
    raise exception 'TAG_MONEY_CONTRACT: protected grants drifted before containment';
  end if;
  if b.direct_deps <> 59 or b.direct_deps_md5 <> 'e21e12608fa3f834ce4621b0c31a6f72'
     or b.money_deps <> 58 or b.money_deps_md5 <> '2eebe724db2d03440058ba35a95bc02e'
     or b.invoker_deps <> 59 or b.anon_deps <> 0 or b.authenticated_deps <> 59 or b.public_deps <> 0 then
    raise exception 'TAG_MONEY_CONTRACT: dependency or privilege map drifted before containment';
  end if;
  if b.sold_deps <> 9 or b.sold_deps_md5 <> 'a997d778bc30c5d7df5c85d10bfcfddc' then
    raise exception 'TAG_MONEY_CONTRACT: sold-by-tag dependency graph drifted before containment';
  end if;
  if b.nav_money_roads <> 57 or b.nav_money_roads_md5 <> '205cc22d9e9d49f014caecc72a4cfd3b'
     or b.report_money_roads <> 11 or b.report_money_roads_md5 <> 'a9578fd3b00c20d9d0d26957cdc93d4a'
     or b.all_money_relations <> 60 or b.all_money_relations_md5 <> 'a1179f93b5d904707073ce470da40ec1' then
    raise exception 'TAG_MONEY_CONTRACT: publication road inventory drifted before containment';
  end if;
  if b.top_menu_rows <> 182 or b.top_menu_md5 <> '057a20fe92cef52ccd11ec342c705d0e'
     or b.tg_workspace_md5 <> 'ab7049beb1bd7d0b89775f441235b448'
     or b.all_nav_rows <> 671 or b.all_nav_md5 <> '22807818eb834a7d6dadb4ca786f8f33'
     or b.role_visibility_rows <> 11681 or b.role_visibility_md5 <> 'ff2723ddcadb25b6c3e8ce8451328723' then
    raise exception 'TAG_MONEY_CONTRACT: protected navigation changed before containment';
  end if;
  if b.document_indexes_md5 <> md5('mv_tag_documents_tag:CREATE UNIQUE INDEX mv_tag_documents_tag ON public.mv_tag_documents USING btree (tag)') then
    raise exception 'TAG_MONEY_CONTRACT: document-trinity unique index drifted';
  end if;
end
$$;

create or replace view public.v_tag_lifecycle
with (security_invoker = true) as
with pkg as (
  select distinct on (p.tag)
         p.tag, p.item_name, p.license, p.location, p.packaged_on, p.quantity, p.uom,
         p.finished, p.source_state, p.raw
    from public.metrc_packages p
   where p.tag is not null
   order by p.tag,
            (coalesce(p.quantity,0) > 0 and not coalesce(p.finished,false)) desc,
            (p.source_state = 'active') desc nulls last,
            p.synced_at desc nulls last
),
harv as (
  select k.tag, h.name as harvest_name, h.harvest_start, h.flower_room,
         (h.raw->>'FinishedDate')::date as harvest_finished_on
    from pkg k
    left join public.metrc_harvests h
      on h.name = split_part(coalesce(k.raw->>'SourceHarvestNames',''), ',', 1)
),
outb as (
  select distinct on (t.package_tag)
         t.package_tag, t.manifest_number, t.received_on as shipped_on,
         t.destination_facility, t.destination_licence,
         coalesce(t.source_row->>'Type','(type not recorded)') as transfer_type,
         nullif(btrim(t.source_row->>'Created by User'),'') as manifest_created_by,
         nullif(btrim(t.source_row->>'Received by User'),'') as manifest_received_by
    from public.metrc_rpt_package_transfers t
   order by t.package_tag, t.received_on desc nulls last
),
inv as (
  select o.package_tag,
         m.apex_invoice_number as invoice_number,
         m.apex_invoice_date as order_date
    from outb o
    join public.v_metrc_manifest_invoice_truth m
      on m.manifest_number = o.manifest_number
   where m.apex_invoice_number is not null
)
select
  k.tag,
  k.item_name,
  coalesce(k.raw#>>'{Item,ProductCategoryName}','(uncategorised)') as category,
  k.raw#>>'{Item,StrainName}' as strain,
  k.license as held_under_licence,
  h.harvest_name as stage1_harvest,
  h.harvest_start as stage1_cut_on,
  h.flower_room as stage1_grown_in,
  coalesce(h.harvest_name, 'NOT FROM A HARVEST OF OURS — bought in or made from another package') as stage1_note,
  k.packaged_on as stage2_packaged_on,
  nullif(k.raw->>'SourcePackageLabels','') as stage2_made_from_packages,
  nullif(k.raw->>'ProductionBatchNumber','') as stage2_production_batch,
  (k.raw->>'LabTestingStateDate')::date as stage3_submitted_on,
  (k.raw->>'LabTestingRecordedDate')::date as stage3_result_on,
  k.raw->>'LabTestingState' as stage3_lab_state,
  ev.lab_name as stage3_laboratory,
  ev.certificate_id as stage3_certificate,
  ev.certificate_date as stage3_certificate_date,
  ev.certificate_document as stage3_coa_document,
  ev.evidence_source as stage3_evidence_basis,
  coalesce(ev.why_no_certificate,
           case when ev.certificate_document is null
                then 'No certificate document held for this tag.' end) as stage3_note,
  o.manifest_number as stage4_manifest,
  o.shipped_on as stage4_shipped_on,
  o.destination_facility as stage4_shipped_to,
  o.destination_licence as stage4_buyer_licence,
  o.transfer_type as stage4_transfer_type,
  o.manifest_created_by as stage4_created_by,
  o.manifest_received_by as stage4_received_by,
  (select d.storage_path from public.metrc_documents d
    where d.manifest_number = o.manifest_number and d.doc_type ilike '%manifest%'
    limit 1) as stage4_manifest_document,
  case when o.manifest_number is null
       then 'STILL HELD — this tag has not left our licences, so there is no manifest yet.'
  end as stage4_note,
  i.invoice_number as stage5_apex_invoice,
  i.order_date as stage5_invoice_date,
  null::numeric as stage5_invoice_usd,
  null::text as stage5_payment_status,
  case
    when o.manifest_number is null then 'Not shipped, so nothing to invoice.'
    when i.invoice_number is null and public.f_is_ours(o.destination_licence)
      then 'INTERNAL MOVE between our own licences — not a sale, no invoice expected.'
    when i.invoice_number is null and not public.f_can_be_a_customer(o.destination_licence)
      then 'Destination is a laboratory or a transporter — not a sale, no invoice expected.'
    when i.invoice_number is null
      then 'NO EXACT APEX INVOICE FOUND for this shipment. This is a discrepancy to investigate.'
  end as stage5_note,
  coalesce(k.finished,false) as stage6_finished,
  (k.raw->>'FinishedDate')::date as stage6_finished_on,
  k.location as audit_room,
  round(public.f_to_pounds(k.quantity, k.uom)::numeric, 3) as audit_lb,
  k.quantity as audit_quantity,
  k.uom as audit_uom,
  case
    when coalesce(k.finished,false) then 'CLOSED — nothing physical to inspect. The record '
         || 'is the evidence.'
    when coalesce(k.quantity,0) = 0 then 'ZERO QUANTITY but not marked finished — the tag '
         || 'should be closed out in Metrc.'
    when o.manifest_number is not null and o.shipped_on is not null
      then 'SHIPPED on ' || o.shipped_on || ' to ' || coalesce(o.destination_facility,'a licensee')
         || '. Not on site.'
    when coalesce(k.location,'') = '' then 'ON SITE but Metrc records no room. Find it by tag.'
    else 'ON SITE — ' || k.location || ', licence ' || k.license
         || '. Inspect the physical tag against this record.'
  end as where_to_audit,
  'https://' || coalesce((select lower(btrim(s.value)) from public.integration_secrets s
                           where s.name='METRC_STATE'),'ma')
     || '.metrc.com/industry/' || k.license || '/packages' as metrc_screen
from pkg k
left join harv h on h.tag = k.tag
left join public.v_tag_evidence ev on ev.tag = k.tag
left join outb o on o.package_tag = k.tag
left join inv i on i.package_tag = k.tag;

comment on view public.v_tag_lifecycle is
  'The seed-to-sale lifecycle for every tag. Metrc owns custody. Apex invoice identity is attached only through the exact normalized invoice number recorded in Metrc wholesale and Apex. Proximity is never a match. Invoice dollars are intentionally null at tag grain; use v_apex_invoice_truth for sales. Payment status is unavailable here until an exact invoice-grain payment surface is governed.';
comment on column public.v_tag_lifecycle.stage5_apex_invoice is
  'Exact invoice-number identity only, reconciled through v_metrc_manifest_invoice_truth. Proximity is never a match.';
comment on column public.v_tag_lifecycle.stage5_invoice_date is
  'Apex invoice date carried only with an exact invoice-number identity.';
comment on column public.v_tag_lifecycle.stage5_invoice_usd is
  'Always null by contract. Invoice dollars are true once per Apex order and are not a tag-grain measure. Use v_apex_invoice_truth.recognized_total_usd.';
comment on column public.v_tag_lifecycle.stage5_payment_status is
  'Always null by contract. Payment status is unavailable here until an exact invoice-grain payment surface is governed.';

refresh materialized view public.mv_tag_documents;

comment on materialized view public.mv_tag_documents is
  'Document trinity at one row per tag: COA, manifest, and exact Apex invoice number. apex_invoice_usd and apex_payment_status are intentionally null because they are invoice-grain facts. Use v_apex_invoice_truth for additive sales truth.';
comment on column public.mv_tag_documents.apex_invoice_no is
  'Exact invoice-number identity only. Proximity is never a match.';
comment on column public.mv_tag_documents.apex_invoice_usd is
  'Always null by contract. Never sum invoice dollars at tag grain; use v_apex_invoice_truth.recognized_total_usd.';
comment on column public.mv_tag_documents.apex_payment_status is
  'Always null by contract. Payment status is unavailable here until an exact invoice-grain payment surface is governed.';

create or replace view public.v_forensic_sold_by_tag
with (security_invoker = true) as
select
  t.received_on as shipped_on,
  t.manifest_number,
  t.package_tag,
  t.item,
  t.category,
  t.strain,
  public.f_product_line(t.item, t.category, null::text) as product_line,
  t.shipped_lb as pounds,
  coalesce(nullif(t.source_row->>'Origin Lic.',''), t.licence) as sold_by_licence,
  t.source_row->>'Origin Facility' as sold_by_facility,
  t.destination_licence as buyer_licence,
  t.destination_facility as buyer,
  public.f_is_ours(t.destination_licence) as internal_transfer,
  t.status,
  t.source_row->>'Type' as transfer_type,
  m.apex_invoice_number as invoice_number,
  null::numeric as total_usd,
  null::text as payment_status,
  coalesce(m.match_status, 'NO METRC WHOLESALE INVOICE') as invoice_match,
  upper(btrim(coalesce(t.destination_licence,''))) like 'MT%' as is_transport_leg,
  not public.f_is_ours(t.destination_licence)
    and public.f_can_be_a_customer(t.destination_licence) as counts_as_sale,
  td.coa_certificate_id,
  td.coa_document_link,
  td.manifest_no,
  td.manifest_document_link,
  m.apex_invoice_number as apex_invoice_no,
  null::numeric as apex_invoice_usd
from public.metrc_rpt_package_transfers t
left join public.v_metrc_manifest_invoice_truth m
  on m.manifest_number = t.manifest_number
left join public.mv_tag_documents td
  on td.tag = t.package_tag
where t.shipped_lb is not null
  and t.shipped_lb <> 0::numeric
  and upper(btrim(coalesce(nullif(t.source_row->>'Origin Lic.',''), t.licence))) in (
    select upper(btrim(c.license))
    from public.company_licenses c
    where c.active
  );

comment on view public.v_forensic_sold_by_tag is
  'One row per outbound package-tag line. Invoice identity is exact normalized invoice-number only. total_usd, payment_status, and apex_invoice_usd are intentionally null because invoice facts are not additive or publishable at tag-line grain.';
comment on column public.v_forensic_sold_by_tag.invoice_number is
  'Exact invoice-number identity only through v_metrc_manifest_invoice_truth. Proximity is never a match.';
comment on column public.v_forensic_sold_by_tag.total_usd is
  'Always null by contract. Use v_apex_invoice_truth.recognized_total_usd at one row per Apex order.';
comment on column public.v_forensic_sold_by_tag.payment_status is
  'Always null by contract. Payment status is unavailable here until an exact invoice-grain payment surface is governed.';
comment on column public.v_forensic_sold_by_tag.apex_invoice_no is
  'Exact invoice-number identity only through v_metrc_manifest_invoice_truth. Proximity is never a match.';
comment on column public.v_forensic_sold_by_tag.apex_invoice_usd is
  'Always null by contract. Use v_apex_invoice_truth.recognized_total_usd at one row per Apex order.';

do $$
declare
  b _tag_money_before%rowtype;
  v_bad bigint;
  v_has_money boolean;
  r record;
begin
  select * into strict b from _tag_money_before;

  if 'public.v_tag_lifecycle'::regclass::oid <> b.lifecycle_oid
     or 'public.mv_tag_documents'::regclass::oid <> b.document_oid
     or 'public.v_forensic_sold_by_tag'::regclass::oid <> b.sold_oid
     or 'public.v_metrc_manifest_invoice_truth'::regclass::oid <> b.bridge_oid then
    raise exception 'TAG_MONEY_CONTRACT: protected object identity changed';
  end if;
  if (select relowner from pg_class where oid = b.lifecycle_oid) <> b.lifecycle_owner
     or (select relacl::text from pg_class where oid = b.lifecycle_oid) is distinct from b.lifecycle_acl
     or (select coalesce(array_to_string(reloptions, ','), '') from pg_class where oid = b.lifecycle_oid) <> b.lifecycle_options
     or (select relowner from pg_class where oid = b.document_oid) <> b.document_owner
     or (select relacl::text from pg_class where oid = b.document_oid) is distinct from b.document_acl
     or (select coalesce(array_to_string(reloptions, ','), '') from pg_class where oid = b.document_oid) <> b.document_options
     or (select relowner from pg_class where oid = b.sold_oid) <> b.sold_owner
     or (select relacl::text from pg_class where oid = b.sold_oid) is distinct from b.sold_acl
     or (select coalesce(array_to_string(reloptions, ','), '') from pg_class where oid = b.sold_oid) <> b.sold_options
     or (select relowner from pg_class where oid = b.bridge_oid) <> b.bridge_owner
     or (select relacl::text from pg_class where oid = b.bridge_oid) is distinct from b.bridge_acl
     or (select coalesce(array_to_string(reloptions, ','), '') from pg_class where oid = b.bridge_oid) <> b.bridge_options then
    raise exception 'TAG_MONEY_CONTRACT: protected owner, grants, or options changed';
  end if;
  if (select md5(string_agg(a.attnum::text || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod), '|' order by a.attnum))
      from pg_attribute a where a.attrelid = b.lifecycle_oid and a.attnum > 0 and not a.attisdropped) <> b.lifecycle_columns_md5
     or (select md5(string_agg(a.attnum::text || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod), '|' order by a.attnum))
      from pg_attribute a where a.attrelid = b.document_oid and a.attnum > 0 and not a.attisdropped) <> b.document_columns_md5
     or (select md5(string_agg(a.attnum::text || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod), '|' order by a.attnum))
      from pg_attribute a where a.attrelid = b.sold_oid and a.attnum > 0 and not a.attisdropped) <> b.sold_columns_md5
     or (select md5(string_agg(a.attnum::text || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod), '|' order by a.attnum))
      from pg_attribute a where a.attrelid = b.bridge_oid and a.attnum > 0 and not a.attisdropped) <> b.bridge_columns_md5
     or (select md5(string_agg(indexname || ':' || indexdef, '|' order by indexname))
      from pg_indexes where schemaname = 'public' and tablename = 'mv_tag_documents') <> b.document_indexes_md5 then
    raise exception 'TAG_MONEY_CONTRACT: protected signature or index changed';
  end if;

  if (select sum(recognized_total_usd) from public.v_apex_invoice_truth) is distinct from b.apex_truth_total then
    raise exception 'TAG_MONEY_CONTRACT: canonical Apex sales truth changed during containment';
  end if;
  if md5(pg_get_viewdef(b.bridge_oid, true)) <> b.bridge_definition_md5 then
    raise exception 'TAG_MONEY_CONTRACT: exact invoice bridge changed during containment';
  end if;
  if (select count(*) from public.v_metrc_manifest_invoice_truth)
       <> (select count(distinct manifest_number) from public.v_metrc_manifest_invoice_truth)
     or exists (select 1 from public.v_metrc_manifest_invoice_truth where manifest_number is null)
     or exists (select 1 from public.v_metrc_manifest_invoice_truth
                where (invoice_number_conflict or coalesce(apex_link_status = 'AMBIGUOUS INVOICE NUMBER', false))
                  and apex_invoice_number is not null) then
    raise exception 'TAG_MONEY_CONTRACT: exact invoice bridge uniqueness or ambiguity refusal failed';
  end if;

  with raw_metrc as (
    select
      w.manifest_number,
      case when count(distinct nullif(regexp_replace(w.invoice_number, '\D', '', 'g'), '')) = 1
        then min(nullif(regexp_replace(w.invoice_number, '\D', '', 'g'), '')) end as invoice_digits,
      count(distinct nullif(regexp_replace(w.invoice_number, '\D', '', 'g'), '')) > 1 as invoice_number_conflict
    from public.metrc_rpt_wholesale w
    where nullif(btrim(w.invoice_number), '') is not null
    group by w.manifest_number
  ), independent_exact as (
    select
      m.manifest_number,
      m.invoice_digits,
      m.invoice_number_conflict,
      i.apex_order_id,
      i.invoice_number as apex_invoice_number,
      i.order_date as apex_invoice_date
    from raw_metrc m
    left join public.v_apex_invoice_truth i
      on i.invoice_digits = m.invoice_digits
     and not i.invoice_number_is_ambiguous
     and not m.invoice_number_conflict
  )
  select count(*) into v_bad
  from independent_exact i
  full join public.v_metrc_manifest_invoice_truth m using (manifest_number)
  where i.manifest_number is null or m.manifest_number is null
     or i.invoice_digits is distinct from m.invoice_digits
     or i.invoice_number_conflict is distinct from m.invoice_number_conflict
     or i.apex_order_id is distinct from m.apex_order_id
     or i.apex_invoice_number is distinct from m.apex_invoice_number
     or i.apex_invoice_date is distinct from m.apex_invoice_date;
  if v_bad <> 0 then
    raise exception 'TAG_MONEY_CONTRACT: exact invoice bridge differs from independent raw-number derivation on % manifests', v_bad;
  end if;

  select count(*) into v_bad
  from public.v_tag_lifecycle l
  left join public.v_metrc_manifest_invoice_truth m on m.manifest_number = l.stage4_manifest
  where l.stage5_apex_invoice is distinct from m.apex_invoice_number
     or l.stage5_invoice_date is distinct from m.apex_invoice_date;
  if v_bad <> 0 then
    raise exception 'TAG_MONEY_CONTRACT: % lifecycle invoice identities are not exact-number reconciled', v_bad;
  end if;

  select count(*) into v_bad
  from public.v_forensic_sold_by_tag s
  left join public.v_metrc_manifest_invoice_truth m on m.manifest_number = s.manifest_number
  where s.invoice_number is distinct from m.apex_invoice_number
     or s.apex_invoice_no is distinct from m.apex_invoice_number
     or s.total_usd is not null
     or s.payment_status is not null
     or s.apex_invoice_usd is not null;
  if v_bad <> 0 then
    raise exception 'TAG_MONEY_CONTRACT: % sold-by-tag rows retain proximity identity, money, or payment status', v_bad;
  end if;

  select count(*) into v_bad
  from public.v_tag_lifecycle l
  full join public.mv_tag_documents d on d.tag = l.tag
  where l.tag is null or d.tag is null
     or d.coa_certificate_id is distinct from l.stage3_certificate
     or d.coa_document_link is distinct from l.stage3_coa_document
     or d.coa_laboratory is distinct from l.stage3_laboratory
     or d.manifest_no is distinct from l.stage4_manifest
     or d.manifest_document_link is distinct from l.stage4_manifest_document
     or d.apex_invoice_no is distinct from l.stage5_apex_invoice
     or d.apex_invoice_usd is not null
     or d.apex_payment_status is not null;
  if v_bad <> 0 then
    raise exception 'TAG_MONEY_CONTRACT: % document-trinity rows fail lifecycle reconciliation', v_bad;
  end if;

  if exists (select 1 from public.v_tag_lifecycle where stage5_invoice_usd is not null or stage5_payment_status is not null)
     or exists (select 1 from public.mv_tag_documents where apex_invoice_usd is not null or apex_payment_status is not null) then
    raise exception 'TAG_MONEY_CONTRACT: tag-grain money or payment status survived refresh';
  end if;
  if (select count(*) from public.v_tag_lifecycle) <> (select count(*) from public.mv_tag_documents)
     or (select count(*) from public.v_tag_lifecycle) <> (select count(distinct tag) from public.v_tag_lifecycle)
     or (select count(*) from public.mv_tag_documents) <> (select count(distinct tag) from public.mv_tag_documents)
     or exists (select 1 from public.v_tag_lifecycle where tag is null)
     or exists (select 1 from public.mv_tag_documents where tag is null) then
    raise exception 'TAG_MONEY_CONTRACT: tag row-count or uniqueness reconciliation failed';
  end if;

  for r in
    select distinct c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
      and a.attname = 'apex_invoice_usd'
      and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('v','m')
    order by c.relname
  loop
    execute format('select exists (select 1 from public.%I where apex_invoice_usd is not null limit 1)', r.relname)
      into v_has_money;
    if v_has_money then
      raise exception 'TAG_MONEY_CONTRACT: public.%.apex_invoice_usd still publishes tag-grain money', r.relname;
    end if;
  end loop;

  if (select count(*) from (
       select distinct c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attname = 'apex_invoice_usd' and not a.attisdropped
       where n.nspname = 'public' and c.relkind in ('v','m')) x) <> b.all_money_relations
     or (select md5(string_agg(x.relname, '|' order by x.relname)) from (
       select distinct c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attname = 'apex_invoice_usd' and not a.attisdropped
       where n.nspname = 'public' and c.relkind in ('v','m')) x) <> b.all_money_relations_md5 then
    raise exception 'TAG_MONEY_CONTRACT: money-column relation inventory changed';
  end if;

  if exists (
    select 1
    from public.report_registry r
    join information_schema.columns c
      on c.table_schema = 'public' and c.table_name = r.fact_view and c.column_name = 'apex_invoice_usd'
    where r.enabled and ('apex_invoice_usd' = any(coalesce(r.measures, '{}'::text[]))
                      or 'total_usd' = any(coalesce(r.measures, '{}'::text[])))
  ) then
    raise exception 'TAG_MONEY_CONTRACT: a tag-grain report registers invoice money as additive';
  end if;

  if (select count(*) from public.nav_registry) <> b.all_nav_rows
     or (select md5(string_agg(to_jsonb(n)::text, '|' order by n.view_key)) from public.nav_registry n) <> b.all_nav_md5
     or (select count(*) from public.nav_registry n where n.surface in ('finance','tax','hr','reports')) <> b.top_menu_rows
     or (select md5(string_agg(to_jsonb(n)::text, '|' order by n.surface,n.category_order,n.item_order,n.view_key)
         filter (where n.surface in ('finance','tax','hr','reports'))) from public.nav_registry n) <> b.top_menu_md5
     or (select md5(string_agg(to_jsonb(n)::text, '|' order by n.view_key)
         filter (where n.view_key = 'tg_workspace')) from public.nav_registry n) <> b.tg_workspace_md5
     or (select count(*) from public.nav_role_visibility) <> b.role_visibility_rows
     or (select md5(string_agg(to_jsonb(v)::text, '|' order by v.view_key,v.role)) from public.nav_role_visibility v) <> b.role_visibility_md5 then
    raise exception 'TAG_MONEY_CONTRACT: protected navigation changed';
  end if;

  if (select count(*) from (
      select distinct d.oid
      from pg_depend dep
      join pg_rewrite rw on rw.oid = dep.objid
      join pg_class d on d.oid = rw.ev_class
      where dep.refobjid = b.document_oid and d.oid <> b.document_oid) x) <> b.direct_deps
     or (select count(*) from (
      select distinct d.oid
      from pg_attribute a
      join pg_depend dep on dep.refobjid = a.attrelid and dep.refobjsubid = a.attnum
      join pg_rewrite rw on rw.oid = dep.objid
      join pg_class d on d.oid = rw.ev_class
      where a.attrelid = b.document_oid and a.attname = 'apex_invoice_usd' and not a.attisdropped and d.oid <> b.document_oid) x) <> 57 then
    raise exception 'TAG_MONEY_CONTRACT: dependency graph changed';
  end if;

  if (select md5(string_agg(x.relname, '|' order by x.relname)) from (
      select distinct d.relname
      from pg_depend dep join pg_rewrite rw on rw.oid = dep.objid join pg_class d on d.oid = rw.ev_class
      where dep.refobjid = b.document_oid and d.oid <> b.document_oid) x) <> b.direct_deps_md5
     or (select md5(string_agg(x.relname, '|' order by x.relname)) from (
      select distinct d.relname
      from pg_attribute a join pg_depend dep on dep.refobjid = a.attrelid and dep.refobjsubid = a.attnum
      join pg_rewrite rw on rw.oid = dep.objid join pg_class d on d.oid = rw.ev_class
      where a.attrelid = b.document_oid and a.attname = 'apex_invoice_usd' and not a.attisdropped and d.oid <> b.document_oid) x) <> 'eef181234378e7983cb774baaef6fb37'
     or (select count(*) from (
      select distinct d.oid from pg_depend dep join pg_rewrite rw on rw.oid = dep.objid join pg_class d on d.oid = rw.ev_class
      where dep.refobjid = b.sold_oid and d.oid <> b.sold_oid) x) <> b.sold_deps
     or (select md5(string_agg(x.relname, '|' order by x.relname)) from (
      select distinct d.relname from pg_depend dep join pg_rewrite rw on rw.oid = dep.objid join pg_class d on d.oid = rw.ev_class
      where dep.refobjid = b.sold_oid and d.oid <> b.sold_oid) x) <> b.sold_deps_md5 then
    raise exception 'TAG_MONEY_CONTRACT: dependency identity changed';
  end if;

  if (select count(*) from (
      select distinct d.oid, d.reloptions from pg_depend dep join pg_rewrite rw on rw.oid = dep.objid
      join pg_class d on d.oid = rw.ev_class where dep.refobjid = b.document_oid and d.oid <> b.document_oid) x
      where 'security_invoker=true' = any(coalesce(x.reloptions, '{}'::text[]))) <> b.invoker_deps
     or (select count(*) from (
      select distinct d.oid from pg_depend dep join pg_rewrite rw on rw.oid = dep.objid
      join pg_class d on d.oid = rw.ev_class where dep.refobjid = b.document_oid and d.oid <> b.document_oid) x
      where has_table_privilege('anon', x.oid, 'SELECT')) <> b.anon_deps
     or (select count(*) from (
      select distinct d.oid from pg_depend dep join pg_rewrite rw on rw.oid = dep.objid
      join pg_class d on d.oid = rw.ev_class where dep.refobjid = b.document_oid and d.oid <> b.document_oid) x
      where has_table_privilege('authenticated', x.oid, 'SELECT')) <> b.authenticated_deps then
    raise exception 'TAG_MONEY_CONTRACT: dependency security map changed';
  end if;

  if (select count(*) from (
      select distinct n.table_ref from public.nav_registry n join information_schema.columns c
      on c.table_schema='public' and c.table_name=n.table_ref and c.column_name='apex_invoice_usd' where n.enabled) x) <> b.nav_money_roads
     or (select md5(string_agg(x.table_ref, '|' order by x.table_ref)) from (
      select distinct n.table_ref from public.nav_registry n join information_schema.columns c
      on c.table_schema='public' and c.table_name=n.table_ref and c.column_name='apex_invoice_usd' where n.enabled) x) <> b.nav_money_roads_md5
     or (select count(*) from (
      select distinct r.fact_view from public.report_registry r join information_schema.columns c
      on c.table_schema='public' and c.table_name=r.fact_view and c.column_name='apex_invoice_usd' where r.enabled) x) <> b.report_money_roads
     or (select md5(string_agg(x.fact_view, '|' order by x.fact_view)) from (
      select distinct r.fact_view from public.report_registry r join information_schema.columns c
      on c.table_schema='public' and c.table_name=r.fact_view and c.column_name='apex_invoice_usd' where r.enabled) x) <> b.report_money_roads_md5 then
    raise exception 'TAG_MONEY_CONTRACT: publication road binding changed';
  end if;
end
$$;
