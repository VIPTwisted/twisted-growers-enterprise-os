-- Agent I, 12 Aug 2026. DBI-070.
-- OWNER: "SETUP TO EMAIL AND IN PLATFORM TOO: EMAIL: TWISTEDGROWERSMA@GMAIL.COM"
--
-- Recording the destination as CONFIGURATION, in one place, so no agent has to ask him again and
-- nobody hardcodes an address into a function. An email address is not a credential and belongs
-- in the database; the mail provider's key is a credential and must NEVER appear here, in a
-- migration, in a comment, or in any file. That separation is the whole point of this row.

create table if not exists alert_destination (
  destination_key text primary key,
  channel         text not null check (channel in ('email','in_platform')),
  address         text,
  who_it_is       text not null,
  what_they_get   text not null,
  active          boolean not null default true,
  set_by          text not null default 'Owner (Vinny)',
  set_at          timestamptz not null default now()
);

alter table alert_destination enable row level security;
drop policy if exists ad_read  on alert_destination;
drop policy if exists ad_write on alert_destination;
create policy ad_read  on alert_destination for select to authenticated using (true);
create policy ad_write on alert_destination for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table alert_destination is
 'Where alerts go. Set by the owner 12 Aug 2026 after the Metrc lab-results sync sat dead for six '
 'days with nobody told. BOTH channels are required, not either: email so a dark sync reaches him '
 'when he is not looking at the platform, in-platform so it is still there when he is. Contains '
 'ADDRESSES ONLY — the mail provider credential lives in the secret store and must never appear '
 'in this table, a migration, a comment or any file.';

insert into alert_destination (destination_key, channel, address, who_it_is, what_they_get) values
('admin_email','email','twistedgrowersma@gmail.com','Owner / admin',
 'Every missed sync, every feed that goes dark past its expected cadence, and every critical '
 'finding. Must state what stopped, when it last succeeded, how long it has been dark, what is '
 'blocked downstream, and what to do. Grouped and escalating by duration — never the same line '
 'resent hourly.'),
('admin_in_platform','in_platform',null,'Owner / admin',
 'The same alerts, in the platform, read through alert_outbox and alert_recipient. NOTE: 239 '
 'alerts have already been raised there and not one has ever been read, because there was no '
 'delivery channel and no reason to look. In-platform alone has already failed once — that is '
 'exactly why email is now required alongside it.')
on conflict (destination_key) do update set
  address = excluded.address, what_they_get = excluded.what_they_get, set_at = now();

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status)
values
('alerts_go_to_email_and_platform_both','1','rule',
 'Alerts go BOTH to email and into the platform — never one or the other',

 'A sync that stops must reach the owner where he actually is. In-platform alone has already '
 'failed: 239 alerts sat unread because nothing prompted anyone to look, and the Metrc '
 'lab-results sync was dead for six days before an agent stumbled on it while hunting '
 'certificates. Email alone would be worse — it would leave no record in the system. So both, '
 'always. Read alert_destination for the current addresses; never hardcode one. An alert must be '
 'ACTIONABLE: what stopped, when it last succeeded, how long dark, what is blocked, what to do. '
 '"Sync failed" is not an alert. And do not create a new noise source — group by feed, rate-limit '
 'repeats, escalate on duration.',

 'Owner 12 Aug 2026: "I NEED TO GET AN ALERT EVERY TIME A SYNC IS MISSED SETUP MICROSOFT GOOGLE '
 'COMPANY SYSTEM FOR ALERTS FOR ADMIN" then "SETUP TO EMAIL AND IN PLATFORM TOO: EMAIL: '
 'TWISTEDGROWERSMA@GMAIL.COM".',
 'Owner (Vinny)', 'owner_set')
on conflict (key) do update set
  what_it_means = excluded.what_it_means, where_it_came_from = excluded.where_it_came_from,
  updated_at = now();;
