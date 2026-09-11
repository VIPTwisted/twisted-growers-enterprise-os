"""Engine bootstrap — install the streamlit shim, pin the working directory to
backend/data (the engine addresses every cache by RELATIVE path), then import
the copied engine modules (slc / planner / apex_core).

Everything in tg/ is self-contained: the engine files are COPIES living in
backend/engine, the JSON caches are COPIES living in backend/data. Nothing
imports from or writes to the old 2.0 folder.
"""

import json
import os
import sys
import time

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE_DIR = os.path.join(BACKEND_DIR, "engine")
DATA_DIR = os.path.join(BACKEND_DIR, "data")

os.makedirs(DATA_DIR, exist_ok=True)

# slc.py addresses every cache by RELATIVE path (metrc_mp_manifests.json,
# apex_inventory.json, ...) — pin the cwd before the import, same trick the
# original manifest_bridge.py used.
if os.path.abspath(os.getcwd()) != DATA_DIR:
    os.chdir(DATA_DIR)
if ENGINE_DIR not in sys.path:
    sys.path.insert(0, ENGINE_DIR)

import stshim  # noqa: E402  (registers the fake `streamlit` in sys.modules)

import slc  # noqa: E402
import planner  # noqa: E402
from apex_core import read_json, write_json, update_json, current_user  # noqa: E402,F401

# planner.py computed these against ITS OWN folder at import time — repoint
# them at the data dir so there is exactly one copy of each cache.
planner.PLANNER_FILE = os.path.join(DATA_DIR, "apex_planner.json")
planner.EMAIL_LOG_FILE = os.path.join(DATA_DIR, "apex_email_log.txt")
# planner reads .streamlit/secrets.toml under its BASE_DIR at call time.
planner.BASE_DIR = ENGINE_DIR

session_state = stshim.session_state


def progress(label="", pct=None, active=True):
    """Live task-progress channel for the frontend's top bar. Long endpoints
    report their current step here; GET /api/progress reads it concurrently
    (sync endpoints run in FastAPI's threadpool, so reads never block).
    Call progress(active=False) in a finally to clear the bar."""
    session_state["_task_progress"] = {
        "active": bool(active), "label": label, "pct": pct, "at": time.time(),
    }

# ── b-api session persistence ────────────────────────────────
# The Streamlit app kept the Firefox-grabbed session in the tab's session
# state, gone on every restart. Here it survives restarts in a local file
# (cookies only — same machine, same folder as every other cache).
SESSION_FILE = os.path.join(DATA_DIR, "bapi_session.json")


def load_saved_session():
    try:
        with open(SESSION_FILE) as f:
            s = json.load(f)
        if slc._session_ready(s):
            session_state["bapi_session"] = s
            return s
    except Exception:
        pass
    return None


def save_session(s):
    try:
        with open(SESSION_FILE, "w") as f:
            json.dump(s, f, indent=2, default=str)
    except Exception:
        pass


load_saved_session()
