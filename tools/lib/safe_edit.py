#!/usr/bin/env python3
"""Edit a source file without ever being able to destroy it.

WHY THIS EXISTS
---------------
On 8 August 2026 app/web/src/budz.jsx went to zero bytes and took 2,908 lines
with it. The script that did it looked like every edit script:

    t = io.open(path, encoding="utf-8").read()
    t = t.replace(old, new)
    io.open(path, "w", encoding="utf-8").write(t)      # <- the bug

`open(path, "w")` truncates the file the moment it is called. The content that
replaces it is written afterwards, and if anything goes wrong in between - an
encoding error, a raised exception, a killed process, a full disk - the original
is already gone. On that day it was a lone surrogate that a shell heredoc had
made out of a doubled backslash, and the UnicodeEncodeError fired after the
truncation and before the write.

The lesson is not "be careful with heredocs". It is that the standard way to
write a file destroys the old one before the new one is known to be good.

WHAT THIS DOES INSTEAD
----------------------
Encode first. Write to a temporary file beside the target. Flush to disk. Then
os.replace, which is atomic on Windows and POSIX alike: the file is either the
old content or the new content, never nothing.

It also refuses the shapes that mean something has already gone wrong - an empty
result, or a file that lost most of itself - because a truncation caught at the
moment of writing costs nothing, and one caught in CI costs a recovery.

USAGE
-----
    from safe_edit import edit

    def change(t):
        return t.replace("old", "new")

    edit(r"C:\\path\\to\\file.jsx", change)

`edit` reads, calls the function, checks the result, and writes atomically. It
raises rather than damaging anything, so a broken edit leaves the file untouched.
"""
from __future__ import annotations

import io
import os
import tempfile
from typing import Callable

#: Losing more than this share of a file in one edit is a truncation, not an edit.
SHRINK_LIMIT = 0.70
#: Below this, percentages are noise.
SMALL_FILE_LINES = 40


class UnsafeEdit(Exception):
    """The edit was refused. The file on disk has not been touched."""


def write_atomic(path: str, text: str, encoding: str = "utf-8") -> None:
    """Replace `path` with `text`, or leave it exactly as it was.

    Encodes BEFORE opening anything for writing, so an unencodable character
    raises while the original is still intact - which is the specific failure
    this module exists for.
    """
    blob = text.encode(encoding)          # raises here, before any file is opened
    folder = os.path.dirname(os.path.abspath(path)) or "."
    fd, tmp = tempfile.mkstemp(dir=folder, prefix=".safe-", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(blob)
            fh.flush()
            os.fsync(fh.fileno())         # survive a power cut, not just an exception
        os.replace(tmp, path)             # atomic on Windows and POSIX
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def edit(path: str, change: Callable[[str], str], *, allow_shrink: bool = False,
         encoding: str = "utf-8") -> int:
    """Apply `change` to the contents of `path` and write the result atomically.

    Returns the number of characters written. Raises UnsafeEdit - without
    touching the file - if the result is empty, unchanged, or has lost most of
    the original. Pass allow_shrink=True when a large deletion is the point.
    """
    with io.open(path, encoding=encoding) as fh:
        before = fh.read()

    after = change(before)

    if after is None:
        raise UnsafeEdit(f"{path}: the change function returned None. Did it forget to return?")
    if not after.strip():
        raise UnsafeEdit(f"{path}: the result is empty. Refusing to write - this is the budz.jsx failure.")
    if after == before:
        raise UnsafeEdit(f"{path}: nothing changed. An edit that matched nothing is a silent no-op, "
                         f"and a silent no-op is how a fix gets reported as applied.")

    was, now = before.count("\n") + 1, after.count("\n") + 1
    if not allow_shrink and was >= SMALL_FILE_LINES and now < was * (1 - SHRINK_LIMIT):
        raise UnsafeEdit(
            f"{path}: would lose {round((1 - now / was) * 100)}% of the file ({was} -> {now} lines). "
            f"That is the shape of a truncation. Pass allow_shrink=True if it is deliberate.")

    write_atomic(path, after, encoding)
    return len(after)


def replace_once(path: str, old: str, new: str, **kw) -> int:
    """Replace the first occurrence of `old`, refusing if it is not present.

    The refusal matters as much as the replacement: `str.replace` on a string
    that does not contain the pattern returns the string unchanged and reports
    nothing, which is how an edit gets believed rather than verified.
    """
    def change(t: str) -> str:
        if old not in t:
            raise UnsafeEdit(f"{path}: pattern not found:\n{old[:200]}")
        return t.replace(old, new, 1)
    return edit(path, change, **kw)


if __name__ == "__main__":
    # Proves the guarantee rather than describing it: an unencodable result must
    # leave the original file byte-for-byte intact.
    import sys
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "probe.txt")
        original = "line one\nline two\n"
        write_atomic(p, original)
        try:
            edit(p, lambda t: t + "\ud83d")   # a lone surrogate: cannot be encoded
        except (UnicodeEncodeError, UnsafeEdit):
            pass
        else:
            sys.exit("safe_edit: FAIL - a lone surrogate was accepted")
        got = io.open(p, encoding="utf-8").read()
        if got != original:
            sys.exit(f"safe_edit: FAIL - file changed after a failed write: {got!r}")
        print("safe_edit: PASS - a failed write leaves the original untouched.")
