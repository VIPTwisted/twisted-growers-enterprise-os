/* Owner, 9 Aug 2026: "AUTOMATICALLY MAKE IT SO ALL ITEMS WE SYNC, API OR INTEGRATE
   WILL ALWAYS BE ADDED HERE AUTOMATICALLY."

   The first version of the per-item screen hard-coded nine Metrc endpoints and ten
   spreadsheet tabs in JSX. That is the same mistake as a hard-coded filter list: every
   new endpoint, tab or integration becomes a code change, a review and a deploy - so
   it does not happen, and the screen quietly stops matching reality. A registry that
   has to be edited by hand is a registry that goes stale.

   So: one row per syncable ITEM, in the database. Adding an integration means
   inserting rows, and the screen shows them on the next load with no deploy at all.
   Apex is not duplicated here - it is UNIONed live from apex_entity in the view
   below, so its forty-four entities cannot drift out of step with the connector. */
create table if not exists public.sync_item (
  id            bigserial primary key,
  source_key    text not null,
  source_label  text not null,
  fn            text not null,                 -- the edge function to call
  item_key      text not null,                 -- value passed to the query param
  item_label    text not null,
  query_param   text not null,                 -- e.g. 'endpoints', 'tab', 'entity'
  extra_params  jsonb not null default '{}'::jsonb,
  note          text,
  enabled       boolean not null default true,
  supported     boolean not null default true, -- does the FUNCTION honour the param?
  sort          int not null default 100,
  added_at      timestamptz not null default now(),
  unique (source_key, item_key, query_param)
);
comment on table public.sync_item is
  'One row per individually-syncable item. The per-item screen renders straight from here, so a new integration appears with no deploy. supported=false means the backing function does NOT yet honour the parameter - the screen must show it greyed with the reason rather than offering a button that runs everything while appearing to run one thing.';
comment on column public.sync_item.supported is
  'FALSE when the edge function ignores query_param. A button whose backend ignores its scope is a dead control - it runs everything and reports success. Never render such an item as clickable.';

alter table public.sync_item enable row level security;
drop policy if exists sync_item_read on public.sync_item;
create policy sync_item_read on public.sync_item for select to authenticated using (true);

/* Metrc — verified against SPECS in metrc-sync/index.ts, which already honours
   ?endpoints=. metrc_auth_arrangement and metrc_sync_cursors are in that list but are
   internal tables, not endpoints, and are deliberately not offered. */
insert into public.sync_item (source_key, source_label, fn, item_key, item_label, query_param, note, sort) values
  ('metrc','Metrc (state system)','metrc-sync','packages','Packages','endpoints','Delta since the last cursor.',10),
  ('metrc','Metrc (state system)','metrc-sync','plants','Plants','endpoints','Delta since the last cursor.',11),
  ('metrc','Metrc (state system)','metrc-sync','plantbatches','Plant batches','endpoints','Delta since the last cursor.',12),
  ('metrc','Metrc (state system)','metrc-sync','harvests','Harvests','endpoints','Delta since the last cursor.',13),
  ('metrc','Metrc (state system)','metrc-sync','transfers','Transfers','endpoints','Manifests. The Apex reconciliation joins here.',14),
  ('metrc','Metrc (state system)','metrc-sync','items','Items','endpoints','The Metrc catalogue.',15),
  ('metrc','Metrc (state system)','metrc-sync','strains','Strains','endpoints','Reference data, changes rarely.',16),
  ('metrc','Metrc (state system)','metrc-sync','locations','Locations','endpoints','Rooms. Reference data.',17),
  ('metrc','Metrc (state system)','metrc-sync','sales','Sales','endpoints','Retail receipts. Not a wholesale figure.',18)
on conflict (source_key, item_key, query_param) do nothing;

/* Finished-Goods workbook. Tab names EXACTLY as the sheet has them - "1.0g Economy
   Raw " carries a trailing space and trimming it would make the call miss its tab. */
insert into public.sync_item (source_key, source_label, fn, item_key, item_label, query_param, note, sort) values
  ('sheet_fg','Finished-Goods spreadsheet','sheet-sync','Solventless','Solventless','tab','Replaces only this tab''s rows.',30),
  ('sheet_fg','Finished-Goods spreadsheet','sheet-sync','Hydrocarbon','Hydrocarbon','tab','Replaces only this tab''s rows.',31),
  ('sheet_fg','Finished-Goods spreadsheet','sheet-sync','Infused PreRolls','Infused pre-rolls','tab','Replaces only this tab''s rows.',32),
  ('sheet_fg','Finished-Goods spreadsheet','sheet-sync','1.0g Raw PreRolls','1.0g raw pre-rolls','tab','Replaces only this tab''s rows.',33),
  ('sheet_fg','Finished-Goods spreadsheet','sheet-sync','0.5g Raw PreRolls','0.5g raw pre-rolls','tab','Replaces only this tab''s rows.',34),
  ('sheet_fg','Finished-Goods spreadsheet','sheet-sync','1.0g Economy Raw ','1.0g economy raw','tab','Tab name really does end in a space.',35),
  ('sheet_fg','Finished-Goods spreadsheet','sheet-sync','Economy Infused','Economy infused','tab','Replaces only this tab''s rows.',36),
  ('sheet_fg','Finished-Goods spreadsheet','sheet-sync','0.5g Economy Raw','0.5g economy raw','tab','Replaces only this tab''s rows.',37),
  ('sheet_fg','Finished-Goods spreadsheet','sheet-sync','Vaporizers','Vaporizers','tab','Replaces only this tab''s rows.',38),
  ('sheet_fg','Finished-Goods spreadsheet','sheet-sync','3rd Party Material','3rd-party material','tab','Its own table, replaced only when asked for.',39)
on conflict (source_key, item_key, query_param) do nothing;

/* ClickUp has no per-item parameter in clickup-sync, so it is registered as ONE item
   and marked unsupported for scoping - visible, honest, and not a button that lies. */
insert into public.sync_item (source_key, source_label, fn, item_key, item_label, query_param, note, supported, sort) values
  ('clickup','ClickUp','clickup-sync','all','Whole workspace','none',
   'clickup-sync has no per-space parameter yet, so this pulls everything.', true, 50)
on conflict (source_key, item_key, query_param) do nothing;

/* THE UNION. Apex lives in apex_entity and is joined in live rather than copied, so
   the screen and the connector cannot disagree about which entities exist. Anything
   registered in sync_item appears automatically; Apex entities appear automatically;
   nothing needs a deploy either way. */
create or replace view public.v_sync_item as
select source_key, source_label, fn, item_key, item_label, query_param, extra_params,
       note, enabled, supported, sort, null::bigint as rows_stored, null::timestamptz as last_success_at,
       null::text as last_status, null::boolean as due, null::text as due_text
from public.sync_item
union all
select 'apex', 'Apex Trading (sales)', 'apex-sync', s.entity, s.entity, 'entity', '{"force":"1"}'::jsonb,
       s.kind || ' · ' || s.rows_stored || ' row(s) held', true, true,
       70 + (case s.kind when 'money' then 0 when 'core' then 1 when 'crm' then 2 when 'document' then 3 else 4 end),
       s.rows_stored, s.last_success_at, s.last_status, s.due, s.due_text
from public.v_apex_entity_status s;

comment on view public.v_sync_item is
  'Every individually-syncable item across every integration. sync_item holds the static ones; Apex is UNIONed live from apex_entity so it can never drift from the connector. The per-item screen renders this view and nothing else, so a new integration needs an INSERT, not a deploy.';

grant select on public.v_sync_item to authenticated;;
