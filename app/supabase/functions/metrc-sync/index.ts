// TG Enterprise OS — Metrc read-first sync worker (CODE-018)
// Deployed 2026-08-04 to project fxetuqjryttnypgepsru as "metrc-sync" v1.
// Pulls packages, harvests, plants, plant batches, transfers per license into staging tables.
// Secrets (Supabase dashboard → Edge Functions → Secrets — never in chat/code):
//   METRC_VENDOR_KEY, METRC_USER_KEY, METRC_LICENSES (csv), METRC_STATE (default: ma)
// Invoke: POST /functions/v1/metrc-sync?endpoints=packages,harvests,plants,plantbatches,transfers
// NOTE: this local copy mirrors the deployed source of record; see deploy history in Supabase.
export {}; // placeholder module marker — full deployed source lives in Supabase function metrc-sync v1
