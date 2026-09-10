-- Owner 10 Sep 2026 17:49 ET: a signed ruling is the status.
-- Live value still refreshes. The auto runner cannot un-sign PASS.

CREATE OR REPLACE FUNCTION public.f_deployment_check_record(p_key text, p_status text, p_value text, p_detail text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update deployment_check
     set status = case when signed_by is not null then status else p_status end,
         value = p_value,
         detail = case
           when signed_by is not null then rtrim(coalesce(sign_note,'') || E'\n\nLive: ' || coalesce(p_detail,''))
           else p_detail end,
         last_run_at = now(),
         first_failed_at = case
           when signed_by is not null then first_failed_at
           when p_status in ('FAIL','WARN') and first_failed_at is null then now()
           when p_status = 'PASS' then null
           else first_failed_at end
   where check_key = p_key;
  insert into deployment_check_run (check_key, status, value, detail)
  values (p_key, p_status, p_value, p_detail);
end $function$;

update public.deployment_check set
  status = 'PASS',
  signed_by = 'owner',
  signed_at = now(),
  sign_note = 'Owner 10 Sep 2026 17:49 ET: leave unassigned. HR assigns. They may rotate. Null department is correct until HR writes one. Do not invent Unassigned.'
where check_key = 'hr.no_department';

update public.deployment_check set
  status = 'PASS',
  signed_by = 'owner',
  signed_at = now(),
  sign_note = 'Owner 10 Sep 2026 17:49 ET: Carroll, Hank (terminated 15 Aug) and Hendrix, Allison J (terminated 18 Aug) no longer with us. OS already inactive. Metrc Cannabis Agent Registration left Active on purpose. We do not POST to Metrc. CCC offboards the badge.'
where check_key = 'hr.leavers_live_badge';

update public.deployment_check set
  status = 'PASS',
  signed_by = 'owner',
  signed_at = now(),
  sign_note = 'Owner 10 Sep 2026 17:49 ET: departments.name stays Cheap Pre-Rolls so payroll and seed joins keep working. Certified display label is Economy Pre-Rolls via facility/data/room-alias.ts. Row is not renamed.'
where check_key = 'naming.economy_prerolls';
