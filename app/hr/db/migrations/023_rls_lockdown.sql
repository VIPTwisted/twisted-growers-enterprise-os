-- 023_rls_lockdown.sql
-- PRIORITY 1 (security): enable RLS on every public table the app accesses
-- ONLY via security-definer RPCs. With RLS on and NO policy, the anon key is
-- locked out of direct reads/writes while RPCs (which bypass RLS) keep working.
-- This is the correct model for THIS app, which uses pin_login + sessionStorage
-- (anon role), not Supabase Auth — so identity-scoped policies don't apply.
--
-- Safe to run in full (ENABLE on an already-enabled table is a no-op).
-- Verified per-table that none are queried directly via supabase-js .from().

-- ── Applied live in batches 1 & 2 (14 tables) ──────────────────────────────
alter table public.dd_change_requests     enable row level security;
alter table public.sales_logs             enable row level security;
alter table public.sales_goals            enable row level security;
alter table public.sales_contests         enable row level security;
alter table public.sales_promotions       enable row level security;
alter table public.applicant_records      enable row level security;
alter table public.availability_prefs     enable row level security;
alter table public.inventory_items        enable row level security;
alter table public.inventory_adjustments  enable row level security;
alter table public.merch_catalog          enable row level security;
alter table public.merch_orders           enable row level security;
alter table public.product_catalog        enable row level security;
alter table public.training_modules       enable row level security;
alter table public.meeting_records        enable row level security;

-- ── Pending (RPC-only, safe; gated by the automation safety classifier) ─────
alter table public.location_zones         enable row level security;
alter table public.shift_zone_coverage    enable row level security;
alter table public.zone_assignments       enable row level security;
alter table public.onboarding_programs    enable row level security;
alter table public.onboarding_tasks       enable row level security;
alter table public.user_tasks             enable row level security;
alter table public.spiff_payouts          enable row level security;

-- ── New tables (no direct .from() access found; lockable) ───────────────────
alter table public.entity_modules         enable row level security;
alter table public.entity_profiles        enable row level security;
alter table public.entity_types           enable row level security;
alter table public.financial_facts        enable row level security;
alter table public.modules                enable row level security;
alter table public.risk_register          enable row level security;

-- ── Now lockable after migration 024 (TimeClock reads moved to an RPC) ──────
-- time_punches: only working direct access was 2 TimeClock reads, now via
--               get_my_time_punches(). spiff_programs: direct writes already
--               fail on a schema mismatch (caught), reads already use an RPC.
alter table public.time_punches           enable row level security;
alter table public.spiff_programs         enable row level security;
