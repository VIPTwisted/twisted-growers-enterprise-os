-- Wire the new HR objects into the existing views engine. No React, no
-- CSS, no deploy — nav_registry is read at runtime, so these appear as
-- soon as the page is refreshed.

-- RLS decides who sees rows; the role still needs table privileges for
-- the policies to be evaluated at all. authenticated only — never anon.
grant select, insert, update on public.attendance_occurrences to authenticated;
grant select, insert, update on public.hr_review_queue        to authenticated;
grant select on public.v_schedule_vs_worked to authenticated;

insert into public.nav_registry
  (category, category_order, label, item_order, icon, view_key, table_ref,
   description, enabled, color, admin_only, surface, subcategory, page_kind,
   date_policy, default_range, range_kind)
values
  ('Human Resources', 7, 'Scheduled vs Worked', 4, 'clock',
   'sched_vs_worked', 'v_schedule_vs_worked',
   'Scheduled hours against hours actually worked, per employee per day. Variance, adherence, daily overtime, and a flag for unscheduled work, missing punches and no-shows. Empty until time_entries and employee_schedules carry rows.',
   true, '#e2bd63', false, 'hr', 'Time & Scheduling', 'report',
   'auto', 'this_month_td', 'activity'),

  ('Human Resources', 7, 'Attendance Occurrences', 5, 'clip',
   'attendance_occurrences', 'attendance_occurrences',
   'Every attendance event — late, absent, early out, missed punch, no call no show — with reason code, explanation, points and the date each occurrence clears. Points roll off twelve months to the day.',
   true, '#b026ff', false, 'hr', 'Time & Scheduling', 'report',
   'auto', 'this_month_td', 'activity'),

  ('Human Resources', 7, 'HR Review Queue', 6, 'check',
   'hr_review_queue', 'hr_review_queue',
   'HR actions drafted by the agents and awaiting a human decision. Send, edit, defer or ignore — an ignored draft is still filed to the employee record with the reason, which is what makes enforcement provably consistent.',
   true, '#ff4245', true, 'hr', 'People', 'report',
   'auto', 'this_month_td', 'activity')
on conflict do nothing;;
