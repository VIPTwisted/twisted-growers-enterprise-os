/* Last 12 calendar months — owner ruling, 28 Aug 2026: "since_365 is not that."
 *
 * The catalogue offered `since_365`, which is a rolling day count and lands wherever
 * the anchor happens to fall. Measured against 2026-08-28 the difference is the whole
 * point of the ruling:
 *
 *   since_365          2025-08-29 → 2026-08-28    ragged, cuts two months in half
 *   last_12_months     2025-09-01 → 2026-08-31    twelve whole calendar months
 *
 * A report grouped by month over since_365 shows thirteen buckets, two of them partial,
 * and the first and last are not comparable to the eleven between them. That is the
 * defect. "Last 12 months" on a finance page has to mean twelve months.
 *
 * WHY A NEW calculation_kind AND NOT A NEW ROW.
 *
 * Every existing kind resolves ONE period: 'month' with period_offset -11 returns
 * September 2025 alone, because resolved_to is period_start + 1 month - 1 day. There
 * was no way to express a SPAN of months, which is why whoever needed a year of data
 * reached for 'rolling' and got days. `month_span` adds the missing shape — a start
 * month plus a length — rather than a second catalogue in React, which the spec
 * forbids: "Do not fork a second catalog in React."
 *
 * WHAT THIS WINDOW INCLUDES, STATED PLAINLY. It ends on the last day of the CURRENT
 * month, so on 28 Aug the window runs to 31 Aug and the final month is still filling.
 * That matches how `this_month` already behaves in this catalogue (2026-08-01 →
 * 2026-08-31 on the 28th), so the two agree rather than disagreeing by three days.
 * If the owner wants the twelve COMPLETE months instead — 2025-08-01 → 2026-07-31,
 * excluding the month in progress — that is period_offset -12 and nothing else
 * changes. One number, one line, and it is a decision about meaning, not mechanism.
 *
 * NOTHING IS REMOVED. since_365 stays: a rolling 365-day window is a legitimate thing
 * to ask for, and pages already pointing at it keep working. This adds the calendar
 * one beside it.
 */

alter table public.date_range_presets
  add column if not exists span_months integer;

comment on column public.date_range_presets.span_months is
  'How many whole calendar months a month_span preset covers, counting its start month. '
  'Null for every other calculation_kind.';

alter table public.date_range_presets
  drop constraint if exists date_range_presets_calculation_kind_check,
  add constraint date_range_presets_calculation_kind_check
    check (calculation_kind in
      ('unbounded','manual','day','week','month','month_span','quarter','year','rolling','fiscal_year')),
  drop constraint if exists date_range_presets_span_months_check,
  add constraint date_range_presets_span_months_check
    check ((calculation_kind = 'month_span' and span_months > 0)
        or (calculation_kind <> 'month_span' and span_months is null));

/* Idempotent: re-running must not raise a second row or a duplicate-key error. */
insert into public.date_range_presets
  (preset_key, label, group_label, sort_order, calculation_kind, period_offset,
   span_months, is_to_date, manual_mode, show_as_quick, quick_label)
values
  ('last_12_months', 'Last 12 Months', 'Rolling', 215, 'month_span', -11,
   12, false, 'none', true, 'Last 12 months')
on conflict (preset_key) do update set
  label            = excluded.label,
  group_label      = excluded.group_label,
  sort_order       = excluded.sort_order,
  calculation_kind = excluded.calculation_kind,
  period_offset    = excluded.period_offset,
  span_months      = excluded.span_months,
  is_to_date       = excluded.is_to_date,
  manual_mode      = excluded.manual_mode,
  show_as_quick    = excluded.show_as_quick,
  quick_label      = excluded.quick_label;

/* The resolver gains one arm. Everything else is reproduced verbatim so the diff shows
 * exactly what changed: 'month_span' in the start expression, and 'month_span' in the
 * end expression. The is_to_date branch is deliberately left above them — a month_span
 * preset is not a to-date preset, and setting both would silently win the wrong way. */
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
        when 'month_span' then
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
      when s.calculation_kind = 'month_span' then
        (s.period_start + (s.span_months * interval '1 month') - interval '1 day')::date
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
