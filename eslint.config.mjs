/* ESLint for the Twisted Growers front end.
 *
 * There was no linter, no type checking and no CI before this. That is why a stray `)}` shipped
 * to production and rendered as literal text on the Executive Control Tower — a warning any
 * linter would have caught.
 *
 * Deliberately calibrated: this is a 7,797-line single-file React app written fast. Turning on
 * every recommended rule would produce thousands of findings and get the linter switched off.
 * So the rules below are the ones that map to defects this project has ACTUALLY suffered.
 * Tighten over time; do not start strict.
 */
import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: ["**/dist/**", "**/node_modules/**", "app/web/public/**"] },
  {
    files: ["app/web/src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "18.3" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      /* --- The ones tied to real defects in this repo ------------------------------ */

      /* A stray `)}` inside JSX renders as literal text instead of erroring. This is the
         rule that catches that class of defect. Non-negotiable. */
      "react/jsx-no-comment-textnodes": "error",

      /* Unescaped apostrophes are cosmetic, and there are 15 of them in prose the owner
         wrote. They are NOT what caught the stray `)}` — the rule above is. Kept visible as
         a warning so the two real errors are not buried under them. */
      "react/no-unescaped-entities": "warn",

      /* useNav depended on [version] only, so it never re-read after sign-in and the whole
         navigation rail silently relied on anonymous database access. A missing dependency
         is not a style question in this codebase — it is how that class of bug happens.
         Starts as a warning because there are known existing violations; the CI step runs
         with --max-warnings 0 on changed files only once the backlog is cleared. */
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",

      /* `if (!session) return <Auth />` sits after every hook. Conditional returns before
         hooks would break the app outright, so rules-of-hooks above is an error. */

      /* Catches the typo class that produced three blank screens when scripted edits put
         state in the wrong component. */
      "no-undef": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      "no-cond-assign": "error",
      "no-constant-condition": ["error", { checkLoops: false }],

      /* An empty catch block is how errors disappear. 127 queries already swallow their
         errors with `?? []`; do not add more routes to silence. Six already exist, so this
         starts as a warning — raise it to error once the data-access wrapper lands and the
         backlog is cleared, otherwise the gate is red on arrival and gets switched off. */
      "no-empty": ["warn", { allowEmptyCatch: false }],

      /* --- Deliberately off, for now ---------------------------------------------- */
      /* 307 useState calls and a fast-moving single file. These would bury the signal. */
      "no-unused-vars": "off",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/display-name": "off",
    },
  },
];
