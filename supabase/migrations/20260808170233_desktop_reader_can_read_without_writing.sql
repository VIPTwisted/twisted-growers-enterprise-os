/* THE BRIDGE COULD NOT SEE THE DATABASE IT WAS ANSWERING FROM.

   Asked how many documents exist, it answered "metrc_documents itself has 0
   rows". It holds 3,675. Not a data fault and not a model fault: the bridge
   reads as tg_desktop_reader, RLS is on, and every policy is written `to
   authenticated`. That role is not authenticated, so where no policy matches
   Postgres returns ZERO ROWS WITH NO ERROR - an empty result indistinguishable
   from an empty table. Absence reported as fact, confidently, in one second.

   WHY NOT THE OBVIOUS FIX. Making the reader a member of `authenticated` was my
   first instinct and it is dangerous: authenticated holds INSERT, UPDATE,
   DELETE and TRUNCATE on 527 tables. That would hand a desktop process the
   ability to truncate this company's database to fix a read problem. Checked
   before doing it, which is the only reason it is not done.

   WHAT IS ACTUALLY RIGHT. tg_desktop_reader holds SELECT and nothing else, on
   525 tables. Privileges and RLS are independent layers, so BYPASSRLS lets it
   READ what it is already permitted to read, and it still cannot write a single
   row anywhere - there is no INSERT, UPDATE or DELETE grant to fall back on.
   Future tables are readable automatically, instead of silently going invisible
   the way these did.

   AND THEN LESS THAN THAT. BYPASSRLS ignores per-user scoping too, so the
   handful of genuinely PERSONAL tables are revoked outright rather than left to
   a policy that no longer applies. A structural boundary, not an instruction to
   be careful - the assistant is told not to disclose personal detail, and this
   makes it unable to. app_secrets first: a desktop process has no business
   reading the company's keys, ever. */
alter role tg_desktop_reader bypassrls;

revoke select on app_secrets            from tg_desktop_reader;
revoke select on user_settings          from tg_desktop_reader;
revoke select on time_tracks            from tg_desktop_reader;
revoke select on assistant_uploads      from tg_desktop_reader;
revoke select on ai_write_approval      from tg_desktop_reader;
revoke select on ai_action_log          from tg_desktop_reader;
revoke select on user_page_date_default from tg_desktop_reader;
revoke select on ai_user_access         from tg_desktop_reader;

comment on role tg_desktop_reader is
  'The desktop bridge. SELECT only - no write grant exists anywhere, so it cannot change a row whatever it is asked. BYPASSRLS because every policy here is written `to authenticated` and this role is not, which made tables look EMPTY rather than forbidden. Personal tables and app_secrets are revoked outright: a boundary it cannot cross, rather than an instruction it might ignore.';;
