import { Component, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { FAC_ROOMS, FACILITY, isRestroom, roomMetrics, shortName, type FacRoom } from "@/data/facility";
import { FacilityGL } from "@/components/facility-gl";

class GLGuard extends Component<{ fallback: ReactNode; children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  render() {
    return this.state.err ? this.props.fallback : this.props.children;
  }
}

function Beds({ zone }: { zone: FacRoom["zone"] }) {
  if (zone !== "flower" && zone !== "canopy") return null;
  const cols = zone === "flower" ? 6 : 5;
  const rows = zone === "flower" ? 5 : 4;
  return (
    <span className={"iso-beds " + zone} aria-hidden>
      {Array.from({ length: rows * cols }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

export function PlanLabels({
  rooms,
  selected,
  onSelect,
  packLow,
}: {
  rooms: FacRoom[];
  selected: string | null;
  onSelect: (id: string) => void;
  packLow?: boolean;
}) {
  return (
    <div className="fac-plan-labels">
      {rooms.map((room) => {
        const lines = isRestroom(room) ? [] : roomMetrics(room);
        const on = selected === room.id;
        const Tag = isRestroom(room) ? "div" : "button";
        return (
          <Tag
            key={room.id}
            {...(isRestroom(room)
              ? {}
              : {
                  type: "button" as const,
                  onClick: (e: PointerEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    onSelect(room.id);
                  },
                })}
            className={
              "fac-plan-lab zone-" +
              room.zone +
              (on ? " on" : "") +
              (selected && !on ? " dim" : "") +
              (isRestroom(room) ? " is-wc" : "")
            }
            style={{
              left: `${room.x}%`,
              top: `${room.y}%`,
              width: `${room.w}%`,
              height: `${room.h}%`,
            }}
          >
            <b>{shortName(room)}</b>
            {room.id === "stage" && packLow ? (
              <em className="fac-pin-low">Low Stock</em>
            ) : null}
            {room.id !== "stage"
              ? lines.map((line) => (
                  <em key={line}>{line}</em>
                ))
              : null}
          </Tag>
        );
      })}
    </div>
  );
}

function FacilityIso({
  rooms,
  selected,
  onSelect,
  view,
  packLow,
}: {
  rooms: FacRoom[];
  selected: string | null;
  onSelect: (id: string) => void;
  view: "iso" | "plan";
  fit?: string;
  packLow?: boolean;
}) {
  const floor = rooms?.length ? rooms : FAC_ROOMS;
  const drag = useRef<{ x: number; y: number; rx: number; rz: number } | null>(null);
  const [rx, setRx] = useState(18);
  const [rz, setRz] = useState(0);

  function down(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(".iso-room:not(.is-wc)")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, rx, rz };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setRz(drag.current.rz + (e.clientX - drag.current.x) * 0.3);
    setRx(Math.min(72, Math.max(32, drag.current.rx - (e.clientY - drag.current.y) * 0.22)));
  }
  function up() {
    drag.current = null;
  }

  return (
    <div
      className={"iso-stage" + (view === "plan" ? " is-plan" : "") + (selected ? " has-open" : "")}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div
        className="iso-world"
        style={{
          aspectRatio: String(FACILITY.aspect),
          transform: `rotateX(${rx}deg) rotateZ(${rz}deg)`,
        }}
      >
        <div className="iso-slab" />
        {floor.map((room) => {
          const on = selected === room.id;
          const wh = Math.max(52, Math.round(room.zh * (on ? 1.4 : 1.15)));
          const lines = isRestroom(room) ? [] : roomMetrics(room);
          const Tag = isRestroom(room) ? "div" : "button";
          return (
            <Tag
              key={room.id}
              {...(isRestroom(room)
                ? {}
                : {
                    type: "button" as const,
                    onClick: (e: PointerEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      onSelect(room.id);
                    },
                  })}
              className={
                "iso-room zone-" +
                room.zone +
                (on ? " on" : "") +
                (selected && !on ? " dim" : "") +
                (isRestroom(room) ? " is-wc" : "")
              }
              style={{
                left: `${room.x}%`,
                top: `${room.y}%`,
                width: `${room.w}%`,
                height: `${room.h}%`,
                "--wh": `${wh}px`,
              } as CSSProperties}
            >
              <span className="iso-base" />
              <span className="iso-pad">
                <Beds zone={room.zone} />
                <span className="iso-label">
                  <b>{shortName(room)}</b>
                  {room.id === "stage" && packLow ? (
              <em className="fac-pin-low">Low Stock</em>
            ) : null}
                  {room.id !== "stage"
                    ? lines.map((line) => (
                        <em key={line}>{line}</em>
                      ))
                    : null}
                </span>
              </span>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}

export function FacilityScene(props: {
  rooms: FacRoom[];
  selected: string | null;
  onSelect: (id: string) => void;
  view: "iso" | "plan";
  fit?: string;
  packLow?: boolean;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const floor = props.rooms?.length ? props.rooms : FAC_ROOMS;
  const next = { ...props, rooms: floor };
  return (
    <div className="fac-scene">
      {ready ? (
        <GLGuard fallback={<FacilityIso {...next} />}>
          <div className="fac-gl-wrap">
            <FacilityGL {...next} />
          </div>
        </GLGuard>
      ) : (
        <FacilityIso {...next} />
      )}
    </div>
  );
}
