import { createClient } from "@supabase/supabase-js";

// Project constants — public by design (they ship to every visitor's browser).
// Deliberately NOT read from build env: a stray VITE_* site variable must never
// be able to swap the key underneath the app (that outage already happened once).
const URL = "https://fxetuqjryttnypgepsru.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZXR1cWpyeXR0bnlwZ2Vwc3J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NzY4MzksImV4cCI6MjEwMTQ1MjgzOX0.JVNn4OoGrTVRLrl0AhAxaodJUeMQi4NO1aZdOVhGn3M";

export const supabase = createClient(URL, KEY);
export const FUNCTIONS_URL = `${URL}/functions/v1`;
