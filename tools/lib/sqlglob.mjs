/* sqlglob.mjs — turn a SQL LIKE pattern into a JavaScript regexp.
 *
 * Extracted from lane-discipline.mjs so it can be TESTED. That is the whole point:
 * it was written inline, it was never tested, and it is the kind of function that
 * looks obviously right and is quietly wrong.
 *
 * Two ways it can be wrong, both silent:
 *
 *   TOO NARROW — a pattern fails to match a file it owns, so the file reads as
 *   unowned and the guard raises a false alarm. A guard that cries wolf gets
 *   switched off, and then it holds nothing.
 *
 *   TOO WIDE — '.' left unescaped matches ANY character, so 'App.jsx' would also
 *   match 'AppXjsx'. Worse, an unescaped pattern like 'tools/checks/%' is fine but
 *   'a.b%' would match 'axbanything'. A pattern that matches more than it should
 *   hands ownership of a file to an agent who does not own it, and nobody notices
 *   because the guard stays green.
 *
 * SQL LIKE semantics, which are NOT glob semantics:
 *   %  matches any sequence, including empty
 *   _  matches exactly ONE character
 * Everything else is literal, including '.', '*', '+', '(' and friends.
 */

/** Convert one SQL LIKE pattern to an anchored RegExp. */
export function likeToRegExp(pattern) {
  if (typeof pattern !== "string") throw new TypeError("pattern must be a string");
  let out = "";
  for (const ch of pattern) {
    if (ch === "%") out += ".*";
    else if (ch === "_") out += ".";
    /* Escape EVERY regexp metacharacter. The original inline version missed '*'
       and '?', which meant a pattern containing either would have matched far
       more than intended - and silently, because a too-wide match still returns
       an owner. */
    else if (".+^$*?()[]{}|\\/".includes(ch)) out += "\\" + ch;
    else out += ch;
  }
  return new RegExp("^" + out + "$");
}

/** Does `value` match the SQL LIKE `pattern`? */
export function likeMatch(value, pattern) {
  return likeToRegExp(pattern).test(value);
}
