-- 0030: Chat v1 - real channels + messages (append-only; threads/reactions/attachments in Work Layer)
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);
alter table channels enable row level security;
create policy read_all on channels for select to authenticated using (true);
create policy exec_all on channels for all using (is_executive()) with check (is_executive());

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);
alter table messages enable row level security;
create policy read_all on messages for select to authenticated using (true);
create policy send_own on messages for insert to authenticated with check (user_id = auth.uid());
create policy exec_delete on messages for delete using (is_executive());
create index if not exists idx_messages_channel_time on messages (channel_id, created_at desc);
-- no audit trigger: chat is high-volume; append-only + exec-only deletion preserves integrity

insert into channels (name, description) values
('general', 'Company-wide - everyone'),
('cultivation', 'Grow rooms, cycles, harvest crews'),
('manufacturing', 'Extraction, production lines, batches'),
('packaging', 'Packaging, labeling, finished goods'),
('quality', 'COAs, holds, CAPAs, compliance'),
('sales', 'Buyers, orders, drops'),
('hr', 'People, schedules, announcements')
on conflict (name) do nothing;

update nav_registry set milestone = null,
  description = 'Real-time company chat: channels per department plus general, append-only history, send from anywhere. Threads, reactions, attachments, and DMs grow in with the Work Layer.'
where view_key = 'messages';

update actions_register set note = note || ' CHAT/INBOX/COMMENTS enrichment (owner cards): Chat v1 SHIPPED (channels+messages, dept-seeded); v2 adds threads, reactions, file attachments, DMs, pins. Inbox = the notification hub P0: Important/Other/Snoozed/Cleared tabs over notifications from mentions, assignments, automations, alerts. Assign comments: any comment can be assigned as an action item to a member with resolve tracking.'
where title = 'Notifications/reminders/alerts engine + inter-company messaging';;
