/* THE PET MUST COME BACK WHERE THE USER LEFT IT — ON ANY MACHINE
   --------------------------------------------------------------
   useBudzPet persists to localStorage under 'tg.pet.v1'. That is per BROWSER,
   not per user: sign in from a different machine and the pet is gone, and two
   people sharing a machine share each other's pet. The work order asks for it
   in user_settings, and user_settings had no columns for it.

   Additive columns only. No RLS change - the table already has row level
   security with an own_settings policy, so a user reads and writes only their
   own row and these columns inherit that automatically. No grants issued.

   pet_notify records WHICH sources the owner wants to be interrupted by. It
   defaults to nothing enabled rather than everything: a pet that pulses at
   every one of 20 critical findings on first sight is a pet that gets switched
   off, and the owner's own rule is to choose rather than assume. */

alter table user_settings
  add column if not exists pet_on        boolean not null default false,
  add column if not exists pet_x         integer,
  add column if not exists pet_y         integer,
  add column if not exists pet_size      integer,
  add column if not exists pet_minimised boolean not null default false,
  add column if not exists pet_notify    jsonb   not null default
    '{"inventory_alerts":false,"critical_findings":false,"alert_outbox":false,"messages":false}'::jsonb;

comment on column user_settings.pet_on is
  'Pet mode on or off for this user. Distinct from pet_minimised: off means gone until re-enabled from the toggle; minimised means still there and still watching.';
comment on column user_settings.pet_minimised is
  'Hidden but alive. The pet keeps watching for alerts and can still pulse.';
comment on column user_settings.pet_notify is
  'Which sources may interrupt this user. Defaults to none - the owner chooses what is worth being interrupted by rather than being opted in to all of it.';

select column_name, data_type, column_default
from information_schema.columns
where table_schema='public' and table_name='user_settings' and column_name like 'pet%'
order by ordinal_position;;
