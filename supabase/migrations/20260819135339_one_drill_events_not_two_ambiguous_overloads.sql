/* TWO OVERLOADS OF ONE FUNCTION IS AN AMBIGUOUS CALL — my defect, found by
 * calling it, 19 Aug 2026.
 *
 * f_drill_events(text) was created with the resolver; f_drill_events(text,
 * date, date) was added an hour later so the drill could carry the user's date
 * range. Both survived, and because the second has DEFAULTS for both dates, a
 * one-argument call matches both signatures — Postgres refuses with "function
 * is not unique" rather than picking. Any caller passing just a tag, including
 * the front end, gets an error instead of a timeline.
 *
 * The three-argument version is strictly more capable and behaves identically
 * when the dates are omitted, so the older one goes. Same for f_drill_stays,
 * which was created the same way and carries the same trap. */

drop function if exists public.f_drill_events(text);
drop function if exists public.f_drill_stays(text);;
