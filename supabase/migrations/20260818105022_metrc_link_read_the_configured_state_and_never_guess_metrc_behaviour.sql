/* The Metrc link must read the configured state, and Metrc behaviour is never guessed.
 *
 * I hardcoded https://mo.metrc.com into v_tag_lifecycle. That is MISSOURI. Twisted Growers
 * is Massachusetts and integration_secrets.METRC_STATE says 'ma'. Every proof link on
 * every tag would have sent an auditor to another state's Metrc instance.
 *
 * Caught in the verification query immediately after building the view, because the query
 * pulled the configured state alongside the result rather than trusting what I had typed.
 *
 * The state now comes from configuration. A literal in a URL is the same class of defect
 * as a literal licence number, which this codebase already has a gate against.
 *
 * AND THE STANDING RULE THE OWNER SET, 18 Aug 2026, recorded so it outlives this session:
 *   "Any time you have an issue or are unsure you should parse the manual from metrc
 *    moving forward not guess, assume or ask me until you have parsed manual."
 *
 * Metrc's behaviour is documented. Guessing it produces exactly what happened tonight and
 * what happened with the pageSize ceiling, the lineage columns absent from the default
 * export, and the invoice-number field nobody was reading. The manual is the first stop,
 * the API response is the second, and the owner is not a substitute for either.
 */

create or replace view public.v_tag_lifecycle as
select l.*,
       'https://' || coalesce(
         (select lower(btrim(value)) from public.integration_secrets where name = 'METRC_STATE'),
         'ma') || '.metrc.com/industry/' || l.held_under_licence || '/packages'
         as metrc_screen_correct_state
from (select * from public.v_tag_lifecycle) l;

comment on column public.v_tag_lifecycle.metrc_screen is
  'DO NOT USE — hardcoded to mo.metrc.com (Missouri) in error on 18 Aug 2026. Twisted '
  'Growers is Massachusetts. Use metrc_screen_correct_state, which reads METRC_STATE from '
  'integration_secrets. Kept only because rule E1 forbids dropping a view column.';

comment on column public.v_tag_lifecycle.metrc_screen_correct_state is
  'The Metrc packages screen for the licence holding this tag, with the state read from '
  'integration_secrets.METRC_STATE rather than written into the SQL.';

insert into public.conversion_factors
  (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
  ('metrc_manual_before_guessing', 1, 'ruling', 'Parse the Metrc manual before guessing',
   'When anything about Metrc''s behaviour is unclear — a field, an endpoint, a limit, a '
   || 'status, an export column — read the Metrc documentation first. Do not guess, do not '
   || 'assume, and do not ask the owner until the manual has been read.',
   'Owner ruling, 18 Aug 2026, after a hardcoded Missouri URL was found in a Massachusetts '
   || 'platform.',
   'Owner', 'ruling',
   'The cost of guessing is on the record: a pageSize of 500 against a documented ceiling '
   || 'of 20 broke every plant sync; Source Harvest and Source Package are absent from the '
   || 'default Packages export and 14,822 packages lost their parent; the manifest carries '
   || 'an invoice number that nothing was reading. All three were discoverable without '
   || 'asking anyone.')
on conflict (key) do update
  set what_it_means = excluded.what_it_means, evidence_note = excluded.evidence_note;;
