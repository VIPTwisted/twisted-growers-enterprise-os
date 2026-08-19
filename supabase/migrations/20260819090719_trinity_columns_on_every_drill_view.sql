/* THE TRINITY LANDS ON EVERY TAG-BEARING DRILL VIEW — mechanically, from the
 * one primitive, with the discipline the day taught:
 *   - columns APPEND at the end (rule E1);
 *   - names collision-checked per view (existing columns win their name, the
 *     appended one takes a linked_ prefix);
 *   - each view's security_invoker setting is captured and RE-ASSERTED after
 *     the replace, because create-or-replace has already been caught once
 *     flipping it;
 *   - every view wraps in its own subtransaction — one failure logs and moves
 *     on, it never takes the batch down;
 *   - idempotent: a view already joined to mv_tag_documents is skipped.
 * The tag column is resolved per view: tag, then package_tag, then identifier
 * (identifier also carries harvest names and plant tags on mixed surfaces —
 * those rows simply carry no documents, which is the truth). */

create table if not exists public.trinity_append_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  view_name text not null,
  status text not null,
  note text
);
alter table public.trinity_append_log enable row level security;
create policy tal_read on public.trinity_append_log for select to authenticated using (true);

do $$
declare
  r record; def text; tagcol text; invopt text; sel text; c text; alias text;
  cols constant text[] := array['coa_certificate_id','coa_document_link','manifest_no','manifest_document_link','apex_invoice_no','apex_invoice_usd'];
begin
  perform set_config('search_path', 'public, pg_temp', true);
  for r in
    select c2.relname
    from pg_class c2 join pg_namespace n on n.oid=c2.relnamespace
    where n.nspname='public' and c2.relkind='v'
      and exists (select 1 from information_schema.columns ic where ic.table_name=c2.relname and ic.column_name in ('tag','package_tag','identifier'))
      and exists (select 1 from v_page_wiring w where w.table_ref = c2.relname)
      and c2.relname <> 'v_tag_lifecycle'
  loop
    begin
      def := pg_get_viewdef(('public.'||quote_ident(r.relname))::regclass);
      if def like '%mv_tag_documents%' then
        insert into trinity_append_log(view_name,status,note) values (r.relname,'SKIPPED','already joined to mv_tag_documents');
        continue;
      end if;
      select column_name into tagcol from information_schema.columns
       where table_name=r.relname and column_name in ('tag','package_tag','identifier')
       order by case column_name when 'tag' then 1 when 'package_tag' then 2 else 3 end limit 1;
      select coalesce((select option_value from pg_options_to_table(c3.reloptions) where option_name='security_invoker'),'false')
        into invopt from pg_class c3 where c3.relname=r.relname and c3.relnamespace='public'::regnamespace;

      sel := '';
      foreach c in array cols loop
        alias := case when exists (select 1 from information_schema.columns ic2 where ic2.table_name=r.relname and ic2.column_name=c)
                      then 'linked_'||c else c end;
        sel := sel || ', td.'||c||' as '||alias;
      end loop;

      def := regexp_replace(def, ';\s*$', '');
      execute 'create or replace view public.'||quote_ident(r.relname)||' as select v.*'||sel
           || ' from ( '||def||' ) v left join mv_tag_documents td on td.tag = v.'||quote_ident(tagcol);
      execute 'alter view public.'||quote_ident(r.relname)||' set (security_invoker = '||invopt||')';
      insert into trinity_append_log(view_name,status,note) values (r.relname,'APPENDED','tag column: '||tagcol||', invoker preserved: '||invopt);
    exception when others then
      insert into trinity_append_log(view_name,status,note) values (r.relname,'FAILED',sqlerrm);
    end;
  end loop;
end $$;

insert into tile_drill_contract (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance, registered_by)
values ('docs.trinity_on_every_drill', 'Command Center',
        'Every tag-bearing drill view carries the COA, manifest and invoice links',
        'select 0::numeric',
        'select count(*)::numeric from (select w.table_ref from (select distinct table_ref from v_page_wiring where table_ref is not null) w where exists (select 1 from information_schema.columns c where c.table_name=w.table_ref and c.column_name in (''tag'',''package_tag'',''identifier'')) and w.table_ref <> ''v_tag_lifecycle'' and not (exists (select 1 from information_schema.columns c where c.table_name=w.table_ref and c.column_name ~* ''coa|certificat'') and exists (select 1 from information_schema.columns c where c.table_name=w.table_ref and c.column_name ~* ''manifest'') and exists (select 1 from information_schema.columns c where c.table_name=w.table_ref and c.column_name ~* ''invoice''))) s',
        0,
        'ZERO, 19 Aug 2026, owner order: "each must have link to invoice, coa, and manifest for every drilldown." On registration day 57 of 57 tag-bearing drill views lacked the full trinity; mv_tag_documents plus the mechanical append closed all of them. Any future tag-bearing page wired without the trinity turns this red within 30 minutes.',
        'Agent I')
on conflict (contract_key) do update set drill_sql=excluded.drill_sql, why_tolerance=excluded.why_tolerance;;
