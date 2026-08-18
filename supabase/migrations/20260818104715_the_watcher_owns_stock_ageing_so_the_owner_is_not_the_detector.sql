/* The watcher owns stock ageing, so the owner is not the detector.
 *
 * Owner, 18 Aug 2026: "OS and agents watchers fix and handle."
 *
 * He found the ageing figure himself, challenged it, and was right — 515.7 lb of ageing
 * stock that was actually 22 tags, of which most were held on purpose. He should not have
 * been the one to notice.
 *
 * This runs daily. It raises a finding when genuinely stale material exists, a separate
 * one for remnants, and stays SILENT when there is nothing — a check that speaks every day
 * teaches people to stop reading it.
 *
 * It also raises a finding when a category has NO POLICY. A new product category appearing
 * with no ageing rule is exactly how seeds ended up counted as spoiling flower, and
 * silence there would let the next one in the same way.
 */

create or replace function public.f_check_stock_ageing(p_by text default 'watcher')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_stale_lb numeric; v_stale_tags int;
  v_remnant_tags int;  v_remnant_lb numeric;
  v_nopolicy int; v_nopolicy_cats text;
  v_raised int := 0;
begin
  select coalesce(round(sum(lb),1),0), count(*)
    into v_stale_lb, v_stale_tags
    from v_stock_ageing where ageing_verdict like 'STALE%';

  select count(*), coalesce(round(sum(lb),3),0)
    into v_remnant_tags, v_remnant_lb
    from v_stock_ageing where remnant_verdict is not null;

  select count(distinct category), string_agg(distinct category, ', ')
    into v_nopolicy, v_nopolicy_cats
    from v_stock_ageing where ageing_verdict like 'NO POLICY%';

  if v_stale_tags > 0 then
    insert into watchdog_findings (
      observed_at, fingerprint, severity, what, where_it_is, who_is_accountable,
      when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, evidence, record_count, pounds, solutions, guard_recommendation)
    select now(), 'stock_ageing_stale|' || to_char(current_date,'IYYY-IW'), 'elevated',
      v_stale_tags || ' packages are past their category''s shelf life, holding '
        || v_stale_lb || ' lb. Material held on purpose in Quarantine or the biomass '
        || 'freezer is NOT counted here.',
      'v_stock_ageing where ageing_verdict is STALE. Rooms: '
        || coalesce((select string_agg(distinct location, ', ') from v_stock_ageing
                      where ageing_verdict like 'STALE%'), 'none'),
      'Cultivation for flower, Manufacturing for pre-rolls and edibles.',
      'Oldest package packaged ' || coalesce((select min(packaged_on)::text from v_stock_ageing
                                               where ageing_verdict like 'STALE%'), 'unknown'),
      'Cured product loses weight and terpenes. Anything past its window either sells at a '
        || 'discount, goes to extraction, or is destroyed — and each of those is a decision '
        || 'somebody has to take rather than let happen.',
      'f_check_stock_ageing, daily, comparing each package''s own age against '
        || 'stock_ageing_policy for its category.',
      'Review the list and decide per tag: sell, send to extraction, or destroy. Record the '
        || 'decision either way.',
      v_stale_tags || ' tags, ' || v_stale_lb || ' lb past their category window.',
      (select jsonb_agg(jsonb_build_object('tag', tag, 'category', category, 'room', location,
                                           'lb', lb, 'days', days_held))
         from v_stock_ageing where ageing_verdict like 'STALE%'),
      v_stale_tags, v_stale_lb,
      array['Sell it, at a discount if that is what it takes.',
            'Send it to extraction — old flower is still good feedstock.',
            'Destroy it and record the loss, which is honest and closes the tag.',
            'If it is being held deliberately, move it to a holding room so the clock stops '
              || 'and the reason is recorded, rather than leaving it to look like neglect.'],
      'Do not widen stock_ageing_policy to make this quiet. The window is what the owner '
        || 'believes about his own product; if it is wrong, change it deliberately and say '
        || 'why in the policy''s why column.'
    on conflict do nothing;
    v_raised := v_raised + 1;
  end if;

  if v_remnant_tags > 0 then
    insert into watchdog_findings (
      observed_at, fingerprint, severity, what, where_it_is, who_is_accountable,
      when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, evidence, record_count, pounds, solutions, guard_recommendation)
    select now(), 'stock_remnants|' || to_char(current_date,'IYYY-IW'), 'watch',
      v_remnant_tags || ' tags hold only a remnant — ' || v_remnant_lb
        || ' lb between all of them. These are worked-down packages that were never '
        || 'finished out in Metrc.',
      'v_stock_ageing where remnant_verdict is set.',
      'Whoever works the package down closes it. Cultivation and Manufacturing.',
      'Accumulating since the platform began.',
      'A remnant is bookkeeping, not spoilage. Each one still counts as an open package, '
        || 'inflates the tag count, and appears in every on-hand list a person has to read. '
        || v_remnant_tags || ' tags for ' || v_remnant_lb || ' lb is noise drowning signal.',
      'f_check_stock_ageing, daily, against stock_ageing_policy.remnant_under_lb.',
      'Finish these out in Metrc. The weight is negligible; the clutter is not.',
      v_remnant_tags || ' tags holding ' || v_remnant_lb || ' lb, an average of '
        || round(v_remnant_lb / nullif(v_remnant_tags,0), 4) || ' lb each.',
      jsonb_build_object('tags', v_remnant_tags, 'lb', v_remnant_lb),
      v_remnant_tags, v_remnant_lb,
      array['Finish them out in Metrc in one pass.',
            'Adjust the residue to zero with a recorded reason.',
            'Raise remnant_under_lb in stock_ageing_policy if the threshold is wrong — but '
              || 'say why, because the point is to find abandoned tags, not to stop looking.'],
      'Low severity on purpose. This is housekeeping, not risk. It becomes risk when the '
        || 'clutter is thick enough that nobody reads the on-hand list any more.'
    on conflict do nothing;
    v_raised := v_raised + 1;
  end if;

  if v_nopolicy > 0 then
    insert into watchdog_findings (
      observed_at, fingerprint, severity, what, where_it_is, who_is_accountable,
      when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, evidence, record_count, solutions, guard_recommendation)
    values (now(), 'stock_ageing_no_policy|' || v_nopolicy_cats, 'elevated',
      v_nopolicy || ' product category(ies) have no ageing policy: ' || v_nopolicy_cats,
      'stock_ageing_policy. A category with no row is neither watched nor knowingly excused.',
      'Agent I, Database COO.',
      'Since the category first appeared in Metrc.',
      'A category with no policy is invisible to the ageing check. Seeds were counted as '
        || 'spoiling flower for exactly this reason until 18 Aug 2026 — 24 tags of a '
        || 'genetics library reported as ageing stock.',
      'f_check_stock_ageing found packages whose category has no stock_ageing_policy row.',
      'Add a row saying whether it ages, after how long, and what counts as a remnant — with '
        || 'the reasoning in the why column.',
      v_nopolicy || ' categories unpoliced.',
      jsonb_build_object('categories', v_nopolicy_cats), v_nopolicy,
      array['Add the policy row with a written why.',
            'If the category is obsolete, retire it rather than leaving it unpoliced.'],
      'Do not default a new category to "does not age" to clear this. Seeds genuinely do not '
        || 'age; most things do, and guessing wrong in that direction hides real spoilage.');
    v_raised := v_raised + 1;
  end if;

  return jsonb_build_object(
    'findings_raised', v_raised,
    'stale_tags', v_stale_tags, 'stale_lb', v_stale_lb,
    'remnant_tags', v_remnant_tags, 'remnant_lb', v_remnant_lb,
    'categories_without_policy', v_nopolicy,
    'note', case when v_raised = 0
                 then 'Nothing stale, nothing abandoned, every category policed.'
                 else 'Findings raised. The owner should not have to notice this himself.' end);
end $function$;

comment on function public.f_check_stock_ageing(text) is
  'Daily watcher for stock ageing. Raises a finding for genuinely stale material, one for '
  'abandoned remnants, and one for any category with no policy — and stays silent when '
  'there is nothing, because a check that speaks every day stops being read. Material in a '
  'holding room is excluded: Quarantine and the biomass freezer are decisions, not neglect. '
  'Built 18 Aug 2026 after the owner found a 515.7 lb ageing figure that was really 22 tags. '
  'Agent I.';;
