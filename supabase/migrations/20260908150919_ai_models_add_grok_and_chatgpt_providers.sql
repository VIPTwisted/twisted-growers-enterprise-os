-- CLAUDE applied 2026-09-08 15:09:19. Filed catch-up so migration-drift cannot go red.
-- Verbatim from supabase_migrations.schema_migrations.statements. Already in production.
-- Do not re-apply. No ledger rewrite. No Metrc write. Cycle 56. CERTIFIED 0 until dual MATCH.
--
-- Grok and ChatGPT in the model picker. Owner, 8 Sep 2026: "I WANT TO SELECT WHICH AI
-- GROK, GPT, CLAUDE... THEN THE VERSIONS AVAILABLE TO ME FROM THOSE COMPANIES AS I HAVE
-- AVAILABLE TO ME FULLY."
--
-- ai_models held four Anthropic rows and nothing else, so the picker could not offer the
-- other two subscriptions the owner pays for.
--
-- WHY NO GROK/GPT VERSION NAMES ARE HARDCODED HERE. The header on useModels() already
-- records why: the list used to be a hardcoded array, "so the list was guaranteed stale,
-- and the day it mattered was the day nobody had time". Inventing "Grok 4" or "GPT-5" rows
-- would repeat exactly that, and worse - it would offer versions a given subscription may
-- not open. The real list lives in the provider's own model menu on the signed-in tab.
-- TG Bots reads it there and syncModelsToOs() writes it back into this table, so these
-- rows are a cache of what the account actually has, not a guess about it.
--
-- bridge_alias = 'current' is a SENTINEL, not a model name: leave the tab on whatever
-- version it already has. It must not be NULL - f_bridge_model_for() coalesces a NULL
-- alias through to ai_settings and then to the literal 'sonnet', so a null here would
-- quietly send "sonnet" to Grok.
insert into ai_models (id, label, provider, bridge_alias, why, speed, enabled, sort_order) values
  ('grok-current', 'Grok — the version I have selected', 'xai', 'current',
   'Answers on grok.com using the version selected in that tab. Press "Load my versions" to pick a specific one.',
   'balanced', true, 50),
  ('gpt-current', 'ChatGPT — the version I have selected', 'openai', 'current',
   'Answers on chatgpt.com using the version selected in that tab. Press "Load my versions" to pick a specific one.',
   'balanced', true, 60)
on conflict (id) do update set
  label = excluded.label, provider = excluded.provider, bridge_alias = excluded.bridge_alias,
  why = excluded.why, enabled = excluded.enabled, sort_order = excluded.sort_order;
