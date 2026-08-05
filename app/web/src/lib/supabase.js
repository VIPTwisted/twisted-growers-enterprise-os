import { createClient } from "@supabase/supabase-js";

// Publishable values only — safe in the client by design. Overridable via env (Law #4).
const URL = import.meta.env.VITE_SUPABASE_URL ?? "https://fxetuqjryttnypgepsru.supabase.co";
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZXR1cWpyeXR0bnlwZ2Vwc3J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NzY4MzksImV4cCI6MjEwMTQ1MjgzOX0.JVNn4OoGrTVRLrl0AhAxaodJUeMQi4NO1aZdOVhGn3M";

export const supabase = createClient(URL, KEY);
export const FUNCTIONS_URL = `${URL}/functions/v1`;
