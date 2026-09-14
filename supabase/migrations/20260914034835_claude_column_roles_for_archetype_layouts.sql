-- BP-12b: an archetype layout learns a view's shape from its columns — WHICH column plays which role is data
-- (rule G1: configuration is rows, never code; report-contract §7 refuses column lists frozen into JSX).
-- One table, read by every archetype screen; the owner can add a name here without a deploy.
create table if not exists public.column_roles (
  role text not null,          -- sev · status · when · resolved · owner · money · lb · head · detail · action · evidence · agent · id
  column_name text not null,
  priority int not null default 100,   -- lower wins when a view has several candidates
  note text,
  primary key (role, column_name)
);
alter table public.column_roles enable row level security;
drop policy if exists column_roles_read on public.column_roles;
create policy column_roles_read on public.column_roles for select to authenticated using (true);
drop policy if exists column_roles_write on public.column_roles;
create policy column_roles_write on public.column_roles for all to authenticated using (public.f_caller_is_admin()) with check (public.f_caller_is_admin());
insert into public.column_roles (role, column_name, priority) values
 ('sev','severity',1),('sev','priority',2),('sev','level',3),('sev','risk',4),('sev','urgency',5),
 ('status','status',1),('status','state',2),('status','decision_status',3),('status','resolution_status',4),('status','outcome',5),
 ('when','detected_at',1),('when','observed_at',2),('when','raised_on',3),('when','opened_at',4),('when','flagged_at',5),('when','created_at',6),('when','requested_at',7),('when','started_at',8),('when','as_of',9),('when','date',10),('when','day',11),
 ('resolved','resolved_at',1),('resolved','cleared_at',2),('resolved','closed_at',3),('resolved','decided_at',4),('resolved','completed_at',5),
 ('owner','owner',1),('owner','who_is_accountable',2),('owner','assignee',3),('owner','owner_role',4),('owner','accountable',5),('owner','assigned_to',6),('owner','responsible',7),('owner','employee_name',8),('owner','full_name',9),
 ('money','dollars',1),('money','usd',2),('money','value_usd',3),('money','amount_usd',4),('money','amount',5),('money','exposure_usd',6),('money','value',7),
 ('lb','pounds',1),('lb','lb',2),('lb','lbs',3),('lb','weight_lb',4),('lb','lb_on_hand',5),('lb','qty_lb',6),
 ('head','headline',1),('head','what',2),('head','title',3),('head','issue',4),('head','finding',5),('head','problem',6),('head','question',7),('head','flag',8),('head','alert',9),('head','rule',10),('head','subject',11),('head','label',12),('head','name',13),('head','item',14),('head','item_name',15),('head','package_tag',16),('head','tag',17),
 ('detail','detail',1),('detail','why_it_matters',2),('detail','description',3),('detail','notes',4),('detail','what_is_wrong',5),('detail','reason',6),('detail','message',7),('detail','body',8),('detail','explanation',9),
 ('action','action',1),('action','what_to_do',2),('action','required_action',3),('action','recommended_action',4),('action','recommendation',5),('action','next_step',6),
 ('evidence','evidence',1),('evidence','the_arithmetic',2),('evidence','how_it_was_detected',3),('evidence','source',4),('evidence','basis',5),
 ('agent','agent',1),('agent','agent_key',2),('agent','detected_by',3),('agent','raised_by',4),('agent','reported_by',5),
 ('id','id',1)
on conflict (role, column_name) do update set priority = excluded.priority;
comment on table public.column_roles is 'Which column plays which role on an archetype layout (issue_queue first). Rows, not code: add a name here and every page of the archetype learns it on next load.';;
