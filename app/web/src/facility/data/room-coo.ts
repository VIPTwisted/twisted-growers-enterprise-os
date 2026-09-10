export type OpsKind = "position" | "assignment" | "task" | "reminder" | "alert";
export type OpsPri = "routine" | "today" | "fire" | "exec";
export type OpsStatus = "open" | "doing" | "done" | "blocked" | "acked" | "dismissed" | "scheduled" | "out";

export type OpsRow = {
  id: string;
  room_id: string;
  kind: OpsKind;
  title: string;
  body: string;
  who: string;
  due: string;
  status: OpsStatus;
  priority: OpsPri;
  extra: string;
};

export type OpsExtra = {
  shift?: string;
  seats?: number;
  reports?: string;
  certs?: string;
  duties?: string;
  position_id?: string;
  from?: string;
  to?: string;
  repeat?: "once" | "daily" | "weekly";
  when?: string;
  steps?: string;
};

export function parseExtra(raw: string): OpsExtra {
  try {
    return raw ? (JSON.parse(raw) as OpsExtra) : {};
  } catch {
    return {};
  }
}

export function blankOp(room_id: string, kind: OpsKind): OpsRow {
  return {
    id: "",
    room_id,
    kind,
    title: "",
    body: "",
    who: "",
    due: "",
    status: kind === "assignment" ? "scheduled" : kind === "alert" ? "open" : "open",
    priority: kind === "alert" ? "today" : "routine",
    extra: "{}",
  };
}

export function opsForRoom(rows: OpsRow[], roomId: string) {
  return rows.filter((r) => r.room_id === roomId);
}

export function opsKpis(rows: OpsRow[]) {
  const pos = rows.filter((r) => r.kind === "position");
  const people = rows.filter((r) => r.kind === "assignment" && r.status !== "out");
  const tasks = rows.filter((r) => r.kind === "task" && r.status !== "done" && r.status !== "dismissed");
  const overdue = tasks.filter((r) => r.due && r.due < new Date().toISOString().slice(0, 10));
  const reminders = rows.filter((r) => r.kind === "reminder" && r.status === "open");
  const alerts = rows.filter((r) => r.kind === "alert" && r.status !== "acked" && r.status !== "dismissed");
  const fire = alerts.filter((r) => r.priority === "fire" || r.priority === "exec");
  return {
    positions: pos.length,
    people: people.length,
    tasks: tasks.length,
    overdue: overdue.length,
    reminders: reminders.length,
    alerts: alerts.length,
    fire: fire.length,
  };
}

export function kindLabel(k: OpsKind) {
  if (k === "position") return "Position";
  if (k === "assignment") return "Assignment";
  if (k === "task") return "Task";
  if (k === "reminder") return "Reminder";
  return "Alert";
}
