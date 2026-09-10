import { FileText, FlaskConical, Receipt } from "lucide-react";
import type { Attachment } from "@/data/dossiers";
import type { FacTarget } from "@/components/fac-forensic";

const ICO = {
  coa: FlaskConical,
  manifest: FileText,
  invoice: Receipt,
} as const;

export function AttachChips({
  atts,
  room,
  onDrill,
}: {
  atts: Attachment[];
  room?: string;
  onDrill: (t: FacTarget) => void;
}) {
  return (
    <div className="doc-chips">
      {atts.map((a) => {
        const Icon = ICO[a.kind];
        const tone = a.status === "ON FILE" ? "on" : a.status === "GAP" ? "gap" : "diff";
        return (
          <button
            key={a.kind}
            type="button"
            className={"doc-chip " + tone}
            title={`${a.kind.toUpperCase()} · ${a.status}${a.id ? ` · ${a.id}` : ""} — ${a.note}`}
            onClick={(e) => {
              e.stopPropagation();
              onDrill({ k: a.kind, room, id: a.id ?? undefined });
            }}
          >
            <Icon className="size-3" />
            {a.kind === "coa" ? "COA" : a.kind === "manifest" ? "MFST" : "INV"}
            <i>{a.status === "ON FILE" ? "FILE" : a.status === "GAP" ? "GAP" : a.status}</i>
          </button>
        );
      })}
    </div>
  );
}
