alter table actions_register add column if not exists what_to_do text;
alter table actions_register add column if not exists why_it_matters text;
alter table actions_register add column if not exists how_to_execute text;
alter table actions_register add column if not exists recommendation text;
alter table actions_register add column if not exists needs_owner boolean default false;;
