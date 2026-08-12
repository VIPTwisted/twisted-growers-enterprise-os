/* integration_secrets held every credential this company owns - Metrc licences,
   the vendor and user keys, the ClickUp token, and shortly the Apex key - and
   three separate things could reach them that had no business doing so.

   1. tg_desktop_reader had SELECT, under a policy whose USING clause was
      literally `true`, AND the role carries rolbypassrls. That is MY doing: I
      granted BYPASSRLS this morning to fix the bridge reading 0 rows off a
      3,675-row table, and I did not carve out the one table where a blanket
      read is a breach rather than a convenience. The bridge has never read
      this table - it is not in bridge/schema-map.txt and appears nowhere in
      bridge/server.mjs - so nothing depends on the access.

   2. `authenticated` held SELECT, INSERT, UPDATE and DELETE. RLS currently
      denies it, because the only policy names tg_desktop_reader and an
      unmatched role gets zero rows. So it was not exploitable today. It was
      one permissive policy away from being exploitable by every signed-in
      employee, and a grant nobody needs is a loaded gun on the table.

   3. RLS was not FORCEd, so the table owner was exempt from its own policies.

   The edge function keeps working throughout: it runs as service_role, which
   carries rolbypassrls and is the only path that should ever read a value. */

drop policy if exists tg_desktop_read on public.integration_secrets;

revoke all on public.integration_secrets from tg_desktop_reader;
revoke all on public.integration_secrets from authenticated;
revoke all on public.integration_secrets from anon;

/* FORCE, so the owner is subject to its own policies too. There is now no
   policy at all on this table, which is deliberate: with RLS enabled and
   forced, and no permissive policy, EVERY role except a BYPASSRLS one reads
   nothing. service_role is the sole way in, and service_role only exists
   inside the edge function. Reversible with NO FORCE if a recovery ever needs
   it - and needing that would itself be the alarm. */
alter table public.integration_secrets enable row level security;
alter table public.integration_secrets force row level security;

comment on table public.integration_secrets is
  'Credential vault. NO policy and FORCE RLS by design: service_role only, via the integration-settings edge function. Never grant SELECT to a login role, never add a permissive policy, and never expose a value through PostgREST or a view. Locked down 9 Aug 2026 after tg_desktop_reader (BYPASSRLS) was found holding SELECT under a USING(true) policy.';;
