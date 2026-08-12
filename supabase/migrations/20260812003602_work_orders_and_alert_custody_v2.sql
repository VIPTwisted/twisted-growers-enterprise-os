-- Agent I (Database COO), 12 Aug 2026. Filed for review as DBI-032 (reviewers V, X, W). v2:
-- employees carries full_name, not first/last - checked this time. Everything else unchanged
-- from v1's header: EVERY ORDER IS A MANIFEST; alerts carry a custody line and ONE next
-- required move; tg_assign_from_tile is the one door for issuing numbered orders capturing the
-- evidence as it stood (owner rule 2); admin-gated via the one existing role helper.
-- UNDO: as v1 header.

alter table tasks add column if not exists order_no text unique;
comment on column tasks.order_no is
 'Human-facing order number, TG-<year>-<serial>. An assignment is a numbered order carrying its '
 'evidence - work moves under chain of custody like material.';

create sequence if not exists tg_order_seq;

create or replace function public.tg_order_no()
returns text language sql volatile as
$$ select 'TG-' || to_char(now(),'YYYY') || '-' || lpad(nextval('tg_order_seq')::text, 4, '0') $$;

create or replace function public.tg_assign_from_tile(
  p_title text, p_assignee_employee_id uuid, p_due_on date, p_priority text,
  p_source_view text, p_source_kpi text, p_source_value numeric, p_source_unit text,
  p_department text default null, p_description text default null, p_snapshot jsonb default null)
returns table (task_id uuid, order_no text)
language plpgsql security definer set search_path to 'public'
as $fn$
declare v_id uuid; v_no text;
begin
  if not f_caller_is_admin() then
    raise exception 'Only admin-tier users may issue orders. Widening this to managers is a role-model decision for the owner.';
  end if;
  if coalesce(btrim(p_title),'') = '' then raise exception 'An order needs a title.'; end if;
  if p_assignee_employee_id is null then raise exception 'An order needs a named assignee - unassigned work is how 108 custody findings reached a week old.'; end if;

  v_no := tg_order_no();
  insert into tasks (title, description, status, priority, assignee_employee_id, due_on,
                     created_by, source_view, source_kpi, source_value, source_unit,
                     source_snapshot, department, order_no)
  values (p_title, p_description, 'open', coalesce(p_priority,'normal'), p_assignee_employee_id,
          p_due_on, auth.uid(), p_source_view, p_source_kpi, p_source_value, p_source_unit,
          coalesce(p_snapshot, jsonb_build_object('captured_at', now())), p_department, v_no)
  returning id into v_id;

  return query select v_id, v_no;
end $fn$;

comment on function public.tg_assign_from_tile is
 'THE one door for issuing work from any surface - tile, banner, alert, finding, narrative '
 'paragraph. Captures the triggering number and snapshot AS THEY STOOD (owner rule 2), assigns a '
 'sequential order number, requires a named assignee. Admin-gated via f_caller_is_admin; '
 'widening to managers is the owner''s role-model call.';

create table if not exists alert_note (
  id         bigserial primary key,
  alert_id   bigint not null references alert_outbox(id),
  author     text not null check (length(btrim(author)) > 0),
  body       text not null check (length(btrim(body)) >= 5),
  created_at timestamptz not null default now()
);
alter table alert_note enable row level security;
drop policy if exists an_read on alert_note;
drop policy if exists an_insert on alert_note;
create policy an_read   on alert_note for select to authenticated using (true);
create policy an_insert on alert_note for insert to authenticated with check (length(btrim(author)) > 0);

comment on table alert_note is
 'Signed, insert-only note thread per alert - the working file an examiner reads. Never edited, '
 'never deleted; a correction is a new note.';

create or replace function public.tg_alert_action(
  p_alert_id bigint, p_action text, p_note text default null,
  p_reason_code text default null, p_assignee_employee_id uuid default null, p_due_on date default null)
returns text
language plpgsql security definer set search_path to 'public'
as $fn$
declare a alert_outbox; v_author text; v_no text; v_id uuid;
begin
  select * into a from alert_outbox where id = p_alert_id;
  if not found then raise exception 'Alert % does not exist.', p_alert_id; end if;
  select coalesce(display_name, auth.uid()::text, 'unknown') into v_author
    from app_users where user_id = auth.uid();
  v_author := coalesce(v_author, 'unknown');

  if p_action = 'acknowledge' then
    update alert_outbox set read_at = coalesce(read_at, now()) where id = p_alert_id;
    return 'acknowledged';

  elsif p_action = 'note' then
    insert into alert_note (alert_id, author, body) values (p_alert_id, v_author, p_note);
    return 'note added';

  elsif p_action = 'defer' then
    insert into alert_deferral (alert_key, alert_source, deferred_by, reason_code, reason_note, age_days_at_deferral)
    values ('alert:'||p_alert_id, a.source, v_author, p_reason_code, p_note, a.days_open);
    return 'deferred for today, on the record';

  elsif p_action = 'resolve' then
    if length(btrim(coalesce(p_note,''))) < 20 then
      raise exception 'Resolving needs at least 20 characters saying WHAT fixed it (reason_policy flag_fixed).';
    end if;
    update alert_outbox set resolved_at = now(), resolved_note = p_note where id = p_alert_id;
    return 'resolved';

  elsif p_action = 'assign' then
    select t.task_id, t.order_no into v_id, v_no from tg_assign_from_tile(
      coalesce(a.subject,'Alert '||p_alert_id), p_assignee_employee_id, p_due_on, a.severity,
      'alert', p_alert_id::text, null, null, null,
      coalesce(p_note, a.body), to_jsonb(a)) t;
    update alert_outbox set read_at = coalesce(read_at, now()) where id = p_alert_id;
    return 'order '||v_no||' issued';
  else
    raise exception 'Unknown action %. Valid: acknowledge, note, defer, resolve, assign.', p_action;
  end if;
end $fn$;

comment on function public.tg_alert_action is
 'Every move a person can make on an alert, one door: acknowledge, note (signed), defer (one day, '
 'today''s own reason, enforced by the deferral trigger), resolve (20+ chars of what fixed it), '
 'assign (issues a numbered order carrying the alert as evidence). The custody line in '
 'v_alert_center is built from what this function writes.';

create or replace view public.v_alert_center as
select a.id, a.severity, a.source, a.subject, a.raised_on, a.days_open, a.reminder_number,
       a.read_at, a.resolved_at, a.resolved_note,
       d.days_deferred, d.latest_reason,
       n.note_count, n.latest_note, n.latest_note_author,
       t.order_no as ticket, t.status as ticket_status, t.due_on as ticket_due,
       e.full_name as ticket_assignee,
       concat_ws(' → ',
         'Raised '||to_char(a.raised_on,'DD Mon'),
         case when a.read_at is not null then 'Acknowledged' end,
         case when coalesce(d.days_deferred,0) > 0 then 'Deferred ×'||d.days_deferred end,
         case when t.order_no is not null then 'Order '||t.order_no||' → '||coalesce(e.full_name,'?') end,
         case when a.resolved_at is not null then 'Resolved '||to_char(a.resolved_at,'DD Mon') end
       ) as custody_line,
       case
         when a.resolved_at is not null then 'CLOSED'
         when t.order_no is not null and coalesce(t.status,'open') not in ('done','completed') then 'IN PROGRESS — order '||t.order_no
         when coalesce(d.deferred_today,false) then 'DEFERRED — today''s reason on record'
         when a.read_at is null then 'ACKNOWLEDGE'
         else 'DECIDE — assign it, resolve it, or defer it with today''s reason'
       end as next_required_move
from alert_outbox a
left join lateral (select count(*) as days_deferred,
                          bool_or(deferred_on = current_date) as deferred_today,
                          (array_agg(reason_note order by deferred_on desc))[1] as latest_reason
                   from alert_deferral where alert_key = 'alert:'||a.id) d on true
left join lateral (select count(*) as note_count,
                          (array_agg(body order by created_at desc))[1] as latest_note,
                          (array_agg(author order by created_at desc))[1] as latest_note_author
                   from alert_note where alert_id = a.id) n on true
left join lateral (select order_no, status, due_on, assignee_employee_id from tasks
                   where source_view = 'alert' and source_kpi = a.id::text
                   order by created_at desc limit 1) t on true
left join lateral (select emp.full_name from employees emp where emp.id = t.assignee_employee_id) e on true;

comment on view public.v_alert_center is
 'The alerts page: every alert with its CHAIN OF CUSTODY (raised, acknowledged, deferred xN, '
 'order issued, resolved) and its ONE next required move. The design: every order is a manifest '
 '- work moves under custody like material, and the platform states what is owed rather than '
 'offering four grey buttons. Deferral pressure and the signed note thread are on the row.';;
