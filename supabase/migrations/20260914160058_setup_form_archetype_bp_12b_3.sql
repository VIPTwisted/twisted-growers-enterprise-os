-- BP-12b-3 Setup form — the data_browser archetype (251 registry pages; 141 are tables of set-up data,
-- 100 views, 7 matviews). Owner, 14 Sep 2026: one exemplar per archetype, rolled to every page of that
-- archetype by data. The page learns each table's shape from the catalog (columns, types, required,
-- enum values, foreign keys, check rules, primary key), edits in place with a written reason,
-- shows the impact BEFORE the save (which views read the table, which rows point at this row) and
-- keeps history in audit_events — the ledger the audit_row trigger already writes for 40 tables.
-- Nothing is typed in: a view is read-only and names its source tables; a table without a primary
-- key or on the immutable list is read-only and says why; the write itself runs as the caller
-- (SECURITY INVOKER) so row-level security, not this function, decides who may change what.
set search_path = public;

create or replace function public.f_setup_shape(p_table text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_oid oid; v_kind char; v_reg record; v_pk text[]; v_immutable boolean; v_out jsonb; v_cols jsonb; v_deps jsonb; v_src jsonb; v_refs jsonb; v_rows bigint;
begin
  if public.current_app_role() is null then raise exception 'Sign in.' using errcode = '42501'; end if;
  select * into v_reg from public.nav_registry n where n.table_ref = p_table and n.enabled order by (n.archetype = 'data_browser') desc limit 1;
  if not found then raise exception 'No registered page reads %.', p_table; end if;
  select c.oid, c.relkind into v_oid, v_kind from pg_class c where c.relname = p_table and c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p');
  if v_oid is null then raise exception 'No table or view called % in public.', p_table; end if;
  select array_agg(a.attname::text order by k.ord) into v_pk
    from pg_constraint con cross join lateral unnest(con.conkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
   where con.conrelid = v_oid and con.contype = 'p';
  v_immutable := p_table in ('watchdog_findings', 'issue_decisions', 'cost_input_history', 'metrc_corrections', 'moisture_loss_entries', 'conversion_factor_history', 'audit_events', 'app_audit_log');
  select jsonb_agg(jsonb_build_object(
      'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'udt', t.typname, 'category', t.typcategory,
      'nullable', not a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid), 'generated', a.attgenerated <> '' or a.attidentity <> '',
      'is_pk', a.attname::text = any(coalesce(v_pk, '{}')),
      'enum_values', (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = a.atttypid),
      'fk', (select jsonb_build_object('table', fc.relname, 'column', fa.attname) from pg_constraint fk
              join pg_class fc on fc.oid = fk.confrelid join pg_attribute fa on fa.attrelid = fk.confrelid and fa.attnum = fk.confkey[1]
             where fk.conrelid = v_oid and fk.contype = 'f' and fk.conkey[1] = a.attnum and array_length(fk.conkey, 1) = 1 limit 1),
      'checks', (select jsonb_agg(pg_get_constraintdef(ck.oid)) from pg_constraint ck where ck.conrelid = v_oid and ck.contype = 'c' and a.attnum = any(ck.conkey)),
      'comment', col_description(v_oid, a.attnum)
    ) order by a.attnum) into v_cols
    from pg_attribute a join pg_type t on t.oid = a.atttypid left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = v_oid and a.attnum > 0 and not a.attisdropped;
  -- who reads it: every view or matview whose definition depends on this relation, with the page that shows it when there is one
  select jsonb_agg(jsonb_build_object('name', x.relname, 'kind', x.relkind, 'view_key', x.view_key, 'label', x.label) order by x.relname) into v_deps
    from (select distinct v.relname, v.relkind, n.view_key, n.label
            from pg_depend dp join pg_rewrite rw on rw.oid = dp.objid join pg_class v on v.oid = rw.ev_class
            left join public.nav_registry n on n.table_ref = v.relname and n.enabled
           where dp.refobjid = v_oid and dp.classid = 'pg_rewrite'::regclass and v.oid <> v_oid and v.relnamespace = 'public'::regnamespace) x;
  -- what it reads (a view): its source relations, so a reader knows where to change the fact
  if v_kind in ('v', 'm') then
    select jsonb_agg(jsonb_build_object('name', x.relname, 'kind', x.relkind, 'view_key', x.view_key, 'label', x.label) order by x.relname) into v_src
      from (select distinct s.relname, s.relkind, n.view_key, n.label
              from pg_rewrite rw join pg_depend dp on dp.objid = rw.oid and dp.classid = 'pg_rewrite'::regclass
              join pg_class s on s.oid = dp.refobjid left join public.nav_registry n on n.table_ref = s.relname and n.enabled
             where rw.ev_class = v_oid and dp.deptype = 'n' and s.relkind in ('r', 'v', 'm', 'p') and s.oid <> v_oid and s.relnamespace = 'public'::regnamespace) x;
  end if;
  -- who points at it: foreign keys from other tables
  select jsonb_agg(jsonb_build_object('table', rc.relname, 'column', ra.attname, 'to_column', ta.attname) order by rc.relname) into v_refs
    from pg_constraint fk join pg_class rc on rc.oid = fk.conrelid
    join pg_attribute ra on ra.attrelid = fk.conrelid and ra.attnum = fk.conkey[1]
    join pg_attribute ta on ta.attrelid = fk.confrelid and ta.attnum = fk.confkey[1]
   where fk.confrelid = v_oid and fk.contype = 'f';
  select c.reltuples::bigint into v_rows from pg_class c where c.oid = v_oid;
  v_out := jsonb_build_object(
    'table', p_table, 'kind', case v_kind when 'r' then 'table' when 'p' then 'table' when 'v' then 'view' else 'materialized view' end,
    'page', jsonb_build_object('view_key', v_reg.view_key, 'label', v_reg.label, 'category', v_reg.category, 'admin_only', v_reg.admin_only, 'description', v_reg.description),
    'pk', to_jsonb(coalesce(v_pk, '{}'::text[])),
    'editable', v_kind in ('r', 'p') and v_pk is not null and not v_immutable,
    'why_not', case when v_kind in ('v', 'm') then 'This is a derived ' || case v_kind when 'v' then 'view' else 'materialized view' end || ' — change the fact at its source.'
                    when v_immutable then 'This is an append-only forensic record (rule H2) — it is evidence, never edited.'
                    when v_pk is null then 'This table has no primary key, so a row cannot be addressed for editing.' end,
    'columns', coalesce(v_cols, '[]'::jsonb), 'read_by', coalesce(v_deps, '[]'::jsonb), 'reads', coalesce(v_src, '[]'::jsonb), 'referenced_by', coalesce(v_refs, '[]'::jsonb),
    'rows_estimate', greatest(v_rows, 0), 'audited_by_trigger', exists (select 1 from pg_trigger t where t.tgrelid = v_oid and t.tgfoid = 'public.audit_row'::regproc and not t.tgisinternal),
    'role', public.current_app_role()::text);
  return v_out;
end $$;
revoke all on function public.f_setup_shape(text) from public, anon;
grant execute on function public.f_setup_shape(text) to authenticated;

-- impact before save: how many rows in each referencing table point at THIS row
create or replace function public.f_setup_impact(p_table text, p_pk jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_oid oid; r record; v_n bigint; v_out jsonb := '[]'::jsonb; v_pkcol text; v_pkval text;
begin
  if public.current_app_role() is null then raise exception 'Sign in.' using errcode = '42501'; end if;
  if not exists (select 1 from public.nav_registry n where n.table_ref = p_table and n.enabled) then raise exception 'No registered page reads %.', p_table; end if;
  select c.oid into v_oid from pg_class c where c.relname = p_table and c.relnamespace = 'public'::regnamespace;
  for r in
    select rc.relname rtable, ra.attname rcol, ta.attname tcol
      from pg_constraint fk join pg_class rc on rc.oid = fk.conrelid
      join pg_attribute ra on ra.attrelid = fk.conrelid and ra.attnum = fk.conkey[1]
      join pg_attribute ta on ta.attrelid = fk.confrelid and ta.attnum = fk.confkey[1]
     where fk.confrelid = v_oid and fk.contype = 'f' and array_length(fk.conkey, 1) = 1
  loop
    v_pkval := p_pk->>r.tcol;
    if v_pkval is null then continue; end if;
    execute format('select count(*) from public.%I where %I::text = $1', r.rtable, r.rcol) into v_n using v_pkval;
    v_out := v_out || jsonb_build_object('table', r.rtable, 'column', r.rcol, 'rows', v_n);
  end loop;
  return jsonb_build_object('referencing_rows', v_out,
    'read_by_count', (select count(distinct rw.ev_class) from pg_depend dp join pg_rewrite rw on rw.oid = dp.objid where dp.refobjid = v_oid and dp.classid = 'pg_rewrite'::regclass and rw.ev_class <> v_oid));
end $$;
revoke all on function public.f_setup_impact(text, jsonb) from public, anon;
grant execute on function public.f_setup_impact(text, jsonb) to authenticated;

-- the history line with the reason — definer only for the audit insert; the data write itself is the caller's
create or replace function public.f_setup_audit(p_table text, p_entity_id text, p_action text, p_old jsonb, p_new jsonb, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- narrow on purpose: only the two set-up actions, only a registered table, only with a reason — never a free audit writer
  if p_action not in ('setup.update', 'setup.insert') then raise exception 'f_setup_audit records set-up changes only.'; end if;
  if not exists (select 1 from public.nav_registry n where n.table_ref = p_table and n.enabled) then raise exception 'No registered page reads %.', p_table; end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'A history line needs the reason.'; end if;
  insert into public.audit_events (actor, actor_name, entity, entity_id, action, old_value, new_value, reason)
  values (auth.uid(), public.f_actor(), p_table, p_entity_id, p_action, p_old, p_new, btrim(p_reason));
end $$;
revoke all on function public.f_setup_audit(text, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.f_setup_audit(text, text, text, jsonb, jsonb, text) to authenticated;

-- edit in place: runs AS THE CALLER — row-level security on the table decides; this function only
-- validates (registered table, editable, columns exist, not the key, reason written) and records
create or replace function public.f_setup_save(p_table text, p_pk jsonb, p_patch jsonb, p_reason text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_shape jsonb; v_pk text[]; v_sets text := ''; v_where text := ''; k text; v_old jsonb; v_new jsonb; v_col jsonb; v_type text; v_n int; v_id text;
begin
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Write why — ten characters at least. A set-up change with no reason is the problem this page fixes.'; end if;
  v_shape := public.f_setup_shape(p_table);
  if not (v_shape->>'editable')::boolean then raise exception '%', coalesce(v_shape->>'why_not', 'This page is read-only.'); end if;
  select array_agg(x) into v_pk from jsonb_array_elements_text(v_shape->'pk') x;
  if p_pk is null or jsonb_typeof(p_pk) <> 'object' then raise exception 'The row key is missing.'; end if;
  foreach k in array v_pk loop
    if p_pk->>k is null then raise exception 'The row key needs %.', k; end if;
    v_where := v_where || case when v_where = '' then '' else ' and ' end || format('%I::text = %L', k, p_pk->>k);
  end loop;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'Nothing to change.'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    select c into v_col from jsonb_array_elements(v_shape->'columns') c where c->>'name' = k;
    if v_col is null then raise exception 'No column called % on %.', k, p_table; end if;
    if (v_col->>'is_pk')::boolean then raise exception 'The key column % is not edited in place — add a new row instead.', k; end if;
    if (v_col->>'generated')::boolean then raise exception 'Column % is generated by the database.', k; end if;
    v_type := v_col->>'type';
    v_sets := v_sets || case when v_sets = '' then '' else ', ' end
              || format('%I = %s', k, case when p_patch->k = 'null'::jsonb then 'null'
                                            when v_type in ('jsonb', 'json') then format('%L::%s', (p_patch->k)::text, v_type)
                                            when v_type like '%[]' then format('%L::%s', (select array_agg(e) from jsonb_array_elements_text(p_patch->k) e)::text, v_type)
                                            else format('%L::%s', p_patch->>k, v_type) end);
  end loop;
  execute format('select to_jsonb(t) from public.%I t where %s', p_table, v_where) into v_old;
  if v_old is null then raise exception 'No row with that key on % — or your role may not see it.', p_table; end if;
  execute format('update public.%I set %s where %s returning to_jsonb(%I)', p_table, v_sets, v_where, p_table) into v_new;
  get diagnostics v_n = row_count;
  if v_n = 0 or v_new is null then raise exception 'The row was not changed — row-level security on % does not let the % role update it.', p_table, public.current_app_role(); end if;
  v_id := (select string_agg(p_pk->>x, '|') from jsonb_array_elements_text(v_shape->'pk') x);
  perform public.f_setup_audit(p_table, v_id, 'setup.update', v_old, v_new, btrim(p_reason));
  return jsonb_build_object('ok', true, 'table', p_table, 'id', v_id, 'before', v_old, 'after', v_new, 'changed', (select jsonb_object_agg(kk, v_new->kk) from jsonb_object_keys(p_patch) kk));
end $$;
revoke all on function public.f_setup_save(text, jsonb, jsonb, text) from public, anon;
grant execute on function public.f_setup_save(text, jsonb, jsonb, text) to authenticated;

create or replace function public.f_setup_insert(p_table text, p_row jsonb, p_reason text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_shape jsonb; v_cols text := ''; v_vals text := ''; k text; v_col jsonb; v_type text; v_new jsonb; v_id text;
begin
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Write why — ten characters at least.'; end if;
  v_shape := public.f_setup_shape(p_table);
  if not (v_shape->>'editable')::boolean then raise exception '%', coalesce(v_shape->>'why_not', 'This page is read-only.'); end if;
  if p_row is null or jsonb_typeof(p_row) <> 'object' or p_row = '{}'::jsonb then raise exception 'Nothing to add.'; end if;
  for k in select jsonb_object_keys(p_row) loop
    select c into v_col from jsonb_array_elements(v_shape->'columns') c where c->>'name' = k;
    if v_col is null then raise exception 'No column called % on %.', k, p_table; end if;
    if (v_col->>'generated')::boolean then continue; end if;
    if p_row->k = 'null'::jsonb or (jsonb_typeof(p_row->k) = 'string' and p_row->>k = '') then continue; end if;
    v_type := v_col->>'type';
    v_cols := v_cols || case when v_cols = '' then '' else ', ' end || format('%I', k);
    v_vals := v_vals || case when v_vals = '' then '' else ', ' end
              || case when v_type in ('jsonb', 'json') then format('%L::%s', (p_row->k)::text, v_type)
                      when v_type like '%[]' then format('%L::%s', (select array_agg(e) from jsonb_array_elements_text(p_row->k) e)::text, v_type)
                      else format('%L::%s', p_row->>k, v_type) end;
  end loop;
  if v_cols = '' then raise exception 'Nothing to add.'; end if;
  execute format('insert into public.%I (%s) values (%s) returning to_jsonb(%I)', p_table, v_cols, v_vals, p_table) into v_new;
  if v_new is null then raise exception 'The row was not added — row-level security on % does not let the % role insert.', p_table, public.current_app_role(); end if;
  v_id := (select string_agg(v_new->>x, '|') from jsonb_array_elements_text(v_shape->'pk') x);
  perform public.f_setup_audit(p_table, v_id, 'setup.insert', null, v_new, btrim(p_reason));
  return jsonb_build_object('ok', true, 'table', p_table, 'id', v_id, 'row', v_new);
end $$;
revoke all on function public.f_setup_insert(text, jsonb, text) from public, anon;
grant execute on function public.f_setup_insert(text, jsonb, text) to authenticated;

-- history for one row or one table: the audit ledger, newest first, bounded
create or replace function public.f_setup_history(p_table text, p_entity_id text default null, p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'at', e.at, 'actor', coalesce(e.actor_name, e.actor::text), 'action', e.action, 'entity_id', e.entity_id,
                    'reason', e.reason, 'old_value', e.old_value, 'new_value', e.new_value) order by e.at desc)
                  from (select * from public.audit_events a where a.entity = p_table and (p_entity_id is null or a.entity_id = p_entity_id) order by a.at desc limit greatest(1, least(p_limit, 500))) e), '[]'::jsonb)
   where public.current_app_role() is not null and exists (select 1 from public.nav_registry n where n.table_ref = p_table and n.enabled);
$$;
revoke all on function public.f_setup_history(text, text, int) from public, anon;
grant execute on function public.f_setup_history(text, text, int) to authenticated;

update public.page_archetype set component_path = 'app/web/src/setup-form.jsx', built = true where archetype = 'data_browser';
notify pgrst, 'reload schema';;
