-- BP-8 Today: the first measurement of the feed showed twelve "Strain TG <name> is wasting N percent"
-- rows and twenty "TG <harvest> F# is blocking <room>" rows each standing as its own decision — the
-- family rule stripped tag suffixes but not names or numbers. One rule, three steps: tag suffix off,
-- a "TG <name>" token becomes "TG …", every number becomes #. 120 finding families → 81.
-- (Postgres ARE: \y is the word boundary; \b is a backspace.)
create or replace function public.f_finding_family(p text) returns text
language sql immutable parallel safe as $$
  select coalesce(nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''),
           '\s*(-|—|:)\s*(M0000\d{7}|1A4[0-9A-F]+).*$', ''),
           '\s*(-|—|:)\s+[A-Z][^:]*$', ''),
           '\yTG [A-Za-z0-9''&#/ .x-]+? (is|has|was|are|in|at|on|f\d|F\d)\y', 'TG … \1', 'g'),
           '\d+(\.\d+)?', '#', 'g'),
           '\y[fF]#\y', 'F#', 'g'),
           '\s+', ' ', 'g')), ''), left(coalesce(p, ''), 120))
$$;
comment on function public.f_finding_family(text) is 'BP-8: the headline with its tag / name suffix removed, "TG <name>" collapsed to "TG …" and every number to # — every open finding of one family and one severity is ONE decision on Today. Used by f_today_feed and f_decide alike so the two never disagree.';
notify pgrst, 'reload schema';;
