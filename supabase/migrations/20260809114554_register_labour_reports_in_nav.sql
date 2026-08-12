insert into public.nav_registry
  (category, category_order, label, item_order, icon, view_key, table_ref,
   description, enabled, color, admin_only, surface, subcategory, page_kind,
   date_policy, default_range, range_kind)
values
  ('Human Resources', 7, 'Overtime Watch', 7, 'clock', 'ot_watch', 'v_ot_watch',
   'Overtime by person by week with the loaded cost of it. Flags at 36 hours — the point a manager can still move a shift and avoid it.',
   true, '#ff4245', false, 'hr', 'Payroll & Budget', 'report', 'auto', 'this_month_td', 'activity'),

  ('Human Resources', 7, 'Under-utilised Staff', 8, 'clock', 'under_utilised', 'v_under_utilised',
   'Full-time staff who worked more than two hours short of their target. Lost capacity for hourly staff, paid-for-unworked time for salaried.',
   true, '#ffea00', false, 'hr', 'Payroll & Budget', 'report', 'auto', 'this_month_td', 'activity'),

  ('Human Resources', 7, 'Zone Staffing', 9, 'grid', 'zone_staffing', 'v_zone_staffing',
   'Required versus scheduled versus actually-worked headcount per zone per day, with loaded cost. The requirement can be set by a person, by the Manufacturing pipeline, or by the harvest calendar.',
   true, '#2df26a', false, 'hr', 'Time & Scheduling', 'report', 'auto', 'this_month_td', 'activity'),

  ('Human Resources', 7, 'Zones', 10, 'grid', 'zones', 'zones',
   'The places people are scheduled into. Add, rename or retire a zone here — no deploy, and every staffing report follows.',
   true, '#2df26a', false, 'hr', 'Time & Scheduling', 'report', 'not_applicable', null, 'snapshot'),

  ('Human Resources', 7, 'Zone Requirements', 11, 'clip', 'zone_requirements', 'zone_staffing_requirements',
   'How many people each zone needs, effective-dated. Set it by hand, or let Manufacturing''s production schedule or the harvest calendar drive it.',
   true, '#e2bd63', false, 'hr', 'Time & Scheduling', 'report', 'auto', 'this_month_td', 'activity')
on conflict do nothing;

select label, view_key, subcategory from public.nav_registry
where surface='hr' and item_order >= 7 order by item_order;;
