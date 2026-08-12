-- OWNER INSTRUCTION, 7 August 2026: "NO PAID ONLY WHEN WE TURN ON".
--
-- The assistant answers through Claude on the owner's own desktop, over the
-- subscription already paid for. The paid API was only ever a fallback, and the
-- owner does not want a fallback that can bill him without him deciding to.
--
-- Off is now the resting state. Turning it on is a deliberate act by an owner in
-- Settings, not something that happens because a laptop was closed.
--
-- Nothing else changes: every page, report, dashboard, drill-down and suggestion
-- button is a database query and has never cost anything. Total spend to date is
-- $0.00.
update ai_settings
set paid_model_enabled = false,
    note = trim(both E'\n' from coalesce(note,'') || E'\n' ||
      '7 Aug 2026 — paid answers switched OFF at the owner''s instruction: "NO PAID ONLY WHEN WE TURN ON". '
      || 'The assistant answers free through the desktop bridge. An owner turns this back on deliberately or not at all.'),
    updated_at = now()
where id = 1;;
