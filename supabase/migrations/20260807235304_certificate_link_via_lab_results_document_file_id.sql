-- "182 packages need a pure download" was WRONG. Measured: all 127 distinct COA
-- documents behind them are ALREADY ON DISK. Zero downloads needed.
--
-- The certificates were unreachable because metrc_documents.package_tag holds ONE
-- tag and a certificate covers SEVERAL packages - doc 2342768 is filed against
-- ...020834 while ...020835 and ...020836 need the same one. The identical
-- one-to-one-on-many-to-many fault that capped coverage at 34% and left all 2,690
-- manifests unattached.
--
-- THE FIFTH LINK SOURCE, unused until now: metrc_lab_results pairs a package_tag
-- DIRECTLY with document_file_id, per result row. It is the lab's own statement of
-- which certificate belongs to which package, and it is many-to-many by nature.
--
-- Measured before this change: v_certificate_resolved 2,088 packages,
-- v_certificate_gap 977.
-- UNDO: remove the third branch of the cert CTE below.

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
  -- (a) the certificate as filed on the document row
  select package_tag, max(client_license) lic, max(client_name) nm,
         max(lab_report_id) rpt, count(*) n
  from coa_extract where package_tag is not null group by package_tag
  union all
  -- (b) THE LAB'S OWN PAIRING. metrc_lab_results says which document belongs to
  --     which package, one row per result, so it is naturally many-to-many.
  select l.package_tag,
         max(e.client_license), max(e.client_name), max(e.lab_report_id), count(*)
  from metrc_lab_results l
  join coa_extract e on e.document_id = l.document_file_id::text
  where l.document_file_id is not null and l.package_tag is not null
  group by l.package_tag
),
cert1 as (
  select package_tag, max(lic) lic, max(nm) nm, max(rpt) rpt, sum(n) n
  from cert group by package_tag
),
hit as (
  select w.package_tag, w.depth, c.lic, c.nm, c.rpt, w.ancestor,
         row_number() over (partition by w.package_tag order by w.depth) rn
  from walk w join cert1 c on c.package_tag = w.ancestor
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
  'Certificate for a package, resolved three ways: filed on the document row, paired '
  'by the laboratory in metrc_lab_results (document_file_id -> package_tag), and '
  'inherited through the lineage. found_at_depth 0 means the lab sampled THIS '
  'package; higher means inherited and MUST be reported as inherited. A certificate '
  'covers MANY packages - never match on a single stored tag alone.';;
