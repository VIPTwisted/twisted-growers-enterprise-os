-- 20260717_shiftmarketplace.sql
-- Wire the Shift Marketplace screen (src/screens/ShiftMarketplace.jsx) to REAL data.
--
-- REUSED (live + verified via PostgREST probes 2026-07-17 — NOT redefined here):
--   * get_swap_board(uuid[], date)           — open postings + their volunteers (live)
--   * volunteer_open_shift(uuid, uuid, text)  — claim/volunteer for an open shift (live)
--   * review_shift_claim(uuid, text, uuid)    — manager approve/deny a claim (live)
--   * review_swap(uuid, text)                 — manager approve/deny a swap request (live)
--   * get_pending_requests(uuid[])            — {time_off, shift_swaps, open_shifts} (live)
--   * post_open_shift(uuid, date, time, time, text) — post an unassigned open shift (live)
--
-- NET-NEW here — the only gap for the marketplace:
--   The shared "shifts" table records NO poster, so the "Posted by Me" tab and a
--   real "Post a shift for coverage" action could not be truthful. Add poster
--   attribution + a stamped post RPC + a read-my-postings RPC. Built entirely on
--   the EXISTING shifts + shift_claims + org_nodes + people tables (no parallel
--   store). Idempotent. SECURITY DEFINER + explicit grants (RLS-locked tables).

-- ── 1) Poster attribution on the shared shifts table ─────────────────────────
alter table public.shifts add column if not exists posted_by uuid references public.people(id);
create index if not exists idx_shifts_posted_by on public.shifts (posted_by);

-- ── 2) Post an open marketplace shift, stamped with the poster ────────────────
create or replace function public.post_marketplace_shift(
  p_person_id uuid,
  p_node_id   uuid default null,
  p_date      date default null,
  p_start     time default null,
  p_end       time default null,
  p_note      text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_node uuid;
  v_id   uuid;
begin
  if p_person_id is null or p_date is null then
    raise exception 'poster and date are required';
  end if;

  -- Resolve the location from the poster's latest assignment when not supplied.
  v_node := p_node_id;
  if v_node is null then
    select a.node_id into v_node
    from assignments a
    where a.person_id = p_person_id
    order by a.effective_from desc nulls last
    limit 1;
  end if;
  if v_node is null then
    raise exception 'no location assignment found for this person';
  end if;

  insert into shifts (person_id, node_id, shift_date, start_time, end_time,
                      shift_type, status, notes, posted_by)
  values (null, v_node, p_date, p_start, p_end,
          case when p_start is not null and p_start >= '14:00'::time then 'PM' else 'AM' end,
          'open', nullif(btrim(coalesce(p_note, '')), ''), p_person_id)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.post_marketplace_shift(uuid, uuid, date, time, time, text) from public;
grant execute on function public.post_marketplace_shift(uuid, uuid, date, time, time, text) to anon, authenticated;

-- ── 3) Read the caller's own open postings, with volunteers + claim counts ───
create or replace function public.get_my_posted_shifts(p_person_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_j order by shift_date), '[]'::jsonb)
  from (
    select
      s.shift_date,
      jsonb_build_object(
        'id',          s.id,
        'node_id',     s.node_id,
        'node',        n.name,
        'shift_date',  s.shift_date,
        'start_time',  s.start_time,
        'end_time',    s.end_time,
        'posted_at',   s.created_at,
        'note',        s.notes,
        'status',      case
                         when s.person_id is not null then 'filled'
                         when exists (
                           select 1 from shift_claims c
                           where c.shift_id = s.id and lower(coalesce(c.status, '')) = 'approved'
                         ) then 'filled'
                         else 'open'
                       end,
        'claim_count', (
          select count(*) from shift_claims c
          where c.shift_id = s.id
            and lower(coalesce(c.status, 'pending')) in ('pending', 'approved')
        ),
        'volunteers', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'claim_id',   c.id,
                   'person_id',  c.person_id,
                   'name',       p.full_name,
                   'status',     c.status,
                   'claimed_at', c.created_at,
                   'note',       c.note
                 ) order by c.created_at)
          from shift_claims c
          join people p on p.id = c.person_id
          where c.shift_id = s.id
            and lower(coalesce(c.status, 'pending')) in ('pending', 'approved')
        ), '[]'::jsonb)
      ) as row_j
    from shifts s
    left join org_nodes n on n.id = s.node_id
    where s.posted_by = p_person_id
      and lower(coalesce(s.status, '')) = 'open'
  ) x;
$$;
revoke all on function public.get_my_posted_shifts(uuid) from public;
grant execute on function public.get_my_posted_shifts(uuid) to anon, authenticated;
