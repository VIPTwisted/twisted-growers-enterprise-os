-- Bound contention on the already-approved permission transaction; no authorization or data change.
set local lock_timeout = '5s';
alter function public.f_save_permission_matrix(text,text,jsonb) set lock_timeout = '5s';
