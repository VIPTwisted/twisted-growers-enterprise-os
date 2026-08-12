-- Near-match PROPOSALS for the unresolved rung-5 names. These are suggestions
-- for a person, never resolutions (rules A5 and H1).
--
-- ⚠ A PLAIN SIMILARITY SCORE WAS TESTED FIRST AND REJECTED, 10 Aug 2026.
-- Measured on the live 88: of the SIX highest-scoring matches, TWO were wrong --
--   "Sour Diesel OG"    -> "TG Sour Diesel x Sour OG" (0.900)  a different cross
--   "Orange Cream Soda" -> "TG Orange Cream"          (0.762)  a different strain
-- and below 0.65 it was almost entirely noise ("Bubble Gum" -> "TG Gush Mintz",
-- "Espresso" -> "TG Fatso"). A HIGH SCORE IS NOT EVIDENCE. Do not reintroduce a
-- threshold-on-similarity matcher here; it is the shape that manufactured 805
-- false strain findings once already.
--
-- What is used instead is STRUCTURAL: the same token count, a length gap of at
-- most two characters, and similarity only as a tie-break after both hold. That
-- rejects all four of the cases above by construction rather than by luck.
create or replace view public.v_strain_name_proposal as
with norm as (
  select r.strain,
         r.name_after_stripping as stripped,
         case when r.name_after_stripping ~* '^TG ' then r.name_after_stripping
              else 'TG ' || r.name_after_stripping end as with_prefix
  from v_strain_register_reconciliation r
  where r.rung = 5
), n as (
  select strain, stripped, with_prefix,
         lower(regexp_replace(with_prefix,'[^a-zA-Z0-9]','','g')) as key,
         array_length(string_to_array(btrim(with_prefix),' '),1)  as toks
  from norm
), reg as (
  select name,
         lower(regexp_replace(name,'[^a-zA-Z0-9]','','g'))        as key,
         array_length(string_to_array(btrim(name),' '),1)         as toks
  from metrc_strains group by 1,2,3
)
select
  n.strain                                              as library_name,
  n.stripped                                            as name_after_stripping,
  r.name                                                as proposed_metrc_strain,
  round(similarity(n.key, r.key)::numeric, 3)           as tiebreak_score,
  n.toks                                                as tokens_in_name,
  abs(length(n.key) - length(r.key))                    as character_gap,
  'PROPOSED - a person must confirm. Same token count and a character gap of '
    || abs(length(n.key)-length(r.key))
    || '. This is a spelling or spacing variant, NOT a decided match.'
                                                        as status,
  'Confirm in Metrc that these are the same strain, then record the ruling. '
  'If they are different strains, register the missing one at source (rule D2).'
                                                        as what_to_do
from n
join reg r
  on n.toks = r.toks
 and abs(length(n.key) - length(r.key)) <= 2
 and similarity(n.key, r.key) >= 0.70
order by 4 desc;

comment on view public.v_strain_name_proposal is
  'Spelling/spacing variants among the unresolved strain names, offered for human '
  'confirmation. PROPOSALS ONLY -- nothing here is applied. A plain similarity '
  'threshold was tested on 10 Aug 2026 and REJECTED: 2 of its 6 best matches were '
  'wrong. The rule used here is structural (token count + length gap), which '
  'rejects those two by construction. Precision over recall is deliberate: a '
  'missed match costs one click, a wrong match publishes the wrong strain to a '
  'customer.';

revoke all on public.v_strain_name_proposal from public, anon;
grant select on public.v_strain_name_proposal to authenticated;
;
