import { useEffect, useMemo, useState } from "react";
import { Bell, Briefcase, CheckSquare, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { loadOps, removeOp, saveOp } from "@/lib/facility-api";
import {
  blankOp,
  kindLabel,
  opsKpis,
  parseExtra,
  type OpsExtra,
  type OpsKind,
  type OpsPri,
  type OpsRow,
  type OpsStatus,
} from "@/data/room-coo";
import { TASK_TEMPLATES } from "@/data/exec-board";
import { ROSTER_NAMES, ROSTER_LAW, onRoster } from "@/data/roster";
import type { FacRoom } from "@/data/facility";
import type { FacTarget } from "@/components/fac-forensic";

const KINDS: OpsKind[] = ["position", "assignment", "task", "reminder", "alert"];

export function RoomOpsDesk({
  room,
  onDrill,
}: {
  room: FacRoom;
  onDrill: (t: FacTarget) => void;
}) {
  const [rows, setRows] = useState<OpsRow[]>([]);
  const [tab, setTab] = useState<OpsKind>("task");
  const [open, setOpen] = useState<string | "new" | null>(null);
  const mine = useMemo(() => rows.filter((r) => r.room_id === room.id), [rows, room.id]);
  const k = opsKpis(mine);
  const list = mine.filter((r) => r.kind === tab);
  const positions = mine.filter((r) => r.kind === "position");

  async function refresh() {
    const data = await loadOps();
    setRows(data.rows ?? []);
  }
  useEffect(() => {
    void refresh();
  }, [room.id]);

  async function persist(row: OpsRow) {
    if (row.kind === "assignment" && row.who && !onRoster(row.who)) {
      window.alert("Not on the employee roster. Cannot invent staff. Load the Metrc employee file or pick a named person.");
      return;
    }
    if ((row.status === "done" || row.status === "acked") && !row.body.trim()) {
      window.alert("Close requires a note. Auto-close is refused.");
      return;
    }
    const res = await saveOp({ data: { ...row, extra: row.extra || "{}" } });
    const id = res.id;
    setRows((cur) => {
      const next = { ...row, id };
      const rest = cur.filter((x) => x.id !== row.id && x.id !== id);
      return [next, ...rest];
    });
    setOpen(id);
  }

  async function drop(id: string) {
    await removeOp({ data: { id } });
    setRows((cur) => cur.filter((x) => x.id !== id));
    if (open === id) setOpen(null);
  }

  return (
    <section className="coo-desk">
      <p className="fac-kicker">COO desk · this room</p>
      <p className="rb-copy">
        Positions, people, tasks, reminders, alerts. Manager and above write. Staff sees assigned work. Readonly looks. Mapped to Workspace → Floor work, Alerts, Calendar, Reminders. {ROSTER_LAW}
      </p>
      <div className="rb-kpis">
        <button type="button" className="rb-tile" onClick={() => setTab("position")}>
          <span className="rb-k">Positions</span>
          <strong className="rb-v">{k.positions}</strong>
          <em>seats defined</em>
        </button>
        <button type="button" className="rb-tile" onClick={() => setTab("assignment")}>
          <span className="rb-k">On the floor</span>
          <strong className="rb-v">{k.people}</strong>
          <em>assignments</em>
        </button>
        <button type="button" className={"rb-tile" + (k.overdue ? " crit" : "")} onClick={() => setTab("task")}>
          <span className="rb-k">Open tasks</span>
          <strong className="rb-v">{k.tasks}</strong>
          <em>{k.overdue ? `${k.overdue} overdue` : "none overdue"}</em>
        </button>
        <button type="button" className="rb-tile" onClick={() => setTab("reminder")}>
          <span className="rb-k">Reminders</span>
          <strong className="rb-v">{k.reminders}</strong>
          <em>pending</em>
        </button>
        <button type="button" className={"rb-tile" + (k.fire ? " crit" : k.alerts ? " hold" : "")} onClick={() => setTab("alert")}>
          <span className="rb-k">Alerts</span>
          <strong className={"rb-v" + (k.fire ? " fac-low" : "")}>{k.alerts}</strong>
          <em>{k.fire ? `${k.fire} fire/exec` : "unacked"}</em>
        </button>
      </div>

      <div className="coo-tabs">
        {KINDS.map((t) => (
          <button key={t} type="button" className={tab === t ? "on" : ""} onClick={() => { setTab(t); setOpen(null); }}>
            {t === "position" ? <Briefcase className="size-3.5" /> : t === "assignment" ? <Users className="size-3.5" /> : t === "task" ? <CheckSquare className="size-3.5" /> : t === "reminder" ? <Bell className="size-3.5" /> : <UserPlus className="size-3.5" />}
            {kindLabel(t)}s
            <i>{mine.filter((r) => r.kind === t).length}</i>
          </button>
        ))}
        <button type="button" className="coo-add" onClick={() => setOpen("new")}>
          <Plus className="size-3.5" /> New {kindLabel(tab).toLowerCase()}
        </button>
      </div>
      {tab === "task" || tab === "reminder" ? (
        <div className="coo-tabs">
          {TASK_TEMPLATES.filter((t) => t.roomIds.includes(room.id) || t.roomIds.includes("*")).map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={() => {
                const row = blankOp(room.id, t.kind);
                row.title = t.title;
                row.body = t.body;
                void persist(row);
              }}
            >
              Template · {t.title}
            </button>
          ))}
        </div>
      ) : null}

      {open === "new" ? (
        <OpForm
          row={blankOp(room.id, tab)}
          positions={positions}
          onSave={(row) => void persist(row)}
          onCancel={() => setOpen(null)}
        />
      ) : null}

      <div className="coo-list">
        {list.map((row) => {
          const x = parseExtra(row.extra);
          const on = open === row.id;
          return (
            <article key={row.id} className={"coo-card" + (row.priority === "fire" || row.priority === "exec" ? " is-fire" : "") + (on ? " on" : "")}>
              <button
                type="button"
                className="coo-hit"
                onClick={() => setOpen(on ? null : row.id)}
              >
                <b>{row.title}</b>
                <em>
                  {row.who || "Unassigned"} · {row.status}
                  {row.due ? ` · due ${row.due}` : ""}
                  {x.shift ? ` · ${x.shift}` : ""}
                </em>
              </button>
              <div className="coo-tools">
                <button type="button" onClick={() => onDrill({ k: "ops", room: room.id, id: row.id })}>
                  Drill
                </button>
                <button type="button" onClick={() => void drop(row.id)}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {on ? (
                <OpForm
                  row={row}
                  positions={positions}
                  onSave={(next) => void persist(next)}
                  onCancel={() => setOpen(null)}
                  onDelete={() => void drop(row.id)}
                />
              ) : null}
            </article>
          );
        })}
        {!list.length && open !== "new" ? (
          <p className="rb-copy">No {kindLabel(tab).toLowerCase()}s on this room yet. Create one — this is how the COO runs the floor.</p>
        ) : null}
      </div>
    </section>
  );
}

function OpForm({
  row,
  positions,
  onSave,
  onCancel,
  onDelete,
}: {
  row: OpsRow;
  positions: OpsRow[];
  onSave: (row: OpsRow) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState(row);
  const extra = parseExtra(form.extra);
  const set = <K extends keyof OpsRow>(k: K, v: OpsRow[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setX = (patch: OpsExtra) => setForm((f) => ({ ...f, extra: JSON.stringify({ ...parseExtra(f.extra), ...patch }) }));
  const names = ROSTER_NAMES;

  return (
    <form
      className="pack-form coo-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.title.trim()) return;
        onSave(form);
      }}
    >
      <div className="pack-sec">{kindLabel(form.kind)} · forensic card</div>
      <label>
        Title
        <input title="Field" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={form.kind === "position" ? "e.g. Flower packaging operator" : "What must happen"} required />
      </label>
      <div className="pack-grid">
        {form.kind !== "position" ? (
          <label>
            Assigned to
            <input title="Name" list="coo-people" value={form.who} onChange={(e) => set("who", e.target.value)} placeholder="Name" />
          </label>
        ) : (
          <label>
            Reports to
            <input title="Field" list="coo-people" value={extra.reports ?? ""} onChange={(e) => setX({ reports: e.target.value })} />
          </label>
        )}
        {form.kind === "assignment" ? (
          <label>
            Position
            <select title="Field" value={extra.position_id ?? ""} onChange={(e) => setX({ position_id: e.target.value })}>
              <option value="">—</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Status
          <select title="Field" value={form.status} onChange={(e) => set("status", e.target.value as OpsStatus)}>
            {(form.kind === "assignment"
              ? ["scheduled", "out", "doing", "done"]
              : form.kind === "alert"
                ? ["open", "acked", "dismissed"]
                : ["open", "doing", "blocked", "done", "dismissed"]
            ).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select title="Field" value={form.priority} onChange={(e) => set("priority", e.target.value as OpsPri)}>
            <option value="routine">Routine</option>
            <option value="today">Today</option>
            <option value="fire">Fire</option>
            <option value="exec">Exec</option>
          </select>
        </label>
        <label>
          {form.kind === "reminder" ? "When" : "Due"}
          <input title="Field" type={form.kind === "reminder" ? "datetime-local" : "date"} value={form.due} onChange={(e) => set("due", e.target.value)} />
        </label>
        {form.kind === "position" || form.kind === "assignment" ? (
          <label>
            Shift
            <input title="Field" value={extra.shift ?? "07:00–15:30"} onChange={(e) => setX({ shift: e.target.value })} />
          </label>
        ) : null}
        {form.kind === "position" ? (
          <label>
            Seats
            <input title="Field" type="number" min={1} value={extra.seats ?? 1} onChange={(e) => setX({ seats: Number(e.target.value) || 1 })} />
          </label>
        ) : null}
        {form.kind === "assignment" ? (
          <>
            <label>
              From
              <input title="Field" type="date" value={extra.from ?? ""} onChange={(e) => setX({ from: e.target.value })} />
            </label>
            <label>
              To
              <input title="Field" type="date" value={extra.to ?? ""} onChange={(e) => setX({ to: e.target.value })} />
            </label>
          </>
        ) : null}
        {form.kind === "reminder" ? (
          <label>
            Repeat
            <select title="Field" value={extra.repeat ?? "once"} onChange={(e) => setX({ repeat: e.target.value as OpsExtra["repeat"] })}>
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
        ) : null}
      </div>
      {form.kind === "position" ? (
        <>
          <label>
            Required certs / skills
            <input title="Field" value={extra.certs ?? ""} onChange={(e) => setX({ certs: e.target.value })} />
          </label>
          <label>
            Duties
            <textarea title="Field" value={extra.duties ?? ""} onChange={(e) => setX({ duties: e.target.value })} rows={3} />
          </label>
        </>
      ) : null}
      <label>
        {form.kind === "task" ? "Work order / steps" : "Notes"}
        <textarea title="Every step. Who. What. Proof when done." value={form.body} onChange={(e) => set("body", e.target.value)} rows={4} placeholder="Every step. Who. What. Proof when done." />
      </label>
      <datalist id="coo-people">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="coo-form-actions">
        <button type="submit">Save {kindLabel(form.kind).toLowerCase()}</button>
        <button type="button" onClick={onCancel}>
          Close
        </button>
        {onDelete ? (
          <button type="button" onClick={onDelete}>
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function FloorWorkPage() {
  const [rows, setRows] = useState<OpsRow[]>([]);
  const [kind, setKind] = useState<OpsKind | "all">("all");
  useEffect(() => {
    void loadOps().then((d) => setRows(d.rows ?? []));
  }, []);
  const k = opsKpis(rows);
  const shown = kind === "all" ? rows : rows.filter((r) => r.kind === kind);
  return (
    <section className="coo-desk">
      <p className="fac-kicker">Every room · positions, people, tasks, reminders, alerts</p>
      <div className="rb-kpis">
        <div className="rb-tile"><span className="rb-k">Open tasks</span><strong className="rb-v">{k.tasks}</strong><em>{k.overdue} overdue</em></div>
        <div className={"rb-tile" + (k.alerts ? " hold" : "")}><span className="rb-k">Alerts</span><strong className="rb-v">{k.alerts}</strong><em>{k.fire} fire/exec</em></div>
        <div className="rb-tile"><span className="rb-k">Reminders</span><strong className="rb-v">{k.reminders}</strong></div>
        <div className="rb-tile"><span className="rb-k">People assigned</span><strong className="rb-v">{k.people}</strong></div>
        <div className="rb-tile"><span className="rb-k">Positions</span><strong className="rb-v">{k.positions}</strong></div>
      </div>
      <div className="coo-tabs">
        <button type="button" className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>All</button>
        {KINDS.map((t) => (
          <button key={t} type="button" className={kind === t ? "on" : ""} onClick={() => setKind(t)}>
            {kindLabel(t)}s
          </button>
        ))}
      </div>
      <div className="coo-list">
        {shown.map((r) => (
          <article key={r.id} className="coo-card">
            <div className="coo-hit">
              <b>{r.title}</b>
              <em>
                {r.room_id} · {kindLabel(r.kind)} · {r.who || "Unassigned"} · {r.status}
                {r.due ? ` · ${r.due}` : ""}
              </em>
              {r.body ? <p className="rb-copy">{r.body.slice(0, 220)}</p> : null}
            </div>
          </article>
        ))}
        {!shown.length ? <p className="rb-copy">Nothing filed yet. Open a room on the facility twin and create the work there.</p> : null}
      </div>
    </section>
  );
}
