/* ═══════════════════════════════════════════════════════════════════════════
   C · THE SYNC CENTRE STOPS PRINTING NULL FOR EVERY METRC ROW
   Branch `claude-c/sync-item-real-status`, 28 August 2026.
   NOT FOR MAIN. Owner holds the merge and the apply.

   `v_sync_item` is two halves stitched with UNION ALL. The Apex half already
   reads real state. The Metrc half did not: `last_success_at` and `last_status`
   were literal `NULL::timestamptz` and `NULL::text`, hardcoded into the view.

   Every Metrc row on the Sync Centre therefore showed nothing at all, and a
   sync that has been failing for days looked exactly like a sync that had just
   run. That is the silent-failure shape this platform keeps producing: not a
   wrong number, an ABSENT one, on the surface whose entire job is to say
   whether the pull worked.

   ── WHAT IT READS NOW ──────────────────────────────────────────────────────
   `metrc_sync_runs`, which is the run log the Metrc worker already writes. No
   new table, no new column, no write path, and no endpoint invented — the join
   only reads rows that are already there.

   THE JOIN. `sync_item.item_key` holds 'packages'; the log holds 'packages',
   'packages (delta)' and 'packages (full sweep)' as separate runs of the same
   endpoint. So a row matches its own key exactly OR that key followed by a
   parenthesised variant, and `system = 'metrc'` scopes it — the same table also
   logs google_sheets and clickup runs, and a Metrc row must never pick one up.

   TWO DIFFERENT QUESTIONS, TWO DIFFERENT READS.
     last_success_at  the newest FINISHED time of a run that actually succeeded.
                      "When did this last work" is not "when did we last try".
     last_status      the status of the most recent ATTEMPT, successful or not.
                      A pull that failed an hour ago must say so even though it
                      succeeded yesterday — reporting only the last success is
                      how a broken sync stays invisible.

   Filtered on `finished_at`, not `started_at`: a run that began and never came
   back has no success to report, and using the start time would credit it with
   one.

   ── WHAT THIS SURFACES THE MOMENT IT LANDS ─────────────────────────────────
   Measured against production 28 Aug 2026, before applying anything:
     plants   last succeeded 16 Aug — twelve days ago — and last ran `partial`
     sales    has NEVER succeeded: no successful run exists, last status `error`
   Both showed blank before. Neither is caused by this change; both were simply
   not being said.

   ── WHAT IS DELIBERATELY NOT TOUCHED ───────────────────────────────────────
   THE APEX HALF ALREADY READS `apex_watermark`. `v_apex_entity_status` — which
   the Apex branch selects from — joins `apex_watermark w` and serves
   `w.last_success_at` directly. It is already correct and is left exactly as it
   is.

   Its `last_status` comes from `apex_sync_run`, not from the watermark, and that
   cannot change: `apex_watermark` holds entity, updated_at_from, last_success_at,
   last_attempt_at and consecutive_errors — there is NO status column on it to
   read. Inventing one, or deriving a status from `consecutive_errors`, would be
   manufacturing a value the source does not carry.

   `rows_stored`, `due` and `due_text` stay NULL on the Metrc half. They were not
   asked for, the run log does not answer `due` without an interval policy that
   does not exist for Metrc, and a plausible guess on a sync surface is worse
   than a blank.

   The `sheet_fg` and `clickup` rows of `sync_item` also stay NULL. The same log
   holds their runs under `system = 'google_sheets'` and `system = 'clickup'`, so
   they can be lit up the same way whenever that is asked for — but it was not
   asked for here, and widening a repoint on my own initiative is how a scoped
   change becomes an unreviewed one.

   Columns, names, types and order are unchanged. `create or replace view`,
   never `drop … cascade`. Read-only: no write column, no Metrc call.
   ═══════════════════════════════════════════════════════════════════════════ */

begin;

create or replace view v_sync_item as
 SELECT sync_item.source_key,
    sync_item.source_label,
    sync_item.fn,
    sync_item.item_key,
    sync_item.item_label,
    sync_item.query_param,
    sync_item.extra_params,
    sync_item.note,
    sync_item.enabled,
    sync_item.supported,
    sync_item.sort,
    NULL::bigint AS rows_stored,
    /* WHEN IT LAST WORKED. Newest finished time among runs that succeeded. */
    (SELECT max(r.finished_at)
       FROM metrc_sync_runs r
      WHERE r.system = 'metrc'
        AND sync_item.source_key = 'metrc'
        AND r.status = 'ok'
        AND r.finished_at IS NOT NULL
        AND (r.endpoint = sync_item.item_key
             OR r.endpoint LIKE sync_item.item_key || ' (%'))
    ) AS last_success_at,   /* max(finished_at) is already timestamptz */
    /* WHAT HAPPENED LAST TIME. The most recent attempt, whatever it did. */
    (SELECT r.status
       FROM metrc_sync_runs r
      WHERE r.system = 'metrc'
        AND sync_item.source_key = 'metrc'
        AND (r.endpoint = sync_item.item_key
             OR r.endpoint LIKE sync_item.item_key || ' (%')
      ORDER BY r.started_at DESC
      LIMIT 1
    ) AS last_status,       /* metrc_sync_runs.status is already text */
    NULL::boolean AS due,
    NULL::text AS due_text,
    sync_item.system_label,
    sync_item.source_name,
    sync_item.pulls,
    sync_item.target
   FROM sync_item
UNION ALL
 SELECT 'apex'::text AS source_key,
    'Apex Trading (sales)'::text AS source_label,
    'apex-sync'::text AS fn,
    s.entity AS item_key,
    COALESCE(e.label, s.entity) AS item_label,
    'entity'::text AS query_param,
    '{"force": "1"}'::jsonb AS extra_params,
    NULL::text AS note,
    true AS enabled,
    true AS supported,
    70 +
        CASE s.kind
            WHEN 'money'::text THEN 0
            WHEN 'core'::text THEN 1
            WHEN 'crm'::text THEN 2
            WHEN 'document'::text THEN 3
            ELSE 4
        END AS sort,
    s.rows_stored,
    /* Already sourced from apex_watermark, through v_apex_entity_status, which
       joins `apex_watermark w` and serves w.last_success_at. Unchanged. */
    s.last_success_at,
    s.last_status,
    s.due,
    s.due_text,
    'Apex Trading'::text AS system_label,
    'Apex Trading API — app.apextrading.com, the sales source of record'::text AS source_name,
    COALESCE(e.why, 'Apex '::text || s.entity) AS pulls,
    ('apex_raw (entity = '::text || s.entity) || ')'::text AS target
   FROM v_apex_entity_status s
     JOIN apex_entity e ON e.entity = s.entity;

comment on view v_sync_item is
  'One row per syncable item across every connected source. The Metrc half reads metrc_sync_runs '
  '(system = metrc) for last_success_at and last_status — before 28 Aug 2026 both were hardcoded NULL, '
  'so a Metrc sync that had been failing for days looked identical to one that had just run. '
  'last_success_at is the newest FINISHED time of a successful run; last_status is the most recent '
  'attempt whatever it did, because a pull that failed an hour ago must say so even though it '
  'succeeded yesterday. The Apex half already reads apex_watermark through v_apex_entity_status and is '
  'unchanged; its last_status comes from apex_sync_run because apex_watermark carries no status column. '
  'rows_stored, due and due_text stay NULL on the Metrc half rather than being guessed at.';

commit;
