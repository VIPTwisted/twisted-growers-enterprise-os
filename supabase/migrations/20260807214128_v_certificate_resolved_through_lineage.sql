-- "2,605 packages have no certificate" was MISLEADING and is corrected here.
-- It meant "no certificate is linked to that exact tag". Of those 2,605:
--   576 legitimately have none  - NotSubmitted (552) or NotRequired (24)
--   102 are mid-flight          - SubmittedForTesting or TestingInProgress
--   1,927 carry a test RESULT and therefore a certificate exists somewhere
--   1,930 of the 2,605 are REPACKS, which inherit their certificate from an
--         ancestor - the one-to-one link on many-to-many data, again
--
-- A certificate belongs to the package the LAB SAMPLED. Every package made from
-- that one carries the same certified facts. Matching on the exact tag throws
-- that away. This resolves a certificate through the lineage and records HOW
-- FAR UP it was found, so an inherited certificate is never mistaken for a
-- direct one.
--
-- UNDO: drop view v_certificate_resolved cascade;

create or replace view public.v_certificate_resolved as
with recursive edges as (
  select distinct on (p.tag) p.tag, p.raw->>'SourcePackageLabels' as srcs
  from metrc_packages p order by p.tag, p.license
),
walk as (
  select e.tag as package_tag, e.tag as ancestor, 0 as depth, e.srcs
  from edges e
  union
  select w.package_tag, s.tag, w.depth + 1, s.srcs
  from walk w
  join lateral (
    select trim(x) as lbl
    from unnest(string_to_array(coalesce(w.srcs,''), ',')) x
    where trim(x) <> ''
  ) l on true
  join edges s on s.tag = l.lbl
  where w.depth < 6
),
cert as (
  select package_tag, max(client_license) lic, max(client_name) nm,
         max(lab_report_id) rpt, count(*) n
  from coa_extract where package_tag is not null group by package_tag
),
hit as (
  select w.package_tag, w.depth, c.lic, c.nm, c.rpt, w.ancestor,
         row_number() over (partition by w.package_tag order by w.depth) rn
  from walk w join cert c on c.package_tag = w.ancestor
)
select h.package_tag,
       h.depth              as found_at_depth,
       h.ancestor           as certificate_on_package,
       h.lic                as cert_license,
       h.nm                 as cert_client,
       h.rpt                as cert_report,
       case when h.depth = 0 then 'DIRECT'
            else 'INHERITED via ' || h.depth || ' repack' || case when h.depth > 1 then 's' else '' end
       end                  as certificate_link
from hit h where h.rn = 1;

comment on view public.v_certificate_resolved is
  'Certificate for a package, resolved through its lineage. found_at_depth 0 means '
  'the lab sampled this package; anything higher means it was inherited from an '
  'ancestor and MUST be reported as inherited, never as a direct certificate.';;
