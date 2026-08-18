/* One row per tag. A package in transit between our own licences is still one package.
 *
 * Two separate tile contracts flagged the same 11-row gap: cc.stock.tags (1,308 vs 1,297)
 * and inv.stock_packages.one_row_per_tag, whose own note says "a package is one physical
 * thing; two rows for one tag is always a defect, never a rounding."
 *
 * MEASURED: exactly 11 tags carry two rows in v_stock_packages, and every one of them
 * appears under BOTH MC281714 and MP281909 — one side intransit, the other active. That
 * is not duplication in the data. It is Metrc correctly recording both ends of a transfer
 * between our own two licences while it is in flight. Both rows carry the same quantity,
 * so summing them counts the package twice: 336 g reported for a 168 g package.
 *
 * WHICH ROW IS THE TRUTH. Owner ruling, already on record: in-transit is OURS until the
 * destination accepts. So when the destination row reads active, the destination has
 * accepted and that row is the current position. When both read intransit, nobody has
 * accepted and the most recently synced row is the best available statement.
 *
 * DISTINCT ON (p.tag) with that order. It changes no column, so CREATE OR REPLACE is
 * legal and the 53 dependents keep their shape — they simply stop receiving a second row
 * for eleven packages. Every one of them was wrong before; none needed to change.
 *
 * Applied by rewriting the view's own definition rather than retyping 5.5KB by hand.
 * Two transcription mistakes were made and caught earlier in this session; a mechanical
 * edit cannot make a third.
 */

do $$
declare d text;
begin
  d := pg_get_viewdef('public.v_stock_packages'::regclass, true);

  if position('SELECT DISTINCT ON' in d) > 0 then
    raise exception 'v_stock_packages already de-duplicates. Refusing to double-apply.';
  end if;
  if position('FROM metrc_packages p' in d) = 0 then
    raise exception 'Expected shape not found in v_stock_packages. Refusing to guess.';
  end if;

  /* Head: SELECT -> SELECT DISTINCT ON (p.tag) */
  d := regexp_replace(d, '^\s*SELECT\s', 'SELECT DISTINCT ON (p.tag) ');

  /* Tail: the view ends with the WHERE clause and a semicolon. Order so the accepted
     row wins, then the freshest. */
  d := rtrim(rtrim(d), ';');
  d := d || E'\n  ORDER BY p.tag, (p.source_state = ''active''::text) DESC NULLS LAST, p.synced_at DESC NULLS LAST';

  execute format('create or replace view public.v_stock_packages as %s', d);
end $$;

comment on view public.v_stock_packages is
  'One row per PHYSICAL PACKAGE. DISTINCT ON (tag) since 18 Aug 2026: 11 tags appeared '
  'twice because a transfer between our own MC and MP licences is recorded by Metrc on '
  'both sides at once — one intransit, one active — with the same quantity on each, so '
  'summing them counted the package twice. The accepted row wins, then the freshest, '
  'following the owner ruling that in-transit is ours until the destination accepts. '
  '53 objects read this view and every one of them was receiving the duplicate.';;
