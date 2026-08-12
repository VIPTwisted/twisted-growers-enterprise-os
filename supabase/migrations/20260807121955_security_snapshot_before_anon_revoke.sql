/* STEP 1 OF 3 — SNAPSHOT BEFORE TOUCHING ANYTHING
   -----------------------------------------------
   Recording every grant anon and PUBLIC currently hold, so this is reversible
   in one statement if anything unexpected breaks. Nothing is revoked here.

   You do not take away 131 function grants on a live system without being able
   to put them back. */

create table if not exists security_grant_snapshot (
  id           bigserial primary key,
  taken_at     timestamptz not null default now(),
  taken_by     text not null,
  grantee      text not null,
  object_kind  text not null,
  object_name  text not null,
  privilege    text not null,
  identity_args text,
  restore_sql  text not null
);
alter table security_grant_snapshot enable row level security;
revoke all on security_grant_snapshot from anon;
grant select on security_grant_snapshot to authenticated;

insert into security_grant_snapshot (taken_by, grantee, object_kind, object_name, privilege, restore_sql)
select 'anon revoke, 7 Aug 2026', g.grantee, 'relation',
       g.table_name, g.privilege_type,
       format('grant %s on public.%I to %I;', g.privilege_type, g.table_name, g.grantee)
from information_schema.role_table_grants g
where g.table_schema='public' and g.grantee in ('anon','PUBLIC');

insert into security_grant_snapshot (taken_by, grantee, object_kind, object_name, privilege, identity_args, restore_sql)
select 'anon revoke, 7 Aug 2026', a.grantee, 'function', p.proname, 'EXECUTE',
       pg_get_function_identity_arguments(p.oid),
       format('grant execute on function public.%I(%s) to %I;',
              p.proname, pg_get_function_identity_arguments(p.oid), a.grantee)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname='public'
cross join lateral (values ('anon'),('PUBLIC')) a(grantee)
where has_function_privilege(case when a.grantee='PUBLIC' then 'public' else a.grantee end,
                             p.oid, 'EXECUTE');

select taken_by, grantee, object_kind, count(*) as grants_recorded
from security_grant_snapshot group by 1,2,3 order by 2,3;;
