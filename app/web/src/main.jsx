import React from "react";
import { createRoot } from "react-dom/client";
import App, { RootBoundary } from "./App.jsx";
import "./styles.css";
import "./rules.css";

/* The section boundary inside App only helps while App itself is standing. If
   the shell throws, React unmounts everything and the user gets a white page
   with no way back and no record that it happened. This catches that. */
createRoot(document.getElementById("root")).render(
  <RootBoundary>
    <App />
  </RootBoundary>
);
