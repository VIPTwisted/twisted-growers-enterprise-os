-- AUDIENCE-WIDE DELIVERY. hr_message.audience could name a group but only a
-- single recipient was delivered, so a company-wide notice sat approved and
-- undelivered while reporting itself as waiting. A message goes to a PERSON,
-- always; an audience is shorthand expanded at delivery, never a row that
-- pretends a group was told.

create table if not exists public.hr_message_recipient (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.hr_message(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  delivered_at timestamptz,
  read_at      timestamptz,
  failed_why   text,
  unique (message_id, employee_id)
);
create index if not exists hmr_undelivered_idx on public.hr_message_recipient(message_id)
  where delivered_at is null;
comment on table public.hr_message_recipient is
  'One row per person per message. Audiences expand into these at delivery, so '
  '"was this person told" is answerable for a company-wide notice, not only for a '
  'one-to-one message.';

create or replace function public.f_resolve_audience(p_audience text, p_employee_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select e.id from public.employees e
  where e.status::text = 'active'
    and (
      (p_employee_id is not null and e.id = p_employee_id)
      or (p_employee_id is null and lower(coalesce(p_audience,'')) in ('all','company','everyone'))
      or (p_employee_id is null and exists (
            select 1 from public.departments d
            where d.id in (e.primary_department_id, e.secondary_department_id)
              and lower(d.name) = lower(p_audience)))
      or (p_employee_id is null and exists (
            select 1 from public.roles_catalog rc
            where rc.id in (e.primary_role_id, e.secondary_role_id)
              and lower(rc.name) = lower(p_audience)))
      or (p_employee_id is null and exists (
            select 1 from public.employee_schedules s
            where s.employee_id = e.id and s.work_date >= current_date
              and lower(btrim(s.zone)) = lower(p_audience)))
      or (p_employee_id is null and lower(coalesce(p_audience,'')) = 'on shift now' and exists (
            select 1 from public.time_entries t
            where t.employee_id = e.id and t.clock_in is not null and t.clock_out is null))
    );
$$;
comment on function public.f_resolve_audience is
  'Turns an audience string into people, resolved live: all/company/everyone, a '
  'department name, a role name, a zone name, or "on shift now". Resolved at '
  'delivery, so a notice reaches who is there then — not who was there when it '
  'was drafted.';

create or replace function public.f_hr_deliver_all()
returns jsonb language plpgsql security definer set search_path = public as $$
declare m record; v_people int; v_batch int; v_msgs int := 0; v_rows int := 0; v_skipped int := 0;
begin
  if not public.f_can_decide_hr() then
    raise exception 'Not permitted to deliver HR messages.' using errcode='42501';
  end if;

  for m in
    select * from public.hr_message
     where approved_at is not null and sent_at is null and cancelled_at is null
     order by created_at
  loop
    insert into public.hr_message_recipient (message_id, employee_id)
    select m.id, r from public.f_resolve_audience(m.audience, m.employee_id) r
    on conflict (message_id, employee_id) do nothing;
    get diagnostics v_people = row_count;

    if v_people = 0 and not exists (
         select 1 from public.hr_message_recipient where message_id = m.id) then
      -- An audience nobody matches is a drafting error, not a delivery. Leave it
      -- unsent and report it rather than marking it done.
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update public.hr_message_recipient
       set delivered_at = now()
     where message_id = m.id and delivered_at is null;
    get diagnostics v_batch = row_count;
    v_rows := v_rows + v_batch;

    update public.hr_message set sent_at = now() where id = m.id;
    v_msgs := v_msgs + 1;
  end loop;

  return jsonb_build_object('messages_sent', v_msgs, 'recipients', v_rows,
                            'skipped_no_audience', v_skipped);
end $$;
comment on function public.f_hr_deliver_all is
  'Delivers every approved, unsent message, expanding audiences into recipients. A '
  'message whose audience matches nobody is LEFT UNSENT and counted as skipped — '
  'marking it delivered would be a lie the record then carries forever.';

create or replace view public.v_hr_delivery_open with (security_invoker = on) as
select m.id, m.kind, m.subject, m.audience, m.approved_at,
       coalesce(e.full_name, m.audience, 'unspecified') as intended,
       (select count(*) from public.hr_message_recipient r where r.message_id=m.id) as recipients,
       (select count(*) from public.hr_message_recipient r
         where r.message_id=m.id and r.delivered_at is not null) as delivered,
       (select count(*) from public.hr_message_recipient r
         where r.message_id=m.id and r.read_at is not null)      as read_count,
       case when m.sent_at is not null then 'sent'
            when m.approved_at is null then 'awaiting approval'
            when not exists (select 1 from public.f_resolve_audience(m.audience, m.employee_id))
                 then 'AUDIENCE MATCHES NOBODY'
            else 'approved, waiting to send' end as state
from public.hr_message m
left join public.employees e on e.id = m.employee_id
where m.cancelled_at is null;

comment on view public.v_hr_delivery_open is
  'Approved messages and where they actually reached. "AUDIENCE MATCHES NOBODY" is '
  'the row that matters — a notice addressed to a department since renamed reaches '
  'no one and looks fine until somebody asks.';

-- clickup_tasks is a MIRROR. Writing into it invents a task that vanishes on the
-- next sync and looks exactly like ClickUp deleted it. So the outbox is drained
-- by whatever holds the credential; this is the claim protocol.
create or replace function public.f_hr_external_next(p_limit integer default 20)
returns setof public.hr_external_task language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.hr_external_task t
     set status='claimed', attempts = coalesce(t.attempts,0)+1
   where t.id in (
     select id from public.hr_external_task
      where status in ('pending','failed') and coalesce(attempts,0) < 5
      order by created_at limit p_limit
      for update skip locked)
  returning t.*;
end $$;
comment on function public.f_hr_external_next is
  'Claim protocol for the ClickUp outbox. FOR UPDATE SKIP LOCKED so two workers '
  'never push the same task twice. Five attempts then it stops and stays visible '
  'as failed — a task retrying forever is a task nobody ever looks at.';

create or replace function public.f_hr_external_done(
  p_id uuid, p_external_id text, p_external_url text, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.hr_external_task
     set status = case when p_error is null then 'pushed' else 'failed' end,
         external_id = coalesce(p_external_id, external_id),
         external_url = coalesce(p_external_url, external_url),
         pushed_at = case when p_error is null then now() else pushed_at end,
         error = p_error
   where id = p_id;
end $$;

alter table public.hr_message_recipient enable row level security;
create policy hmr_self on public.hr_message_recipient for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
create policy hmr_read on public.hr_message_recipient for update to authenticated
  using (employee_id = public.f_my_employee_id()) with check (employee_id = public.f_my_employee_id());

grant select on public.hr_message_recipient, public.v_hr_delivery_open to authenticated;
grant update on public.hr_message_recipient to authenticated;
grant execute on function public.f_resolve_audience(text,uuid),
                        public.f_hr_deliver_all(),
                        public.f_hr_external_next(integer),
                        public.f_hr_external_done(uuid,text,text,text) to authenticated;

insert into public.nav_registry
 (category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, color, admin_only, surface, subcategory, page_kind,
  date_policy, default_range, range_kind)
values
 ('Human Resources',7,'Message Delivery',52,'mail','hr_delivery','v_hr_delivery_open',
  'Approved messages and where they actually reached. An audience matching nobody is shown as such rather than quietly marked sent.',
  true,'#57a9ff',false,'hr','Communications','report','auto','this_month_td','activity'),
 ('Human Resources',7,'Message Recipients',53,'people','hr_message_recipient','hr_message_recipient',
  'One row per person per message, delivered and read. This is how you answer "was this person told" for a company-wide notice.',
  true,'#57a9ff',false,'hr','Communications','report','auto','this_month_td','activity'),
 ('Human Resources',7,'ClickUp Outbox',54,'upload','hr_external_task','hr_external_task',
  'Tasks waiting to be pushed to ClickUp. clickup_tasks is a mirror, so nothing is written there directly — whatever holds the credential drains this queue.',
  true,'#e2bd63',true,'hr','Integrations','report','auto','this_month_td','activity')
on conflict do nothing;;
