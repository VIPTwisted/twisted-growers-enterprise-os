import { LIC_MC, LIC_MP } from "@/data/licences";
export type Attachment = {
  kind: "manifest" | "coa" | "invoice";
  status: "ON FILE" | "GAP" | "INHERITED" | "VALUE DIFFERS" | "UNMATCHED";
  id: string | null;
  source: string;
  note: string;
};

export type Dossier = {
  id: string;
  tag: string;
  strain: string;
  harvest: string;
  room: string;
  licence: string;
  qty: string;
  metrc: string;
  apex: string | null;
  attachments: Attachment[];
};

export const DOSSIERS: Dossier[] = [
  {
    id: "veg-cluster",
    tag: "Vegetation Room",
    strain: "Mother · Clone · Veg",
    harvest: "—",
    room: "Vegetation Room",
    licence: LIC_MC,
    qty: "5,930 plants",
    metrc: "Mother 30 CERTIFIED · Veg 1,430 PARTIAL · Clone 4,470 PARTIAL",
    apex: null,
    attachments: [
      {
        kind: "coa",
        status: "GAP",
        id: null,
        source: "Metrc lab",
        note: "No COA at veg. Lab tests attach after harvest / package. Lands here when the tag is tested.",
      },
      {
        kind: "manifest",
        status: "GAP",
        id: null,
        source: "Metrc transfers",
        note: "Plants do not ship from Vegetation. Manifest attaches when a package leaves Shipping & Receiving.",
      },
      {
        kind: "invoice",
        status: "GAP",
        id: null,
        source: "Apex",
        note: "Apex invoice is money after a sold package. Not a sale at mother / clone / veg.",
      },
    ],
  },
  {
    id: "twiste-303",
    tag: "1A40A030000E5B2000000303",
    strain: "Twisted — wholesale",
    harvest: "—",
    room: "Fulfillment Vault",
    licence: LIC_MC,
    qty: "sold",
    metrc: "$1,800.00",
    apex: "$1,800.00",
    attachments: [
      {
        kind: "invoice",
        status: "ON FILE",
        id: "Twiste-303",
        source: "Apex · 18 May 2025",
        note: "Buyer-restricted match. Unrestricted key still shows $73,958.51 as false-match evidence — not blended.",
      },
      {
        kind: "manifest",
        status: "ON FILE",
        id: "buyer-restricted manifests",
        source: "Metrc wholesale",
        note: "Only manifests to the Apex buyer. 14 other companies on the invoice key are FALSE MATCH.",
      },
      {
        kind: "coa",
        status: "ON FILE",
        id: "inherited from source packages",
        source: "tag_coa_lineage",
        note: "Direct or inherited. If a child package has none, that is a COA GAP — not a pass.",
      },
    ],
  },
  {
    id: "tag-0014",
    tag: "1A40A030000E5B2000000014",
    strain: "N-Butane R&D",
    harvest: "R&D line",
    room: "Hydrocarbon",
    licence: LIC_MP,
    qty: "failed / R&D",
    metrc: "lab fail · R&D",
    apex: null,
    attachments: [
      {
        kind: "coa",
        status: "ON FILE",
        id: "N-Butane R&D",
        source: "Metrc lab",
        note: "R&D fail is not a compliance fail. If Metrc shows a compliance failure on this tag, Queue 3 is wrong.",
      },
      {
        kind: "manifest",
        status: "GAP",
        id: null,
        source: "Metrc transfers",
        note: "No outbound wholesale. Do not invent a ship.",
      },
      {
        kind: "invoice",
        status: "GAP",
        id: null,
        source: "Apex",
        note: "No Apex order. Correct — this is not a sale.",
      },
    ],
  },
  {
    id: "twiste-1487",
    tag: "mixed lots",
    strain: "wholesale gap",
    harvest: "—",
    room: "Fulfillment",
    licence: LIC_MC,
    qty: "sold",
    metrc: "$7,000.00",
    apex: "$62,181.00",
    attachments: [
      {
        kind: "invoice",
        status: "VALUE DIFFERS",
        id: "Twiste-1487",
        source: "Apex",
        note: "Genuine operator gap. Do not force to zero. Exception stays open.",
      },
      {
        kind: "manifest",
        status: "ON FILE",
        id: "buyer manifests $7,000",
        source: "Metrc",
        note: "Buyer-restricted sum. Missing Metrc weight vs Apex is the finding.",
      },
      {
        kind: "coa",
        status: "GAP",
        id: null,
        source: "tag_coa_gap",
        note: "Not every lot on the invoice has a certificate yet. Surfaces as COA GAP, not a pass.",
      },
    ],
  },
];

export const HOME_KPIS: Record<
  string,
  { label: string; value: string; source: string; period: string; drill: string; tone: "ok" | "issue" | "gap" }[]
> = {
  command: [
    { label: "Open issues", value: "2", source: "item_flags", period: "as-of now", drill: "item_flags", tone: "issue" },
    { label: "Metrc need-action-now", value: "79", source: "v_xq_summary", period: "as-of now", drill: "xq_metrc_exceptions", tone: "issue" },
    { label: "Apex matched", value: "679", source: "v_apex_order_metrc_link", period: "all years", drill: "orders", tone: "ok" },
    { label: "VALUE DIFFERS", value: "199", source: "v_apex_order_metrc_link", period: "all years", drill: "orders", tone: "issue" },
    { label: "Tags packaged", value: "12,020.2 lb", source: "metrc_harvests TotalPackagedWeight", period: "day one → 8 Sep 2026", drill: "cm_alloc", tone: "ok" },
    { label: "Metrc moisture residual", value: "27,314.2 lb", source: "wet − waste − packaged", period: "avg 54.6% vs 70–77%", drill: "cm_alloc", tone: "issue" },
    { label: "FF to manufacturing", value: "10,363 lb wet", source: "single-source FF tags", period: "2,303 lb dry-eq ÷4.5", drill: "cm_alloc", tone: "issue" },
    { label: "FF → concentrate", value: "3.0% wet", source: "first-run concentrate", period: "155.3 / 5,175.1 lb", drill: "cm_alloc", tone: "ok" },
  ],
  cultivation: [
    { label: "Moisture / residual need action", value: "10", source: "v_xq_harvest_moisture", period: "as-of now", drill: "xq_metrc_exceptions", tone: "issue" },
    { label: "Harvest open past limit", value: "6", source: "v_xq_overdue / Queue 4", period: "as-of now", drill: "xq_harvest_cycle", tone: "issue" },
    { label: "Room turn", value: "QUARANTINED", source: "room_turn_audit", period: "do not grade", drill: "room_turn_audit", tone: "gap" },
    { label: "Canopy", value: "at cap · two sizes", source: "F1/F3 1140 LARGE · F2/F4 1050 SMALL", period: "1,150 is labor, not cap", drill: "cm_alloc", tone: "ok" },
    { label: "Month floor 360 lb", value: "Vincent min", source: "packaged tags / month", period: "180 lb per pull × 2", drill: "cm_alloc", tone: "issue" },
  ],
  metrc: [
    { label: "Never submitted", value: "48", source: "v_xq_never_submitted", period: "as-of now", drill: "xq_metrc_exceptions", tone: "issue" },
    { label: "Failed, no disposition", value: "11", source: "v_xq_failed_no_disposition", period: "as-of now", drill: "xq_metrc_exceptions", tone: "issue" },
    { label: "COA gap", value: "open queue", source: "tag_coa_gap", period: "as-of now", drill: "tag_coa_gap", tone: "gap" },
    { label: "Write-back", value: "off · phase 1", source: "constitution", period: "policy", drill: "metrc_corrections", tone: "ok" },
  ],
  finance: [
    { label: "Orders in Apex book", value: "1,739", source: "v_apex_order_metrc_link", period: "all", drill: "orders", tone: "ok" },
    { label: "Matched", value: "679 / $3,282,818", source: "v_apex_order_metrc_link", period: "all", drill: "orders", tone: "ok" },
    { label: "Unexplained Apex-only", value: "214 / $940,000", source: "v_apex_order_metrc_link", period: "post-key", drill: "orders", tone: "issue" },
    { label: "Proof row", value: "Twiste-303 = $1,800", source: "buyer-restricted Metrc", period: "18 May 2025", drill: "twiste-303", tone: "ok" },
  ],
  inventory: [
    { label: "On hand (weighed)", value: "live Metrc qty > 0", source: "metrc_packages Active", period: "today / as-of", drill: "stock_on_hand", tone: "ok" },
    { label: "Sheet vs Metrc", value: "named exceptions", source: "sheet_vs_metrc", period: "as-of", drill: "sheet_vs_metrc", tone: "issue" },
    { label: "PIT vs packages", value: "do not blend", source: "rpt-point-in-time", period: "as-of date", drill: "rpt-point-in-time", tone: "gap" },
  ],
  quality: [
    { label: "Never tested", value: "130 items", source: "v_never_tested_proof", period: "as-of now", drill: "never-tested-proof", tone: "issue" },
    { label: "Certificate gap", value: "queue", source: "tag_coa_gap", period: "as-of now", drill: "certificate-gap", tone: "gap" },
  ],
  manufacturing: [
    { label: "Units / hour", value: "goal vs actual", source: "pipeline_runs", period: "this shift", drill: "pipeline_runs", tone: "issue" },
    { label: "Empty cart", value: "par is CFO-owned", source: "plan_products", period: "today", drill: "dept_dash_mfg", tone: "issue" },
    { label: "FF in from harvest", value: "10,363 lb wet", source: "single-source FF tags", period: "2,303 dry-eq", drill: "cm_alloc", tone: "issue" },
    { label: "FF first-run yield", value: "3.0% ON FLOOR", source: "consumed FF vs first concentrate", period: "Vincent band 3–6%", drill: "cm_alloc", tone: "issue" },
    { label: "Unprocessed FF", value: "5,188 lb", source: "harvest FF minus first-run in", period: "on-hand 370.9", drill: "cm_alloc", tone: "issue" },
  ],
  hr: [
    { label: "Week start", value: "Monday → today", source: "f_date_presets this_week_td", period: "this week", drill: "my_week", tone: "ok" },
    { label: "Clock vs 09:00", value: "grade the hour", source: "on_the_floor", period: "today", drill: "on_the_floor", tone: "issue" },
  ],
  infused: [
    { label: "Work orders", value: "live schedule", source: "work_orders", period: "this week", drill: "work_orders", tone: "ok" },
  ],
  workspace: [
    { label: "Open issues", value: "board", source: "issues", period: "as-of", drill: "issues", tone: "issue" },
  ],
  reports: [
    { label: "Tag register", value: "every tag", source: "tag_master", period: "all", drill: "tag_master", tone: "ok" },
    { label: "Invoice truth", value: "1,739 orders", source: "apex_invoice_truth", period: "all", drill: "apex_invoice_truth", tone: "ok" },
  ],
  settings: [
    { label: "Users live", value: "2 owners", source: "app_users", period: "as-of", drill: "permissions", tone: "ok" },
  ],
};
