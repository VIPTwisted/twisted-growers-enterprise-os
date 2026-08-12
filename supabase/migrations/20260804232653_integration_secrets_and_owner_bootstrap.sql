-- 0007 In-app integration secrets (Law #4: credentials are configuration) + owner bootstrap

-- Service-role only: RLS enabled with NO policies = invisible & untouchable from the browser.
create table integration_secrets (
  name text primary key,
  value text not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table integration_secrets enable row level security;

-- Never expose values through audit either: log the event, not the secret.
create or replace function audit_secret_touch() returns trigger
language plpgsql security definer as $$
begin
  insert into audit_events(actor, entity, entity_id, action, new_value)
  values (auth.uid(), 'integration_secrets', new.name, tg_op, jsonb_build_object('set', true));
  return new;
end $$;
create trigger audit_integration_secrets after insert or update on integration_secrets
  for each row execute function audit_secret_touch();

-- First account ever created becomes owner; everyone after starts readonly until assigned.
create or replace function bootstrap_app_user() returns trigger
language plpgsql security definer as $$
begin
  insert into app_users(user_id, role)
  values (new.id, case when (select count(*) from app_users) = 0
                       then 'owner'::app_role else 'readonly'::app_role end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function bootstrap_app_user();;
