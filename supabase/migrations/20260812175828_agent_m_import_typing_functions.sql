-- Agent: M — the type coercions the import path is allowed to make, and no others.
-- Every one returns NULL rather than guessing. A NULL here is always paired with a row in
-- import_rejects saying why, so nothing is ever silently dropped.

create or replace function f_import_num(v text) returns numeric
language sql immutable as $$
  select case
    when v is null or btrim(v) = '' then null
    -- thousands commas are stripped; "1,932.00" must never become two fields or 1
    when btrim(v) ~ '^-?[0-9,]+(\.[0-9]+)?$' then replace(btrim(v), ',', '')::numeric
    else null
  end;
$$;
comment on function f_import_num(text) is
'Number, or NULL. Strips thousands commas. Returns NULL for any value that is not purely numeric - "Not Tested", "N/A", "IN CURE" and "ON HOLD" all become NULL and are recorded in import_rejects.';

create or replace function f_import_pct(v text) returns numeric
language sql immutable as $$
  select case
    when v is null or btrim(v) = '' then null
    when btrim(v) ~* '^(not tested|n/a|na|tbd|pending)$' then null
    when btrim(v) ~ '^-?[0-9]{1,3}(\.[0-9]+)?\s*%$' then replace(btrim(v), '%', '')::numeric
    when btrim(v) ~ '^-?[0-9,]+(\.[0-9]+)?$' then replace(btrim(v), ',', '')::numeric
    else null
  end;
$$;
comment on function f_import_pct(text) is
'The NUMBER out of a percentage string. "94.08%" becomes 94.08 - the unit lives in import_field_map.unit and in the _pct column name, never in the value. Sentinels return NULL.';

create or replace function f_import_usdate(v text) returns date
language sql immutable as $$
  select case
    when v is null or btrim(v) = '' then null
    when btrim(v) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
     and split_part(btrim(v), '/', 1)::int between 1 and 12
     and split_part(btrim(v), '/', 2)::int between 1 and 31
    then to_date(btrim(v), 'FMMM/FMDD/YYYY')
    else null
  end;
$$;
comment on function f_import_usdate(text) is
'US M/D/YYYY ONLY, and only when unambiguous. 5/6/2027 is 6 May 2027 and can never become 5 June. Anything else - including "ON HOLD" - returns NULL and is recorded in import_rejects.';

create or replace function f_import_tag(v text) returns text
language sql immutable as $$
  select case
    when v is null or btrim(v) = '' then null
    when btrim(v) ~* '^(n/a|na|none|-)$' then null           -- ABSENT, not invalid
    when upper(btrim(v)) ~ '^1[A-Z0-9]{23}$' then upper(btrim(v))
    else null                                                 -- e.g. "IN CURE"
  end;
$$;
comment on function f_import_tag(text) is
'A 24-character Metrc tag, or NULL. The literal N/A is a legitimate ABSENCE and returns NULL quietly; anything else non-conforming also returns NULL but is recorded in import_rejects and kept verbatim in a _note column.';;
