-- I INTRODUCED A SILENT PICK AND IT MOVED A HEADLINE NUMBER.
--
-- v_certificate_resolved takes row_number() over (order by depth) - the SHALLOWEST
-- certificate in the lineage. Adding the metrc_lab_results link attached nearer
-- certificates to packages that already had a deeper one, and 33 packages moved
-- from CONFIRMED NOT OURS to INCONCLUSIVE without anyone deciding they should.
-- The reported figure went 52 packages / 146.0 lb -> 19 / 128.5 lb.
--
-- Depth is a reasonable TIE-BREAK. It is not a reasoning. When two certificates in
-- one lineage name DIFFERENT clients, that is a disagreement, and the house rule is
-- absolute: report both, never average, never pick silently - the disagreement IS
-- the finding.
--
-- And here the deeper certificate is often the BETTER answer to the question being
-- asked. A near certificate says who tested THIS package - frequently us, on
-- material we bought. A deep one, at the root of the lineage, is closer to who grew
-- it. Depth-ordering silently prefers the weaker evidence for an ownership question.
--
-- UNDO: drop view v_certificate_disagreement;

create or replace view public.v_certificate_disagreement as
with recursive edges as (
  select distinct on (p.tag) p.tag, p.raw->>'SourcePackageLabels' as srcs
  from metrc_packages p order by p.tag, p.license
),
walk as (
  select e.tag as package_tag, e.tag as ancestor, 0 as depth, e.srcs from edges e
  union
  select w.package_tag, s.tag, w.depth + 1, s.srcs
  from walk w
  join lateral (select trim(x) as lbl
                from unnest(string_to_array(coalesce(w.srcs,''), ',')) x
                where trim(x) <> '') l on true
  join edges s on s.tag = l.lbl
  where w.depth < 6
),
cert as (
  select package_tag, max(client_license) lic, max(client_name) nm
  from coa_extract where package_tag is not null and client_license is not null
  group by package_tag
  union
  select l.package_tag, max(e.client_license), max(e.client_name)
  from metrc_lab_results l
  join coa_extract e on e.document_id = l.document_file_id::text
  where l.document_file_id is not null and l.package_tag is not null
    and e.client_license is not null
  group by l.package_tag
),
all_certs as (
  select w.package_tag, w.depth, w.ancestor, c.lic, c.nm
  from walk w join cert c on c.package_tag = w.ancestor
)
select a.package_tag,
       count(distinct a.lic)                                        as distinct_clients,
       min(a.depth) filter (where f_is_ours(a.lic))                 as nearest_ours_depth,
       min(a.depth) filter (where not f_is_ours(a.lic))             as nearest_outside_depth,
       string_agg(distinct a.nm || ' (' || a.lic || ' @ depth ' || a.depth || ')', ' | '
                  order by a.nm || ' (' || a.lic || ' @ depth ' || a.depth || ')') as certificates,
       bool_or(f_is_ours(a.lic))                                    as some_say_ours,
       bool_or(not f_is_ours(a.lic))                                as some_say_outside,
       'THE ISSUE: certificates in this package''s lineage name DIFFERENT clients. '
       'Depth is a tie-break, not a reason. A near certificate says who tested THIS '
       'package - often us, on material we bought. A deep one is closer to who grew '
       'it. Neither is automatically right.'                        as what_is_wrong,
       'Read both certificates before recording ownership. Report both figures; '
       'never average and never let the ordering decide.'           as what_to_do
from all_certs a
group by a.package_tag
having count(distinct a.lic) > 1;

comment on view public.v_certificate_disagreement is
  'Packages whose lineage carries certificates naming DIFFERENT clients. '
  'v_certificate_resolved resolves these by depth so downstream views have one '
  'answer - that is a tie-break, NOT a judgement, and every package listed here '
  'needs a human to read both certificates. Disagreement is the finding.';;
