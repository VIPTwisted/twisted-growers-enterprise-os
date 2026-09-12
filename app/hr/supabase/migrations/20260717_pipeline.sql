-- ─────────────────────────────────────────────────────────────────────────────
-- Pipeline screen — finish real wiring
-- The pipeline_deals table + get_pipeline_deals / create_pipeline_deal /
-- update_pipeline_deal RPCs already exist and are used by src/screens/Pipeline.jsx.
-- This migration:
--   1. Removes an inspection probe row created while verifying the create RPC.
--   2. Adds the missing delete_pipeline_deal RPC so the deal drawer can delete.
-- Idempotent + SECURITY DEFINER + grants, matching this project's conventions.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Clean up the single probe row inserted during backend verification.
--    Targeted by exact id so no real record can ever be affected.
delete from public.pipeline_deals
 where id = '55c805cf-fa0b-4f31-9da6-cd828ca6849a';

-- 2) Delete RPC — deletes a deal by id and reports whether a row was removed.
create or replace function public.delete_pipeline_deal(p_deal_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.pipeline_deals where id = p_deal_id;
  get diagnostics v_count = row_count;
  return json_build_object('ok', v_count > 0);
end;
$$;

grant execute on function public.delete_pipeline_deal(uuid) to anon, authenticated;
