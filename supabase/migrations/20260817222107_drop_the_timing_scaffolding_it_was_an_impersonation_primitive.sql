/* Drop the timing scaffolding. It was an impersonation primitive.
 *
 * f_time_as_user(p_sql text, p_uid uuid) and f_time_as_authenticated(p_sql text) were
 * written to measure the Command dashboard timeouts under the role that actually
 * suffers them. They did their job: they proved v_stock_headline took 10,405 ms against
 * an 8,000 ms ceiling, and then proved it took 552 ms afterwards.
 *
 * They must not survive that. Both take ARBITRARY SQL. f_time_as_user additionally sets
 * request.jwt.claims to ANY uuid the caller supplies and executes under it. Left in the
 * schema and reachable through PostgREST, that is a function which lets one signed-in
 * user read the database as any other user — a complete bypass of every RLS policy on
 * the platform, added by the very change that was fixing an RLS problem.
 *
 * Nothing referenced them but the measurements in this session. Dropped.
 *
 * If a permanent diagnostic is wanted later it must take a whitelisted relation name
 * rather than arbitrary SQL, must not accept a uid from the caller, and must be
 * executable only by a role no login can assume. That is a real piece of work with a
 * threat model, not a helper knocked up mid-investigation.
 */

drop function if exists public.f_time_as_user(text, uuid);
drop function if exists public.f_time_as_authenticated(text);;
