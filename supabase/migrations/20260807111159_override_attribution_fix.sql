/* set_by was NOT NULL and defaulted to auth.uid(), which is null outside a
   signed-in session - so an agent, a migration or a back-office script could
   never record an override. Attribution is still required: either a user id
   or a name, and one of them must be there. */

alter table tg_overrides alter column set_by drop not null;

alter table tg_overrides
  drop constraint if exists override_must_be_attributed;
alter table tg_overrides
  add constraint override_must_be_attributed
  check (set_by is not null or length(btrim(coalesce(set_by_name,''))) >= 3);

comment on constraint override_must_be_attributed on tg_overrides is
  'Every override names someone - a signed-in user or a named agent. No anonymous edits.';;
