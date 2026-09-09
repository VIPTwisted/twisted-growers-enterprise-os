"""
Packing Speed dashboard — its own tab in app21.py, fully separate from the
Planner and Orders & Picking. Reads apex_pack_stats.json (written by the
planner when orders move prep -> READY) and shows throughput metrics on a
Mon-Fri 8am-4pm working-hours clock.
"""

import streamlit as st
import json, os
from datetime import datetime, date, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PACK_STATS_FILE = os.path.join(BASE_DIR, "apex_pack_stats.json")

try:
    from apex_core import read_json, update_json
except Exception:
    def read_json(path, default):
        try:
            if os.path.exists(path):
                with open(path, "r") as f:
                    return json.load(f)
        except Exception:
            pass
        return default
    def update_json(path, default, mutate):
        data = read_json(path, default)
        if mutate(data) is not False:
            tmp = path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp, path)
        return data


# ── data layer ──────────────────────────────────────────────────────────────

def load_stats() -> list:
    return read_json(PACK_STATS_FILE, [])


def set_excluded(rec_id: str, excluded: bool):
    def _mut(stats):
        for r in stats:
            if r.get("id") == rec_id:
                r["excluded"] = excluded
                return True
        return False
    update_json(PACK_STATS_FILE, [], _mut)


# ── metrics ─────────────────────────────────────────────────────────────────

def _median(vals):
    vals = sorted(vals)
    n = len(vals)
    if not n:
        return 0.0
    return vals[n // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) / 2.0


def compute_metrics(records: list) -> dict:
    """Aggregate throughput over non-excluded records with real work time."""
    live = [r for r in records if not r.get("excluded")]
    timed = [r for r in live if (r.get("work_minutes") or 0) > 0]
    total_dollars = sum(float(r.get("total") or 0) for r in live)
    total_items = sum(int(r.get("items") or 0) for r in live)
    total_minutes = sum(float(r.get("work_minutes") or 0) for r in timed)
    dollars_timed = sum(float(r.get("total") or 0) for r in timed)
    per_min = (dollars_timed / total_minutes) if total_minutes else 0.0
    mpi = [r["work_minutes"] / r["items"] for r in timed if (r.get("items") or 0) > 0]
    return {
        "orders": len(live),
        "dollars": total_dollars,
        "items": total_items,
        "minutes": total_minutes,
        "per_min": per_min,
        "per_hr": per_min * 60.0,
        "median_min_per_item": _median(mpi),
        "median_min_per_order": _median([r["work_minutes"] for r in timed]),
    }


def _fmt_minutes(m: float) -> str:
    if m <= 0:
        return "—"
    if m >= 60:
        return f"{int(m // 60)}h {int(m % 60)}m"
    return f"{m:.0f}m"


def _in_period(rec: dict, period: str) -> bool:
    try:
        d = datetime.fromisoformat(rec.get("ready_at", "")).date()
    except Exception:
        return False
    today = date.today()
    if period == "Today":
        return d == today
    if period == "7 Days":
        return d >= today - timedelta(days=6)
    if period == "30 Days":
        return d >= today - timedelta(days=29)
    return True


# ── UI ──────────────────────────────────────────────────────────────────────

_CSS = """
<style>
.ps-cards{display:flex;gap:14px;flex-wrap:wrap;margin:6px 0 18px;}
.ps-card{flex:1;min-width:170px;background:linear-gradient(160deg,#161d2e,#111827);
  border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px 20px;}
.ps-card.hot{border-color:rgba(249,115,22,0.45);box-shadow:0 0 24px rgba(249,115,22,0.08);}
.ps-card.green{border-color:rgba(34,197,94,0.4);}
.ps-num{font-size:30px;font-weight:800;line-height:1.05;
  background:linear-gradient(90deg,#f97316,#fb923c);-webkit-background-clip:text;
  -webkit-text-fill-color:transparent;background-clip:text;}
.ps-card.green .ps-num{background:linear-gradient(90deg,#22c55e,#4ade80);
  -webkit-background-clip:text;background-clip:text;}
.ps-cap{font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;
  color:#64748b;margin-top:7px;}
.ps-sub{font-size:11.5px;font-weight:600;color:#94a3b8;margin-top:3px;}
.ps-row{background:linear-gradient(160deg,#141b2b,#101725);border:1px solid rgba(255,255,255,0.07);
  border-radius:13px;padding:12px 16px;margin-bottom:2px;}
.ps-row.excluded{opacity:0.42;}
.ps-inv{font-size:14px;font-weight:800;color:#f1f5f9;
  font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;}
.ps-co{font-size:12px;font-weight:600;color:#94a3b8;margin-top:1px;}
.ps-chip{display:inline-block;font-size:10.5px;font-weight:800;border-radius:20px;
  padding:2px 10px;margin-right:6px;margin-top:6px;border:1px solid rgba(255,255,255,0.12);
  background:rgba(255,255,255,0.04);color:#cbd5e1;}
.ps-chip.time{color:#4ade80;border-color:rgba(34,197,94,0.4);background:rgba(34,197,94,0.08);}
.ps-chip.money{color:#fb923c;border-color:rgba(249,115,22,0.4);background:rgba(249,115,22,0.08);}
.ps-chip.warn{color:#f87171;border-color:rgba(239,68,68,0.4);background:rgba(239,68,68,0.08);}
</style>
"""


def render_pack_stats():
    st.markdown(_CSS, unsafe_allow_html=True)
    st.markdown("### ⏱ Packing Speed")
    st.caption("Clock runs prep → READY, counting **Mon–Fri 8am–4pm** straight through — "
               "lunch included, because it's part of what a shift can produce. Nights and "
               "weekends never count. These are true shift-capacity numbers: $/hr here × 8 "
               "= what the team can actually clear in a day. ✕ any bad read to drop it "
               "from the stats (undo anytime).")

    stats = load_stats()
    if not stats:
        st.info("No completed packs recorded yet. Drag an order into PREPARING and then "
                "into READY on the Planner — its timing lands here automatically.")
        return

    c1, c2 = st.columns([3, 2])
    with c1:
        period = st.radio("Period", ["Today", "7 Days", "30 Days", "All Time"],
                          horizontal=True, label_visibility="collapsed")
    with c2:
        show_excluded = st.toggle("Show excluded reads", value=False)

    records = [r for r in stats if _in_period(r, period)]
    m = compute_metrics(records)

    st.markdown(f"""
    <div class="ps-cards">
      <div class="ps-card hot"><div class="ps-num">${m['per_min']:,.2f}</div>
        <div class="ps-cap">$ / Minute</div><div class="ps-sub">packing throughput</div></div>
      <div class="ps-card hot"><div class="ps-num">${m['per_hr']:,.0f}</div>
        <div class="ps-cap">$ / Hour</div><div class="ps-sub">at current pace</div></div>
      <div class="ps-card green"><div class="ps-num">${m['dollars']:,.0f}</div>
        <div class="ps-cap">Packed — {period}</div><div class="ps-sub">{m['orders']} orders · {m['items']} items</div></div>
      <div class="ps-card"><div class="ps-num">{_fmt_minutes(m['median_min_per_order'])}</div>
        <div class="ps-cap">Median / Order</div><div class="ps-sub">working-hours clock</div></div>
      <div class="ps-card"><div class="ps-num">{m['median_min_per_item']:.1f}m</div>
        <div class="ps-cap">Median / Item</div><div class="ps-sub">comparable across order sizes</div></div>
    </div>""", unsafe_allow_html=True)

    # Daily $ packed chart
    live = [r for r in records if not r.get("excluded")]
    if live:
        try:
            import pandas as pd
            df = pd.DataFrame(live)
            df["day"] = df["ready_at"].str[:10]
            daily = df.groupby("day")["total"].sum().sort_index()
            if len(daily) > 1:
                st.bar_chart(daily, height=180)
        except Exception:
            pass

    st.markdown("#### Completed packs")
    shown = [r for r in sorted(records, key=lambda r: r.get("ready_at", ""), reverse=True)
             if show_excluded or not r.get("excluded")]
    if not shown:
        st.caption("Nothing in this period.")
        return

    for r in shown[:60]:
        excluded = r.get("excluded", False)
        wm = float(r.get("work_minutes") or 0)
        items = int(r.get("items") or 0)
        total = float(r.get("total") or 0)
        mpi = (wm / items) if (wm > 0 and items > 0) else 0
        try:
            when = datetime.fromisoformat(r["ready_at"]).strftime("%a %b %d · %I:%M %p")
        except Exception:
            when = r.get("ready_at", "")
        ppm = (total / wm) if wm > 0 else 0
        packer = r.get("packer") or ""

        chips = (f'<span class="ps-chip time">⏱ {_fmt_minutes(wm)}</span>'
                 f'<span class="ps-chip money">💰 ${total:,.2f}</span>'
                 f'<span class="ps-chip">📦 {items} items</span>')
        if mpi:
            chips += f'<span class="ps-chip">{mpi:.1f} min/item</span>'
        if ppm:
            chips += f'<span class="ps-chip money">${ppm:,.0f}/min</span>'
        if packer:
            chips += f'<span class="ps-chip">👤 {packer}</span>'
        if wm <= 0:
            chips += '<span class="ps-chip warn">no work-hours time — check this read</span>'

        col_info, col_btn = st.columns([11, 1])
        with col_info:
            st.markdown(f"""
            <div class="ps-row{' excluded' if excluded else ''}">
              <span class="ps-inv">🧾 {r.get('invoice','')}</span>
              <span class="ps-co"> — {r.get('company','')} · ready {when}</span><br>{chips}
            </div>""", unsafe_allow_html=True)
        with col_btn:
            if excluded:
                if st.button("↩", key=f"ps_undo_{r['id']}", help="Restore this read into the stats"):
                    set_excluded(r["id"], False)
                    st.rerun()
            else:
                if st.button("✕", key=f"ps_x_{r['id']}", help="Exclude this read from the stats"):
                    set_excluded(r["id"], True)
                    st.rerun()

    if len(shown) > 60:
        st.caption(f"Showing the 60 most recent of {len(shown)} records.")