-- MANIFEST BRIDGE CLONE — phase 1 tables. Written by Claude, 2026-09-07.
--
-- WHY (Claude owns this one; it is not Grok's):
--   Source is source/manifest-bridge/data/, imported verbatim from the owner's tg (2).zip.
--   These tables hold that data as EVIDENCE. Metrc remains the legal record for custody and
--   Apex remains the source of record for sales; a bridge row never overrides either, and
--   nothing here is promoted into v_package_manifest.
--
--   It closes a measured gap: v_package_manifest held 343 manifests and ZERO customer sales,
--   so the platform could not say which packages were sold to whom.
--
-- CERTIFIED BEFORE LOAD, and re-checked independently by Grok against live Postgres:
--   bridge_manifest          196 rows  — 0 unknown to v_manifest_ledger
--   bridge_manifest_package  2,138 rows / 2,120 tags — 0 tags missing from metrc_packages
--   bridge_manual_link       116 rows  — hand-made links; do not drop, do not rewrite
--   customer-sale manifests  191       — distinct sold tags 2,072
--
-- NOT CERTIFIED, and must not be published as if it were:
--   Customer-sale weight is 748.2 lb. The 770.1 lb figure is the WHOLE load, not what sold.
--   13 apex_invoice values carry a slash (1443/1564, 1557/1584/1585, ...) plus 1 blank.
--   Those are NAMED EXCEPTIONS, not a join. Do not auto-split them. Do not call them COGS.
--
-- Loader: tools/load-manifest-bridge.mjs (idempotent upserts, re-runnable after a fresh
-- export). It cannot run against PGURL — that role is read-only by design — so the load
-- itself went through the Supabase MCP; the script is the repeatable definition.

create table if not exists bridge_manifest (
  manifest_id        text primary key,
  manifest_number    text not null,
  apex_invoice       text,
  recipient          text,
  recipient_license  text,
  last_modified      text,
  saved_at           text,
  raw                jsonb,
  source             text not null default 'manifest-bridge',
  imported_at        timestamptz not null default now()
);
create index if not exists bridge_manifest_number_idx on bridge_manifest (manifest_number);

create table if not exists bridge_manifest_package (
  manifest_id      text not null references bridge_manifest(manifest_id) on delete cascade,
  package_tag      text not null,
  package_number   text,
  batch_name       text,
  item_name        text,
  quantity         numeric,
  unit             text,
  raw              jsonb,
  imported_at      timestamptz not null default now(),
  primary key (manifest_id, package_tag)
);
create index if not exists bridge_manifest_package_tag_idx on bridge_manifest_package (package_tag);

-- Human decisions no algorithm reproduced. mode='manual' is the whole point of this table:
-- somebody looked at an order and a manifest and said "these two are the same thing".
create table if not exists bridge_manual_link (
  link_kind    text not null check (link_kind in ('order_manifest','order_tag','posted_tag')),
  left_key     text not null,
  right_value  text not null,
  mode         text,
  linked_by    text,
  linked_at    text,
  imported_at  timestamptz not null default now(),
  primary key (link_kind, left_key)
);

alter table bridge_manifest         enable row level security;
alter table bridge_manifest_package enable row level security;
alter table bridge_manual_link      enable row level security;

drop policy if exists bridge_manifest_read on bridge_manifest;
create policy bridge_manifest_read on bridge_manifest for select to authenticated using (true);
drop policy if exists bridge_manifest_package_read on bridge_manifest_package;
create policy bridge_manifest_package_read on bridge_manifest_package for select to authenticated using (true);
drop policy if exists bridge_manual_link_read on bridge_manual_link;
create policy bridge_manual_link_read on bridge_manual_link for select to authenticated using (true);

drop policy if exists bridge_manifest_admin on bridge_manifest;
create policy bridge_manifest_admin on bridge_manifest for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());
drop policy if exists bridge_manifest_package_admin on bridge_manifest_package;
create policy bridge_manifest_package_admin on bridge_manifest_package for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());
drop policy if exists bridge_manual_link_admin on bridge_manual_link;
create policy bridge_manual_link_admin on bridge_manual_link for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table bridge_manifest is
  'Manifest Bridge cache: Metrc manifest -> Apex invoice + recipient. EVIDENCE, not truth. Point-in-time copy; verify against v_manifest_ledger before reporting.';
comment on table bridge_manifest_package is
  'Manifest Bridge cache: the package tags on each manifest, with item, quantity and unit. This is the manifest->package link the platform lacks for customer sales.';
comment on table bridge_manual_link is
  'Order<->manifest and order-line<->tag links a HUMAN made by hand in the upstream app. Irreplaceable: no algorithm reproduced these. Preserve the mode flag.';
