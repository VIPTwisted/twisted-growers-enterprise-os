/* ============================================================================
 * "Fresh frozen" had THREE definitions. Collapse to one. Agent W, 13 Aug 2026.
 *
 * f_harvest_is_fresh_frozen(text) was created on 13 Aug to be the single
 * definition. It is not: the identical regex is also written out by hand inside
 * v_harvest_takedown and v_moisture_loss_register. v_harvest_takedown was built
 * in the SAME session as the function — the duplicate-definition bug reproduced
 * itself inside the change that was fixing it. That is not a criticism of the
 * author; it is the reason a countable check is needed rather than a rule.
 *
 * PROVED EQUIVALENT BEFORE TOUCHING ANYTHING: across all 380 metrc_harvests rows
 * and all 301 v_harvest_forensic rows, the inline regex and the function
 * disagree on zero. The substitution changes no answer.
 *
 * The edit is done by targeted substring replacement on the view's own stored
 * definition, so every other byte of these views is carried across untouched.
 * Retyping a 60-line view to change one predicate is how unrelated defects get
 * introduced under cover of a cleanup.
 * ========================================================================== */
do $$
declare d text; n int;
begin
  -- v_harvest_takedown
  select definition into d from pg_views
   where schemaname='public' and viewname='v_harvest_takedown';
  n := (length(d) - length(replace(d, 'h.name ~* ''(^|[^a-z])FF([^a-z]|$)''::text', '')))
       / length('h.name ~* ''(^|[^a-z])FF([^a-z]|$)''::text');
  if n <> 1 then
    raise exception 'v_harvest_takedown: expected exactly 1 inline fresh-frozen regex, found %', n;
  end if;
  d := replace(d, 'h.name ~* ''(^|[^a-z])FF([^a-z]|$)''::text',
                  'f_harvest_is_fresh_frozen(h.name)');
  execute 'create or replace view public.v_harvest_takedown as ' || d;

  -- v_moisture_loss_register
  select definition into d from pg_views
   where schemaname='public' and viewname='v_moisture_loss_register';
  n := (length(d) - length(replace(d, 'h.harvest_name ~* ''(^|[^a-z])FF([^a-z]|$)''::text', '')))
       / length('h.harvest_name ~* ''(^|[^a-z])FF([^a-z]|$)''::text');
  if n <> 1 then
    raise exception 'v_moisture_loss_register: expected exactly 1 inline fresh-frozen regex, found %', n;
  end if;
  d := replace(d, 'h.harvest_name ~* ''(^|[^a-z])FF([^a-z]|$)''::text',
                  'f_harvest_is_fresh_frozen(h.harvest_name)');
  execute 'create or replace view public.v_moisture_loss_register as ' || d;
end $$;

comment on function f_harvest_is_fresh_frozen(text) is
  'THE definition of whether a harvest is fresh frozen. Registered in primitive_definition; '
  'any view or function that writes the FF regex out by hand instead of calling this is a '
  'second definition and the duplicate-definition assertion will name it. Two such copies '
  'existed and were collapsed on 13 Aug 2026.';
;
