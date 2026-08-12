-- Agent I, 12 Aug 2026. DBI-076.
-- OWNER: "DO NOT TOUCH VIP ENTERPRISE OS THAT IS NOT THIS PROJECT."
--
-- Raised because an agent's Google Drive credential turned out to be authenticated as
-- anthonydemartino41@gmail.com, whose Drive is topped by July 2026 "VIP Enterprise OS" material
-- belonging to a different company. The agent read none of it, said so plainly, and flagged the
-- credential scope — which is the behaviour required. Recording it as a rule so the next agent
-- that finds a foreign file in a shared Drive does the same thing without having to reason it out.

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status)
values
('other_companies_are_off_limits','1','rule',
 'VIP Enterprise OS, Dragon Sourcing and DDC are DIFFERENT COMPANIES. Never read their data.',

 'Twisted Growers is a licensed Massachusetts cannabis company and its data may not be mixed with '
 'anything else, in either direction. Three neighbours exist and all three are off limits: '
 'VIP Enterprise OS, Claude_Dragon Sourcing, and DDC (DeMartino Development & Construction). '
 'If you open a shared Drive, a folder or a repository and find files belonging to any of them: '
 'READ NOTHING, copy nothing, quote no figure, and TELL THE OWNER the credential is not scoped to '
 'this company. Do not reason that a quick look is harmless — a figure read from another company '
 'and later half-remembered is exactly how a cross-company contamination starts, and in a licensed '
 'business that is a regulatory problem, not an untidiness. '
 'THE ONE THING THAT DOES CROSS IS PATTERN. The owner ruled that DDC''s design discipline is our '
 'bar and told us to learn from it — layout, vocabulary, honest-state chips, system discipline. '
 'PATTERNS CROSS. DATA NEVER DOES. A screenshot of how DDC arranges a page is a lesson; a number '
 'from a DDC table is contamination.',

 'Owner ruling 12 Aug 2026: "DO NOT TOUCH VIP ENTERPRISE OS THAT IS NOT THIS PROJECT", after an '
 'agent reported that its Drive credential resolved to anthonydemartino41@gmail.com and indexed '
 'VIP Enterprise OS files. The agent read none of them and flagged the scope — the correct '
 'behaviour, now written down. Consistent with the standing CLAUDE.md rule on Dragon Sourcing: '
 '"Never carry a fact, a figure or a file between the two."',
 'Owner (Vinny)', 'owner_set')
on conflict (key) do update set
  label = excluded.label, what_it_means = excluded.what_it_means,
  where_it_came_from = excluded.where_it_came_from, updated_at = now();;
