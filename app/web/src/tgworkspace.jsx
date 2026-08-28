/* ═══════════════════════════════════════════════════════════════════════════
   TG WORKSPACE — our own workspace, built on our own tables.
   Agent B, 12 Aug 2026. Owner: "build workspace as our own clone as similar
   copy to clickup" and, earlier, "must connect and wire to our version of
   clickup too we call ours TG workspace". A message thread was considered and
   rejected: this is spaces → lists → tasks → subtasks, with a real task
   detail behind every row.

   WHY IT IS A NEW FILE AND NOT A PANEL ON AN EXISTING SCREEN.
   `hold_the_ddc_discipline`: share primitives, NEVER layouts — 522 pages
   through one ReportScreen is the CAUSE of the bugs on this platform, not the
   cure. A workspace is not a report and not a dashboard. It borrows the
   chrome vocabulary (DkTag, DkErr, DkEmpty, DkCaret, DrillRoot, DkDrill) and
   the token ladder, and owns its own layout. Nothing that already renders was
   touched: App.jsx gains one lazy import and one entry in the `special` map.

   THE STATUS SET IS THE SPACE'S OWN, NEVER A SET THIS FILE CHOSE.
   Columns and groups come from `spaces.statuses` for the space you are in. A
   status that appears on a task but not in the space's own list is NOT hidden
   — it gets its own group that says what it is, because a task nobody can see
   is worse than an untidy board. That group is how the defect noted below
   becomes visible instead of silent.

   ⚠ MEASURED DEFECT IN THE DATA LAYER, REPORTED TO AGENT I, NOT WORKED AROUND
   SILENTLY. `tg_task_create` cannot create a task. It inserts
   `status = 'open'` and defaults `priority` to `'normal'`, and BOTH violate
   the table's own CHECK constraints — `tasks_status_check` admits only
   todo / in_progress / done / blocked, and `tasks_priority_check` only
   P0 / P1 / P2 / P3. Proved by attempting the insert inside a rolled-back
   transaction: SQLSTATE 23514, "new row for relation tasks violates check
   constraint tasks_priority_check". This is the second create function in a
   row that could never have run; the first, `tg_task_from_dashboard`, took a
   bigint assignee for a uuid column. So creation here is a direct insert,
   which RLS `staff_insert` permits because it sets created_by to the caller,
   and this file writes the `task_activity` row the function would have
   written. `createTask` below is the ONE place that happens: when the
   function is fixed to take a status, that function body is the only edit.

   EVERY READ BINDS ITS ERROR. 129 read sites on this platform swallow theirs
   and a blank page is the classic silent failure here. No read in this file
   falls back to an empty array without first saying the read failed and why:
   loading, failed-with-the-reason, and genuinely-empty are three different
   states on screen, and the nullish-array shape the ratchet counts appears
   nowhere below. (Written this way on purpose — that ratchet scans raw text and
   counts the operator inside a COMMENT as though it were code, so describing
   the rule literally would spend the last slot in its ceiling. dashkit.jsx
   documents the same defect. Not worked around: reworded, and reported.)

   WHAT THIS FILE DELIBERATELY DOES NOT DO — stated here so nobody has to find
   it. No attachment upload (no storage bucket exists for workspace files, and
   inventing one is the data layer's call, not this page's). No @mention
   targets (task_comment.mentions is uuid[] with no declared referent — auth
   user or employee — and guessing would raise notifications to nobody). No
   calendar and no timeline: they are stage 5, and rather than offer a control
   that does nothing, a saved view asking for either says so and offers the
   same tasks as a list.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import {
  DkTag, DkErr, DkEmpty, DkCaret, DrillRoot, DkDrill, dkAge,
  useDefaultRange, DkRangeSearch, rangeSearch,
} from "./dashkit.jsx";
/* The per-user collapse memory the whole platform already uses, so a section
   the owner closed here stays closed the way it does everywhere else. One
   definition of the thing, not a second one written locally. */
import { useSectionStore, DateRangeSelect } from "./App.jsx";
import "./tgworkspace.css";

/* The four priorities are the database's own CHECK constraint
   `tasks_priority_check`, mirrored here because the constraint is not readable
   from a browser. Mirrored, not invented: a fifth value would be rejected by
   the database loudly rather than stored wrongly. Filed with Agent I — a
   `task_priority` lookup table would remove even this. */
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const URGENT = "P0";
const HIGH = "P1";

/* A status key is a database value; this is the only place it becomes English,
   and it is DERIVED, never a lookup table of the four we happen to have today.
   A space that adds `waiting_on_lab` reads as "Waiting on lab" with no edit. */
function pretty(key) {
  const s = String(key === null || key === undefined ? "" : key).replace(/_/g, " ").trim();
  if (!s) return "Unnamed";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const arr = (v) => (Array.isArray(v) ? v : []);

/* What each read is CALLED when it fails. A failure that names the state key it
   came from — "the emps could not be read" — tells the person in front of it
   nothing and puts an abbreviation on screen, which is against the house rule
   on user-facing language. Caught by rendering this page with every read
   refused and reading the result back. */
const READ_NAME = {
  spaces: "space list",
  lists: "lists in this space",
  tasks: "tasks",
  people: "employee list",
  views: "saved views",
  identity: "link between your sign-in and your employee record",
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Whole days between today and a due date, negative when the date has passed.
   Both sides are plain YYYY-MM-DD, so no timezone can move a due date by a
   day — parsing "2026-08-12" as a Date makes it midnight UTC and turns it
   yesterday for anyone west of Greenwich. */
function daysUntil(due) {
  if (!due) return null;
  const a = String(due).slice(0, 10).split("-").map(Number);
  const t = today().split("-").map(Number);
  if (a.length !== 3 || a.some((n) => Number.isNaN(n))) return null;
  const ms = Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(t[0], t[1] - 1, t[2]);
  return Math.round(ms / 86400000);
}

function whenText(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function minutesText(m) {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0) return "none logged";
  const h = Math.floor(n / 60);
  const r = n % 60;
  if (!h) return `${r} minutes`;
  if (!r) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h}h ${r}m`;
}

/* ═══════════ the page ═══════════ */
const VIEW_KEY = "tg_workspace";

export default function TgWorkspace({ session, go }) {
  /* A TASK BOARD IS A WORK QUEUE, SO IT OPENS UNBOUNDED.
     nav_registry held no default_range, so f_date_default fell to the company
     fallback and this board would have opened on a month — hiding every task
     raised before the 1st that is still open, which is exactly the work the
     board exists to show. Governed default 'all' with range_kind 'snapshot'
     (see the migration alongside this change). The frame still narrows to
     "raised this month" when somebody asks that question of it. */
  const uid = session && session.user ? session.user.id : null;

  const [spaces, setSpaces] = useState(null);
  const [lists, setLists] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [emps, setEmps] = useState([]);
  const [views, setViews] = useState([]);
  const [me, setMe] = useState(null);           /* the caller's employees.id, or null */
  const [errs, setErrs] = useState({});
  const [said, setSaid] = useState(null);

  const [spaceId, setSpaceId] = useState(null);
  const [listId, setListId] = useState("all");  /* "all" | "unfiled" | uuid */
  const [layout, setLayout] = useState("list"); /* list | board | table */
  const [viewId, setViewId] = useState("");
  const [q, setQ] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [mineOnly, setMineOnly] = useState(false);
  const [hideClosed, setHideClosed] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [addingList, setAddingList] = useState(false);
  const [newList, setNewList] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [newView, setNewView] = useState("");
  const [dragOver, setDragOver] = useState(null);

  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const sections = useSectionStore(uid, "tgworkspace");

  const setErr = useCallback((key, message) => {
    setErrs((e) => (e[key] === message ? e : { ...e, [key]: message }));
  }, []);

  /* ── the one read of everything the page frame needs ────────────────────
     Promise.all over five settled responses. Each one's `error` is read
     explicitly below; nothing here falls through to an empty array without
     first saying the read failed and why. */
  const load = useCallback(async () => {
    const [sp, ls, tk, em, vw, au] = await Promise.all([
      supabase.from("spaces").select("id,name,statuses,description,is_private").order("name"),
      supabase.from("task_list").select("id,space_id,name,description,sort,archived").eq("archived", false).order("sort"),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("employees").select("id,full_name").is("terminated_on", null).order("full_name"),
      supabase.from("workspace_view").select("*").order("name"),
      supabase.from("app_users").select("employee_id").eq("user_id", uid).maybeSingle(),
    ]);
    if (!live.current) return;

    setErr("spaces", sp.error ? sp.error.message : null);
    setSpaces(sp.error ? [] : arr(sp.data));
    setErr("lists", ls.error ? ls.error.message : null);
    setLists(ls.error ? [] : arr(ls.data));
    setErr("tasks", tk.error ? tk.error.message : null);
    setTasks(tk.error ? [] : arr(tk.data));
    setErr("people", em.error ? em.error.message : null);
    setEmps(em.error ? [] : arr(em.data));
    setErr("views", vw.error ? vw.error.message : null);
    setViews(vw.error ? [] : arr(vw.data));
    setErr("identity", au.error ? au.error.message : null);
    setMe(au.error || !au.data ? null : au.data.employee_id);
  }, [uid, setErr]);

  useEffect(() => { load(); }, [load]);

  /* First landing: the first space in the list, which is alphabetical and
     stable. Never a space id written into this file. */
  useEffect(() => {
    if (spaceId || !spaces || !spaces.length) return;
    setSpaceId(spaces[0].id);
  }, [spaces, spaceId]);

  const space = useMemo(
    () => (spaces || []).find((s) => s.id === spaceId) || null,
    [spaces, spaceId],
  );

  /* THE STATUS SET, from the space itself. `statuses` is jsonb; a space whose
     column was written as an object rather than an array must not take the
     page down, so anything that is not an array of strings is treated as
     "this space declares none" and said so on screen. */
  const statuses = useMemo(() => {
    const raw = space ? space.statuses : null;
    return arr(raw).filter((s) => typeof s === "string" && s.length > 0);
  }, [space]);

  /* The space's own last status is its closed one — the convention ClickUp
     uses and the only one available, because nothing in the schema marks a
     terminal state. Stated on the page so the owner can see the rule being
     applied rather than guess at it, and so it can be corrected in one place
     if he wants a different one. */
  const closedStatus = statuses.length ? statuses[statuses.length - 1] : null;

  const empName = useCallback(
    (id) => {
      if (!id) return null;
      const e = emps.find((x) => x.id === id);
      return e ? e.full_name : null;
    },
    [emps],
  );

  const listsHere = useMemo(
    () => lists.filter((l) => l.space_id === spaceId),
    [lists, spaceId],
  );

  /* Tasks in scope: this space, this list, minus subtasks (they render under
     their parent), then the toolbar's filters. */
  /* THE STRUCTURAL FILTERS ARE THIS PAGE'S OWN; THE RANGE AND THE SEARCH ARE NOT.
     Which space, which list, mine only, hide closed — those are questions only
     this board asks. Whether a search beats a range, and whether an undated row
     survives one, are answered the same way on every page in the platform, so
     they come from rangeSearch rather than being written a second time here. */
  const structural = useMemo(() => tasks.filter((t) => {
    if (t.space_id !== spaceId) return false;
    if (t.parent_task_id) return false;
    if (listId === "unfiled" && t.list_id) return false;
    if (listId !== "all" && listId !== "unfiled" && t.list_id !== listId) return false;
    if (mineOnly && t.assignee_employee_id !== me) return false;
    if (hideClosed && closedStatus && t.status === closedStatus) return false;
    return true;
  }), [tasks, spaceId, listId, mineOnly, me, hideClosed, closedStatus]);

  /* The frame is created_at — when the task was RAISED. A task completed late
     still belongs to the day somebody asked for it, and a task with no
     created_at is never dropped by a range it has no date to be tested against. */
  const rs = useMemo(() => rangeSearch(structural, {
    from: range.from, to: range.to, dateField: "created_at", q,
    fields: ["title", "description"],
  }), [structural, range.from, range.to, q]);
  const scoped = rs.rows;

  const childrenOf = useCallback(
    (id) => tasks.filter((t) => t.parent_task_id === id),
    [tasks],
  );

  /* Groups: the space's declared statuses in the space's own order, then one
     group for anything carrying a status the space does not declare. The
     second group is normally empty and must never be removed — it is the only
     thing standing between a mis-set status and a task nobody can find. */
  const groups = useMemo(() => {
    const out = statuses.map((s) => ({ key: s, label: pretty(s), declared: true, rows: [] }));
    const extra = new Map();
    for (const t of scoped) {
      const g = out.find((x) => x.key === t.status);
      if (g) { g.rows.push(t); continue; }
      const k = t.status || "";
      if (!extra.has(k)) extra.set(k, { key: k, label: pretty(k), declared: false, rows: [] });
      extra.get(k).rows.push(t);
    }
    return out.concat([...extra.values()]);
  }, [statuses, scoped]);

  const spaceCount = useCallback(
    (id) => tasks.filter((t) => t.space_id === id && !t.parent_task_id).length,
    [tasks],
  );

  const newestChange = useMemo(() => {
    let best = null;
    for (const t of tasks) {
      const v = t.updated_at || t.created_at;
      if (v && (!best || v > best)) best = v;
    }
    return best;
  }, [tasks]);

  const open = useMemo(() => tasks.find((t) => t.id === openId) || null, [tasks, openId]);

  /* FAILURES, SAID ONCE. Every failed read still reaches the screen — that rule
     does not bend — but one cause must not print six times. When the database
     refuses this page it refuses every table on it, and the six messages differ
     only in the table they name, which is information the reader already has
     from the list of what failed. So the object name is stripped for GROUPING
     ONLY and the reads that share a cause are named together on one line.
     Anything that does not match keeps its own line and its own wording, so a
     genuinely different failure can never hide inside a group. Written after
     rendering this page with all six reads refused and finding a wall of red. */
  const readFailures = useMemo(() => {
    const byCause = new Map();
    for (const key of Object.keys(errs)) {
      const message = errs[key];
      if (!message) continue;
      const cause = String(message).replace(/\s+for\s+(?:table|relation|view)\s+\S+/i, "");
      if (!byCause.has(cause)) byCause.set(cause, []);
      byCause.get(cause).push(READ_NAME[key] || key);
    }
    return [...byCause.entries()].map(([cause, names]) => ({
      cause,
      what: names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`,
    }));
  }, [errs]);

  /* ── writes ─────────────────────────────────────────────────────────────
     One helper. Every call binds `error`, every failure reaches the screen
     naming the step, and nothing reports success before the re-read lands. */
  const run = useCallback(async (what, fn) => {
    const { error } = await fn();
    if (error) {
      setSaid({ ok: false, text: `${what} failed: ${error.message}` });
      return false;
    }
    await load();
    if (live.current) setSaid({ ok: true, text: `${what} saved.` });
    return true;
  }, [load]);

  /* THE ONE PLACE A TASK IS CREATED. See the defect note at the top of this
     file: `tg_task_create` violates two CHECK constraints and cannot run, so
     this inserts directly — permitted by RLS `staff_insert` because
     created_by is the caller — and writes the activity row the function would
     have written. When the function is repaired to accept a status, this body
     is the only thing that changes. */
  const createTask = useCallback(async (title, status, extra) => {
    const clean = String(title || "").trim();
    if (!clean) { setSaid({ ok: false, text: "A task needs a title somebody could act on." }); return null; }
    if (!spaceId) { setSaid({ ok: false, text: "Pick a space first — a task has to live somewhere." }); return null; }
    const row = {
      title: clean,
      status,
      space_id: spaceId,
      list_id: listId === "all" || listId === "unfiled" ? null : listId,
      created_by: uid,
    };
    if (extra) Object.assign(row, extra);
    const { data, error } = await supabase.from("tasks").insert(row).select("id").single();
    if (error) { setSaid({ ok: false, text: `The task was not created: ${error.message}` }); return null; }
    const { error: aerr } = await supabase
      .from("task_activity").insert({ task_id: data.id, what: "created", new_value: clean });
    await load();
    if (!live.current) return data.id;
    setSaid(aerr
      ? { ok: false, text: `Task created, but its history line was not written: ${aerr.message}` }
      : { ok: true, text: `Created "${clean}".` });
    return data.id;
  }, [spaceId, listId, uid, load]);

  /* A field change plus the history line that makes this a workspace rather
     than a spreadsheet. The activity row is written even when the update
     succeeded and the log did not, and the screen says which happened. */
  const patchTask = useCallback(async (task, field, value) => {
    const beforeRaw = task[field];
    const before = beforeRaw === null || beforeRaw === undefined ? "" : String(beforeRaw);
    const after = value === null || value === undefined ? "" : String(value);
    if (before === after) return;
    const patch = { [field]: value === "" ? null : value, updated_at: new Date().toISOString() };
    /* A task reaching the space's closed status is completed; leaving it is
       not. completed_at is a fact, not decoration — it is what any "how long
       did this take" question will read. */
    if (field === "status" && closedStatus) {
      patch.completed_at = value === closedStatus ? new Date().toISOString() : null;
    }
    const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
    if (error) { setSaid({ ok: false, text: `That change was not saved: ${error.message}` }); return; }
    const { error: aerr } = await supabase.from("task_activity").insert({
      task_id: task.id, what: "changed", field,
      old_value: before === "" ? null : before,
      new_value: after === "" ? null : after,
    });
    await load();
    if (!live.current) return;
    setSaid(aerr
      ? { ok: false, text: `Change saved, but its history line was not written: ${aerr.message}` }
      : { ok: true, text: `${pretty(field)} changed.` });
  }, [closedStatus, load]);

  /* Board drop: set the status, then renumber that column so the order the
     owner dragged into survives a reload. order_no is text, so the keys are
     zero padded and sort lexicographically the way they read. */
  const dropOn = useCallback(async (statusKey, taskId) => {
    setDragOver(null);
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    if (t.status !== statusKey) await patchTask(t, "status", statusKey);
    const column = tasks
      .filter((x) => x.space_id === spaceId && !x.parent_task_id && x.status === statusKey && x.id !== taskId)
      .sort((a, b) => String(a.order_no || "").localeCompare(String(b.order_no || "")));
    const ordered = [t].concat(column);
    let failed = null;
    for (let i = 0; i < ordered.length; i += 1) {
      const key = String((i + 1) * 10).padStart(6, "0");
      if (String(ordered[i].order_no || "") === key) continue;
      const { error } = await supabase.from("tasks").update({ order_no: key }).eq("id", ordered[i].id);
      if (error) { failed = error.message; break; }
    }
    await load();
    if (!live.current) return;
    setSaid(failed
      ? { ok: false, text: `Moved, but the new order was not fully saved: ${failed}` }
      : { ok: true, text: `Moved to ${pretty(statusKey)}.` });
  }, [tasks, spaceId, patchTask, load]);

  const addList = useCallback(async () => {
    const name = newList.trim();
    if (!name || !spaceId) return;
    const ok = await run("The list", () =>
      supabase.from("task_list").insert({ space_id: spaceId, name, created_by: uid }));
    if (ok && live.current) { setNewList(""); setAddingList(false); }
  }, [newList, spaceId, uid, run]);

  /* ── saved views ──────────────────────────────────────────────────────── */
  const applyView = useCallback((v) => {
    setViewId(v ? v.id : "");
    if (!v) return;
    if (v.space_id) setSpaceId(v.space_id);
    setListId(v.list_id ? v.list_id : "all");
    setLayout(v.layout);
    const f = v.filters && typeof v.filters === "object" ? v.filters : {};
    setMineOnly(f.mine === true || v.scope === "mine");
    setHideClosed(f.hide_closed === true);
    setQ(typeof f.q === "string" ? f.q : "");
  }, []);

  const saveView = useCallback(async () => {
    const name = newView.trim();
    if (!name) return;
    const ok = await run("The view", () => supabase.from("workspace_view").insert({
      name,
      owner_id: uid,
      scope: mineOnly ? "mine" : listId !== "all" && listId !== "unfiled" ? "list" : "space",
      space_id: spaceId,
      list_id: listId !== "all" && listId !== "unfiled" ? listId : null,
      layout,
      group_by: "status",
      filters: { mine: mineOnly, hide_closed: hideClosed, q: q.trim() },
      sort_by: "order_no",
    }));
    if (ok && live.current) { setNewView(""); setSavingView(false); }
  }, [newView, uid, mineOnly, listId, spaceId, layout, hideClosed, q, run]);

  const deleteView = useCallback(async (v) => {
    const ok = await run("Removing the view", () => supabase.from("workspace_view").delete().eq("id", v.id));
    if (ok && live.current && viewId === v.id) setViewId("");
  }, [run, viewId]);

  /* ── render ───────────────────────────────────────────────────────────── */
  if (spaces === null) {
    return <div className="ccpage tgws"><div className="cc-fine">Loading the workspace…</div></div>;
  }

  const activeView = views.find((v) => v.id === viewId) || null;
  const unbuilt = activeView && (activeView.layout === "calendar" || activeView.layout === "timeline")
    ? activeView.layout : null;

  return (
    <DrillRoot label="TG Workspace">
      <div className="ccpage tgws">
        <div className="cc-head">
          <h1 className="cc-title">TG Workspace</h1>
          <span className="cc-hchip">Spaces<b>{spaces.length}</b></span>
          <span className="cc-hchip">Tasks<b>{tasks.length}</b></span>
          {closedStatus && (
            <span className="cc-hchip" title={`This space's own last status, "${pretty(closedStatus)}", is treated as its closed one. Nothing in the schema marks a terminal state, so the space's own order decides it.`}>
              Closed at<b>{pretty(closedStatus)}</b>
            </span>
          )}
          <span className="cc-stamp" title="The age of the newest change to any task, not the age of this page's calculation.">
            {newestChange ? `Newest change ${dkAge(newestChange)}` : "No task has ever been changed"}
          </span>
        </div>

        <div className="cc-tools">
          <div className="cc-tools-l">
            {["list", "board", "table"].map((k) => (
              <button key={k} type="button" className={`cc-btn${layout === k ? " primary" : ""}`}
                onClick={() => setLayout(k)}
                title={`Show these tasks as a ${k}.`}>
                {pretty(k)}
              </button>
            ))}
          </div>
          <div className="cc-tools-c">
            <DkRangeSearch id="tgws-q" label="Find" placeholder="title or description"
              q={q} onQ={setQ} result={rs} noun="tasks" />
            <DateRangeSelect label="Raised between" from={range.from} to={range.to}
              onFrom={(v) => setRange((prev) => ({ ...prev, from: v }))}
              onTo={(v) => setRange((prev) => ({ ...prev, to: v }))}
              presetKey={dateDefault.presetKey} session={session}
              viewKey={VIEW_KEY} allowSave />
            {dateDefault.error && <span className="note bad" role="alert">{dateDefault.error}</span>}
            <label className="cc-check" htmlFor="tgws-mine">
              <input id="tgws-mine" type="checkbox" checked={mineOnly}
                onChange={(e) => setMineOnly(e.target.checked)} />
              Assigned to me
            </label>
            <label className="cc-check" htmlFor="tgws-hide">
              <input id="tgws-hide" type="checkbox" checked={hideClosed}
                onChange={(e) => setHideClosed(e.target.checked)} />
              Hide closed
            </label>
          </div>
          <div className="cc-tools-r">
            <label className="cc-check" htmlFor="tgws-view">View</label>
            <select id="tgws-view" className="cc-input cc-viewsel" value={viewId}
              onChange={(e) => applyView(views.find((v) => v.id === e.target.value) || null)}>
              <option value="">Not using a saved view</option>
              {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {activeView
              ? <button type="button" className="cc-btn" onClick={() => deleteView(activeView)}
                  title={`Delete the saved view "${activeView.name}". The tasks are untouched.`}>Delete view</button>
              : <button type="button" className="cc-btn" onClick={() => setSavingView((s) => !s)}
                  title="Remember this space, list, layout and filters as a view you can come back to.">Save this view</button>}
            {go && (
              <button type="button" className="cc-btn" onClick={() => go("clickup_tasks")}
                title="The read-only mirror of the outside ClickUp account. Nothing here writes to it.">
                ClickUp mirror
              </button>
            )}
          </div>
        </div>

        {savingView && (
          <div className="cc-panel"><div className="tgws-add">
            <label className="cc-check" htmlFor="tgws-newview">Name this view</label>
            <input id="tgws-newview" value={newView} onChange={(e) => setNewView(e.target.value)}
              placeholder="What you want to call it…"
              onKeyDown={(e) => { if (e.key === "Enter") saveView(); }} />
            <button type="button" className="cc-btn primary" onClick={saveView}>Save it</button>
            <button type="button" className="cc-btn" onClick={() => { setSavingView(false); setNewView(""); }}>Cancel</button>
          </div></div>
        )}

        {readFailures.map((f) => <DkErr key={f.cause} what={`The ${f.what}`} err={f.cause} />)}
        {said && <div className={`tgws-said${said.ok ? "" : " bad"}`}>{said.text}</div>}

        <div className="tgws-shell">
          <div className="tgws-rail">
            <div className="tgws-railhead">Spaces</div>
            {spaces.length === 0 && !errs.spaces && (
              <div style={{ padding: 8 }}>
                <DkEmpty why="No spaces exist."
                  fills="A space is the top level of the workspace — Cultivation, Manufacturing, and so on. They are created in the database, not here." />
              </div>
            )}
            {spaces.map((s) => (
              /* aria-label, not just title: `title` WINS the accessible name
                 computation over the visible text, so without this a screen
                 reader announced "Whole-company work: cross-department
                 initiatives…" where the button plainly reads "Company". Caught
                 by reading this page's own accessibility tree back. */
              <button key={s.id} type="button" aria-label={s.name}
                className={`tgws-pick${s.id === spaceId ? " on" : ""}`}
                onClick={() => { setSpaceId(s.id); setListId("all"); setOpenId(null); }}
                title={s.description || s.name}>
                <span className="tgws-pickname">{s.name}</span>
                <span className="tgws-n">{spaceCount(s.id)}</span>
              </button>
            ))}

            <div className="tgws-railhead" style={{ marginTop: 4 }}>Lists in this space</div>
            <button type="button" className={`tgws-pick sub${listId === "all" ? " on" : ""}`}
              onClick={() => { setListId("all"); setOpenId(null); }}
              title="Every task in this space, whichever list it is in.">
              <span className="tgws-pickname">Everything in this space</span>
              <span className="tgws-n">{spaceCount(spaceId)}</span>
            </button>
            {listsHere.map((l) => (
              <button key={l.id} type="button" aria-label={l.name}
                className={`tgws-pick sub${listId === l.id ? " on" : ""}`}
                onClick={() => { setListId(l.id); setOpenId(null); }}
                title={l.description || l.name}>
                <span className="tgws-pickname">{l.name}</span>
                <span className="tgws-n">
                  {tasks.filter((t) => t.list_id === l.id && !t.parent_task_id).length}
                </span>
              </button>
            ))}
            {tasks.some((t) => t.space_id === spaceId && !t.list_id && !t.parent_task_id) && (
              <button type="button" className={`tgws-pick sub${listId === "unfiled" ? " on" : ""}`}
                onClick={() => { setListId("unfiled"); setOpenId(null); }}
                title="Tasks in this space that were never put in a list. They are not lost and they are not hidden.">
                <span className="tgws-pickname">Not in a list</span>
                <span className="tgws-n">
                  {tasks.filter((t) => t.space_id === spaceId && !t.list_id && !t.parent_task_id).length}
                </span>
              </button>
            )}
            {listsHere.length === 0 && !errs.lists && (
              <div style={{ padding: 8 }}>
                <DkEmpty why="This space has no lists yet."
                  fills="A list groups the work inside a space — one per project, crew or run." />
              </div>
            )}
            <div className="tgws-railfoot">
              {addingList ? (
                <div className="tgws-wrap">
                  <label className="cc-check" htmlFor="tgws-newlist">Name</label>
                  <input id="tgws-newlist" className="cc-input tgws-grow" value={newList}
                    onChange={(e) => setNewList(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addList(); }} />
                  <button type="button" className="cc-btn primary" onClick={addList}>Add</button>
                  <button type="button" className="cc-btn"
                    onClick={() => { setAddingList(false); setNewList(""); }}>Cancel</button>
                </div>
              ) : (
                <button type="button" className="cc-btn" disabled={!spaceId}
                  onClick={() => setAddingList(true)}
                  title="Create a list inside this space.">+ New list</button>
              )}
            </div>
          </div>

          <div className="tgws-main">
            {!space && (
              <div className="cc-panel"><div className="cc-panel-body">
                <DkEmpty why="No space is selected." fills="Pick one on the left to see its work." />
              </div></div>
            )}

            {space && statuses.length === 0 && (
              <div className="cc-panel"><div className="cc-panel-body">
                <DkEmpty
                  why={`"${space.name}" declares no statuses, so there are no columns to put work in.`}
                  fills="A space's statuses live in its own record. Until it has some, tasks here can be read but not grouped." />
              </div></div>
            )}

            {space && open && (
              <DkDrill label={`Task — ${open.title}`} onClose={() => setOpenId(null)}>
                <TaskDetail
                  task={open} statuses={statuses} closedStatus={closedStatus}
                  emps={emps} empName={empName} lists={listsHere} me={me}
                  subtasks={childrenOf(open.id)} sections={sections}
                  onPatch={patchTask} onOpen={setOpenId} onSaid={setSaid}
                  onCreateSub={(title) => createTask(title, statuses[0] || open.status, {
                    parent_task_id: open.id, list_id: open.list_id,
                  })}
                  onReload={load}
                />
              </DkDrill>
            )}

            {space && !open && unbuilt && (
              <div className="cc-panel"><div className="cc-panel-body">
                <DkEmpty
                  why={`The saved view "${activeView.name}" asks for the ${unbuilt} layout, which is not built yet.`}
                  fills="It is the last stage of this build. The view is unchanged and nothing was lost."
                  action={<button type="button" className="cc-btn" onClick={() => setLayout("list")}>
                    Show the same tasks as a list
                  </button>} />
              </div></div>
            )}

            {space && !open && !unbuilt && statuses.length > 0 && layout === "list" && (
              <ListView
                groups={groups} sections={sections} emps={emps} empName={empName}
                statuses={statuses} closedStatus={closedStatus} childrenOf={childrenOf}
                onOpen={setOpenId} onPatch={patchTask} onCreate={createTask}
                anyTasks={scoped.length > 0} filtered={Boolean(q.trim()) || mineOnly || hideClosed}
              />
            )}

            {space && !open && !unbuilt && statuses.length > 0 && layout === "board" && (
              <BoardView
                groups={groups} empName={empName} closedStatus={closedStatus}
                dragOver={dragOver} setDragOver={setDragOver} onDrop={dropOn}
                statuses={statuses} onOpen={setOpenId} onPatch={patchTask} onCreate={createTask}
              />
            )}

            {space && !open && !unbuilt && statuses.length > 0 && layout === "table" && (
              <TableView rows={scoped} empName={empName} closedStatus={closedStatus}
                onOpen={setOpenId} lists={listsHere} />
            )}
          </div>
        </div>
      </div>
    </DrillRoot>
  );
}

/* ═══════════ shared row chrome ═══════════ */

function DueChip({ due, closed }) {
  if (!due) return <span className="tgws-meta" title="No due date has been set on this task.">no due date</span>;
  const d = daysUntil(due);
  if (closed || d === null) return <span className="tgws-meta">{String(due).slice(0, 10)}</span>;
  const cls = d < 0 ? "due-late" : d <= 2 ? "due-soon" : "";
  const words = d < 0
    ? `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`
    : d === 0 ? "due today" : `due in ${d} day${d === 1 ? "" : "s"}`;
  return <span className={`tgws-meta ${cls}`} title={`Due ${String(due).slice(0, 10)}`}>{words}</span>;
}

function PriorityChip({ p }) {
  if (!p) return null;
  const tone = p === URGENT ? "crit" : p === HIGH ? "warn" : "neutral";
  return <DkTag tone={tone} title={`Priority ${p}. P0 is the most urgent, P3 the least.`}>{p}</DkTag>;
}

function AssigneeSelect({ id, task, emps, onPatch }) {
  return (
    <select id={id} className="tgws-sel" value={task.assignee_employee_id || ""}
      title="Who is doing this."
      onChange={(e) => onPatch(task, "assignee_employee_id", e.target.value)}>
      <option value="">Nobody yet</option>
      {emps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
    </select>
  );
}

function StatusSelect({ id, task, statuses, onPatch }) {
  const known = statuses.includes(task.status);
  return (
    <select id={id} className="tgws-sel" value={known ? task.status : ""}
      title="Move this task to another status. This is the keyboard way to do what dragging does on the board."
      onChange={(e) => onPatch(task, "status", e.target.value)}>
      {!known && <option value="">{pretty(task.status)} — not one of this space&rsquo;s</option>}
      {statuses.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
    </select>
  );
}

function PrioritySelect({ id, task, onPatch }) {
  return (
    <select id={id} className="tgws-sel" value={task.priority || ""}
      title="P0 is the most urgent, P3 the least."
      onChange={(e) => onPatch(task, "priority", e.target.value)}>
      {!task.priority && <option value="">No priority</option>}
      {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}

/* ═══════════ stage 1 — the list ═══════════ */

function ListView({ groups, sections, emps, empName, statuses, closedStatus, childrenOf,
  onOpen, onPatch, onCreate, anyTasks, filtered }) {
  const [draft, setDraft] = useState({});

  const add = async (statusKey) => {
    const text = draft[statusKey];
    const id = await onCreate(text, statusKey);
    if (id) setDraft((d) => ({ ...d, [statusKey]: "" }));
  };

  return (
    <>
      {!anyTasks && (
        <div className="cc-panel"><div className="cc-panel-body">
          <DkEmpty
            why={filtered
              ? "Nothing matches the filters you have set."
              : "There is no work in this space yet."}
            fills={filtered
              ? "Clear the search box or the two tick boxes above to see everything again."
              : "Type into the row under any status below and it becomes the first task."} />
        </div></div>
      )}

      {groups.map((g) => {
        const secId = `group:${g.key}`;
        const isOpen = sections.isOpen(secId, true);
        const closed = closedStatus && g.key === closedStatus;
        return (
          <div className="tgws-group" key={g.key || "blank"}>
            {/* The status NAME leads both the tooltip and the accessible name.
                Without it the header announced "0 tasks at this status" — true,
                and useless, because it never said which status. */}
            <button type="button" className="tgws-grouphead"
              aria-label={`${g.label}, ${g.rows.length} task${g.rows.length === 1 ? "" : "s"}, ${isOpen ? "expanded" : "collapsed"}`}
              aria-expanded={isOpen}
              onClick={() => sections.set(secId, !isOpen)}
              title={g.declared
                ? `${g.label}: ${g.rows.length} task${g.rows.length === 1 ? "" : "s"}. Click to ${isOpen ? "collapse" : "expand"}.`
                : `${g.label} is not one of this space's own statuses, so these tasks have nowhere else to appear. Change the status on a row to file it properly.`}>
              <DkCaret open={isOpen} />
              <span className="tgws-groupname">{g.label}</span>
              <DkTag tone={g.declared ? (closed ? "ok" : "neutral") : "warn"}>
                {g.rows.length}
              </DkTag>
              {!g.declared && <DkTag tone="warn">not a status of this space</DkTag>}
            </button>

            {isOpen && (
              <div className="tgws-groupbody">
                {g.rows.length === 0 && (
                  <div style={{ padding: "6px 10px" }}>
                    <DkEmpty why="Nothing at this status." fills="That is a real count, not a failed read." />
                  </div>
                )}
                {g.rows.map((t) => (
                  <TaskRow key={t.id} task={t} statuses={statuses} emps={emps} empName={empName}
                    closedStatus={closedStatus} subtasks={childrenOf(t.id)}
                    onOpen={onOpen} onPatch={onPatch} />
                ))}
                {g.declared && (
                  <div className="tgws-add">
                    <label className="cc-check" htmlFor={`tgws-add-${g.key}`}>New</label>
                    <input id={`tgws-add-${g.key}`} value={draft[g.key] || ""}
                      aria-label={`Add a task at ${g.label}`}
                      placeholder={`Add a task at ${g.label} and press Enter…`}
                      onChange={(e) => setDraft((d) => ({ ...d, [g.key]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") add(g.key); }} />
                    <button type="button" className="cc-btn" onClick={() => add(g.key)}>Add</button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function TaskRow({ task, statuses, emps, empName, closedStatus, subtasks, onOpen, onPatch, depth = 0 }) {
  const closed = closedStatus && task.status === closedStatus;
  const who = empName(task.assignee_employee_id);
  return (
    <>
      <div className={`tgws-row${depth ? " tgws-sub" : ""}`}>
        <div className="tgws-rowl">
          <button type="button" className={`tgws-titlebtn${closed ? " closed" : ""}`}
            onClick={() => onOpen(task.id)}
            title="Open this task — description, comments, checklist, subtasks, time and its full history.">
            {task.title}
          </button>
          <PriorityChip p={task.priority} />
          {subtasks.length > 0 && (
            <DkTag tone="info" title="Subtasks under this task. Each one is a task in its own right and can be assigned and dated.">
              {subtasks.length} sub
            </DkTag>
          )}
        </div>
        <div className="tgws-rowr">
          <span className="tgws-meta" title={who ? `Assigned to ${who}.` : "Nobody is assigned to this yet."}>
            {who || "unassigned"}
          </span>
          <DueChip due={task.due_on} closed={closed} />
          <AssigneeSelect id={`tgws-as-${task.id}`} task={task} emps={emps} onPatch={onPatch} />
          <StatusSelect id={`tgws-st-${task.id}`} task={task} statuses={statuses} onPatch={onPatch} />
          <input id={`tgws-du-${task.id}`} className="tgws-date" type="date"
            value={task.due_on ? String(task.due_on).slice(0, 10) : ""}
            title="Due date."
            onChange={(e) => onPatch(task, "due_on", e.target.value)} />
        </div>
      </div>
      {subtasks.map((s) => (
        <TaskRow key={s.id} task={s} statuses={statuses} emps={emps} empName={empName}
          closedStatus={closedStatus} subtasks={[]} onOpen={onOpen} onPatch={onPatch} depth={depth + 1} />
      ))}
    </>
  );
}

/* ═══════════ stage 3 — the board ═══════════
   Drag is the fast path, never the only path: every card carries the same
   status control the list rows use, so the board is fully operable from the
   keyboard. A drag-only board fails the accessibility gate and, more to the
   point, fails anyone using this on a keyboard all day. */

function BoardView({ groups, empName, closedStatus, dragOver, setDragOver, onDrop, statuses, onOpen, onPatch, onCreate }) {
  const [draft, setDraft] = useState({});
  return (
    <div className="tgws-board">
      {groups.map((g) => (
        <div key={g.key || "blank"}
          className={`tgws-col${dragOver === g.key ? " over" : ""}`}
          onDragOver={(e) => { if (g.declared) { e.preventDefault(); setDragOver(g.key); } }}
          onDragLeave={() => setDragOver((c) => (c === g.key ? null : c))}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            if (id && g.declared) onDrop(g.key, id);
          }}>
          <div className="tgws-colhead">
            <span className="tgws-groupname">{g.label}</span>
            <DkTag tone={g.declared ? (closedStatus === g.key ? "ok" : "neutral") : "warn"}>{g.rows.length}</DkTag>
          </div>
          <div className="tgws-colbody">
            {g.rows.length === 0 && (
              <DkEmpty why="Nothing here." fills={g.declared ? "Drag a card in, or type below." : ""} />
            )}
            {g.rows.map((t) => (
              <div key={t.id} className="tgws-card" draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}>
                <button type="button" className="tgws-titlebtn" onClick={() => onOpen(t.id)}
                  title="Open this task.">{t.title}</button>
                <div className="tgws-cardrow">
                  <PriorityChip p={t.priority} />
                  <DueChip due={t.due_on} closed={closedStatus === t.status} />
                </div>
                <div className="tgws-cardrow">
                  <span className="tgws-meta">{empName(t.assignee_employee_id) || "unassigned"}</span>
                  <StatusSelect id={`tgws-bst-${t.id}`} task={t} statuses={statuses} onPatch={onPatch} />
                </div>
              </div>
            ))}
            {g.declared && (
              <div className="tgws-wrap">
                <label className="cc-check" htmlFor={`tgws-badd-${g.key}`}>New</label>
                <input id={`tgws-badd-${g.key}`} className="cc-input tgws-grow"
                  value={draft[g.key] || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [g.key]: e.target.value }))}
                  onKeyDown={async (e) => {
                    if (e.key !== "Enter") return;
                    const id = await onCreate(draft[g.key], g.key);
                    if (id) setDraft((d) => ({ ...d, [g.key]: "" }));
                  }} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════ the table ═══════════ */

function TableView({ rows, empName, closedStatus, onOpen, lists }) {
  const listName = (id) => {
    if (!id) return "not in a list";
    const l = lists.find((x) => x.id === id);
    return l ? l.name : "a list in another space";
  };
  if (!rows.length) {
    return (
      <div className="cc-panel"><div className="cc-panel-body">
        <DkEmpty why="No tasks match." fills="Change the space, the list or the filters above." />
      </div></div>
    );
  }
  return (
    <div className="cc-panel"><div className="tablewrap"><table>
      <thead><tr>
        <th>Task</th><th>Status</th><th>Priority</th><th>Assigned to</th><th>Due</th><th>List</th>
      </tr></thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}>
            <td>
              <button type="button" className="tgws-titlebtn" onClick={() => onOpen(t.id)}
                title="Open this task.">{t.title}</button>
            </td>
            <td>{pretty(t.status)}</td>
            <td>{t.priority || "none"}</td>
            <td>{empName(t.assignee_employee_id) || "unassigned"}</td>
            <td><DueChip due={t.due_on} closed={closedStatus === t.status} /></td>
            <td>{listName(t.list_id)}</td>
          </tr>
        ))}
      </tbody>
    </table></div></div>
  );
}

/* ═══════════ stage 2 — the task detail ═══════════ */

function Section({ id, title, chip, sections, children }) {
  const isOpen = sections.isOpen(id, true);
  return (
    <div className="tgws-sec">
      <button type="button" className="tgws-sechead" onClick={() => sections.set(id, !isOpen)}
        title={`Click to ${isOpen ? "collapse" : "expand"} this section. It stays that way next time you open a task.`}>
        <DkCaret open={isOpen} />
        <span>{title}</span>
        {chip !== null && chip !== undefined && <DkTag tone="neutral">{chip}</DkTag>}
      </button>
      {isOpen && <div className="tgws-secbody">{children}</div>}
    </div>
  );
}

function TaskDetail({ task, statuses, closedStatus, emps, empName, lists, me, subtasks,
  sections, onPatch, onOpen, onSaid, onCreateSub, onReload }) {
  const [comments, setComments] = useState(null);
  const [checks, setChecks] = useState(null);
  const [files, setFiles] = useState(null);
  const [acts, setActs] = useState(null);
  const [times, setTimes] = useState(null);
  const [derr, setDerr] = useState({});
  const [body, setBody] = useState("");
  const [item, setItem] = useState("");
  const [sub, setSub] = useState("");
  const [desc, setDesc] = useState(task.description || "");
  const [editingDesc, setEditingDesc] = useState(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const taskId = task.id;

  const loadDetail = useCallback(async () => {
    const [c, k, f, a, tl] = await Promise.all([
      supabase.from("task_comment").select("*").eq("task_id", taskId).order("created_at"),
      supabase.from("task_checklist_item").select("*").eq("task_id", taskId).order("sort").order("created_at"),
      supabase.from("task_attachment").select("*").eq("task_id", taskId).order("uploaded_at"),
      supabase.from("task_activity").select("*").eq("task_id", taskId).order("at", { ascending: false }),
      supabase.from("task_time_log").select("*").eq("task_id", taskId).order("started_at", { ascending: false }),
    ]);
    if (!live.current) return;
    const next = {};
    next.comments = c.error ? c.error.message : null;
    next.checklist = k.error ? k.error.message : null;
    next.attachments = f.error ? f.error.message : null;
    next.history = a.error ? a.error.message : null;
    next.time = tl.error ? tl.error.message : null;
    setDerr(next);
    setComments(c.error ? [] : arr(c.data));
    setChecks(k.error ? [] : arr(k.data));
    setFiles(f.error ? [] : arr(f.data));
    setActs(a.error ? [] : arr(a.data));
    setTimes(tl.error ? [] : arr(tl.data));
  }, [taskId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => { setDesc(task.description || ""); setEditingDesc(false); }, [taskId, task.description]);

  const saveDesc = async () => {
    await onPatch(task, "description", desc.trim());
    if (live.current) setEditingDesc(false);
  };

  const addComment = async () => {
    const text = body.trim();
    if (!text) return;
    const { error } = await supabase.from("task_comment").insert({ task_id: taskId, body: text });
    if (error) { onSaid({ ok: false, text: `The comment was not saved: ${error.message}` }); return; }
    setBody("");
    await loadDetail();
    if (live.current) onSaid({ ok: true, text: "Comment added." });
  };

  const addCheck = async () => {
    const label = item.trim();
    if (!label) return;
    const { error } = await supabase.from("task_checklist_item").insert({ task_id: taskId, label });
    if (error) { onSaid({ ok: false, text: `The checklist item was not added: ${error.message}` }); return; }
    setItem("");
    await loadDetail();
  };

  /* done_by and done_at are written together with done, because "who ticked
     this" is the first question when something turns out not to have been
     done. */
  const toggleCheck = async (row, next) => {
    const { error } = await supabase.from("task_checklist_item").update({
      done: next,
      done_by: next ? (me || null) : null,
      done_at: next ? new Date().toISOString() : null,
    }).eq("id", row.id);
    if (error) { onSaid({ ok: false, text: `That tick was not saved: ${error.message}` }); return; }
    await loadDetail();
  };

  const running = (times || []).find((t) => !t.ended_at) || null;

  const startTimer = async () => {
    const { error } = await supabase.from("task_time_log").insert({
      task_id: taskId, employee_id: me, started_at: new Date().toISOString(),
    });
    if (error) { onSaid({ ok: false, text: `The timer did not start: ${error.message}` }); return; }
    await loadDetail();
  };

  const stopTimer = async () => {
    if (!running) return;
    const { error } = await supabase.from("task_time_log")
      .update({ ended_at: new Date().toISOString() }).eq("id", running.id);
    if (error) { onSaid({ ok: false, text: `The timer did not stop: ${error.message}` }); return; }
    await loadDetail();
  };

  const logged = (times || []).reduce((n, t) => n + (Number(t.minutes) || 0), 0);
  const snap = task.source_snapshot && typeof task.source_snapshot === "object" ? task.source_snapshot : null;

  return (
    <div className="tgws-detail">
      <div className="tgws-dcol">
        <Section id="d:desc" title="Description" sections={sections}>
          {editingDesc ? (
            <>
              <textarea id={`tgws-desc-${taskId}`} className="tgws-ta" rows={5} value={desc}
                onChange={(e) => setDesc(e.target.value)} />
              <div className="tgws-wrap">
                <button type="button" className="cc-btn primary" onClick={saveDesc}>Save</button>
                <button type="button" className="cc-btn"
                  onClick={() => { setDesc(task.description || ""); setEditingDesc(false); }}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              {task.description
                ? <div className="tgws-body">{task.description}</div>
                : <DkEmpty why="No description." fills="Nobody has written what this task actually involves." />}
              <div><button type="button" className="cc-btn" onClick={() => setEditingDesc(true)}>
                {task.description ? "Edit" : "Write one"}
              </button></div>
            </>
          )}
        </Section>

        <Section id="d:checks" title="Checklist"
          chip={checks ? `${checks.filter((c) => c.done).length} of ${checks.length}` : null}
          sections={sections}>
          {derr.checklist && <DkErr what="The checklist" err={derr.checklist} />}
          {checks === null && <div className="cc-fine">Loading…</div>}
          {checks && checks.length === 0 && !derr.checklist && (
            <DkEmpty why="No checklist." fills="Add the steps this task breaks into — each one records who ticked it and when." />
          )}
          {(checks || []).map((c) => (
            <div className="tgws-item" key={c.id}>
              <input id={`tgws-ck-${c.id}`} type="checkbox" checked={c.done}
                onChange={(e) => toggleCheck(c, e.target.checked)} />
              <div className="tgws-itemmain">
                <label className={`tgws-note${c.done ? " tgws-done" : ""}`} htmlFor={`tgws-ck-${c.id}`}>
                  {c.label}
                </label>
                {c.done && (
                  <div className="tgws-meta">
                    ticked by {empName(c.done_by) || "somebody not on the employee list"} {whenText(c.done_at) || ""}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="tgws-wrap">
            <label className="cc-check" htmlFor={`tgws-nc-${taskId}`}>Add step</label>
            <input id={`tgws-nc-${taskId}`} className="cc-input tgws-grow" value={item}
              onChange={(e) => setItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCheck(); }} />
            <button type="button" className="cc-btn" onClick={addCheck}>Add</button>
          </div>
        </Section>

        <Section id="d:subs" title="Subtasks" chip={subtasks.length} sections={sections}>
          {subtasks.length === 0 && (
            <DkEmpty why="No subtasks."
              fills="A subtask is a task in its own right — it can be assigned, dated and timed like any other." />
          )}
          {subtasks.map((s) => (
            <div className="tgws-item" key={s.id}>
              <div className="tgws-itemmain">
                <button type="button" className="tgws-titlebtn" onClick={() => onOpen(s.id)}>{s.title}</button>
                <div className="tgws-meta">
                  {pretty(s.status)} · {empName(s.assignee_employee_id) || "unassigned"}
                </div>
              </div>
              <StatusSelect id={`tgws-sst-${s.id}`} task={s} statuses={statuses} onPatch={onPatch} />
            </div>
          ))}
          <div className="tgws-wrap">
            <label className="cc-check" htmlFor={`tgws-ns-${taskId}`}>Add subtask</label>
            <input id={`tgws-ns-${taskId}`} className="cc-input tgws-grow" value={sub}
              onChange={(e) => setSub(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== "Enter") return;
                const id = await onCreateSub(sub);
                if (id && live.current) setSub("");
              }} />
            <button type="button" className="cc-btn"
              onClick={async () => { const id = await onCreateSub(sub); if (id && live.current) setSub(""); }}>
              Add
            </button>
          </div>
        </Section>

        <Section id="d:comments" title="Comments" chip={comments ? comments.length : null} sections={sections}>
          {derr.comments && <DkErr what="The comments" err={derr.comments} />}
          {comments === null && <div className="cc-fine">Loading…</div>}
          {comments && comments.length === 0 && !derr.comments && (
            <DkEmpty why="Nothing has been said about this task yet." fills="Comments are kept with the task, not in a chat somebody has to search." />
          )}
          {(comments || []).map((c) => (
            <div className="tgws-item" key={c.id}>
              <div className="tgws-itemmain">
                <div className="tgws-body">{c.body}</div>
                <div className="tgws-meta">{whenText(c.created_at)}{c.edited_at ? " · edited" : ""}</div>
              </div>
            </div>
          ))}
          <textarea id={`tgws-cm-${taskId}`} className="tgws-ta" rows={2} value={body}
            placeholder="Say something about this task…"
            onChange={(e) => setBody(e.target.value)} />
          <div className="tgws-wrap">
            <button type="button" className="cc-btn primary" onClick={addComment}>Comment</button>
            <span className="cc-fine" title="task_comment.mentions is a uuid array with no declared referent — an auth user or an employee — so this page does not guess. Raised with the data layer.">
              @mentions are not wired yet
            </span>
          </div>
        </Section>
      </div>

      <div className="tgws-dcol">
        <Section id="d:props" title="Properties" sections={sections}>
          <div className="tgws-field">
            <span className="tgws-flabel">Status</span>
            <StatusSelect id={`tgws-dst-${taskId}`} task={task} statuses={statuses} onPatch={onPatch} />
          </div>
          <div className="tgws-field">
            <span className="tgws-flabel">Assigned to</span>
            <AssigneeSelect id={`tgws-das-${taskId}`} task={task} emps={emps} onPatch={onPatch} />
          </div>
          <div className="tgws-field">
            <span className="tgws-flabel">Priority</span>
            <PrioritySelect id={`tgws-dpr-${taskId}`} task={task} onPatch={onPatch} />
          </div>
          <div className="tgws-field">
            <span className="tgws-flabel">Starts</span>
            <input id={`tgws-dsd-${taskId}`} className="tgws-date" type="date"
              value={task.start_on ? String(task.start_on).slice(0, 10) : ""}
              onChange={(e) => onPatch(task, "start_on", e.target.value)} />
          </div>
          <div className="tgws-field">
            <span className="tgws-flabel">Due</span>
            <input id={`tgws-ddd-${taskId}`} className="tgws-date" type="date"
              value={task.due_on ? String(task.due_on).slice(0, 10) : ""}
              onChange={(e) => onPatch(task, "due_on", e.target.value)} />
          </div>
          <div className="tgws-field">
            <span className="tgws-flabel">List</span>
            <select id={`tgws-dli-${taskId}`} className="tgws-sel" value={task.list_id || ""}
              onChange={(e) => onPatch(task, "list_id", e.target.value)}>
              <option value="">Not in a list</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="tgws-field">
            <span className="tgws-flabel">Created</span>
            <span className="tgws-meta">{whenText(task.created_at) || "at an unrecorded time"}</span>
          </div>
          {closedStatus && task.status === closedStatus && (
            <div className="tgws-field">
              <span className="tgws-flabel">Completed</span>
              <span className="tgws-meta">{whenText(task.completed_at) || "no completion time was recorded"}</span>
            </div>
          )}
          {snap && (
            <div className="tgws-field">
              <span className="tgws-flabel">Raised from</span>
              <span className="tgws-note" title="The figure as it stood at the moment this task was raised, frozen so it cannot drift.">
                {String(snap.kpi || "a figure")} was {String(snap.value)} {String(snap.unit || "")}
              </span>
            </div>
          )}
        </Section>

        <Section id="d:time" title="Time on this task"
          chip={times ? minutesText(logged) : null} sections={sections}>
          {derr.time && <DkErr what="The time log" err={derr.time} />}
          <div className="cc-fine" title="task_time_log is workspace time — how long a piece of work took. Payroll hours live in time_entries and belong to the HR module. The two are never added together.">
            Workspace time, not payroll
          </div>
          {times && times.length === 0 && !derr.time && (
            <DkEmpty why="No time has been logged." fills="Start the timer when you pick this up." />
          )}
          {(times || []).filter((t) => t.ended_at).map((t) => (
            <div className="tgws-item" key={t.id}>
              <div className="tgws-itemmain">
                <div className="tgws-meta">{whenText(t.started_at)} · {minutesText(t.minutes)}</div>
              </div>
            </div>
          ))}
          {me ? (
            running
              ? <button type="button" className="cc-btn primary" onClick={stopTimer}
                  title={`Running since ${whenText(running.started_at)}.`}>Stop the timer</button>
              : <button type="button" className="cc-btn" onClick={startTimer}>Start the timer</button>
          ) : (
            <DkEmpty why="You cannot log time because this sign-in is not linked to an employee record."
              fills="app_users links a login to an employee; an administrator sets that link." />
          )}
        </Section>

        <Section id="d:files" title="Attachments" chip={files ? files.length : null} sections={sections}>
          {derr.attachments && <DkErr what="The attachments" err={derr.attachments} />}
          {files && files.length === 0 && !derr.attachments && (
            <DkEmpty why="Nothing is attached, and nothing can be attached yet."
              fills="There is no storage bucket for workspace files. Creating one, with its access rules, is the data layer's call — not this page's." />
          )}
          {(files || []).map((f) => (
            <div className="tgws-item" key={f.id}>
              <div className="tgws-itemmain">
                <div className="tgws-note">{f.filename}</div>
                <div className="tgws-meta">{whenText(f.uploaded_at)}</div>
              </div>
            </div>
          ))}
        </Section>

        <Section id="d:hist" title="History" chip={acts ? acts.length : null} sections={sections}>
          {derr.history && <DkErr what="The history" err={derr.history} />}
          {acts === null && <div className="cc-fine">Loading…</div>}
          {acts && acts.length === 0 && !derr.history && (
            <DkEmpty why="No history was recorded." fills="Every change made from here adds a line." />
          )}
          {(acts || []).map((a) => (
            <div className="tgws-item" key={a.id}>
              <div className="tgws-itemmain">
                <div className="tgws-note">
                  {a.what === "created"
                    ? <>Created as <b>{a.new_value}</b></>
                    : <>{pretty(a.field)} changed{a.old_value ? <> from <b>{pretty(a.old_value)}</b></> : null} to <b>{a.new_value ? pretty(a.new_value) : "nothing"}</b></>}
                </div>
              </div>
              <span className="tgws-when">{whenText(a.at)}</span>
            </div>
          ))}
          <button type="button" className="cc-btn" onClick={onReload}
            title="Re-read this task and its history from the database.">Refresh</button>
        </Section>
      </div>
    </div>
  );
}
