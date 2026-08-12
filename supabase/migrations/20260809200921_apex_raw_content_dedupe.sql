/* Dedupe by CONTENT, computed by Postgres.
   A delta pull returns a row because its updated_at moved, which is not the same as
   its content changing. Storing an identical payload again inflates apex_raw and
   makes "what actually changed" unanswerable.

   The obvious client-side version does not work: payload_hash is
   md5(payload::text), and Postgres renders jsonb with its own key ordering and
   whitespace, so a hash computed in Deno would never match. Doing it as a unique
   index and ON CONFLICT DO NOTHING lets the database compute both sides of the
   comparison - exact, and free, because the index is the check.

   Deliberately NOT unique on (entity, apex_id): an order that genuinely changes
   must land a second row. History is the point. */
create unique index if not exists apex_raw_content_unique
  on public.apex_raw (entity, apex_id, payload_hash);

comment on index public.apex_raw_content_unique is
  'Content dedupe. An unchanged payload returned by a delta pull is silently dropped by ON CONFLICT DO NOTHING; a genuinely changed one lands as a new row, so apex_raw keeps full history without duplicating noise.';;
