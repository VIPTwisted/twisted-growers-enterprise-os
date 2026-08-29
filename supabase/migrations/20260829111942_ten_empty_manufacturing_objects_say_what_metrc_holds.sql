/* TEN EMPTY MANUFACTURING OBJECTS SAY WHAT METRC ACTUALLY HOLDS.
   Owner instruction, 29 August 2026.

   THE DEFECT. Ten pages across Manufacturing and Infused Pre-Rolls & Flower read
   a platform table that is empty, and every one of them said "No records on this
   object yet." That sentence is true of five hundred objects and useful about
   none of them: it reports that the table is empty, which the reader can already
   see, and says nothing about whether that is expected, a gap, or a finding
   somebody has already made. Here it is a finding, and it has been measured.

   THE FIGURES, DERIVED BEFORE THEY WERE WRITTEN DOWN. Counted on metrc_packages,
   the API mirror, on 29 August 2026:

     select count(distinct nullif(raw->>'ProductionBatchNumber','')) ...
       distinct production batches       1,766
       packages flagged IsProductionBatch 1,838
       first packaged_on                  2023-10-09
       last packaged_on                   2026-08-28

   Not taken from metrc_rpt_packages_inventory, which answers 188 — that table is
   CURRENT INVENTORY, a position, and the sentence is about everything ever made.
   Two right answers to two different questions; using the wrong one here would
   have understated the floor's history by an order of magnitude.

   APPENDED, NOT REPLACED, AND THAT IS DELIBERATE. nav_registry.description is
   rendered in three places: the page subtitle, the report header, and the tooltip
   on every menu item that reaches the page. Overwriting it would trade a sentence
   saying what the object is FOR against a sentence saying what is missing, and a
   reader needs both. The existing copy is kept and the finding follows it.

   nav_registry has no owner_note column. report_registry does — and it is the
   better home — but none of these ten has a row there, so reaching for it would
   have meant creating ten registered reports as a side effect of writing a
   sentence. That is a larger change than the instruction, and it would push
   against the report_nobody_can_open ratchet, which has no headroom.

   IDEMPOTENT. The append is guarded on the sentence not already being present, so
   running this twice does not stutter.

   TO REVERSE: one update stripping everything from ' Floor book empty.' onward.
*/

do $$
declare
  k_note constant text :=
    'Floor book empty. Metrc shows 1,766 distinct production batches '
    || '(1,838 packages flagged as production batches). First recorded Oct 2023, last this month.';
  k_objects constant text[] := array[
    'work_orders', 'work_order_stages', 'schedule_assignments', 'pipeline_runs',
    'v_pipeline_run_status', 'pipeline_stage_events', 'task_standards',
    'turnaround_policies', 'v_turnaround_watch'
  ];
  v_touched integer;
begin
  update nav_registry
     set description = case
           when coalesce(description, '') = '' then k_note
           else rtrim(description) || ' ' || k_note
         end,
         updated_at = now()
   where table_ref = any (k_objects)
     and position(k_note in coalesce(description, '')) = 0;

  get diagnostics v_touched = row_count;

  /* The instruction named ten pages. Nine table names serve them, because
     work_order_stages backs both Manufacturing Schedule and Production Schedule.
     If this stops matching ten rows the registry has moved underneath us and the
     migration should be read again rather than run again. */
  if v_touched not in (0, 10) then
    raise exception 'Expected ten nav rows across the nine manufacturing objects, updated %', v_touched;
  end if;
end $$;
