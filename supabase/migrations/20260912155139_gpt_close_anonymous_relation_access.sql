-- Remove anonymous access without changing signed-in roles, policies or data.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

revoke all privileges on table
  public.apex_stated_invoices_20260830,
  public.apex_stated_sales_20260830,
  public.population_snapshot_receipt,
  public.v_forensic_room_census,
  public.v_s2s_rooms
from anon;

do $verify$
declare target text;
begin
  foreach target in array array[
    'apex_stated_invoices_20260830', 'apex_stated_sales_20260830',
    'population_snapshot_receipt', 'v_forensic_room_census', 'v_s2s_rooms'
  ] loop
    if has_table_privilege('anon', format('public.%I', target), 'SELECT') then
      raise exception 'Anonymous read access remains on %', target;
    end if;
  end loop;
end
$verify$;
