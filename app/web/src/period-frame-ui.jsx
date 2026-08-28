/* ═══════════════════════════════════════════════════════════════════════════
   THE TIME FRAME PICKER — Hour · Shift · Day · Week · Custom.
   Owner ruling, 26 August 2026.

   WHY IT LIVES IN ITS OWN FILE AND NOT IN DASHKIT.
   `dashkit.jsx` imports from `App.jsx`. The Control Tower lives IN `App.jsx`,
   so putting this component in dashkit and importing it back would close an
   import cycle — the class of change that has three times produced a blank
   screen on this project rather than an error. This module imports only the
   pure frame logic and the Supabase client, so both the Control Tower and every
   dashkit page can use it and neither pulls the other in.

   A PRIMITIVE, NOT A LAYOUT. It renders the five frames and the state of the
   policy behind them. Where it sits, and what a page recomputes when the frame
   changes, is each page's own business. `share_primitives_never_layouts`.

   IT NEVER GUESSES. `useFramePolicy` reads the owner's rows and binds the
   error. A refused read prints as a refusal; a missing policy row disables the
   frame that needs it and names the row. Nothing here falls back to Monday —
   the whole reason the week start moved into a policy row is so that a change
   to the row moves the screen, and a compiled-in fallback would defeat that
   silently.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { FRAMES, FRAME_POLICY_KEYS } from "./lib/period-frame.js";

export { FRAMES, FRAME_KEYS, FRAME_POLICY_KEYS, resolveFrame, SUB_DAY_NOTE } from "./lib/period-frame.js";

export function useFramePolicy() {
  const [state, setState] = useState({ policy: null, unconfirmed: [], err: null, read: false });
  useEffect(() => {
    let live = true;
    supabase.from("conversion_factors").select("key,value,evidence_status")
      .in("key", FRAME_POLICY_KEYS)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setState({ policy: null, unconfirmed: [], err: error.message, read: true }); return; }
        const rows = Array.isArray(data) ? data : [];
        setState({
          policy: Object.fromEntries(rows.map((r) => [r.key, Number(r.value)])),
          unconfirmed: rows.filter((r) => r.evidence_status === "unconfirmed").map((r) => r.key),
          err: null, read: true,
        });
      });
    return () => { live = false; };
  }, []);
  return state;
}

/* A chip, local to this file so the module pulls in no page. Only existing
   token classes are used; nothing here defines a colour. */
function FrameChip({ tone, title, children }) {
  return <span className={`cc-hchip ${tone}`} title={title}>{children}</span>;
}

export function FramePicker({
  frame, onFrame, customFrom = "", customTo = "", onCustom,
  resolved, policyErr, unconfirmed,
}) {
  return (
    <div className="cc-frame" role="group" aria-label="Time frame">
      <span className="cc-frame-lbl">Frame</span>
      {FRAMES.map((f) => (
        <button key={f.key} type="button"
          className={`cc-btn ${frame === f.key ? "on" : ""}`}
          aria-pressed={frame === f.key}
          onClick={() => onFrame(f.key)}
          title={f.key === "week"
            ? "A week as the owner defines it. The day the week starts on is a policy row on Settings → Business Rules, not a setting inside this page, so changing it there moves every dashboard at once."
            : (f.key === "hour" || f.key === "shift")
              ? "Metrc and Apex date every business event without a time of day, so this frame shows the day that contains it and says so on the figures. Only findings carry a real clock."
              : `Recompute every figure on this page for one ${f.label.toLowerCase()}.`}>
          {f.label}
        </button>
      ))}
      {frame === "custom" && (
        <>
          <label htmlFor="cc-frame-from">From</label>
          <input id="cc-frame-from" type="date" className="cc-input" value={customFrom}
            onChange={(e) => onCustom(e.target.value, customTo)} />
          <label htmlFor="cc-frame-to">To</label>
          <input id="cc-frame-to" type="date" className="cc-input" value={customTo}
            onChange={(e) => onCustom(customFrom, e.target.value)} />
        </>
      )}
      {policyErr && (
        <FrameChip tone="crit"
          title={`The owner's frame policy could not be read: ${policyErr}. No frame is being guessed at, and no figure is shown for one.`}>
          frame policy could not be read
        </FrameChip>
      )}
      {resolved?.ok && <span className="cc-frame-note" title={resolved.note}>{resolved.label}</span>}
      {resolved && !resolved.ok && (
        <FrameChip tone="crit" title={resolved.why}>this frame cannot be resolved — no figures shown for it</FrameChip>
      )}
      {resolved?.ok && resolved.subDay && (
        <FrameChip tone="attn" title={resolved.note}>quantities and dollars still show the whole day ⓘ</FrameChip>
      )}
      {resolved?.ok && resolved.frame === "shift" && unconfirmed?.includes("shift_length_hours") && (
        <FrameChip tone="attn"
          title="Shift length has never been set by the owner, and no roster, punch or schedule row exists to derive one from — every one of those tables is empty. The eight hours used here is an assumption, recorded as unconfirmed on Settings → Business Rules.">
          shift length is assumed, not set ⓘ
        </FrameChip>
      )}
    </div>
  );
}
