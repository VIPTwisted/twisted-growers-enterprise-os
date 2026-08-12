-- 0008 Fix owner-bootstrap trigger: qualified names + locked search_path + never blocks signup.
create or replace function public.bootstrap_app_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.app_users(user_id, role)
    values (new.id, case when (select count(*) from public.app_users) = 0
                         then 'owner'::public.app_role else 'readonly'::public.app_role end);
  exception when others then
    -- Bootstrap must never break account creation; a missed row is repairable after the fact.
    null;
  end;
  return new;
end $$;;
