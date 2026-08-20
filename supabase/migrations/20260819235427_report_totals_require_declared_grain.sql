-- REPORT_GRAIN_CONTRACT
-- A report cannot certify its own measure semantics. Canonical value grain,
-- source identity, eligibility, and null policy live in a separate registry.
-- The renderer may total only a complete population re-verified after reading.

set local lock_timeout = '15s';
set local statement_timeout = '5min';

create temporary table _report_grain_before on commit drop as
select
  (select count(*) from public.report_registry) registry_rows,
  (select coalesce(sum(cardinality(measures)),0) from public.report_registry where enabled) measure_cells,
  (select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='report_registry') registry_oid,
  (select c.relowner::regrole::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='report_registry') registry_owner,
  (select coalesce(c.relacl::text,'') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='report_registry') registry_acl,
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='report_registry') registry_rls,
  (select c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='report_registry') registry_force_rls,
  (select coalesce(md5(string_agg(to_jsonb(p)::text,'|' order by p.policyname,p.cmd)),'') from pg_policies p where p.schemaname='public' and p.tablename='report_registry') registry_policy_md5,
  'public.v_apex_invoice_truth'::regclass::oid apex_oid,
  md5(pg_get_viewdef('public.v_apex_invoice_truth'::regclass,true)) apex_definition_md5,
  (select sum(recognized_total_usd) from public.v_apex_invoice_truth) apex_total,
  (select count(*) from public.v_apex_invoice_truth where not cancelled and recognized_total_usd is null) apex_eligible_nulls,
  (select md5(string_agg(to_jsonb(n)::text,'|' order by n.view_key)) from public.nav_registry n) nav_md5,
  (select md5(string_agg(to_jsonb(n)::text,'|' order by n.surface,n.category_order,n.item_order,n.view_key)
      filter(where n.surface in ('finance','tax','hr','reports'))) from public.nav_registry n) top_menu_md5,
  (select md5(string_agg(to_jsonb(n)::text,'|' order by n.view_key) filter(where n.view_key='tg_workspace')) from public.nav_registry n) tg_workspace_md5,
  (select md5(string_agg(to_jsonb(v)::text,'|' order by v.view_key,v.role)) from public.nav_role_visibility v) role_md5;

do $$
declare b record;
begin
  select * into b from _report_grain_before;
  if b.registry_rows<>25 or b.measure_cells<>78 then
    raise exception 'REPORT_GRAIN_CONTRACT: report registry drifted before apply (% rows / % measures)',b.registry_rows,b.measure_cells;
  end if;
  if not exists (select 1 from public.report_registry where report_key='sales.apex_invoice_truth'
      and fact_view='v_apex_invoice_truth' and measures=array['recognized_total_usd']::text[]) then
    raise exception 'REPORT_GRAIN_CONTRACT: canonical Apex report declaration drifted';
  end if;
  if exists (select 1 from public.v_apex_invoice_truth where nullif(btrim(apex_order_id),'') is null)
     or (select count(*) from public.v_apex_invoice_truth)
        <> (select count(distinct nullif(btrim(apex_order_id),'')) from public.v_apex_invoice_truth) then
    raise exception 'REPORT_GRAIN_CONTRACT: canonical Apex order keys are blank or duplicated';
  end if;
end $$;

create table public.measure_semantic_registry(
  measure_key text primary key,
  canonical_relation text not null,
  canonical_relation_oid oid not null,
  canonical_definition_md5 text not null,
  canonical_column text not null,
  value_grain text not null,
  value_grain_keys text[] not null,
  aggregation text not null check(aggregation in ('sum','display_only')),
  eligibility_column text,
  eligibility_equals boolean,
  null_policy text not null check(null_policy='forbid_for_eligible'),
  source_system text not null,
  owner_note text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(cardinality(value_grain_keys)>0),
  check((eligibility_column is null and eligibility_equals is null)
     or (eligibility_column is not null and eligibility_equals is not null))
);

alter table public.measure_semantic_registry enable row level security;
create policy measure_semantic_registry_read on public.measure_semantic_registry
  for select to authenticated using(true);
revoke all on public.measure_semantic_registry from public,anon;
grant select on public.measure_semantic_registry to authenticated,service_role;

comment on table public.measure_semantic_registry is
  'Independent canonical measure provenance. A report declaration may reference a measure_key but cannot redefine its source, value grain, aggregation, eligibility, or null policy.';

create or replace function public.tg_guard_measure_semantic()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare current_oid oid; current_md5 text; ctype text;
begin
  new.measure_key:=btrim(new.measure_key); new.canonical_relation:=btrim(new.canonical_relation);
  new.canonical_column:=btrim(new.canonical_column); new.value_grain:=btrim(new.value_grain);
  new.source_system:=btrim(new.source_system); new.owner_note:=btrim(new.owner_note); new.updated_at:=now();
  if new.measure_key='' or new.canonical_relation='' or new.canonical_column='' or new.value_grain=''
     or new.source_system='' or new.owner_note='' or exists(select 1 from unnest(new.value_grain_keys) k where btrim(k)='') then
    raise exception 'REPORT_GRAIN_CONTRACT: canonical measure fields and keys cannot be blank';
  end if;
  select c.oid,md5(pg_get_viewdef(c.oid,true)) into current_oid,current_md5
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname=new.canonical_relation and c.relkind in ('v','m');
  if current_oid is null or current_oid<>new.canonical_relation_oid or current_md5 is distinct from new.canonical_definition_md5 then
    raise exception 'REPORT_GRAIN_CONTRACT: canonical relation identity or definition is not the reviewed source';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=new.canonical_relation and column_name=new.canonical_column)
     or exists(select 1 from unnest(new.value_grain_keys) k where not exists(
       select 1 from information_schema.columns where table_schema='public' and table_name=new.canonical_relation and column_name=k)) then
    raise exception 'REPORT_GRAIN_CONTRACT: canonical measure or value-grain key column is missing';
  end if;
  if new.eligibility_column is not null then
    select data_type into ctype from information_schema.columns
    where table_schema='public' and table_name=new.canonical_relation and column_name=new.eligibility_column;
    if ctype is distinct from 'boolean' then raise exception 'REPORT_GRAIN_CONTRACT: eligibility column must be boolean'; end if;
  end if;
  return new;
end $$;

create trigger measure_semantic_guard before insert or update on public.measure_semantic_registry
for each row execute function public.tg_guard_measure_semantic();

insert into public.measure_semantic_registry(
  measure_key,canonical_relation,canonical_relation_oid,canonical_definition_md5,canonical_column,
  value_grain,value_grain_keys,aggregation,eligibility_column,eligibility_equals,null_policy,
  source_system,owner_note
) values (
  'apex.recognized_sales','v_apex_invoice_truth','public.v_apex_invoice_truth'::regclass::oid,
  md5(pg_get_viewdef('public.v_apex_invoice_truth'::regclass,true)),'recognized_total_usd',
  'one row per Apex order',array['apex_order_id']::text[],'sum','cancelled',false,
  'forbid_for_eligible','Apex','Apex owns sales. Cancelled orders are ineligible; every non-cancelled order must carry a numeric value before a total is certified.'
);

alter table public.report_registry
  add column row_grain text,
  add column grain_keys text[] not null default '{}'::text[],
  add column measure_contracts jsonb not null default '{}'::jsonb,
  add constraint report_measure_contracts_are_an_object check(jsonb_typeof(measure_contracts)='object');

create or replace function public.tg_guard_report_measure_contract()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare measure_name text; contract jsonb; semantic public.measure_semantic_registry%rowtype;
begin
  -- Turning a road off is always safe. Re-enabling it re-runs the full guard.
  if not new.enabled then return new; end if;
  if jsonb_typeof(new.measure_contracts)<>'object' or exists(select 1 from unnest(new.grain_keys) k where btrim(k)='') then
    raise exception 'REPORT_GRAIN_CONTRACT: report contract object and grain keys are invalid';
  end if;
  for measure_name,contract in select key,value from jsonb_each(new.measure_contracts) loop
    if not(measure_name=any(new.measures)) or jsonb_typeof(contract)<>'object' or nullif(btrim(contract->>'measure_key'),'') is null then
      raise exception 'REPORT_GRAIN_CONTRACT: % has no valid canonical measure reference',measure_name;
    end if;
    select * into semantic from public.measure_semantic_registry where measure_key=contract->>'measure_key' and enabled;
    if not found then raise exception 'REPORT_GRAIN_CONTRACT: canonical measure % is unavailable',contract->>'measure_key'; end if;
    if semantic.canonical_relation<>new.fact_view or semantic.canonical_column<>measure_name
       or semantic.value_grain is distinct from nullif(btrim(coalesce(new.row_grain,'')),'')
       or semantic.value_grain_keys is distinct from new.grain_keys then
      raise exception 'REPORT_GRAIN_CONTRACT: % canonical source/value grain does not match this report',measure_name;
    end if;
  end loop;
  foreach measure_name in array new.measures loop
    if not(new.measure_contracts?measure_name) then raise exception 'REPORT_GRAIN_CONTRACT: declared measure % has no canonical contract',measure_name; end if;
  end loop;
  return new;
end $$;

create trigger report_measure_contract_guard
before insert or update of report_key,fact_view,enabled,measures,row_grain,grain_keys,measure_contracts
on public.report_registry for each row execute function public.tg_guard_report_measure_contract();

update public.report_registry set
  row_grain='one row per Apex order', grain_keys=array['apex_order_id']::text[],
  measure_contracts=jsonb_build_object('recognized_total_usd',jsonb_build_object('measure_key','apex.recognized_sales')),
  updated_at=now()
where report_key='sales.apex_invoice_truth' and fact_view='v_apex_invoice_truth';

create or replace view public.v_report_measure_governance with(security_invoker=true) as
select r.report_key,r.title,r.fact_view,r.row_grain,r.grain_keys,m.measure,
  r.measure_contracts->m.measure->>'measure_key' measure_key,s.canonical_relation,s.canonical_column,
  s.value_grain,s.value_grain_keys,s.aggregation,s.eligibility_column,s.eligibility_equals,
  s.null_policy,s.source_system,
  case when s.measure_key is null then 'UNVERIFIED — total refused'
       when s.canonical_relation<>r.fact_view or s.canonical_column<>m.measure or s.value_grain<>r.row_grain or s.value_grain_keys<>r.grain_keys then 'CANONICAL MISMATCH — total refused'
       else 'DECLARED CANONICAL MEASURE — live proof required' end contract_status
from public.report_registry r cross join lateral unnest(r.measures)m(measure)
left join public.measure_semantic_registry s on s.measure_key=r.measure_contracts->m.measure->>'measure_key' and s.enabled
where r.enabled;
alter view public.v_report_measure_governance owner to postgres;
revoke all on public.v_report_measure_governance from public,anon;
grant select on public.v_report_measure_governance to authenticated,service_role;

create or replace function public.f_verify_report_grains(p_report_key text)
returns table(report_key text,fact_view text,row_grain text,grain_keys text[],row_count bigint,
  distinct_grain_rows bigint,blank_grain_rows bigint,eligible_measure_rows bigint,
  valued_measure_rows bigint,invalid_measure_rows bigint,source_verified boolean,
  contract_digest text,observed_at timestamptz,verdict text)
language plpgsql security invoker set search_path=pg_catalog,public set statement_timeout='8s' as $$
declare r record; s record; key_sql text; blank_sql text; eligible_sql text:='0'; valued_sql text:='0'; invalid_sql text:='0';
  one_eligible text; source_bad boolean:=false; missing_column boolean:=false;
begin
  select * into r from public.report_registry rr where rr.report_key=p_report_key and rr.enabled and rr.measure_contracts<>'{}'::jsonb;
  if not found then return; end if;
  report_key:=r.report_key; fact_view:=r.fact_view; row_grain:=r.row_grain; grain_keys:=r.grain_keys; observed_at:=clock_timestamp();
  select md5((jsonb_build_object('report_key',r.report_key,'fact_view',r.fact_view,'row_grain',r.row_grain,
    'grain_keys',r.grain_keys,'measure_contracts',r.measure_contracts,'semantics',coalesce((select jsonb_agg(to_jsonb(ms) order by ms.measure_key)
      from public.measure_semantic_registry ms where ms.measure_key in(select value->>'measure_key' from jsonb_each(r.measure_contracts))),'[]'::jsonb)))::text)
    into contract_digest;
  select count(*)<>(select count(*) from jsonb_object_keys(r.measure_contracts)) into source_bad
  from public.measure_semantic_registry ms
  where ms.enabled and ms.measure_key in(select value->>'measure_key' from jsonb_each(r.measure_contracts));
  for s in select ms.*,m.measure from unnest(r.measures)m(measure)
      join public.measure_semantic_registry ms on ms.measure_key=r.measure_contracts->m.measure->>'measure_key' and ms.enabled loop
    if s.canonical_relation<>r.fact_view or s.canonical_column<>s.measure or s.value_grain<>r.row_grain or s.value_grain_keys<>r.grain_keys
       or to_regclass(format('public.%I',s.canonical_relation))::oid is distinct from s.canonical_relation_oid
       or md5(pg_get_viewdef(s.canonical_relation_oid,true)) is distinct from s.canonical_definition_md5 then source_bad:=true; end if;
    if s.aggregation='sum' then
      one_eligible:=case when s.eligibility_column is null then 'true'
        else format('%I is not distinct from %L::boolean',s.eligibility_column,s.eligibility_equals) end;
      eligible_sql:=eligible_sql||format(' + count(*) filter(where %s)',one_eligible);
      valued_sql:=valued_sql||format(' + count(*) filter(where %s and %I is not null)',one_eligible,s.canonical_column);
      invalid_sql:=invalid_sql||format(' + count(*) filter(where %s and %I is null)',one_eligible,s.canonical_column);
    end if;
  end loop;
  source_verified:=not source_bad;
  select exists(select 1 from unnest(r.grain_keys) k where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=r.fact_view and c.column_name=k)) into missing_column;
  if to_regclass(format('public.%I',r.fact_view)) is null or missing_column or source_bad then verdict:='REFUSED — canonical relation, definition, or grain key drifted'; return next; return; end if;
  select string_agg(format('nullif(btrim((%I)::text),'''')',k),', '),string_agg(format('nullif(btrim((%I)::text),'''') is null',k),' or ')
    into key_sql,blank_sql from unnest(r.grain_keys)k;
  execute format('select count(*),count(distinct (%s)),count(*) filter(where %s),%s,%s,%s from public.%I',
    key_sql,blank_sql,eligible_sql,valued_sql,invalid_sql,r.fact_view)
    into row_count,distinct_grain_rows,blank_grain_rows,eligible_measure_rows,valued_measure_rows,invalid_measure_rows;
  verdict:=case when row_count=0 then 'REFUSED — no rows to verify'
    when blank_grain_rows>0 then 'REFUSED — blank grain keys'
    when row_count<>distinct_grain_rows then 'REFUSED — canonical grain keys are not unique'
    when invalid_measure_rows>0 then 'REFUSED — eligible sum values are incomplete'
    else 'VERIFIED — row/value grain and eligible values are complete' end;
  return next;
end $$;

alter function public.f_verify_report_grains(text) owner to postgres;
revoke all on function public.f_verify_report_grains(text) from public,anon,tg_desktop_reader;
grant execute on function public.f_verify_report_grains(text) to authenticated,service_role;

create or replace function public.f_report_registry_runtime(p_fact_view text)
returns table(report_key text,title text,category text,fact_view text,date_column text,dimensions text[],measures text[],
  description text,owner_note text,enabled boolean,created_at timestamptz,updated_at timestamptz,row_grain text,grain_keys text[],
  measure_contracts jsonb,grain_verified boolean,grain_verification_reason text,contract_digest text,contract_observed_at timestamptz,
  population_snapshot_verified boolean,population_snapshot_id text,population_snapshot_reason text,
  verified_row_count bigint,eligible_measure_rows bigint,valued_measure_rows bigint,invalid_measure_rows bigint)
language sql stable security invoker set search_path=pg_catalog,public set statement_timeout='8s' as $$
select r.report_key,r.title,r.category,r.fact_view,r.date_column,r.dimensions,r.measures,r.description,r.owner_note,r.enabled,
  r.created_at,r.updated_at,r.row_grain,r.grain_keys,
  coalesce(res.contracts,'{}'::jsonb),coalesce(v.verdict='VERIFIED — row/value grain and eligible values are complete',false),
  coalesce(v.verdict,'UNVERIFIED — no execution-backed canonical contract'),v.contract_digest,v.observed_at,
  false,null::text,'REFUSED — no snapshot-bound database population receipt exists',v.row_count,
  v.eligible_measure_rows,v.valued_measure_rows,v.invalid_measure_rows
from public.report_registry r
left join lateral public.f_verify_report_grains(r.report_key)v on r.measure_contracts<>'{}'::jsonb
left join lateral(select jsonb_object_agg(m.measure,jsonb_build_object(
    'measure_key',s.measure_key,'canonical_relation',s.canonical_relation,'canonical_column',s.canonical_column,
    'value_grain',s.value_grain,'value_grain_keys',s.value_grain_keys,'aggregation',s.aggregation,
    'eligibility_column',s.eligibility_column,'eligibility_equals',s.eligibility_equals,'null_policy',s.null_policy,
    'source_system',s.source_system,'source_verified',coalesce(v.source_verified,false),
    'source_verification_reason',v.verdict)) contracts
  from unnest(r.measures)m(measure) left join public.measure_semantic_registry s
    on s.measure_key=r.measure_contracts->m.measure->>'measure_key' and s.enabled)res on true
where r.enabled and r.fact_view=p_fact_view order by r.report_key
$$;

alter function public.f_report_registry_runtime(text) owner to postgres;
revoke all on function public.f_report_registry_runtime(text) from public,anon,tg_desktop_reader;
grant execute on function public.f_report_registry_runtime(text) to authenticated,service_role;

do $$
declare b record;v record;rejected boolean:=false;state text;message text;
begin
  begin update public.report_registry set fact_view='v_metrc_manifest_invoice_truth' where report_key='sales.apex_invoice_truth';
  exception when others then get stacked diagnostics state=returned_sqlstate,message=message_text;
    if state<>'P0001' or message not like 'REPORT_GRAIN_CONTRACT:%canonical source/value grain%' then raise; end if; rejected:=true;
  end;
  if not rejected then raise exception 'REPORT_GRAIN_CONTRACT: fact-view republish negative fixture was accepted'; end if;
  select * into v from public.f_verify_report_grains('sales.apex_invoice_truth'); select * into b from _report_grain_before;
  if v.row_count=0 or v.row_count<>v.distinct_grain_rows or v.blank_grain_rows<>0 or not v.source_verified
     or v.invalid_measure_rows<>b.apex_eligible_nulls
     or (b.apex_eligible_nulls>0 and v.verdict<>'REFUSED — eligible sum values are incomplete')
     or (b.apex_eligible_nulls=0 and v.verdict<>'VERIFIED — row/value grain and eligible values are complete') then
    raise exception 'REPORT_GRAIN_CONTRACT: live canonical proof is inconsistent (%)',to_jsonb(v);
  end if;
  if (select count(*) from public.v_report_measure_governance where contract_status='DECLARED CANONICAL MEASURE — live proof required')<>1
     or (select count(*) from public.v_report_measure_governance where contract_status='UNVERIFIED — total refused')<>77 then
    raise exception 'REPORT_GRAIN_CONTRACT: governance census is not 1 canonical plus 77 refused';
  end if;
  if (select count(*) from public.f_report_registry_runtime('not_a_registered_fact_view'))<>0 then
    raise exception 'REPORT_GRAIN_CONTRACT: unrelated runtime lookup returned a contract';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname in('f_verify_report_grains','f_report_registry_runtime') and p.prosecdef)
     or not has_function_privilege('authenticated','public.f_report_registry_runtime(text)','EXECUTE')
     or has_function_privilege('anon','public.f_report_registry_runtime(text)','EXECUTE') then
    raise exception 'REPORT_GRAIN_CONTRACT: runtime functions are not safe invoker-only publications';
  end if;
  if (select count(*) from public.report_registry)<>b.registry_rows
     or (select coalesce(sum(cardinality(measures)),0) from public.report_registry where enabled)<>b.measure_cells
     or (select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='report_registry')<>b.registry_oid
     or (select c.relowner::regrole::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='report_registry') is distinct from b.registry_owner
     or (select coalesce(c.relacl::text,'') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='report_registry') is distinct from b.registry_acl
     or (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='report_registry') is distinct from b.registry_rls
     or (select c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='report_registry') is distinct from b.registry_force_rls
     or (select coalesce(md5(string_agg(to_jsonb(p)::text,'|' order by p.policyname,p.cmd)),'') from pg_policies p where p.schemaname='public' and p.tablename='report_registry') is distinct from b.registry_policy_md5
     or 'public.v_apex_invoice_truth'::regclass::oid<>b.apex_oid or md5(pg_get_viewdef('public.v_apex_invoice_truth'::regclass,true))<>b.apex_definition_md5
     or (select sum(recognized_total_usd) from public.v_apex_invoice_truth) is distinct from b.apex_total
     or (select md5(string_agg(to_jsonb(n)::text,'|' order by n.view_key)) from public.nav_registry n) is distinct from b.nav_md5
     or (select md5(string_agg(to_jsonb(n)::text,'|' order by n.surface,n.category_order,n.item_order,n.view_key) filter(where n.surface in('finance','tax','hr','reports'))) from public.nav_registry n) is distinct from b.top_menu_md5
     or (select md5(string_agg(to_jsonb(n)::text,'|' order by n.view_key) filter(where n.view_key='tg_workspace')) from public.nav_registry n) is distinct from b.tg_workspace_md5
     or (select md5(string_agg(to_jsonb(n)::text,'|' order by n.view_key,n.role)) from public.nav_role_visibility n) is distinct from b.role_md5 then
    raise exception 'REPORT_GRAIN_CONTRACT: protected truth, registry, navigation, or roles changed';
  end if;
end $$;
