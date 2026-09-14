import React from "react";
import { createRoot } from "react-dom/client";
import App, { RootBoundary } from "./App.jsx";
import "./styles.css";
import "./rules.css";
/* Loaded last so it can correct the locked theme without editing it. */
import "./patches.css";

/* A TAB OPEN ACROSS A DEPLOY (owner, 14 Sep 2026, Bots desk: "Failed to fetch
   dynamically imported module …/os-staff-CluGw3cF.js"). Every build renames its
   chunks and Netlify serves only the current set, so a page that was open before
   a publish asks for a filename that no longer exists the next time it opens a
   route. That is not a page fault and "Retry section" cannot fix it — the
   filename is gone. Vite raises vite:preloadError for exactly this; the shell
   reloads itself ONCE (a marker in sessionStorage stops a loop), which fetches
   the current index and the current chunks. With a build every hour in go-live
   week this would otherwise greet every open tab after every publish. */
window.addEventListener("vite:preloadError", (event) => {
  const key = "tg.reload-after-deploy";
  let already = null;
  try { already = sessionStorage.getItem(key); } catch { /* storage blocked: reload anyway, once per page life */ }
  if (already && Date.now() - Number(already) < 60000) return; /* a second failure inside a minute is a real fault: let the boundary show it */
  event.preventDefault();
  try { sessionStorage.setItem(key, String(Date.now())); } catch { /* fine */ }
  window.location.reload();
});

/* The section boundary inside App only helps while App itself is standing. If
   the shell throws, React unmounts everything and the user gets a white page
   with no way back and no record that it happened. This catches that. */
createRoot(document.getElementById("root")).render(
  <RootBoundary>
    <App />
  </RootBoundary>
);
