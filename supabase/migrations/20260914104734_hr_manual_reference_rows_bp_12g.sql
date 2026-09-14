-- BP-12g · the Employee Manual's quick reference (procedures, contacts, holidays, pay periods)
-- was typed into Manual.jsx (with retail leftovers such as "Black Friday — extended hours").
-- One reader returns rows: published procedures from hr.hr_policies, the company's support
-- contacts from hr.company_branding, the holiday calendar the OS holds (public.holidays) and
-- the pay periods the OS holds (public.pay_periods). Empty lists are empty; the page says
-- where HR enters them.
set search_path = hr, public, extensions;

create or replace function hr.manual_reference(p_node_ids uuid[] default null, p_year int default null)
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  with y as (select coalesce(p_year, extract(year from current_date)::int) yr),
  pp as (select 'PP-' || lpad(row_number() over (order by starts_on)::text, 2, '0') period, starts_on, ends_on, pay_date, frequency, status
           from public.pay_periods, y where extract(year from starts_on)::int = y.yr)
  select jsonb_build_object(
    'year', (select yr from y),
    'procedures', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'category', p.category, 'version', p.version,
                     'effective_date', p.effective_date, 'content', p.content, 'ack_required', p.ack_required) order by p.category, p.title)
                   from hr.hr_policies p where p.tenant_id = hr.tg_tenant_id() and coalesce(p.is_active, true)
                     and coalesce(p.status, 'draft') in ('published', 'active') and (p.category ilike '%procedure%' or p.category ilike '%operation%' or p.category ilike '%sop%')), '[]'::jsonb),
    'policies_published', (select count(*) from hr.hr_policies p where p.tenant_id = hr.tg_tenant_id() and coalesce(p.is_active, true) and coalesce(p.status, 'draft') in ('published', 'active')),
    'contacts', jsonb_build_array(jsonb_build_object('name', 'Police / Fire / EMS', 'role', 'Emergency', 'phone', '911', 'email', '—'))
                || coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(b.company_display_name, 'Twisted Growers') || ' HR', 'role', 'HR / support', 'phone', b.support_phone, 'email', b.support_email))
                             from hr.company_branding b where b.tenant_id = hr.tg_tenant_id() and (b.support_phone is not null or b.support_email is not null)), '[]'::jsonb),
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('date', h.holiday_date, 'holiday', h.name, 'paid', h.paid, 'hours', h.hours, 'multiplier_if_worked', h.multiplier_if_worked,
                     'department', d.name) order by h.holiday_date)
                   from public.holidays h left join public.departments d on d.id = h.department_id, y
                   where coalesce(h.active, true) and extract(year from h.holiday_date)::int = y.yr), '[]'::jsonb),
    'pay_periods', coalesce((select jsonb_agg(jsonb_build_object('period', pp.period, 'start', pp.starts_on, 'end', pp.ends_on, 'payday', pp.pay_date, 'frequency', pp.frequency, 'status', pp.status) order by pp.starts_on) from pp), '[]'::jsonb));
$$;
revoke all on function hr.manual_reference(uuid[], int) from public, anon;
grant execute on function hr.manual_reference(uuid[], int) to authenticated;
notify pgrst, 'reload schema';;
