-- f_is_ours() TAKES ONE LICENCE. A CERTIFICATE CAN NAME SEVERAL.
--
-- A laboratory prints the client's licences as they appear on the licence itself:
--     Twisted Growers
--     License #: MC281714, MP281909
-- so client_license holds the STRING 'MC281714, MP281909'. f_is_ours() compares
-- that whole string and returns FALSE - it matches neither member.
--
-- 621 of our own 983 certificates are stored that way, and 666 certificates in
-- total carry more than one licence. v_certificate_disagreement classified every
-- one of them as an OUTSIDE company, which is how a package whose certificates all
-- say "Twisted Growers" came to be reported as ours-versus-outside.
--
-- This is trap 3 in a new coat: a field that usually holds one value sometimes
-- holds a list, and a comparison written for the single case fails silently on the
-- rest. It does not error. It just answers the wrong question.
--
-- f_is_ours stays exactly as it is - it is correct for a single licence and is used
-- that way in many places. This is the SET version.
-- UNDO: drop function f_any_ours(text);

create or replace function public.f_any_ours(p_licences text)
returns boolean language sql immutable as $$
  select case when p_licences is null or btrim(p_licences) = '' then false
         else exists (
           select 1 from unnest(string_to_array(p_licences, ',')) x
           where f_is_ours(btrim(x)))
         end;
$$;

comment on function public.f_any_ours(text) is
  'True when ANY licence in a comma-separated list is ours. Use this for '
  'coa_extract.client_license and anywhere else a field may hold several licences - '
  '666 certificates do, 621 of them ours. f_is_ours() takes ONE licence and returns '
  'false on a list, silently.';

create or replace function public.f_all_ours(p_licences text)
returns boolean language sql immutable as $$
  select case when p_licences is null or btrim(p_licences) = '' then false
         else not exists (
           select 1 from unnest(string_to_array(p_licences, ',')) x
           where btrim(x) <> '' and not f_is_ours(btrim(x)))
         end;
$$;

comment on function public.f_all_ours(text) is
  'True only when EVERY licence in the list is ours. Use when a mixed list must not '
  'count as ours.';

-- Rebuild the disagreement view on the corrected test.
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
       count(distinct a.lic)                                    as distinct_clients,
       min(a.depth) filter (where f_any_ours(a.lic))             as nearest_ours_depth,
       min(a.depth) filter (where not f_any_ours(a.lic))         as nearest_outside_depth,
       string_agg(distinct a.nm || ' (' || a.lic || ' @ depth ' || a.depth || ')', ' | '
                  order by a.nm || ' (' || a.lic || ' @ depth ' || a.depth || ')') as certificates,
       bool_or(f_any_ours(a.lic))                                as some_say_ours,
       bool_or(not f_any_ours(a.lic))                            as some_say_outside,
       'THE ISSUE: certificates in this package''s lineage name DIFFERENT clients. '
       'Depth is a tie-break, not a reason. A near certificate says who tested THIS '
       'package - often us, on material we bought. A deep one is closer to who grew '
       'it. Neither is automatically right.'                     as what_is_wrong,
       'Read both certificates before recording ownership. Report both figures; '
       'never average and never let the ordering decide.'        as what_to_do
from all_certs a
group by a.package_tag
having count(distinct a.lic) > 1;;
