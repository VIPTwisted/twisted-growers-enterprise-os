-- GROK-WHY: Already applied in production as 20260912194358 hr_import_bridge_temporary.
-- Another desk ran this. Filed here so migration-drift can pass and the Bots paid key can ship on Sync.
-- Exact SQL from supabase_migrations.schema_migrations.statements. No ledger rewrite. Metrc read-only.

-- TEMPORARY import bridge: pulls schema-only DDL from vip-hr-platform's export function through pg_net
-- (VIP's publishable key, schema text only, no rows) and applies it statement by statement into `hr`,
-- logging every failure so nothing is silently skipped. Dropped when the clone is loaded.
create schema if not exists hr_import;
create table if not exists hr_import.log (
  id bigint generated always as identity primary key,
  kind text, request_id bigint, stmt_no int, stmt text, error text, applied_at timestamptz default now()
);
create table if not exists hr_import.requests (
  request_id bigint primary key, kind text, p_from int, p_to int, created_at timestamptz default now(), applied boolean default false, ok int, failed int
);

create or replace function hr_import.fetch(p_kind text, p_from int default 1, p_to int default 100000)
returns bigint language plpgsql security definer as $$
declare v_id bigint;
begin
  select net.http_post(
    url := 'https://zsmdejhgdyyaakqsjhmk.supabase.co/rest/v1/rpc/tg_ddl_export',
    body := jsonb_build_object('p_kind', p_kind, 'p_from', p_from, 'p_to', p_to),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzbWRlamhnZHl5YWFrcXNqaG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MTA3OTcsImV4cCI6MjA5Nzk4Njc5N30.BqFZqX0Ma35RjMDU0NprPxp-6_f2s8dBQedGC_ohkZ4',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzbWRlamhnZHl5YWFrcXNqaG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MTA3OTcsImV4cCI6MjA5Nzk4Njc5N30.BqFZqX0Ma35RjMDU0NprPxp-6_f2s8dBQedGC_ohkZ4'),
    timeout_milliseconds := 60000) into v_id;
  insert into hr_import.requests (request_id, kind, p_from, p_to) values (v_id, p_kind, p_from, p_to);
  return v_id;
end $$;

create or replace function hr_import.apply(p_request_id bigint)
returns table (ok int, failed int, status int, note text) language plpgsql security definer as $$
declare r record; v_body text; v_stmts text[]; s text; n int := 0; v_ok int := 0; v_fail int := 0; v_kind text;
begin
  select * into r from net._http_response where id = p_request_id;
  if r.id is null then return query select 0, 0, null::int, 'no response yet'; return; end if;
  if r.status_code <> 200 then return query select 0, 0, r.status_code, left(coalesce(r.content, r.error_msg), 300); return; end if;
  select kind into v_kind from hr_import.requests where request_id = p_request_id;
  v_body := r.content::jsonb #>> '{}';
  if v_body is null or v_body = '' then return query select 0, 0, 200, 'empty body'; return; end if;
  v_stmts := string_to_array(v_body, E'\n--@@--\n');
  foreach s in array v_stmts loop
    n := n + 1;
    begin
      execute s;
      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      insert into hr_import.log (kind, request_id, stmt_no, stmt, error) values (v_kind, p_request_id, n, s, sqlerrm);
    end;
  end loop;
  update hr_import.requests set applied = true, ok = v_ok, failed = v_fail where request_id = p_request_id;
  return query select v_ok, v_fail, 200, v_kind || ': ' || array_length(v_stmts, 1) || ' statements';
end $$;

-- kick off the first four small kinds now
select hr_import.fetch('fks'), hr_import.fetch('indexes'), hr_import.fetch('rls'), hr_import.fetch('triggers');
