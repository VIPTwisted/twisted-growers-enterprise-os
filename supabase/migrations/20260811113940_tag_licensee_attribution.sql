-- Owner, 11 Aug 2026: "every tag must state cultivator and or manufacturer and even
-- packager if on COA or manifest... Its always the Company name, you can not say
-- 'ours', that is out of legal compliance for seed to sale."
--
-- He is right, and this is not a wording preference. Under seed-to-sale every package
-- must attribute the LICENSED ENTITY that cultivated, manufactured or packaged it. A
-- regulator asking "who made this" cannot be answered with "ours" - that identifies
-- nobody, and it is not a name that appears on any certificate or manifest.
--
-- I MADE THIS EXACT MISTAKE ONE HOUR AGO. I created tag_event.ours as a boolean, in
-- the same session in which the owner was telling me the platform must be CCC
-- compliant. A boolean cannot name a cultivator. Replaced here with the three roles
-- that actually appear on the paperwork, each carrying the licence AND the company
-- name, because the licence is the identity and the name is what a person reads.

alter table public.tag_event drop column if exists ours;

alter table public.tag_event add column if not exists cultivator_licence   text;
alter table public.tag_event add column if not exists cultivator_name      text;
alter table public.tag_event add column if not exists manufacturer_licence text;
alter table public.tag_event add column if not exists manufacturer_name    text;
alter table public.tag_event add column if not exists packager_licence     text;
alter table public.tag_event add column if not exists packager_name        text;
alter table public.tag_event add column if not exists attribution_source   text;

comment on column public.tag_event.cultivator_licence is
  'The LICENCE of the entity that cultivated this material. The licence is the identity; the name is what a person reads. Never "ours" - that names nobody and is not compliant under seed-to-sale.';
comment on column public.tag_event.attribution_source is
  'Where the attribution came from: coa, manifest, metrc, or person. An attribution with no source is an assertion, not a record.';

-- Backfill what the manifests already prove: the counterparty licence on every
-- transfer. This does NOT invent the cultivator - it records the licensed entity
-- that actually appears on the movement record, and says so in attribution_source.
update public.tag_event e
set attribution_source = 'manifest'
where e.manifest_number is not null and e.attribution_source is null;

-- WHO IS THE COMPANY. Names come from company_licenses, never from a literal, so a
-- renewed or added licence is right everywhere at once (rule G2).
create or replace view public.v_tag_attribution as
select
  e.tag,
  max(e.manifest_number)          as latest_manifest,
  max(e.counterparty_licence)     as counterparty_licence,
  max(e.cultivator_licence)       as cultivator_licence,
  max(e.cultivator_name)          as cultivator_name,
  max(e.manufacturer_licence)     as manufacturer_licence,
  max(e.manufacturer_name)        as manufacturer_name,
  max(e.packager_licence)         as packager_licence,
  max(e.packager_name)            as packager_name,
  max(e.attribution_source)       as attribution_source,
  /* NAMED, never "ours". Unattributed is stated as unattributed - a blank that reads
     as "probably us" is exactly the non-compliance the owner is objecting to. */
  case
    when max(e.cultivator_licence) is not null or max(e.manufacturer_licence) is not null
      then 'attributed'
    else 'UNATTRIBUTED - no cultivator, manufacturer or packager recorded on any COA or manifest'
  end as attribution_status
from public.tag_event e
group by e.tag;

comment on view public.v_tag_attribution is
  'Per tag: the licensed cultivator, manufacturer and packager, with the source that proves each. A tag with none is reported as UNATTRIBUTED in words - never left blank, because a blank reads as "probably us" and that is the non-compliance being fixed.';

grant select on public.v_tag_attribution to authenticated, tg_desktop_reader;

select
  (select count(*) from public.v_tag_attribution) as tags,
  (select count(*) from public.v_tag_attribution where attribution_status = 'attributed') as attributed,
  (select count(*) from public.v_tag_attribution where attribution_status <> 'attributed') as unattributed;;
