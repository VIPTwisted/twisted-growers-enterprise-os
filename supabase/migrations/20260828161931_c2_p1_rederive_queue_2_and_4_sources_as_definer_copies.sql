-- OWNER CALL, 28 August 2026: re-derive. Queues 2 and 4 must stop nesting
-- invoker views, and the sibling views must not be flipped or altered.
--
-- THE CHAIN, measured through pg_rewrite/pg_depend rather than assumed. It is
-- shallow and closed - four views, all security_invoker = true, nothing deeper:
--   v_never_tested_proof -> v_certificate_resolved
--   v_overdue_harvests   -> v_harvest_forensic
--
-- WHAT THIS DOES. Four definer COPIES under a v_xq_src_ prefix, generated from
-- pg_get_viewdef so not one line is retyped and the copy cannot differ from the
-- original at the moment it is taken. Queue 2 and queue 4 then read the copies.
-- Every relation in both queues is now owner-rights, so RLS on the Metrc mirror
-- is bypassed for the queue and untouched everywhere else.
--
-- THE COST, STATED PLAINLY: this is a second definition of "never tested" and of
-- "overdue harvest". If someone edits the sibling view, these copies do NOT
-- follow, and the two pages will disagree silently. That is the trade the owner
-- ruled for over flipping the siblings. A drift check is registered in
-- tile_drill_contract in the same migration so the disagreement cannot stay
-- silent: it compares each copy's row count to its original on every run.
--
-- The copies are granted to NOBODY. A view referenced by another view is checked
-- against the referencing view's owner, so the gated queue views can read them
-- while no client can reach them directly and bypass f_xq_reader().
do $rederive$
declare body text;
begin
  -- leaf copies first
  body := regexp_replace(pg_get_viewdef('public.v_certificate_resolved'::regclass, true), ';\s*$', '');
  execute format('create or replace view public.v_xq_src_certificate_resolved with (security_invoker = false) as %s', body);

  body := regexp_replace(pg_get_viewdef('public.v_harvest_forensic'::regclass, true), ';\s*$', '');
  execute format('create or replace view public.v_xq_src_harvest_forensic with (security_invoker = false) as %s', body);

  -- then the two the queues actually read, repointed at the leaf copies.
  -- Anchored on FROM/JOIN only: these bodies also name the views inside
  -- provenance string literals and a blind replace would corrupt them.
  body := regexp_replace(pg_get_viewdef('public.v_never_tested_proof'::regclass, true), ';\s*$', '');
  body := regexp_replace(body, '(FROM|JOIN|from|join)\s+(public\.)?v_certificate_resolved\M',
                         '\1 public.v_xq_src_certificate_resolved', 'g');
  if body !~ 'v_xq_src_certificate_resolved' then
    raise exception 'v_never_tested_proof copy: v_certificate_resolved reference not matched';
  end if;
  execute format('create or replace view public.v_xq_src_never_tested_proof with (security_invoker = false) as %s', body);

  body := regexp_replace(pg_get_viewdef('public.v_overdue_harvests'::regclass, true), ';\s*$', '');
  body := regexp_replace(body, '(FROM|JOIN|from|join)\s+(public\.)?v_harvest_forensic\M',
                         '\1 public.v_xq_src_harvest_forensic', 'g');
  if body !~ 'v_xq_src_harvest_forensic' then
    raise exception 'v_overdue_harvests copy: v_harvest_forensic reference not matched';
  end if;
  execute format('create or replace view public.v_xq_src_overdue_harvests with (security_invoker = false) as %s', body);

  -- repoint the two queues onto the copies
  body := regexp_replace(pg_get_viewdef('public.v_xq_never_submitted'::regclass, true), ';\s*$', '');
  body := regexp_replace(body, '(FROM|JOIN|from|join)\s+(public\.)?v_never_tested_proof\M',
                         '\1 public.v_xq_src_never_tested_proof', 'g');
  if body !~ 'v_xq_src_never_tested_proof' then
    raise exception 'v_xq_never_submitted: source reference not matched, refusing to replace';
  end if;
  execute format('create or replace view public.v_xq_never_submitted with (security_invoker = false) as %s', body);

  body := regexp_replace(pg_get_viewdef('public.v_xq_harvest_open_past_limit'::regclass, true), ';\s*$', '');
  body := regexp_replace(body, '(FROM|JOIN|from|join)\s+(public\.)?v_overdue_harvests\M',
                         '\1 public.v_xq_src_overdue_harvests', 'g');
  if body !~ 'v_xq_src_overdue_harvests' then
    raise exception 'v_xq_harvest_open_past_limit: source reference not matched, refusing to replace';
  end if;
  execute format('create or replace view public.v_xq_harvest_open_past_limit with (security_invoker = false) as %s', body);
end
$rederive$;

alter view public.v_xq_src_certificate_resolved set (security_invoker = false);
alter view public.v_xq_src_harvest_forensic     set (security_invoker = false);
alter view public.v_xq_src_never_tested_proof   set (security_invoker = false);
alter view public.v_xq_src_overdue_harvests     set (security_invoker = false);
alter view public.v_xq_never_submitted          set (security_invoker = false);
alter view public.v_xq_harvest_open_past_limit  set (security_invoker = false);

revoke all on public.v_xq_src_certificate_resolved, public.v_xq_src_harvest_forensic,
               public.v_xq_src_never_tested_proof,  public.v_xq_src_overdue_harvests
  from public, anon, authenticated, service_role, tg_desktop_reader;

comment on view public.v_xq_src_never_tested_proof is
'TICKET C2 / owner ruling P1 (re-derive). Owner-rights COPY of v_never_tested_proof taken verbatim from pg_get_viewdef so queue 2 does not nest an invoker view. THIS IS A SECOND DEFINITION and will not follow edits to the original - tile_drill_contract key xq.src.never_tested_matches_sibling re-derives one from the other on every run so the drift cannot stay silent. Reachable only through v_xq_never_submitted, which carries f_xq_reader().';
comment on view public.v_xq_src_overdue_harvests is
'TICKET C2 / owner ruling P1 (re-derive). Owner-rights COPY of v_overdue_harvests taken verbatim from pg_get_viewdef so queue 4 does not nest an invoker view. THIS IS A SECOND DEFINITION - see tile_drill_contract key xq.src.overdue_matches_sibling. Reachable only through v_xq_harvest_open_past_limit, which carries f_xq_reader().';
comment on view public.v_xq_src_certificate_resolved is
'TICKET C2 / owner ruling P1 (re-derive). Owner-rights COPY of v_certificate_resolved, required because v_never_tested_proof reads it. Second definition; drift is caught by xq.src.certificate_resolved_matches_sibling.';
comment on view public.v_xq_src_harvest_forensic is
'TICKET C2 / owner ruling P1 (re-derive). Owner-rights COPY of v_harvest_forensic, required because v_overdue_harvests reads it. Second definition; drift is caught by xq.src.harvest_forensic_matches_sibling.';

insert into tile_drill_contract
  (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance, registered_by, registered_at)
values
  ('xq.src.never_tested_matches_sibling', 'Metrc Exception Queues', 'Queue 2 source copy matches its original',
   'select count(*)::numeric from v_xq_src_never_tested_proof',
   'select count(*)::numeric from v_never_tested_proof',
   0, 'ZERO. The copy exists only because queue 2 may not nest an invoker view. The moment it stops matching its original, one of the two pages is lying and this is the only thing that will say so.',
   'Agent I (Claude), ticket C2 P1', now()),
  ('xq.src.overdue_matches_sibling', 'Metrc Exception Queues', 'Queue 4 source copy matches its original',
   'select count(*)::numeric from v_xq_src_overdue_harvests',
   'select count(*)::numeric from v_overdue_harvests',
   0, 'ZERO. Same reason as the queue 2 copy: a silent divergence between the copy and the sibling page is the whole risk this re-derivation takes on.',
   'Agent I (Claude), ticket C2 P1', now()),
  ('xq.src.certificate_resolved_matches_sibling', 'Metrc Exception Queues', 'Certificate source copy matches its original',
   'select count(*)::numeric from v_xq_src_certificate_resolved',
   'select count(*)::numeric from v_certificate_resolved',
   0, 'ZERO. Copied only because v_never_tested_proof reads it.',
   'Agent I (Claude), ticket C2 P1', now()),
  ('xq.src.harvest_forensic_matches_sibling', 'Metrc Exception Queues', 'Harvest forensic source copy matches its original',
   'select count(*)::numeric from v_xq_src_harvest_forensic',
   'select count(*)::numeric from v_harvest_forensic',
   0, 'ZERO. Copied only because v_overdue_harvests reads it.',
   'Agent I (Claude), ticket C2 P1', now())
on conflict (contract_key) do nothing;;
