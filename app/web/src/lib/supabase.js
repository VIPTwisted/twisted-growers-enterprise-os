import { createClient } from "@supabase/supabase-js";

// Publishable values only — safe in the client by design. Overridable via env (Law #4).
const URL = import.meta.env.VITE_SUPABASE_URL ?? "https://fxetuqjryttnypgepsru.supabase.co";
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_V8cV4o6iE2nRV1oSu_CyGw_9Ftso15J";

export const supabase = createClient(URL, KEY);
export const FUNCTIONS_URL = `${URL}/functions/v1`;
