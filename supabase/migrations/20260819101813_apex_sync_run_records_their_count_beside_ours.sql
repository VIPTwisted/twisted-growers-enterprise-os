/* meta_total — completing work the apex agent started but could not land.
 *
 * Its edge-function change stores Apex's OWN record count beside the count we
 * parsed, and the reasoning in that code is right: "receiving-orders could sit
 * at status ok, rows_seen 0 for two days without anybody being able to say
 * whether the entity was empty or the connector was broken. Those are opposite
 * findings and only one of them is 'no purchases exist'."
 *
 * The column it writes to never existed, so every insert would have failed and
 * taken the sync down with it. Adding it here rather than reverting their work:
 * the idea is correct and the OS is better with it. Found while fixing the
 * scheduling authentication, 19 Aug 2026. */

alter table public.apex_sync_run
  add column if not exists meta_total integer;

comment on column public.apex_sync_run.meta_total is
  'Apex''s own count of records matching the query, stored beside rows_seen (what we parsed). '
  'Equal and zero means the entity is genuinely empty; divergent means our connector has a bug. '
  'Without it, "status ok, rows_seen 0" is unreadable — it could be either, and they are opposite '
  'findings. Column added 19 Aug 2026 to land the apex agent''s change. Agent I.';;
