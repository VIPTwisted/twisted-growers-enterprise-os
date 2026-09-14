-- Applied 14 Sep 2026 02:40 UTC through the SQL console because the migration runner's empty search_path could not
-- inline f_all_ours / f_any_ours (they called f_is_ours unqualified). Recorded here so the repository carries it.
alter function public.f_all_ours(text) set search_path = public, pg_catalog;
alter function public.f_any_ours(text) set search_path = public, pg_catalog;
alter function public.f_is_ours(text) set search_path = public, pg_catalog;
create materialized view if not exists public.mv_package_dossier as select * from public.v_package_dossier;
create unique index if not exists mv_package_dossier_tag on public.mv_package_dossier (package_tag);
create materialized view if not exists public.mv_tag_lifecycle as select * from public.v_tag_lifecycle;
create unique index if not exists mv_tag_lifecycle_tag on public.mv_tag_lifecycle (tag);
create materialized view if not exists public.mv_tag_gap as select row_number() over () as rn, * from public.v_tag_gap;
create unique index if not exists mv_tag_gap_rn on public.mv_tag_gap (rn);
create index if not exists mv_tag_gap_tag on public.mv_tag_gap (tag);
create materialized view if not exists public.mv_package_events as select row_number() over () as rn, * from public.v_package_events;
create unique index if not exists mv_package_events_rn on public.mv_package_events (rn);
create index if not exists mv_package_events_tag on public.mv_package_events (package_tag);
grant select on public.mv_package_dossier, public.mv_tag_lifecycle, public.mv_tag_gap, public.mv_package_events to authenticated;;
