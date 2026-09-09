"""
apex_core.py — shared foundation for the Apex Picking Manager.

1. SAFE STORAGE: locked, atomic JSON read/write so two users saving at the
   same moment can never corrupt a file or interleave writes.
2. LOGIN: username/password auth with salted PBKDF2 hashes stored in
   .streamlit/secrets.toml, roles (admin / packer), and per-tab sessions.

Generate a password entry with:   python apex_core.py hash
"""

import streamlit as st
import json, os, time, hashlib, secrets as pysecrets

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


# ════════════════════════════════════════════════════════════════════════════
# 1. LOCKED, ATOMIC JSON STORAGE
# ════════════════════════════════════════════════════════════════════════════

_LOCK_TIMEOUT = 6.0      # seconds to wait for a lock before giving up
_LOCK_STALE = 12.0       # a lock file older than this is from a crashed run


class _FileLock:
    """Cross-platform lock via exclusive lock-file creation. No dependencies."""

    def __init__(self, path: str):
        self.lock_path = path + ".lock"

    def __enter__(self):
        deadline = time.time() + _LOCK_TIMEOUT
        while True:
            try:
                fd = os.open(self.lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, str(os.getpid()).encode())
                os.close(fd)
                return self
            except FileExistsError:
                # break stale locks left behind by a crashed process
                try:
                    if time.time() - os.path.getmtime(self.lock_path) > _LOCK_STALE:
                        os.remove(self.lock_path)
                        continue
                except OSError:
                    pass
                if time.time() > deadline:
                    # last resort: proceed unlocked rather than hang the app;
                    # atomic replace below still prevents torn files
                    return self
                time.sleep(0.05)

    def __exit__(self, *a):
        try:
            os.remove(self.lock_path)
        except OSError:
            pass
        return False


def read_json(path: str, default):
    """Lock-free read. Writers replace the file atomically (os.replace), so a
    reader always sees a complete old or new file — the exclusive lock the
    reads used to take only added two lock-file syscalls per read and made
    readers block each other. Returns default on missing/corrupt file."""
    try:
        if os.path.exists(path):
            with open(path, "r") as f:
                return json.load(f)
    except Exception:
        pass
    return default


def _replace_retry(tmp: str, path: str, attempts: int = 5, delay: float = 0.02):
    """os.replace with a brief retry: on Windows, replacing a file a reader
    momentarily has open raises PermissionError (readers are lock-free now)."""
    for i in range(attempts):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            if i == attempts - 1:
                raise
            time.sleep(delay)


def write_json(path: str, data, indent=2):
    """Atomic write under lock: temp file + os.replace, so a file on disk is
    always complete valid JSON even if the process dies mid-write.
    Pass indent=None for multi-MB caches — pretty-printing inflates them ~50%."""
    with _FileLock(path):
        tmp = f"{path}.tmp.{os.getpid()}.{pysecrets.token_hex(3)}"
        try:
            with open(tmp, "w") as f:
                json.dump(data, f, indent=indent)
                f.flush()
                os.fsync(f.fileno())
            _replace_retry(tmp, path)
        except BaseException:
            try:
                os.remove(tmp)
            except OSError:
                pass
            raise


def update_json(path: str, default, mutate):
    """Read-modify-write as ONE locked operation (no lost updates):
    mutate(data) edits in place and returns anything truthy to save."""
    with _FileLock(path):
        data = default
        try:
            if os.path.exists(path):
                with open(path, "r") as f:
                    data = json.load(f)
        except Exception:
            data = default
        result = mutate(data)
        if result is not False:
            tmp = f"{path}.tmp.{os.getpid()}.{pysecrets.token_hex(3)}"
            try:
                with open(tmp, "w") as f:
                    json.dump(data, f, indent=2)
                    f.flush()
                    os.fsync(f.fileno())
                _replace_retry(tmp, path)
            except BaseException:
                try:
                    os.remove(tmp)
                except OSError:
                    pass
                raise
        return data


# ════════════════════════════════════════════════════════════════════════════
# 2. LOGIN / AUTH
# ════════════════════════════════════════════════════════════════════════════

_PBKDF2_ITERS = 240_000


def hash_password(plain: str) -> str:
    salt = pysecrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", plain.encode(), bytes.fromhex(salt), _PBKDF2_ITERS)
    return f"pbkdf2${salt}${h.hex()}"


def verify_password(plain: str, stored: str) -> bool:
    try:
        if stored.startswith("plain$"):          # quick-start option, discouraged
            return pysecrets.compare_digest(plain, stored[6:])
        scheme, salt, want = stored.split("$", 2)
        if scheme != "pbkdf2":
            return False
        h = hashlib.pbkdf2_hmac("sha256", plain.encode(), bytes.fromhex(salt), _PBKDF2_ITERS)
        return pysecrets.compare_digest(h.hex(), want)
    except Exception:
        return False


def _users() -> dict:
    """[users.<name>] password=... role=...  from secrets.toml"""
    try:
        u = st.secrets.get("users", {})
        return {k: dict(v) for k, v in u.items()}
    except Exception:
        return {}


_LOGIN_CSS = """
<style>
.login-wrap{max-width:400px;margin:8vh auto 0;}
.login-card{background:linear-gradient(160deg,#161d2e,#111827);border:1px solid rgba(249,115,22,0.3);
  border-radius:18px;padding:30px 30px 12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);}
.login-title{font-size:22px;font-weight:800;color:#f1f5f9;text-align:center;margin-bottom:2px;}
.login-sub{font-size:12px;font-weight:600;color:#64748b;text-align:center;margin-bottom:16px;
  letter-spacing:1.5px;text-transform:uppercase;}
</style>
"""


def require_login():
    """Gate the whole app. Returns (username, role) once authenticated;
    renders the login screen and stops the script otherwise."""
    users = _users()
    if not users:
        st.error("No users configured. Add a [users.<name>] section to "
                 ".streamlit/secrets.toml (see the template) and restart.")
        st.stop()

    auth = st.session_state.get("auth")
    if auth and auth.get("user") in users:
        return auth["user"], auth.get("role", "packer")

    st.markdown(_LOGIN_CSS, unsafe_allow_html=True)
    st.markdown('<div class="login-wrap"><div class="login-card">'
                '<div class="login-title">🔶 Apex Picking Manager</div>'
                '<div class="login-sub">Sign in to continue</div></div></div>',
                unsafe_allow_html=True)
    _, mid, _ = st.columns([1, 2, 1])
    with mid:
        with st.form("apex_login"):
            username = st.text_input("Username")
            password = st.text_input("Password", type="password")
            ok = st.form_submit_button("Sign In", use_container_width=True, type="primary")
        if ok:
            u = users.get(username.strip())
            if u and verify_password(password, str(u.get("password", ""))):
                st.session_state.auth = {"user": username.strip(),
                                         "role": str(u.get("role", "packer"))}
                st.rerun()
            else:
                time.sleep(0.7)  # slow brute-force attempts
                st.error("Wrong username or password.")
    st.stop()


def current_user() -> str:
    """Username of whoever is driving this session ('' if not authed)."""
    try:
        return (st.session_state.get("auth") or {}).get("user", "")
    except Exception:
        return ""


def logout_button():
    if st.button("Log out", key="apex_logout"):
        st.session_state.pop("auth", None)
        st.rerun()


# ── CLI: generate password hashes ───────────────────────────────────────────
if __name__ == "__main__":
    import sys, getpass
    if len(sys.argv) > 1 and sys.argv[1] == "hash":
        pw = getpass.getpass("Password to hash: ")
        print("\nPut this in .streamlit/secrets.toml under the user:\n")
        print(f'password = "{hash_password(pw)}"')
    else:
        print("Usage: python apex_core.py hash")