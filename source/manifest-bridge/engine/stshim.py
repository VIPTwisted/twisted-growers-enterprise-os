"""Streamlit shim — lets slc.py / planner.py / apex_core.py run un-modified
inside a plain Python process (FastAPI server) with NO Streamlit installed.

The engine modules mix pure business logic (METRC pulls, Apex b-api writes,
comparisons, PDF/email builds) with Streamlit UI calls. The UI calls all
become no-ops here; the two pieces of Streamlit the ENGINE genuinely relies
on are provided for real:

  * st.session_state  ->  one global dict-like object (this is a single-user
                          local app, same as the Streamlit original where one
                          browser tab held the one session).
  * st.secrets        ->  parsed from engine/.streamlit/secrets.toml.

Import this module BEFORE importing slc/planner/apex_core — it registers
itself in sys.modules as `streamlit` (and `streamlit.components.v1`).
"""

import os
import sys
import types
import threading

_ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))


# ── session state ────────────────────────────────────────────
class SessionState(dict):
    """dict with attribute access, like streamlit's SessionState."""

    def __getattr__(self, k):
        try:
            return self[k]
        except KeyError as e:
            raise AttributeError(k) from e

    def __setattr__(self, k, v):
        self[k] = v

    def __delattr__(self, k):
        self.pop(k, None)


session_state = SessionState()
_state_lock = threading.Lock()   # available to callers that mutate concurrently


# ── secrets ──────────────────────────────────────────────────
def _load_secrets():
    path = os.path.join(_ENGINE_DIR, ".streamlit", "secrets.toml")
    try:
        import tomllib
        with open(path, "rb") as f:
            return tomllib.load(f)
    except Exception:
        return {}


secrets = _load_secrets()


# ── generic UI dummy ─────────────────────────────────────────
class _Dummy:
    """Stands in for any Streamlit element/return value. Callable, iterable,
    context-manager, attribute-chainable — and always falsy, so
    `if st.button(...)` branches never fire inside engine code."""

    def __call__(self, *a, **k):
        return _DUMMY

    def __getattr__(self, k):
        return _DUMMY

    def __enter__(self):
        return _DUMMY

    def __exit__(self, *a):
        return False

    def __bool__(self):
        return False

    def __iter__(self):
        return iter(())

    def __len__(self):
        return 0

    def __eq__(self, other):
        return other is self or other is None or other is False

    def __hash__(self):
        return 0

    def __str__(self):
        return ""

    def __repr__(self):
        return "<st-dummy>"


_DUMMY = _Dummy()


def _noop(*a, **k):
    return _DUMMY


def _columns(spec, **k):
    n = spec if isinstance(spec, int) else len(spec)
    return [_Dummy() for _ in range(max(n, 1))]


def _tabs(labels, **k):
    return [_Dummy() for _ in labels]


def _decorator(*a, **k):
    """Passthrough decorator for @st.fragment / @st.dialog("t") — the function
    runs as-is."""
    if len(a) == 1 and callable(a[0]) and not k:
        f = a[0]
        f.clear = _noop
        return f

    def deco(f):
        f.clear = _noop
        return f

    return deco


def _cache_decorator(deep_copy_result):
    """REAL memoization for @st.cache_data / @st.cache_resource — the engine
    leans on these hard (load_csv_index reads the whole CSV, and
    fetch_all_batches_indexed crawls the entire paginated /v2/batches list;
    uncached, every inventory-candidate lookup re-crawled Apex). Honors the
    ttl= kwarg, exposes .clear(), and — like Streamlit's cache_data — hands
    back a deep copy so callers mutating the result can't corrupt the cache
    (cache_resource returns the shared object, also like Streamlit)."""
    import copy
    import time as _time

    def make(*a, **k):
        ttl = k.get("ttl")

        def wrap(f):
            store = {}
            lock = threading.Lock()

            def inner(*fa, **fk):
                key = repr(fa) + "|" + repr(sorted(fk.items()))
                now = _time.time()
                with lock:
                    ent = store.get(key)
                    if ent and (ttl is None or now - ent[0] < ttl):
                        val = ent[1]
                        return copy.deepcopy(val) if deep_copy_result else val
                val = f(*fa, **fk)
                with lock:
                    store[key] = (now, val)
                return copy.deepcopy(val) if deep_copy_result else val

            inner.clear = lambda *aa, **kk: store.clear()
            inner.__name__ = getattr(f, "__name__", "cached")
            inner.__doc__ = getattr(f, "__doc__", None)
            return inner

        if len(a) == 1 and callable(a[0]) and not k:
            return wrap(a[0])
        return wrap

    return make


class StStopException(Exception):
    pass


def _stop(*a, **k):
    raise StStopException("st.stop() called inside engine code")


# ── build the fake `streamlit` module ────────────────────────
_st = types.ModuleType("streamlit")
_st.session_state = session_state
_st.secrets = secrets
_st.cache_data = _cache_decorator(True)
_st.cache_resource = _cache_decorator(False)
_st.fragment = _decorator
_st.dialog = _decorator
_st.experimental_fragment = _decorator
_st.columns = _columns
_st.tabs = _tabs
_st.stop = _stop
_st.__getattr__ = lambda name: _noop          # every other st.* is a no-op

_components_pkg = types.ModuleType("streamlit.components")
_components_v1 = types.ModuleType("streamlit.components.v1")
_components_v1.html = _noop
_components_v1.iframe = _noop
_components_pkg.v1 = _components_v1
_st.components = _components_pkg

# Streamlit runtime loggers that slc/manifest_bridge tune — must exist as paths
sys.modules["streamlit"] = _st
sys.modules["streamlit.components"] = _components_pkg
sys.modules["streamlit.components.v1"] = _components_v1
