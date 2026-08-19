/* QUICKBOOKS DATE CONTRACT — ONE CATALOG, ONE CALCULATOR, ONE DEFAULT.
 *
 * The database already held the right catalogue, but the browser ignored it
 * and carried a smaller second list with different keys and different week
 * boundaries. f_date_default also stopped reading nav_registry.default_range,
 * so a page configured for Today, YTD, 90 days or 180 days reopened on Month.
 *
 * This migration makes the catalogue executable without evaluating the
 * from_expr/to_expr text as SQL. The algorithm understands period SHAPES; all
 * business choices remain rows. SECURITY INVOKER plus explicit grants keeps
 * this a signed-in read API, not a privileged escape hatch.
 *
 * UNDO: restore f_date_default from
 * 20260819143232_a_custom_range_saved_everywhere_keeps_its_dates.sql; drop
 * f_date_presets(date); drop the six metadata columns and their constraints.
 */

alter table public.date_range_presets
  add column if not exists calculation_kind text,
  add column if not exists period_offset integer not null default 0,
  add column if not exists rolling_days integer,
  add column if not exists manual_mode text not null default 'none',
  add column if not exists show_as_quick boolean not null default false,
  add column if not exists quick_label text;

update public.date_range_presets
set calculation_kind = case
      when preset_key = 'all' then 'unbounded'
      when preset_key in ('custom','since_date','until_date') then 'manual'
      when preset_key in ('today','yesterday') then 'day'
      when preset_key like '%week%' then 'week'
      when preset_key like '%month%' then 'month'
      when preset_key like '%quarter%' then 'quarter'
      when preset_key in ('this_year','this_year_td','last_year','last_year_td') then 'year'
      when preset_key like 'since_%' then 'rolling'
      when preset_key like 'fiscal_%' then 'fiscal_year'
    end,
    period_offset = case
      when preset_key in ('yesterday','last_week','last_month','last_quarter',
                          'last_year','last_year_td','fiscal_last') then -1
      else 0
    end,
    rolling_days = case preset_key
      when 'since_30' then 30
      when 'since_60' then 60
      when 'since_90' then 90
      when 'since_180' then 180
      when 'since_365' then 365
      else null
    end,
    manual_mode = case preset_key
      when 'custom' then 'both'
      when 'since_date' then 'from'
      when 'until_date' then 'to'
      else 'none'
    end,
    show_as_quick = preset_key in
      ('today','this_week','this_month','this_quarter','this_year','all'),
    quick_label = case preset_key
      when 'today' then 'Today'
      when 'this_week' then 'Week'
      when 'this_month' then 'Month'
      when 'this_quarter' then 'Quarter'
      when 'this_year' then 'Year'
      when 'all' then 'All'
      else null
    end;

/* The two open-ended choices are genuinely open. Their prose already said so,
 * but since_date still carried current_date as an end expression. */
update public.date_range_presets
set from_expr = null, to_expr = null
where preset_key in ('since_date','until_date');

alter table public.date_range_presets
  alter column calculation_kind set not null;

alter table public.date_range_presets
  drop constraint if exists date_range_presets_calculation_kind_check,
  add constraint date_range_presets_calculation_kind_check
    check (calculation_kind in
      ('unbounded','manual','day','week','month','quarter','year','rolling','fiscal_year')),
  drop constraint if exists date_range_presets_manual_mode_check,
  add constraint date_range_presets_manual_mode_check
    check (manual_mode in ('none','both','from','to')),
  drop constraint if exists date_range_presets_rolling_days_check,
  add constraint date_range_presets_rolling_days_check
    check ((calculation_kind = 'rolling' and rolling_days > 0)
        or (calculation_kind <> 'rolling' and rolling_days is null)),
  drop constraint if exists date_range_presets_quick_label_check,
  add constraint date_range_presets_quick_label_check
    check ((show_as_quick and quick_label is not null)
        or (not show_as_quick));

create or replace function public.f_date_presets(p_anchor date default current_date)
returns table (
  preset_key text,
  label text,
  group_label text,
  sort_order integer,
  resolved_from date,
  resolved_to date,
  is_to_date boolean,
  manual_mode text,
  show_as_quick boolean,
  quick_label text,
  note text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  with shaped as (
    select
      p.*,
      case p.calculation_kind
        when 'day' then p_anchor + p.period_offset
        when 'week' then
          date_trunc('week', p_anchor + p.period_offset * interval '1 week')::date
        when 'month' then
          date_trunc('month', p_anchor + p.period_offset * interval '1 month')::date
        when 'quarter' then
          date_trunc('quarter', p_anchor + p.period_offset * interval '3 months')::date
        when 'year' then
          date_trunc('year', p_anchor + p.period_offset * interval '1 year')::date
        when 'rolling' then p_anchor - (p.rolling_days - 1)
        when 'fiscal_year' then
          public.f_fiscal_year_start(p_anchor)
            + p.period_offset * interval '1 year'
        else null
      end::date as period_start
    from public.date_range_presets p
  )
  select
    s.preset_key,
    s.label,
    s.group_label,
    s.sort_order,
    s.period_start as resolved_from,
    case
      when s.calculation_kind in ('unbounded','manual') then null
      when s.calculation_kind = 'day' then s.period_start
      when s.calculation_kind = 'rolling' then p_anchor
      when s.is_to_date then case s.calculation_kind
        when 'week' then (p_anchor + s.period_offset * interval '1 week')::date
        when 'month' then (p_anchor + s.period_offset * interval '1 month')::date
        when 'quarter' then (p_anchor + s.period_offset * interval '3 months')::date
        when 'year' then (p_anchor + s.period_offset * interval '1 year')::date
        when 'fiscal_year' then (p_anchor + s.period_offset * interval '1 year')::date
        else p_anchor
      end
      when s.calculation_kind = 'week' then s.period_start + 6
      when s.calculation_kind = 'month' then
        (s.period_start + interval '1 month - 1 day')::date
      when s.calculation_kind = 'quarter' then
        (s.period_start + interval '3 months - 1 day')::date
      when s.calculation_kind in ('year','fiscal_year') then
        (s.period_start + interval '1 year - 1 day')::date
      else null
    end as resolved_to,
    s.is_to_date,
    s.manual_mode,
    s.show_as_quick,
    s.quick_label,
    s.note
  from shaped s
  order by s.sort_order;
$function$;

comment on function public.f_date_presets(date) is
  'The only executable QuickBooks-style date catalogue. Resolves every configured '
  'preset against one anchor date using safe period metadata; no client reimplements '
  'the calendar and no stored SQL expression is evaluated.';

create or replace function public.f_date_default(p_user uuid, p_view_key text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  with
  page_choice as (
    select p.preset_key, p.custom_from, p.custom_to
    from public.user_page_date_default p
    where p.user_id = p_user and p.view_key = p_view_key
    limit 1
  ),
  user_choice as (
    select u.default_date_preset, u.custom_from, u.custom_to,
           coalesce(u.date_default_scope, 'remember_last') as date_default_scope
    from public.user_settings u
    where u.user_id = p_user
    limit 1
  ),
  page_rule as (
    select n.default_range, n.range_kind
    from public.nav_registry n
    where n.view_key = p_view_key
    limit 1
  ),
  choice as (
    select
      coalesce(
        pc.preset_key,
        uc.default_date_preset,
        pr.default_range,
        case when pr.range_kind = 'snapshot' then 'today' else 'this_month' end,
        'this_month'
      ) as preset_key,
      case when pc.preset_key is not null then pc.custom_from else uc.custom_from end
        as custom_from,
      case when pc.preset_key is not null then pc.custom_to else uc.custom_to end
        as custom_to,
      coalesce(uc.date_default_scope, 'remember_last') as default_scope,
      coalesce(pr.range_kind, 'activity') as range_kind,
      pr.default_range as page_default,
      case
        when pc.preset_key is not null then 'this user, this page'
        when uc.default_date_preset is not null then 'this user''s own default'
        when pr.default_range is not null then 'this page''s governed default'
        when pr.range_kind = 'snapshot' then 'snapshot fallback — today'
        else 'company fallback — this month'
      end as source
    from (select 1) seed
    left join page_choice pc on true
    left join user_choice uc on true
    left join page_rule pr on true
  ),
  raw as (
    select
      c.*,
      r.label as preset_label,
      r.manual_mode,
      case r.manual_mode
        when 'both' then c.custom_from
        when 'from' then c.custom_from
        when 'to' then null
        else r.resolved_from
      end as raw_from,
      case r.manual_mode
        when 'both' then c.custom_to
        when 'from' then null
        when 'to' then c.custom_to
        else r.resolved_to
      end as raw_to
    from choice c
    join public.f_date_presets(current_date) r
      on r.preset_key = c.preset_key
  )
  select jsonb_build_object(
    /* Atomic-release bridge. The browser currently in production understands
     * only these six keys. For every richer governed preset it receives
     * "custom" plus the exact endpoints, while the new browser reads
     * governed_preset_key. Remove this bridge only after every production
     * client has moved to the server-resolved contract. */
    'preset_key', case when raw.preset_key in
      ('all','today','this_month','this_quarter','this_year','custom')
      then raw.preset_key else 'custom' end,
    'governed_preset_key', raw.preset_key,
    'preset_label', raw.preset_label,
    'custom_from', case
      when raw.raw_from is not null and raw.raw_to is not null
       and raw.raw_from > raw.raw_to then raw.raw_to
      else raw.raw_from
    end,
    'custom_to', case
      when raw.raw_from is not null and raw.raw_to is not null
       and raw.raw_from > raw.raw_to then raw.raw_from
      else raw.raw_to
    end,
    'resolved_from', case
      when raw.raw_from is not null and raw.raw_to is not null
       and raw.raw_from > raw.raw_to then raw.raw_to
      else raw.raw_from
    end,
    'resolved_to', case
      when raw.raw_from is not null and raw.raw_to is not null
       and raw.raw_from > raw.raw_to then raw.raw_from
      else raw.raw_to
    end,
    'manual_mode', raw.manual_mode,
    'scope', raw.default_scope,
    'source', raw.source,
    'range_kind', raw.range_kind,
    'page_default', raw.page_default
  )
  from raw;
$function$;

comment on function public.f_date_default(uuid, text) is
  'Resolves one user and page through four ordered levels: user+page, user '
  'everywhere, nav_registry page default, then the company fallback. Returns '
  'server-resolved endpoints so no browser performs different calendar maths.';

/* The catalogue is configuration, not an authenticated write surface. RLS was
 * already read-only, but the grants advertised broader authority than the
 * policy would ever permit. Grants and policy now say the same thing. */
revoke all on table public.date_range_presets from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.date_range_presets from authenticated;
grant select on table public.date_range_presets to authenticated;

revoke all on function public.f_date_presets(date) from public, anon;
grant execute on function public.f_date_presets(date) to authenticated, service_role;

revoke all on function public.f_date_default(uuid, text) from public, anon;
grant execute on function public.f_date_default(uuid, text) to authenticated, service_role;

/* Schedule adherence used to show an editable date strip while its key figures
 * stayed pinned to a second Year/Quarter/Month control. This range aggregate is
 * the database-owned answer for any selected window, including custom dates. */
create or replace function public.f_schedule_cost_range(p_from date, p_to date)
returns table (
  period_type text,
  period_start date,
  late_pulls bigint,
  days_late bigint,
  pounds_at_risk numeric,
  dollars_at_risk numeric,
  whole_cycles_lost bigint,
  cost_per_lb_used numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select
    'custom'::text,
    p_from,
    count(*)::bigint,
    coalesce(sum(d.days_late), 0)::bigint,
    round(coalesce(sum(d.pounds_at_risk), 0), 1),
    round(coalesce(sum(d.dollars_at_risk), 0), 0),
    coalesce(sum(d.whole_cycles_lost), 0)::bigint,
    max(d.cost_per_lb_then)
  from public.v_schedule_cost_detail d
  where (p_from is null or d.scheduled_date >= p_from)
    and (p_to is null or d.scheduled_date <= p_to);
$function$;

comment on function public.f_schedule_cost_range(date, date) is
  'Recomputes schedule cost KPIs from their detail rows for the exact inclusive '
  'user-selected range. The UI uses this same range for every drill row.';

revoke all on function public.f_schedule_cost_range(date, date) from public, anon;
grant execute on function public.f_schedule_cost_range(date, date) to authenticated, service_role;
