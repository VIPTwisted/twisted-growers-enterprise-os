/* A fingerprint is meant to be a finding's stable identity - the same problem
   seen again is the SAME finding, not a new one. But watchdog_findings had no
   unique index on it, so every "on conflict do nothing" did nothing and every
   re-run created another copy. 100 rows holding 42 real findings.

   The forensic watchdog runs twice a day, so this has been quietly doubling
   findings since it was built. My own sync review agent did the same thing
   within an hour of being written.

   Fix: collapse to one row per fingerprint, keeping the EARLIEST (so
   "when it started" survives) but carrying forward the LATEST observation.
   Then make it structurally impossible to duplicate again. */

-- carry the most recent observation onto the row we are keeping
with keep as (
  select fingerprint, min(id) as keep_id, max(observed_at) as latest
  from watchdog_findings where fingerprint is not null
  group by fingerprint having count(*) > 1
)
update watchdog_findings w
set observed_at = k.latest
from keep k where w.id = k.keep_id;

-- remove the copies
with keep as (
  select fingerprint, min(id) as keep_id
  from watchdog_findings where fingerprint is not null group by fingerprint
)
delete from watchdog_findings w
using keep k
where w.fingerprint = k.fingerprint and w.id <> k.keep_id;

-- and make it impossible to happen again
create unique index if not exists watchdog_findings_fingerprint_once
  on watchdog_findings (fingerprint) where fingerprint is not null;

comment on index watchdog_findings_fingerprint_once is
  'A fingerprint is the finding''s identity. Seeing the same problem again updates it - it does not create another.';;
