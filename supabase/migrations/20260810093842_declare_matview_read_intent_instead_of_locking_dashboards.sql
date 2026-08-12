-- THE MATVIEW FINDING IS NOT CRITICAL, AND SAYING SO IS THE FIX.
--
-- Standing finding: "9 materialized views readable by every signed-in user, and RLS cannot
-- protect them", severity red. Two of those three claims are true. It is 11 now, not 9, and
-- Postgres genuinely cannot apply row-level security to a materialized view — the only lever is
-- the table grant. The severity is what does not survive measurement.
--
-- WHAT IS ACTUALLY IN THEM: department KPIs, harvest yields, strain census, package origin,
-- package-to-harvest links, certificate counts, tower counts, seed-to-sale rollups, and a
-- document search index. No compensation. No wage rates. No personal records beyond names in
-- requested_by / approved_by on allocation rows. And anon can read NONE of the eleven — verified,
-- not assumed.
--
-- So the finding describes signed-in employees of a cannabis company being able to see that
-- company's own cultivation and production data. That is not a breach; for most of these it is
-- the job. Rule C1 requires every total to open to the items behind it, and C3a requires every
-- item row to carry its certificate and manifest SITEWIDE — restricting mv_document_search would
-- put this platform in conflict with the owner's own rules.
--
-- WHY LOCKING THEM DOWN WOULD BE THE WRONG MOVE. mv_department_dashboard and mv_tower_counts feed
-- the Control Tower and the department dashboards. mv_department_dashboard is the specific object
-- CASCADE destroyed three times, blanking every dashboard with no visible error because the front
-- end swallows the failure with `?? []`. Revoking its grant would reproduce that outage
-- deliberately, in exchange for withholding a harvest yield from a grower.
--
-- So: declare the intent, the same fix that resolved three false positives out of seven on the
-- RLS-no-policy finding. A register that cries wolf loses the reader it needs for the real alarm.
-- ONE of the eleven carries genuinely commercial data and is flagged for a decision rather than
-- decided here.

insert into public.rls_intent (table_name, intent, reason) values
  ('mv_department_dashboard', 'staff_read',
   'Department KPI tiles. Feeds the department dashboards and the Control Tower. RLS is impossible on a matview, and revoking the grant reproduces the CASCADE outage that blanked every dashboard three times. All-staff read is intended.'),
  ('mv_tower_counts', 'staff_read',
   'Headline counts for the Control Tower — packages, plants, harvests, open actions. Aggregate only, no row-level detail. All-staff read is intended.'),
  ('mv_tower_inventory', 'staff_read',
   'Inventory metrics for the Control Tower. Aggregate only. All-staff read is intended.'),
  ('mv_harvest_yields', 'staff_read',
   'Harvest yields, projections and variance. Growers need this. Contains requested_by / approved_by / allocated_to names on allocation rows — operational attribution, not personal data.'),
  ('mv_harvest_pkg_rollup', 'staff_read',
   'Packages made per harvest, with pass, fail and untested counts. Operational.'),
  ('mv_package_harvest', 'staff_read',
   'Which package came from which harvest. This is the seed-to-sale chain the owner requires be visible.'),
  ('mv_package_origin', 'staff_read',
   'Package tag to origin. The identity spine — rule D4 makes the tag the identity, so this must be readable to resolve anything.'),
  ('mv_package_documents', 'staff_read',
   'Certificate counts and lab testing state per package. Rule C3a requires certificate and manifest on every item row sitewide, so restricting this would breach the owner rule it exists to serve.'),
  ('mv_seed_to_sale', 'staff_read',
   'Per-strain rollup from plants through packaging to shipment. Aggregate.'),
  ('mv_strain_census', 'staff_read',
   'Live plant counts by strain and room. Operational, and required for room mirroring.'),
  ('mv_document_search', 'staff_read',
   'DECISION NEEDED. The only one of the eleven carrying commercially sensitive data: customer and shipper names alongside manifest numbers. Every signed-in employee can currently see who we buy from and sell to. Left readable because rule C3a requires certificates and manifests reachable sitewide and because sales staff need it — but whether a grower should see the customer list is the owner''s call, not an inference. Raised 10 Aug 2026.')
on conflict (table_name) do update set
  intent = excluded.intent, reason = excluded.reason;

comment on table public.rls_intent is
  'Why a relation has the access it has. For TABLES: why one with RLS and no policy is that way — '
  'sealed means deny-by-default is the intended terminal state. For MATERIALIZED VIEWS: RLS is '
  'impossible on them, so the grant is the only lever and the intent must be written down rather '
  'than reported as a defect every night. Added because the RLS-no-policy finding called three '
  'correctly-sealed tables a defect for days, and the matview finding called eleven operational '
  'rollups a critical breach.';;
