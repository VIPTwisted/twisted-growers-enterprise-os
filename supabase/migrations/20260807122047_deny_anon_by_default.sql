/* STEP 2 OF 3 — DENY BY DEFAULT
   -----------------------------
   anon is the role every anonymous visitor to the website holds. The
   publishable key ships inside the JavaScript bundle, so anon is effectively
   "the internet".

   It held EXECUTE on 128 functions - 33 of which write, including one that can
   roll back a data import and one that approves a column mapping without
   review - and SELECT on 1,624 relations, of which 30 returned real business
   data: the customer directory, transfer manifests, wholesale money, strain
   performance.

   The app needs NONE of it. Every RPC the front end calls (nine of them) runs
   after sign-in, and sign-in itself uses supabase.auth, which lives in the
   auth schema, not public.

   So: revoke everything from anon and from PUBLIC (which anon inherits),
   preserve exactly what signed-in users had, and change the DEFAULT so the
   next view somebody creates does not quietly reopen the hole. That last part
   is why the previous revoke pass did not hold - it fixed the views that
   existed on 6 August, and the surface grew straight back from 177 to 215.

   Reversible from security_grant_snapshot. */

-- 1. Functions: take them from PUBLIC and anon, keep them for signed-in users.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;

-- 2. Relations: anon reads nothing in public.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 3. The default, so this cannot silently come back on the next object created.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke select, insert, update, delete on tables from anon;

-- 4. Make it explicit and reviewable rather than tribal knowledge.
create table if not exists security_anon_allowlist (
  object_name  text primary key,
  object_kind  text not null,
  why_anon_needs_it text not null,
  approved_by  text not null,
  approved_on  date not null default current_date
);
alter table security_anon_allowlist enable row level security;
revoke all on security_anon_allowlist from anon;
grant select on security_anon_allowlist to authenticated;

comment on table security_anon_allowlist is
  'Everything an anonymous visitor is permitted to touch in public. Currently EMPTY, and it should stay that way - the app authenticates before it reads anything. Adding a row here is a security decision and needs a reason and a name against it.';;
