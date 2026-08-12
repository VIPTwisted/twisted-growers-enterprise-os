-- The previous attempt set search_path on f_material_origin and then failed on a
-- unique index — and the rollback took the ALTER with it. Both go in together.
--
-- Neither f_material_origin nor f_is_ours fixes its own search_path, so both
-- resolve table names against whatever the caller happens to have. They work
-- from a normal session by luck and fail outright when a materialized view is
-- built over them:
--     ERROR: relation "metrc_packages" does not exist
-- A function whose correctness depends on the caller's environment fails
-- somewhere eventually, and for a SECURITY DEFINER function it is also the
-- mechanism of a search_path attack. ALTER ... SET leaves both bodies untouched.
alter function public.f_material_origin(text) set search_path to 'public';
alter function public.f_is_ours(text)         set search_path to 'public';

-- metrc_packages is NOT unique on tag — the same package appears under both
-- licences, 4,259 rows against 4,252 distinct tags, which is exactly what the
-- packages-unique-on-tag check reports. DISTINCT ON (tag) ORDER BY tag, license
-- mirrors what f_material_origin does internally ("dedupe: one row per tag"), so
-- the two agree rather than each picking a different row.
--
-- Dropping a MATERIALIZED VIEW created minutes ago with no dependents. Rule E1
-- forbids the cascade drop of a view things read — that blanked three dashboards.
-- Nothing reads this yet and there is no CASCADE.
drop materialized view if exists mv_package_origin;

create materialized view mv_package_origin as
select distinct on (p.tag)
       p.tag,
       f_material_origin(p.tag) as origin,
       now()                    as computed_at
from metrc_packages p
order by p.tag, p.license;

create unique index mv_package_origin_tag on mv_package_origin (tag);

comment on materialized view mv_package_origin is
  'Package lineage resolved ONCE per package. f_material_origin is a recursive walk; four views called it per row, and v_shipped_full called it 19,256 times for 4,259 distinct packages and timed out at two minutes when its columns were actually produced. Refresh when packages change, not when somebody looks.';

grant select on mv_package_origin to authenticated;
revoke all on mv_package_origin from anon;;
