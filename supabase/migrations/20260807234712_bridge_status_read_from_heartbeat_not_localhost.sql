-- The status chip used to fetch http://127.0.0.1:8765/health. Chrome 151 blocks
-- that: `local-network-access` is a user permission and it reads DENIED on the
-- owner's machine. So the chip reported "AI offline" while the bridge was
-- answering perfectly, and the request never even left the browser.
--
-- The bridge now writes a heartbeat every 30 seconds through the bridge-queue
-- function, so the chip reads a row instead of calling a computer. A row cannot
-- be blocked by a browser permission.
--
-- ⚠ The distinction that matters: this says the bridge REPORTED IN recently, not
-- that it is reachable from this particular browser. That is the honest claim —
-- and it is now also the claim that matters, because the browser no longer needs
-- to reach it. Anything staler than 90 seconds (three missed beats) is treated
-- as stopped rather than shown as a comforting old timestamp.
--
-- E1: CREATE OR REPLACE, keeping the five existing columns with their existing
-- names, order AND types — seconds_since stays integer, which is what the
-- replace refused to change. New columns are appended.
create or replace view v_bridge_status as
select
  h.machine,
  h.last_seen,
  h.version,
  (now() - h.last_seen) < interval '90 seconds'                            as online,
  round(extract(epoch from (now() - h.last_seen)))::integer                as seconds_since,
  h.last_seen at time zone 'America/New_York'                              as last_seen_et,
  case
    when (now() - h.last_seen) < interval '90 seconds'
      then 'Answering on ' || h.machine
    when (now() - h.last_seen) < interval '1 hour'
      then 'Stopped ' || round(extract(epoch from (now() - h.last_seen))/60) || ' minutes ago on ' || h.machine
    else 'Last reported in ' || to_char(h.last_seen at time zone 'America/New_York', 'DD Mon HH24:MI')
         || ' on ' || h.machine
  end                                                                      as verdict,
  (select count(*) from ai_bridge_jobs j where j.status = 'pending')       as waiting,
  (select count(*) from ai_bridge_jobs j where j.status = 'running')       as in_progress
from ai_bridge_heartbeat h;

comment on view v_bridge_status is
  'Whether a desktop bridge has reported in recently. Read instead of fetching 127.0.0.1, which Chrome 151 blocks behind the local-network-access permission. Says "reported in", not "reachable from here" — the browser no longer needs to reach it.';

grant select on v_bridge_status to authenticated;
revoke all on v_bridge_status from anon;;
