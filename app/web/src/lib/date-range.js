import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import {
  normaliseDateRange,
  validateDatePresetCatalog,
  validateResolvedDefault,
} from "./date-range-core.js";

let catalogPromise = null;

export async function readDatePresetCatalog(client = supabase) {
  const load = async () => {
    const { data, error } = await client.rpc("f_date_presets");
    if (error) throw error;
    return validateDatePresetCatalog(data);
  };
  if (client !== supabase) return load();
  if (!catalogPromise) {
    catalogPromise = load()
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

export function useDatePresetCatalog() {
  const [state, setState] = useState({ rows: null, error: null });
  useEffect(() => {
    let live = true;
    readDatePresetCatalog()
      .then((rows) => { if (live) setState({ rows, error: null }); })
      .catch((error) => { if (live) setState({ rows: null, error: error.message }); });
    return () => { live = false; };
  }, []);
  return state;
}

export function useDefaultRange(session, viewKey, setRange) {
  const userId = session?.user?.id;
  const [state, setState] = useState({
    ready: false, error: null, presetKey: null, source: null,
    rangeKind: null, pageDefault: null,
  });

  useEffect(() => {
    let live = true;
    setState({ ready: false, error: null, presetKey: null, source: null, rangeKind: null, pageDefault: null });
    if (!userId || !viewKey) return () => { live = false; };

    supabase.rpc("f_date_default", { p_user: userId, p_view_key: viewKey })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) throw error;
        const resolved = validateResolvedDefault(data);
        setRange((current) => ({
          ...(typeof current === "object" && current ? current : {}),
          from: resolved.resolved_from,
          to: resolved.resolved_to,
        }));
        setState({
          ready: true,
          error: null,
          presetKey: resolved.preset_key,
          source: resolved.source ?? null,
          rangeKind: resolved.range_kind ?? null,
          pageDefault: resolved.page_default ?? null,
        });
      })
      .catch((error) => {
        if (live) setState({
          ready: false,
          error: `The governed date range could not be loaded: ${error.message}`,
          presetKey: null, source: null, rangeKind: null, pageDefault: null,
        });
      });
    return () => { live = false; };
  }, [userId, viewKey, setRange]);

  return state;
}

export async function saveDateDefault(client, {
  userId, viewKey, presetKey, from, to, everywhere = false,
}) {
  if (!userId) throw new Error("A signed-in user is required to save a date default.");
  if (!everywhere && !viewKey) throw new Error("A page is required to save this page's date default.");
  const range = normaliseDateRange(from, to);
  const values = {
    custom_from: range.from || null,
    custom_to: range.to || null,
  };
  const write = everywhere
    ? client.from("user_settings").upsert({
        user_id: userId,
        default_date_preset: presetKey,
        ...values,
      }, { onConflict: "user_id" })
    : client.from("user_page_date_default").upsert({
        user_id: userId,
        view_key: viewKey,
        preset_key: presetKey,
        ...values,
      }, { onConflict: "user_id,view_key" });
  const { error } = await write;
  if (error) throw error;
  return range;
}
