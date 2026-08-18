/* THE LINEAGE HELPERS RUN AS DEFINER — the second half of task #34's fix.
 *
 * f_material_origin, f_strain_by_tag, f_is_ours and f_can_be_a_customer are the
 * house-sanctioned resolution functions ("use f_material_origin(tag), never the
 * raw field" — trained into every agent and every page). They were SECURITY
 * INVOKER, which cost nothing while views ran owner-mode: the helpers executed
 * as postgres. The RLS closure flipped 196 views to invoker, and each helper
 * call started paying row-security checks on every internal lookup, per row,
 * per call — measured: v_ownership_verdict at 78 seconds for 187 rows AFTER the
 * policy wrap (it was a hard timeout before it).
 *
 * DEFINER is correct for these, not a shortcut: they return derived facts about
 * a tag (origin, strain, ours-or-not), not row dumps; every signed-in role is
 * entitled to resolve them, and the rows a user can SEE remain governed by the
 * view and base-table policies. No dynamic SQL inside; search_path pinned. */

alter function public.f_material_origin(text)      security definer set search_path = public, pg_temp;
alter function public.f_strain_by_tag(text, text)  security definer set search_path = public, pg_temp;
alter function public.f_is_ours(text)              security definer set search_path = public, pg_temp;
alter function public.f_can_be_a_customer(text)    security definer set search_path = public, pg_temp;;
