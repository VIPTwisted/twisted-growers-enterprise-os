-- Employee Performance Health Scores — real backend for src/screens/HealthScores.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- The screen previously fabricated its ENTIRE dataset from a deterministic seed()
-- generator (18 hardcoded employee names, seeded metric values, seeded trends,
-- seeded "has DA" flags) blended with localStorage (gamification/attendance
-- points/disputes). Its one "real" path called get_attendance_overview but read
-- columns that RPC never returns (callout_30d, late_30d, current_streak,
-- node_name), so it produced garbage and always fell back to the seeded mock.
--
-- This migration adds ONE new read-only RPC that computes a genuine composite
-- health score PER employee, 100% from EXISTING real tables — NO new tables:
--   people(id, full_name, display_name, is_active)
--   assignments(person_id, node_id, role_id, effective_from)
--   org_nodes(id, name, tenant_id)   roles(id, name)
--   attendance_incidents(person_id, node_id, incident_type[tardy|callout|ncns], points, incident_date)
--   training_records(person_id, node_id, completed_at, expires_at)
--   disciplinary_records(person_id, node_id, status[active|resolved])
--   shifts(person_id, node_id, shift_date, status)
--   compliments(to_person_id, to_node_id, status[approved], points)
--
-- The five weighted components mirror the UI's existing model:
--   attendance 30%, training 25%, DA-free 20%, coverage 15%, recognition 10%.
--
-- Idempotent — safe to re-run. Read-only (STABLE). RLS on the underlying tables
-- stays intact; this SECURITY DEFINER function bypasses it by design, matching
-- the app's pin_login/anon model (every sibling HR RPC does the same).

create or replace function public.get_health_scores(p_node_ids uuid[])
returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with roster as (
    select distinct on (p.id)
      p.id                                                          as person_id,
      coalesce(nullif(btrim(p.display_name), ''), p.full_name, 'Unknown') as full_name,
      a.node_id                                                     as node_id,
      n.name                                                        as location,
      coalesce(r.name, '—')                                         as role
    from people p
    join assignments a on a.person_id = p.id and a.node_id = any(p_node_ids)
    join org_nodes  n on n.id = a.node_id
    left join roles r on r.id = a.role_id
    where coalesce(p.is_active, true) = true
    order by p.id, a.effective_from desc nulls last
  ),
  att as (  -- attendance incidents in the last 90 days
    select person_id,
           coalesce(sum(points), 0)                                  as pts,
           count(*) filter (where incident_type = 'callout')         as callouts,
           count(*) filter (where incident_type = 'ncns')            as ncns,
           count(*) filter (where incident_date >= current_date - 30) as recent_ct
    from attendance_incidents
    where node_id = any(p_node_ids)
      and incident_date >= current_date - 90
    group by person_id
  ),
  trn as (  -- training completion (valid = completed and not expired)
    select person_id,
           count(*)                                                                  as total,
           count(*) filter (where completed_at is not null
                              and (expires_at is null or expires_at >= current_date)) as valid
    from training_records
    where node_id = any(p_node_ids)
    group by person_id
  ),
  da as (   -- open disciplinary actions
    select person_id, count(*) filter (where status = 'active') as open_da
    from disciplinary_records
    where node_id = any(p_node_ids)
    group by person_id
  ),
  cov as (  -- scheduled shifts in the last 90 days
    select person_id, count(*) as shift_ct
    from shifts
    where node_id = any(p_node_ids)
      and shift_date >= current_date - 90
    group by person_id
  ),
  rec as (  -- approved peer/customer recognition received
    select to_person_id as person_id,
           coalesce(sum(points), 0) as pts,
           count(*)                 as ct
    from compliments
    where to_node_id = any(p_node_ids)
      and status = 'approved'
    group by to_person_id
  ),
  scored as (
    select
      ro.person_id, ro.full_name, ro.role, ro.location, ro.node_id,
      greatest(0, 100 - coalesce(att.pts, 0) * 8)::int                        as m_att,
      case when coalesce(trn.total, 0) = 0 then 0
           else round(100.0 * trn.valid / trn.total)::int end                as m_trn,
      coalesce(trn.total, 0)                                                  as trn_total,
      coalesce(trn.valid, 0)                                                  as trn_valid,
      greatest(0, 100 - coalesce(da.open_da, 0) * 25)::int                    as m_daf,
      coalesce(da.open_da, 0)                                                 as open_da,
      case when coalesce(cov.shift_ct, 0) = 0 then 100
           else greatest(0, round(100.0 * (cov.shift_ct
                       - coalesce(att.callouts, 0) - coalesce(att.ncns, 0))
                       / cov.shift_ct))::int end                             as m_cov,
      coalesce(cov.shift_ct, 0)                                               as shift_ct,
      least(100, coalesce(rec.pts, 0))::int                                   as m_rec,
      coalesce(rec.pts, 0)                                                    as rec_pts,
      coalesce(rec.ct, 0)                                                     as rec_ct,
      coalesce(att.pts, 0)                                                    as att_pts,
      coalesce(att.recent_ct, 0)                                             as recent_ct
    from roster ro
    left join att on att.person_id = ro.person_id
    left join trn on trn.person_id = ro.person_id
    left join da  on da.person_id  = ro.person_id
    left join cov on cov.person_id = ro.person_id
    left join rec on rec.person_id = ro.person_id
  ),
  final as (
    select *,
      round(m_att * 0.30 + m_trn * 0.25 + m_daf * 0.20
          + m_cov * 0.15 + m_rec * 0.10)::int as score
    from scored
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'person_id',          person_id,
        'full_name',          full_name,
        'role',               role,
        'location',           location,
        'node_id',            node_id,
        'score',              score,
        'attendance',         m_att,
        'training',           m_trn,
        'da_free',            m_daf,
        'coverage',           m_cov,
        'recognition',        m_rec,
        'training_overdue',   (trn_total > 0 and trn_valid < trn_total),
        'training_total',     trn_total,
        'open_da',            (open_da > 0),
        'open_da_count',      open_da,
        'recognition_points', rec_pts,
        'recognition_count',  rec_ct,
        'attendance_points',  att_pts,
        'shift_count',        shift_ct,
        'recent_incidents',   recent_ct
      )
      order by score desc, full_name
    ),
    '[]'::jsonb
  )
  from final;
$$;

grant execute on function public.get_health_scores(uuid[]) to anon, authenticated;
