/** COA · Manifest · Invoice follow the tag seed-to-sale. GAP is coverage. Silence is not. */

import type { Attachment } from "@/data/dossiers";
import { DOSSIERS } from "@/data/dossiers";
import type { InvLot } from "@/data/inventory-lots";
import type { Lot } from "@/data/s2s-chain";

function gap(kind: Attachment["kind"], note: string, source: string): Attachment {
  return { kind, status: "GAP", id: null, source, note };
}

export function docsAtStage(stage: string, room: string): Attachment[] {
  const packaged = /package|sold|transfer|process|cure|dry/i.test(stage) || /vault|ship|pack|hydro|solvent|trim|production/i.test(room);
  const shipping = /ship|sold|transfer/i.test(stage) || /shipping/i.test(room);
  return [
    packaged
      ? gap("coa", "No lab row on this freeze for this lot. Lands when a COA is on the tag or a parent.", "Metrc lab")
      : gap("coa", "Lab tests attach after harvest / package. Not at this stage.", "Metrc lab"),
    shipping
      ? gap("manifest", "No outbound transfer on this freeze. Manifest attaches when the package leaves Shipping & Receiving.", "Metrc transfers")
      : gap("manifest", "Manifest attaches when a package leaves Shipping & Receiving.", "Metrc transfers"),
    gap("invoice", "Apex invoice is money after a sold package. Not a sale at this stage.", "Apex"),
  ];
}

export function docsForLot(lot: Pick<Lot, "now_stage" | "now_room" | "name">): Attachment[] {
  const hit = DOSSIERS.find((d) => d.harvest === lot.name || d.tag === lot.name);
  return hit?.attachments ?? docsAtStage(lot.now_stage, lot.now_room);
}

export function docsForInv(lot: InvLot): Attachment[] {
  const hit = DOSSIERS.find((d) => d.tag === lot.id);
  return hit?.attachments ?? docsAtStage("PACKAGE", lot.metrc);
}

export function docsSummary(atts: Attachment[]) {
  return {
    coa: atts.find((a) => a.kind === "coa"),
    manifest: atts.find((a) => a.kind === "manifest"),
    invoice: atts.find((a) => a.kind === "invoice"),
    onFile: atts.filter((a) => a.status === "ON FILE").length,
    gaps: atts.filter((a) => a.status === "GAP").length,
  };
}
