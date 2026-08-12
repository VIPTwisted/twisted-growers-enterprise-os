-- OWNER RULING, 9 August 2026: "WE HAVE TO ALWAYS MATCH NAMES TO METRC, THEN COA AND
-- MANIFESTS" / "BY TAG" / "ITS SEED TO SALE METRC".
--
-- Identity is the TAG. A name is an attribute of the tag, never the identity. The rungs
-- below are rows, not code (G1), so the owner can reorder them without a deploy.
--
-- What this replaced: a check comparing the Metrc ITEM name to the Metrc STRAIN field and
-- calling every difference a discrepancy. It produced 956 findings. Resolved by tag through
-- seed-to-sale, 798 of them (83%) were blends or product names and not discrepancies at
-- all, and the strain field was never once the wrong side.

create table if not exists name_authority (
  rung            integer primary key,
  source          text not null,
  what_it_answers text not null check (length(btrim(what_it_answers)) >= 20),
  how_to_read_it  text not null check (length(btrim(how_to_read_it))  >= 20),
  why_this_rank   text not null check (length(btrim(why_this_rank))   >= 20),
  is_independent  boolean not null,
  enabled         boolean not null default true,
  set_by          text not null,
  set_on          date not null default current_date
);
alter table name_authority enable row level security;
create policy name_authority_read  on name_authority for select to authenticated using (true);
create policy name_authority_write on name_authority for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

insert into name_authority
  (rung, source, what_it_answers, how_to_read_it, why_this_rank, is_independent, set_by)
values
(1,'Metrc seed-to-sale',
 'What strain a tagged package actually contains, by walking the tag back to the harvest it came from',
 'Read source harvests for the tag. MORE THAN ONE means the package is a BLEND and has no single strain - record every contributing strain and never "correct" the name. EXACTLY ONE means the harvest names the strain, via the convention TG <strain> - <YYYYMMDD> <room>.',
 'Metrc is the legal record (D1) and seed-to-sale is how Metrc itself establishes what a package is. A name field is a label; the harvest chain is the provenance.',
 false,'Vincent DeMartino'),

(2,'Certificate of analysis',
 'Which strain and batch a laboratory independently recorded for the sampled package',
 'coa_extract.metrc_batch_id names the harvest; metrc_source_id names the sampled package. Read the strain from the batch. Use when there is no harvest, the harvest name is off-convention, or the harvest names a strain matching neither field.',
 'The certificate is the ONLY independent statement about the material (C0). Every Metrc field shares one origin and cannot disconfirm another - a check that cannot fail proves nothing.',
 true,'Vincent DeMartino'),

(3,'Manifest',
 'What was declared as leaving or entering custody, and who shipped it',
 'The manifest document and metrc_rpt_package_transfers for the tag. Read the declared item and strain as shipped. Use only where no COA exists.',
 'Chain of custody outside the facility. Weaker than a certificate because it restates what the shipper entered rather than testing the material.',
 true,'Vincent DeMartino'),

(4,'A person',
 'Anything the three sources above cannot settle between them',
 'Raise it as a finding with an owner and a clock. State which rungs were tried and what each returned.',
 'Rule A5: never assume business practice. A name nobody can evidence is not resolved by picking the more plausible one.',
 false,'Vincent DeMartino')
on conflict (rung) do update
  set source = excluded.source, what_it_answers = excluded.what_it_answers,
      how_to_read_it = excluded.how_to_read_it, why_this_rank = excluded.why_this_rank;

comment on table name_authority is
  'The owner ruling of 9 Aug 2026 on which source names a thing: Metrc seed-to-sale, then '
  'the COA, then the manifest, then a person. Rows not code, so the order can change '
  'without a deploy. Identity is always the TAG.';;
