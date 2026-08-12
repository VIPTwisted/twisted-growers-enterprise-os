-- WHAT THE MISSED-SYNC WORK FOUND AND DID NOT FIX
-- TG-08, 12 August 2026. Findings outside my lane, filed rather than quietly fixed,
-- and filed as ROWS rather than as prose in a report nobody re-reads. A finding that
-- lives only in a chat message is a finding that expires when the session does.
--
-- Every figure below was measured live on 12 August 2026 through a read-only
-- connection. Re-measure before acting: numbers in this platform are perishable.

begin;

insert into actions_register
 (title, priority, status, source, why_it_matters, what_to_do, how_to_execute,
  recommendation, needs_owner)
values

 ('Two of the three company spreadsheets are watched by nothing, because the monitor '
  || 'reads sheet_sources and the registry is sheet_source',
  'P1', 'open', 'TG-08 12 Aug 2026 — measured',
  'There are two tables one character apart. sheet_source holds the three company '
  || 'spreadsheets the owner named, with file ids and parse traps. sheet_sources holds '
  || 'ONE row. v_sheet_sync_status — the only surface that reports whether a sheet is '
  || 'arriving — reads sheet_sources. So the manufacturing product inventory and the '
  || 'production cost calculator have never been monitored at all, and nobody would '
  || 'have been told if they stopped, because as far as the monitor is concerned they '
  || 'do not exist. sheet_rows is 0: not one row has ever arrived from any of them.',
  'Decide which table is the registry and make the other read from it. Do not delete '
  || 'either until the decision is made — sheet_sources carries a push token and a '
  || 'poll configuration that sheet_source does not.',
  'feed_registry now covers all three sheets from sheet_source, so detection is no '
  || 'longer blind. That is a patch over the split, not a fix for it.',
  'Fold sheet_sources into sheet_source as columns rather than keeping two tables '
  || 'whose names differ by one letter. Two tables with near-identical names is how '
  || 'this happened and it will happen again.',
  false),

 ('sheet_sources.push_token is stored in clear text and is readable by the read-only '
  || 'reporting role',
  'P0', 'open', 'TG-08 12 Aug 2026 — observed while reading the table',
  'A bearer token that authorises pushing rows into the platform sits in a plain text '
  || 'column. It was returned in full to tg_desktop_reader, an account intended only '
  || 'for read-only reporting and whose connection string has itself been in this '
  || 'repository''s history. Any holder of that reader can push sheet data into the '
  || 'platform. Secrets belong in integration_secrets, which is write-only by design '
  || 'and which this same role is correctly refused access to.',
  'Rotate the push token. Then move it to integration_secrets or store only a hash of '
  || 'it, and revoke select on sheet_sources from the reporting role.',
  'Rotation first: the value has already been exposed to at least one session, so '
  || 'moving it without rotating moves a compromised secret.',
  'Store a hash, not the token. The push endpoint can compare a hash and never needs '
  || 'the original back.',
  false),

 ('18 of 25 materialised views carry no computed_at column, so their staleness cannot '
  || 'be measured at all',
  'P1', 'open', 'TG-08 12 Aug 2026 — measured against pg_class and pg_attribute',
  'A materialised view with no clock cannot be aged. It may be four minutes old or '
  || 'four weeks old and it looks identical from outside, so no monitor can tell the '
  || 'difference and every page over it publishes figures of unknown age under a '
  || 'header that says live. This is the exact shape of the failure recorded in '
  || 'v_house_rules: Command Center numbers did not change for six days while the '
  || 'header said "Live from the records".',
  'Add a computed_at column to each, set at refresh time. The seven that already have '
  || 'one show the pattern.',
  'v_feed_health reports these as CANNOT MEASURE rather than as healthy, and the '
  || 'feeds.matview-clocks-not-getting-worse ratchet stops the number rising. Neither '
  || 'makes the existing 18 measurable — only adding the column does.',
  'Do them in one pass with the refresh functions that own them, not one at a time.',
  false),

 ('Two dashboard materialised views are hours stale right now and no surface says so',
  'P1', 'open', 'TG-08 12 Aug 2026 — measured from their own computed_at',
  'mv_dept_dash_audit_tiles last computed 11 Aug 04:09 (38 hours) and '
  || 'mv_dept_dash_third_party last computed 11 Aug 21:46 (21 hours), while '
  || 'mv_department_dashboard_base, mv_dept_dash_supplement and mv_tower_counts all '
  || 'recomputed within the last three minutes. Views that sit side by side on the '
  || 'same dashboard are a day and a half apart, and the page does not say which is '
  || 'which. Re-measure before acting; these ages move.',
  'Find out whether their refresh is scheduled at all, and if it is, why it is not '
  || 'firing while its neighbours do.',
  'v_feed_health now reports both as OVERDUE against a six-hour floor and will alert '
  || 'on them. That reports the symptom; it does not schedule the refresh.',
  'Check them against the other three in the same family first — the difference '
  || 'between the ones that refresh and the ones that do not is the answer.',
  false),

 ('The hourly alert-email job has run 24 times a day for a week, succeeded every '
  || 'time, and dispatched nothing',
  'P2', 'open', 'TG-08 12 Aug 2026 — v_cron_health and alert_outbox',
  'alert-email-send reports HEALTHY with 24 runs and 0 failures in 24 hours, across '
  || 'at least 170 hours of retained history. In that time alert_outbox recorded zero '
  || 'dispatched_at and zero sent_at on 477 rows. The job is correct to do nothing — '
  || 'email is switched off and it says so honestly in its return value — but that '
  || 'return value is discarded, so the only thing visible is a green job. This is the '
  || 'same shape as the retry loop that ran 1,440 times a day retrying nothing and '
  || 'read as green for as long as anybody looked.',
  'Record what the job returned, not merely that it returned. A job whose result is '
  || 'thrown away can only ever report on its own liveness.',
  'The pattern already exists: tg_verify writes verification_runs, and '
  || 'tg_raise_feed_alerts now writes feed_watch_run for exactly this reason.',
  'Give the alert email jobs a run table of their own, the same shape as '
  || 'feed_watch_run.',
  false),

 ('477 alerts have been raised, not one has ever been read, and they trace to only 20 '
  || 'distinct causes',
  'P1', 'open', 'TG-08 12 Aug 2026 — measured directly from alert_outbox',
  'alert_outbox holds 477 rows. read_at is null on all 477. sent_at is null on all '
  || '477. dispatched_at is null on all 477. 396 are unresolved, and those 396 carry '
  || 'only 20 distinct entity_key values — roughly twenty to one. The queue is not '
  || 'twenty times more informative than the twenty problems behind it, it is twenty '
  || 'times longer, and that is why none of it was read. NOTE A DISAGREEMENT: this '
  || 'work was briefed on a figure of 239 unread alerts. 239 does not reproduce under '
  || 'any definition tried — total 477, unresolved 396, unresolved in-platform 225, '
  || 'unresolved email 171. The 239 may predate rows added since. Both numbers and '
  || 'both methods are recorded here rather than one of them being picked silently.',
  'Collapse the existing queue by cause before adding any new alert source to it. New '
  || 'feed alerts are grouped and rate-limited so they cannot repeat the pattern, but '
  || 'they land in the same inbox as the 396 already there.',
  'tg_raise_item_alerts already auto-resolves an alert when its flag clears. Run it '
  || 'and see how many of the 396 close on their own before treating the rest as real.',
  'Close what has already been fixed first. A queue nobody trusts cannot be fixed by '
  || 'adding a better alert to it.',
  false),

 ('Confirm the Metrc sales endpoints are actually disabled and not merely stopped',
  'P2', 'open', 'TG-08 12 Aug 2026 — metrc_sync_runs',
  'The metrc sales endpoint has 237 recorded runs and zero successes, every one a 401, '
  || 'with the last attempt on 7 August. It was ruled permanently disabled on 6 August. '
  || 'A decision recorded is not a decision implemented: these endpoints were declared '
  || 'disabled once before and were still firing 401s a day later. It has been quiet '
  || 'for five days, which is consistent with disabled and also consistent with a '
  || 'scheduler that happens not to have called it.',
  'Find the switch and read it, rather than inferring from silence. Apex is the source '
  || 'of record for sales; Metrc sales is not needed.',
  'It is registered in feed_registry as retired with that reason, so it will not '
  || 'generate a daily alert for a decision already taken. Retiring it in the registry '
  || 'is not the same as it being off.',
  'Read the dispatcher configuration. If it is still listed, remove it there.',
  false)

on conflict do nothing;

commit;
