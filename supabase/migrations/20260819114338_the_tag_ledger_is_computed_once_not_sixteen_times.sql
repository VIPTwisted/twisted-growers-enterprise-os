/* THE DASHBOARD HUNG ON A WEEK WINDOW — and the cause was one word.
 *
 * Owner, 19 Aug 2026: he picked "Week" and the strip sat on "RECOMPUTING FOR
 * 2026-08-16 → 2026-08-22" and never finished. The new stale-label guard was
 * working exactly as designed — it correctly refused to show the previous
 * window's figures under the new heading — but the fetch behind it never
 * returned, so the honest message became a permanent one.
 *
 * MEASURED, not guessed: every individual part of the query is fast (the
 * third-party spend, the no-invoice count, the resold pounds all return in
 * 0.00s for that window). What is slow is that `led` — the canonical
 * one-row-per-tag ledger, a DISTINCT ON over 19,000 packages — was declared
 * NOT MATERIALIZED and is referenced at SIXTEEN sites. Postgres inlines an
 * un-materialized CTE at every reference, so that 19,000-row sort ran up to
 * sixteen times in one call.
 *
 * NOT MATERIALIZED was added deliberately yesterday and was right for `flow`,
 * whose six columns must stay lazy so an untaken branch costs nothing. It was
 * wrong for `led`, which every branch reads and which returns the same rows
 * regardless of the window. Materialising it computes the ledger once and
 * hands the same result to all sixteen. `flow` and `asof` stay lazy.
 *
 * Applied by rewriting the live definition in place rather than re-typing 570
 * lines of it — the owner's standing rule against monolithic pushes, and the
 * transcription risk is exactly what that rule exists to prevent. */

do $$
declare d text;
begin
  d := pg_get_functiondef('public.f_department_dashboard(text,date,date)'::regprocedure);
  if position('led as not materialized (' in d) = 0 then
    raise exception 'led is not declared NOT MATERIALIZED — the definition has moved on; '
                    'refusing to guess at what to change.';
  end if;
  d := replace(d, 'led as not materialized (', 'led as materialized (');
  execute d;
end $$;;
