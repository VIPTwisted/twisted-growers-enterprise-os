/* ONE DEFINITION OF "IS THIS THE SAME STATE LICENCE", AND WHAT IT RECOVERS.
 *
 * NOT YET APPLIED. Written 15 Aug 2026 while the database connection was down, so
 * nothing below has been run or verified. Apply, then verify against the numbers
 * stated in the comments - if they do not reproduce, the comments are wrong and the
 * migration should be questioned, not the database.
 *
 * WHAT THIS IS FOR. 277 Apex orders worth $1,267,382 read APEX ONLY - UNEXPLAINED
 * against Metrc. 51 of them, worth $264,719, went to buyers Metrc says we have never
 * shipped anything to. That sounded like unshipped product. It is very largely typing.
 *
 * MEASURED 15 Aug 2026, before this migration:
 *
 *     apex has        metrc has        the mistake
 *     MRN283033       MR283033         stray N after MR   (also 282378, 284920, 284668)
 *     284652          MR284652         prefix missing entirely (also 283720)
 *     mr282474        MR282474         lowercase          (also mr284843)
 *     RMD705          RMD705-C/-P/-R   site suffix missing (also RMD665)
 *     RMD-445         RMD445-R         stray hyphen
 *     MP281588        MR281588         MP typed for MR
 *
 *     12 buyers · 20 orders · $70,224 - every one sharing IDENTICAL DIGITS with a
 *     licence Metrc has actually shipped to.
 *
 * WHY DIGITS ARE THE KEY, AND WHERE THAT STOPS BEING SAFE. All fourteen recoveries
 * above match on digits alone. But digits alone is NOT proof: MP281588 and MR281588
 * share digits and are different licence TYPES - a product manufacturer and a
 * retailer. Often that is one company holding two licences; it does not have to be.
 * So this does not silently declare them equal. It grades the match and lets the
 * reader see which kind they are looking at:
 *
 *     exact           the normalised strings are identical
 *     suffix variant  one is the other plus a site suffix - RMD705 vs RMD705-C
 *     digits only     digits agree, alpha prefix does not - PROBABLE, eyeball it
 *
 * A check that cannot distinguish a certainty from a probability is not a check.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not rewrite anything in Apex. Apex is
 * the sales system of record and its rows are not ours to edit - and rewriting them
 * would destroy the evidence of what was actually typed. Normalising on READ fixes
 * every one of these permanently AND keeps fixing them as new ones are typed, which
 * they will be: four of the fourteen were entered in 2026.
 *
 * It also does not repoint v_apex_order_metrc_link yet. That view has 21 columns and
 * create-or-replace cannot reorder them, so repointing it is a second, separate step
 * to be made once these functions are applied and their output is verified against
 * live data. Shipping the matcher and the surface in one untested migration is how
 * v18 got rolled back.
 */

create or replace function public.f_licence_digits(p_licence text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(regexp_replace(coalesce(p_licence, ''), '\D', '', 'g'), '')
$$;

comment on function public.f_licence_digits(text) is
  'The stable part of a state licence: its digits, with every letter, space, hyphen and case difference removed. Every one of the fourteen Apex-to-Metrc licence mismatches found on 15 Aug 2026 agreed on this and disagreed on everything else. Null when the input carries no digits at all.';

create or replace function public.f_licence_normalised(p_licence text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(upper(regexp_replace(coalesce(p_licence, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

comment on function public.f_licence_normalised(text) is
  'A state licence with case, spaces, hyphens and punctuation removed. Turns RMD-445 into RMD445 and mr282474 into MR282474. Use with f_licence_digits: normalised catches formatting, digits catches a wrong or missing alpha prefix.';

create or replace function public.f_licence_match_grade(p_apex text, p_metrc text)
returns text
language sql
immutable
parallel safe
as $$
  /* THE DIGITS MUST AGREE BEFORE ANY OTHER TEST IS ALLOWED TO SPEAK.
     An earlier draft checked "suffix variant" on the normalised strings alone, so a
     short licence could prefix-match an unrelated longer one. Verified read-only
     against live data on 15 Aug 2026 before this was applied: that draft produced 163
     pairs from 4 Apex licences - a fan-out, i.e. false matches. Requiring the digits
     first gives 19 pairs from 17 Apex licences, and the only one-to-many left is the
     real one: RMD705 against RMD705-C, -P and -R, which are three genuine sites of
     one operator. */
  select case
    when p_apex is null or p_metrc is null                                then null
    when public.f_licence_digits(p_apex) is null
      or public.f_licence_digits(p_apex) is distinct from
         public.f_licence_digits(p_metrc)                                 then null
    when public.f_licence_normalised(p_apex)
       = public.f_licence_normalised(p_metrc)                             then 'exact'
    when public.f_licence_normalised(p_metrc)
         like public.f_licence_normalised(p_apex) || '%'
      or public.f_licence_normalised(p_apex)
         like public.f_licence_normalised(p_metrc) || '%'                 then 'suffix variant'
    else                                                                       'digits only'
  end
$$;

comment on function public.f_licence_match_grade(text, text) is
  'How confident the pairing of two state licences is, and never more confident than the evidence. "exact" once case and punctuation are removed. "suffix variant" where one is the other plus a site suffix, RMD705 against RMD705-C. "digits only" where the digits agree but the alpha prefix does not - PROBABLE, not proven: MP281588 and MR281588 share digits and are different licence types. Null means no relationship. Never collapse these three into a boolean.';

create or replace view public.v_apex_licence_recovery as
with apex as (
  select distinct
         nullif(a.payload ->> 'state_license', '') as apex_licence,
         nullif(a.payload ->> 'name', '')          as buyer_name
    from public.apex_raw a
   where a.entity = 'buyers'
     and nullif(a.payload ->> 'state_license', '') is not null
), metrc as (
  select distinct m.destination_licence as metrc_licence,
         m.destination_facility         as metrc_facility
    from public.metrc_rpt_transfer_manifests m
   where m.destination_licence is not null
)
select a.apex_licence,
       a.buyer_name,
       m.metrc_licence,
       m.metrc_facility,
       public.f_licence_match_grade(a.apex_licence, m.metrc_licence) as match_grade,
       (a.apex_licence = m.metrc_licence)                            as matched_before_this,
       case
         when a.apex_licence = m.metrc_licence then null
         when upper(a.apex_licence) = m.metrc_licence then 'Apex has it in lower case.'
         when public.f_licence_normalised(a.apex_licence) = public.f_licence_normalised(m.metrc_licence)
           then 'Punctuation or spacing differs only.'
         when public.f_licence_digits(a.apex_licence) is not null
          and public.f_licence_normalised(m.metrc_licence) like public.f_licence_normalised(a.apex_licence) || '%'
           then 'Apex is missing the site suffix Metrc uses.'
         when public.f_licence_digits(a.apex_licence) = public.f_licence_digits(m.metrc_licence)
           then 'Same digits, different alpha prefix - probable typo, but MP and MR are different licence types so confirm the company before relying on it.'
       end                                                           as what_differs
  from apex a
  join metrc m
    on public.f_licence_match_grade(a.apex_licence, m.metrc_licence) is not null
 where a.apex_licence is distinct from m.metrc_licence;

comment on view public.v_apex_licence_recovery is
  'Every Apex buyer licence that does NOT literally equal a Metrc destination licence but plainly refers to the same one, with the difference named in words and the confidence graded. Built 15 Aug 2026 after 51 Apex orders worth $264,719 read as "we have never shipped this buyer anything" - largely because Apex holds MRN283033 where Metrc holds MR283033, or 284652 where Metrc holds MR284652. Nothing in Apex is rewritten: Apex is the sales record and the typed value is the evidence. Read match_grade before acting - "digits only" is probable, not proven.';
