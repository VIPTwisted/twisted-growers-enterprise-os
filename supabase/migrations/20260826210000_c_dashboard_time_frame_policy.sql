/* ═══════════════════════════════════════════════════════════════════════════
   C · THE DASHBOARD TIME FRAME IS A POLICY, NOT A CONSTANT
   Branch `claude-c/dashboard-time-frame`, 26 August 2026.
   NOT FOR MAIN. Owner holds the merge and the apply.

   Owner ruling, 26 Aug 2026: Control Tower and the Command Center Dashboard
   carry Hour | Shift | Day | Week | Custom, and "default week start = Monday,
   stored as policy (editable), not a constant."

   These three rows ARE that policy. They live in `conversion_factors` because
   that is where every owner-settable business threshold on this platform already
   lives, it is already surfaced on Settings → Business Rules, it is already read
   by `f_rule()`, and the no-hardcoded-numbers gate already watches it. A fourth
   home for a business rule would be a fourth place to look when a number is
   wrong. No new source of record — the owner ruled that out and it was not
   needed.

   `app/web/src/lib/period-frame.js` carries NO fallback for any of these. Ask it
   to resolve a week without the policy and it refuses with the row name rather
   than quietly assuming Monday, which is the whole point of moving it out of the
   code. `tools/tests/period-frame.test.mjs` proves that refusal, and proves the
   week boundary moves when the row says 7 instead of 1.

   NOTHING ELSE IS TOUCHED. No view, no function, no Metrc or Apex object. This
   migration inserts three configuration rows and stops.
   ═══════════════════════════════════════════════════════════════════════════ */

begin;

insert into conversion_factors
  (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
  (
    'week_starts_on_iso_dow', 1, 'ISO weekday',
    'The day the working week starts on',
    'Which day a "Week" frame begins on, written as an ISO weekday: 1 is Monday and 7 is Sunday. '
    'Every dashboard that offers a Week frame reads this row, so changing it here moves the week '
    'boundary on every page at once rather than in one place and not another.',
    'Owner ruling, 26 August 2026: "Default week start = Monday, stored as policy (editable), not a constant."',
    'Claude C, branch claude-c/dashboard-time-frame',
    'confirmed',
    'Stated by the owner in writing on 26 Aug 2026.'
  ),
  (
    'shift_start_hour', 9, 'hour of day',
    'The hour a production shift opens',
    'The hour, on a 24-hour clock, at which a shift begins. A "Shift" frame chosen before this hour '
    'resolves to the PREVIOUS day''s shift, because a shift that has not started yet has no work in it.',
    'Owner ruling, 26 August 2026: "first-unit clock vs shift start (policy 09:00 default, editable)".',
    'Claude C, branch claude-c/dashboard-time-frame',
    'confirmed',
    'Stated by the owner in writing on 26 Aug 2026 as the default, explicitly editable.'
  ),
  (
    'shift_length_hours', 8, 'hours',
    'How long a production shift runs',
    'How many hours a shift covers, measured from shift_start_hour. It sets where the Shift frame ends.',
    'NOT owner-stated. Eight hours is the ordinary length of a shift and is recorded here so the Shift '
    'frame has something to read, but the owner has never given a figure for this and no roster, punch '
    'or schedule row exists to derive one from — every one of those tables is empty as at 26 Aug 2026.',
    'Claude C, branch claude-c/dashboard-time-frame',
    'unconfirmed',
    'NEEDS AN OWNER RULING. This is the only figure in this migration the owner did not state. It is '
    'flagged unconfirmed so the Shift frame can say on its face that its length is assumed, rather than '
    'presenting an assumed boundary as a measured one.'
  )
on conflict (key) do nothing;

commit;
