-- Eight more Human Resources pages arrived while the gate was being cleared -- Approval
-- Witness, Checklist Steps, Evidence & Attachments, KPI Definitions, Offline Punch Queue,
-- Onboarding & Offboarding, Sensitive Access Log, Session Policy. Third time today that
-- pages have appeared without ownership.
--
-- Module is a fact from category. Archetype only where the label states it.
update nav_registry set module = 'hr'
 where enabled and module is null and category = 'Human Resources';

update nav_registry set archetype = 'rules_editor'
 where enabled and archetype is null
   and label ~* '(checklist step|kpi definition|session policy)';

update nav_registry set archetype = 'punch_log'
 where enabled and archetype is null and label ~* 'offline punch queue';

update nav_registry set archetype = 'document_register'
 where enabled and archetype is null
   and label ~* '(evidence & attachment|approval witness)';

-- THE DURABLE FIX, because catching is not preventing. Three times today pages were
-- inserted with no module, and each time a human had to notice. A default cannot know the
-- department, but it CAN refuse silence: module is now required on any new row.
-- Existing rows are unaffected; this only stops the next one arriving unowned.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.nav_registry'::regclass
                   and conname  = 'nav_new_rows_declare_their_module') then
    alter table nav_registry
      add constraint nav_new_rows_declare_their_module
      check (module is not null) not valid;      -- NOT VALID: existing rows exempt
  end if;
end $$;

comment on constraint nav_new_rows_declare_their_module on nav_registry is
'Added 9 Aug 2026 after three rounds of pages arriving with no owner in a single day. NOT VALID by design: it does not touch rows that already exist, and it refuses any new row that does not name its department module. Archetype stays nullable because the layout is a design decision, not a fact -- see v_page_design_queue.';

select count(*) filter (where module is null)    as no_module,
       count(*) filter (where archetype is null) as no_archetype,
       count(*)                                   as enabled_pages
  from nav_registry where enabled;;
