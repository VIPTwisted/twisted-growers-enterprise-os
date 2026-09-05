-- Already applied prod 20260905173057. File-only this hour — do not re-CREATE the view.
-- v_stock_on_hand live columns include packages_on_site, pounds_on_site, units_on_site, packages_in_transit.
-- Today on-hand remains packages active qty>0. Not PIT. Not Packages Inventory as-of 8/6.
-- Dual MATCH not claimed. Do not mix on-site with in-transit into one certified total.

select 1;
