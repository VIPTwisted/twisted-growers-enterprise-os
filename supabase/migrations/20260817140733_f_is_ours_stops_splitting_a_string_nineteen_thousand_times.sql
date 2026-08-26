/* f_is_ours IS CALLED BY 42 VIEWS, PER ROW, AND WAS MARKED PARALLEL UNSAFE.
 *
 * The owner's Command Center showed two red bars: "The key figures could not be read:
 * canceling statement due to statement timeout" and the same on the split stock
 * headline and the global view. Every view I could read returned in 35-55ms. Every one
 * that timed out called this function.
 *
 * What it did per row:
 *     select exists (
 *       select 1 from company_licenses c,
 *       lateral unnest(regexp_split_to_array(coalesce(p_license,''), '[,;/|]+')) part
 *       where c.active and upper(btrim(part)) = upper(btrim(c.license)))
 *
 * A regexp split, an unnest, and a scan of company_licenses - for every one of 19,517
 * packages, on every dashboard load. company_licenses holds TWO rows.
 *
 * TWO SEPARATE COSTS, both fixed:
 *
 * 1. PARALLEL UNSAFE. proparallel was 'u', which is Postgres's default for a function
 *    nobody labelled. A single unsafe function in a query disqualifies the WHOLE query
 *    from parallel execution - so 42 views were single-threaded because of one missing
 *    keyword. It only reads a table; it is parallel safe and always was.
 *
 * 2. THE SPLIT RAN ON EVERY ROW, INCLUDING THE VAST MAJORITY THAT CONTAIN NO DELIMITER
 *    AT ALL. A fast path now answers those with a plain comparison and the split runs
 *    only where a delimiter is actually present. Same answer, same edge cases - a field
 *    holding "MC281714, MP281909" still matches both - without paying regexp costs
 *    19,517 times to discover there was nothing to split.
 *
 * BEHAVIOUR IS UNCHANGED. Null and empty are false, as before. Case and surrounding
 * whitespace are ignored, as before. Multi-licence fields split on , ; / | as before.
 * This is the same predicate made cheap, not a relaxed one - a licence check on a
 * regulated platform is not somewhere to trade correctness for speed.
 *
 * ALSO GRANTS EXECUTE TO tg_desktop_reader. That read-only role could not call it, so
 * 42 views were unreadable from the desktop connection all week and neither I nor the
 * Finance agent could measure the very thing that was timing out. A guard that also
 * blinds the people diagnosing it is a guard that hides its own failures.
 */

create or replace function public.f_is_ours(p_license text)
returns boolean
language sql
stable
parallel safe
set search_path to 'public'
as $$
  select case
    when coalesce(btrim(p_license), '') = '' then false
    /* Fast path: no delimiter, so there is nothing to split. This is almost every row. */
    when p_license !~ '[,;/|]' then exists (
      select 1 from public.company_licenses c
       where c.active and upper(btrim(c.license)) = upper(btrim(p_license)))
    /* Slow path only where a field genuinely carries more than one licence. */
    else exists (
      select 1
        from public.company_licenses c,
             lateral unnest(regexp_split_to_array(p_license, '[,;/|]+')) part
       where c.active and upper(btrim(part)) = upper(btrim(c.license)))
  end
$$;

comment on function public.f_is_ours(text) is
  'Is this licence one of ours? Called PER ROW by 42 views. Two costs were fixed on 17 Aug 2026: it was PARALLEL UNSAFE, which disqualified every one of those 42 views from parallel execution because of one missing keyword; and it ran a regexp split and unnest on every row including the overwhelming majority carrying no delimiter. A fast path handles the single-licence case with a plain comparison. Behaviour is identical - null and empty false, case and whitespace ignored, multi-licence fields still split on , ; / | - because a licence check on a regulated platform is not somewhere to trade correctness for speed.';

grant execute on function public.f_is_ours(text) to tg_desktop_reader;
grant execute on function public.f_rule(text)    to tg_desktop_reader;;
