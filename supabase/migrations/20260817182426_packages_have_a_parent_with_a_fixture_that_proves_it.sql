/* packages_have_a_parent, with a fixture that proves it fires and proves it stays quiet.
 *
 * The backfill on 17 Aug took package orphans from 14,863 to 42. Nothing stops it
 * rotting back — the same class has now recurred three times (IsFinished on 14,822
 * packages, State on 1,151 plants, lineage on 14,863 packages). The fix is not the
 * deliverable; the guard is.
 *
 * tg_require_assertion_fixture refused the first attempt because it had no fixture,
 * and it was right to. An assertion nobody has watched fail is not evidence.
 *
 * THE SUBTLETY THIS FIXTURE EXISTS TO PIN DOWN
 * -------------------------------------------
 * The naive check is "package has no parent" — and it is wrong. Metrc itself records
 * no parent for some packages, and 42 of ours are in exactly that state. Blaming our
 * mirror for Metrc's gap would put a permanent red number on a screen that nobody can
 * ever clear, which is how a check becomes wallpaper.
 *
 * So the assertion fires only where METRC NAMES A PARENT AND WE DID NOT CAPTURE IT.
 * One live package proves the distinction is not theoretical: tag
 * 1A40A0300011815000000164 has a transfer row whose source_harvest is blank, so a
 * naive exists() flags it and this assertion does not.
 *
 * The violation SQL is deliberately UNQUALIFIED. f_assertion_probe runs it under
 * `set local search_path = <fixture>, public, pg_temp`, so a public.-prefixed name
 * would read production, the positive half would find production clean, and the
 * fixture would prove nothing while showing green. The prover also refuses unless
 * every relation in fixture_shadows exists in BOTH schemas, for the same reason.
 *
 * POSITIVE plants two violations, not one: keys absent, and keys present but empty.
 * Those are different shapes and coalesce() handles both — fixture_positive_min_rows
 * is 2 so a check that only caught one limb still fails the gate.
 */

/* ── Positive: two real violations, each a different shape ───────────────────── */
drop schema if exists tg_fx_pos_lineage cascade;
create schema tg_fx_pos_lineage;

create table tg_fx_pos_lineage.metrc_packages (
  tag text primary key, license text, item_name text, raw jsonb);
create table tg_fx_pos_lineage.metrc_rpt_package_transfers (
  package_tag text, source_harvest text);

insert into tg_fx_pos_lineage.metrc_packages (tag, license, item_name, raw) values
  ('FX-POS-KEYS-ABSENT', 'MC281714', 'Chimera Flower', '{}'::jsonb),
  ('FX-POS-KEYS-EMPTY',  'MC281714', 'Gush Mintz Flower',
   '{"SourceHarvestNames":"","SourcePackageLabels":""}'::jsonb);

insert into tg_fx_pos_lineage.metrc_rpt_package_transfers (package_tag, source_harvest) values
  ('FX-POS-KEYS-ABSENT', 'F1-Chimera-2026-06-26'),
  ('FX-POS-KEYS-EMPTY',  'F1-Gush Mintz-2026-06-26');

/* ── Negative: four legitimate cases it must not touch ──────────────────────── */
drop schema if exists tg_fx_neg_lineage cascade;
create schema tg_fx_neg_lineage;

create table tg_fx_neg_lineage.metrc_packages (
  tag text primary key, license text, item_name text, raw jsonb);
create table tg_fx_neg_lineage.metrc_rpt_package_transfers (
  package_tag text, source_harvest text);

insert into tg_fx_neg_lineage.metrc_packages (tag, license, item_name, raw) values
  /* 1. Parent captured from a harvest — the ordinary healthy case. */
  ('FX-NEG-HAS-HARVEST', 'MC281714', 'XJ-13 Flower',
   '{"SourceHarvestNames":"F1-XJ-13-2026-06-26"}'::jsonb),
  /* 2. Parent is another package, not a harvest — every manufactured item. */
  ('FX-NEG-HAS-PACKAGE', 'MP281909', 'Strawberry Glue Cartridge',
   '{"SourcePackageLabels":"1A40A0300011815000000001"}'::jsonb),
  /* 3. METRC ITSELF HAS NO PARENT. Blank source_harvest on the transfer row.
        This is the live shape of tag 1A40A0300011815000000164 and the whole reason
        the assertion tests for a non-blank value rather than a row's existence. */
  ('FX-NEG-METRC-BLANK', 'MP281909', 'Strawberry Glue',
   '{}'::jsonb),
  /* 4. Never transferred, so no report row can name a parent. Not our gap. */
  ('FX-NEG-NEVER-MOVED', 'MC281714', 'Cap Junky Flower', '{}'::jsonb);

insert into tg_fx_neg_lineage.metrc_rpt_package_transfers (package_tag, source_harvest) values
  ('FX-NEG-HAS-HARVEST', 'F1-XJ-13-2026-06-26'),
  ('FX-NEG-HAS-PACKAGE', ''),
  ('FX-NEG-METRC-BLANK', '   ');   -- whitespace, not empty: btrim must handle it
  -- FX-NEG-NEVER-MOVED deliberately has no transfer row at all.

/* ── The assertion ──────────────────────────────────────────────────────────── */
insert into public.data_assertion
  (assertion_key, title, domain, severity, violation_sql, max_allowed,
   what_it_proves, why_it_matters, enabled, owner_agent, added_by, accountable_to,
   fixture_shadows, fixture_positive_schema, fixture_negative_schema,
   fixture_positive_case, fixture_negative_case, fixture_positive_min_rows, note)
values
  ('packages_have_a_parent',
   'Every package Metrc can trace, we can trace',
   'metrc', 'critical',
   'select p.tag, p.license, p.item_name '
   || '  from metrc_packages p '
   || ' where coalesce(p.raw->>''SourceHarvestNames'','''') = '''' '
   || '   and coalesce(p.raw->>''SourcePackageLabels'','''') = '''' '
   || '   and exists (select 1 from metrc_rpt_package_transfers t '
   || '                where t.package_tag = p.tag '
   || '                  and coalesce(btrim(t.source_harvest),'''') <> '''')',
   0,
   'That no package is missing a parent in our mirror while Metrc''s own report names '
   || 'one. It deliberately does NOT flag packages Metrc has no lineage for either — '
   || 'that would blame our mirror for Metrc''s gap and produce a red number nobody '
   || 'can ever clear.',
   'Seed-to-sale is the legal record. A package with no parent breaks the chain from '
   || 'plant to sale and cannot be traced in a recall. 14,863 rows sat in exactly this '
   || 'state because a report table was loaded and nothing promoted its columns into '
   || 'the JSON the ~30 downstream views read — the third occurrence of that same '
   || 'failure, after IsFinished on 14,822 packages and State on 1,151 plants.',
   true, 'Agent I', 'Agent I', 'Owner',
   array['metrc_packages','metrc_rpt_package_transfers'],
   'tg_fx_pos_lineage', 'tg_fx_neg_lineage',
   'Two packages whose raw carries no parent while their transfer row names a real '
   || 'source harvest. One has the keys absent entirely, the other has them present '
   || 'but empty — the two shapes the loader actually produced.',
   'Four packages that must not be flagged: one parented by a harvest, one parented '
   || 'by another package, one where Metrc''s own source_harvest is whitespace, and '
   || 'one never transferred at all so no report row could name a parent.',
   2,
   'Added 17 Aug 2026 with the backfill it guards. The backfill alone would not stop '
   || 'the next loader repeating this for the fourth time.')
on conflict (assertion_key) do update
  set violation_sql            = excluded.violation_sql,
      max_allowed              = excluded.max_allowed,
      why_it_matters           = excluded.why_it_matters,
      what_it_proves           = excluded.what_it_proves,
      fixture_shadows          = excluded.fixture_shadows,
      fixture_positive_schema  = excluded.fixture_positive_schema,
      fixture_negative_schema  = excluded.fixture_negative_schema,
      fixture_positive_case    = excluded.fixture_positive_case,
      fixture_negative_case    = excluded.fixture_negative_case,
      fixture_positive_min_rows= excluded.fixture_positive_min_rows,
      enabled                  = true;
