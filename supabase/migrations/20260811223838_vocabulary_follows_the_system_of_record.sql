-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-021 (reviewers V, X, W).
-- OWNER RULING 11 Aug 2026: "license. I think it's best to match terms to Metrc, Apex, Manifest
-- and COA as rule."
--
-- THE RULING IS BIGGER THAN THE SPELLING. It is a naming doctrine: when the platform and an
-- external system of record use different words for one thing, THE PLATFORM YIELDS. We are a
-- read-only mirror of Metrc; a mirror that renames what it reflects invites every future agent
-- to wonder which word is authoritative. Precedence follows the systems named by the owner:
--   1. Metrc     - the legal record. Its field vocabulary wins outright.
--   2. Manifest  - Metrc transfer documents; same authority, transport context.
--   3. COA       - the laboratory's certificate language for testing terms.
--   4. Apex      - sales vocabulary where Metrc has no term (order, buyer, invoice).
-- Where none of the four names the concept (our own inventions: dry-equivalent, on hand),
-- the glossary itself is the authority and the owner settles it.
--
-- APPLIED TO THE FOUR OPEN PROPOSALS, each checked against the source rather than assumed:
--   license      Metrc raw JSON: ReceivedFromFacilityLicenseNumber, ItemFromFacilityLicenseNumber.
--                American spelling, everywhere. SETTLED as "license".
--   lb           Metrc raw JSON: UnitOfMeasureAbbreviation = "lb". SETTLED as "lb".
--   third-party  None of the four systems uses the phrase - manifests name licensees, never
--                "third party". Falls to glossary authority; hyphenated form settled because the
--                unhyphenated twin already caused a live label collision on 11 Aug.
--   on hand      Also ours, not theirs. Settled as two words, matching the Command tile.
--
-- EXISTING COLUMNS ARE STILL NOT RENAMED. The ruling governs NEW work and the retirement path
-- for the 305 counted inconsistencies. The ratchet does the rest.
--
-- UNDO: update glossary_term set settled=false, settled_by=null
--        where term in ('licence','pound','third-party','on hand');
--       delete from db_policy where rule like 'Vocabulary follows the system of record%';

update glossary_term set
  settled = true,
  settled_by = 'Owner (Vinny), 11 Aug 2026 — vocabulary follows the system of record',
  why_it_matters = why_it_matters || ' SETTLED under the owner''s source-of-record rule: Metrc''s own fields (ReceivedFromFacilityLicenseNumber, ItemFromFacilityLicenseNumber) use this spelling.'
where term = 'licence';

update glossary_term set
  settled = true,
  settled_by = 'Owner (Vinny), 11 Aug 2026 — vocabulary follows the system of record',
  why_it_matters = why_it_matters || ' SETTLED under the source-of-record rule: Metrc''s UnitOfMeasureAbbreviation is "lb".'
where term = 'pound';

update glossary_term set
  settled = true,
  settled_by = 'Owner (Vinny), 11 Aug 2026 — glossary authority; no source system names this concept',
  why_it_matters = why_it_matters || ' None of Metrc, Apex, manifest or COA uses the phrase, so the glossary is the authority here.'
where term in ('third-party', 'on hand');

comment on table glossary_term is
 'The business glossary: one canonical term per concept, the exact preferred form every new label, '
 'column and KPI must use. OWNER RULING 11 Aug 2026 - VOCABULARY FOLLOWS THE SYSTEM OF RECORD: '
 'where Metrc, the manifest, the COA or Apex names a concept, the platform uses their word, in '
 'that precedence order. Metrc is the legal record and a mirror does not rename what it reflects. '
 'Only concepts none of the four systems name (dry-equivalent, on hand) are settled by the '
 'glossary itself, and those need the owner''s signature. Parsed from the platform''s own 20,212 '
 'word uses on 11 Aug 2026, not invented.';

insert into db_policy (rule_no, rule, because, hard)
select coalesce(max(rule_no),0)+1,
 'Vocabulary follows the system of record. When naming anything new - a column, a label, a KPI, a page - use the word Metrc uses; if Metrc has no term, the manifest; then the COA; then Apex. Never introduce a new spelling of a word one of the four already uses. Concepts none of them name are settled in glossary_term by the owner.',
 'Owner ruling 11 Aug 2026. The platform had 148 uses of "licence" against 127 of "license" for one word - in column and table names, so an agent guessing wrong got an error, not a warning. Metrc spells it license (ItemFromFacilityLicenseNumber), and a read-only mirror that renames what it reflects makes every future reader wonder which word is authoritative. Enforced by the glossary-no-new-inconsistency ratchet at 305, which may fall and never rise.',
 true
from db_policy
where not exists (select 1 from db_policy where rule like 'Vocabulary follows the system of record%')
returning rule_no;;
