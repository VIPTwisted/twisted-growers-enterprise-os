import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { addPackItem, loadFacility, savePackItem } from "@/lib/facility-api";
import {
  PACK_CATS,
  PACK_SEED,
  blankPack,
  packDays,
  packExpiryDays,
  packExpiring,
  packKpis,
  packLanded,
  packLow,
  type PackItem,
  type PackStatus,
} from "@/data/pack-inventory";

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function money2(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

type Tab = "all" | "low" | "order" | "planning" | "waste" | "expiring";

export function PackStock({
  items,
  onChange,
  page = false,
}: {
  items: PackItem[];
  onChange: (next: PackItem[]) => void;
  page?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [cat, setCat] = useState("ALL");
  const [q, setQ] = useState("");
  const [addName, setAddName] = useState("");
  const k = packKpis(items);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return items.filter((it) => {
      if (tab === "low" && !packLow(it)) return false;
      if (tab === "order" && it.on_order <= 0) return false;
      if (tab === "planning" && it.status !== "planning") return false;
      if (tab === "waste" && (it.wasted || 0) + (it.damaged || 0) <= 0) return false;
      if (tab === "expiring" && !packExpiring(it)) return false;
      if (cat !== "ALL" && it.category !== cat) return false;
      if (n && !(it.name + it.sku + it.vendor + it.category).toLowerCase().includes(n)) return false;
      return true;
    });
  }, [items, tab, cat, q]);

  async function save(it: PackItem) {
    await savePackItem({ data: it });
    onChange(items.map((x) => (x.id === it.id ? it : x)));
  }

  async function add(status: PackStatus = "active") {
    const name = addName.trim();
    if (!name) return;
    const res = await addPackItem({ data: { name } });
    const row = blankPack(name);
    row.id = res.id;
    row.status = status;
    if (cat !== "ALL") row.category = cat;
    await savePackItem({ data: row });
    onChange([...items, row]);
    setOpen(row.id);
    setAddName("");
  }

  return (
    <section className="pack-stock">
      <div className="pack-head">
        <div>
          <p className="fac-kicker">Supplies & packaging · OS book · not Metrc</p>
          {!page ? (
            <p className="rb-copy">
              Full desk:{" "}
              <Link to="/p/$key" params={{ key: "supplies_packaging" }} className="text-mark">
                Inventory → Supplies & Packaging
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      <div className="rb-kpis pack-kpis">
        <button type="button" className="rb-tile" onClick={() => setTab("all")}>
          <span className="rb-k">Active SKUs</span>
          <strong className="rb-v">{k.skus}</strong>
          <em>{items.length} in book</em>
        </button>
        <button type="button" className={"rb-tile" + (k.low ? " crit" : "")} onClick={() => setTab("low")}>
          <span className="rb-k">Low stock</span>
          <strong className={"rb-v" + (k.low ? " fac-low" : "")}>{k.low}</strong>
          <em>{k.low ? "Below reorder — buy" : "None below reorder"}</em>
        </button>
        <button type="button" className="rb-tile" onClick={() => setTab("order")}>
          <span className="rb-k">On order</span>
          <strong className="rb-v">{k.order}</strong>
          <em>{money(k.po)} open PO</em>
        </button>
        <button type="button" className="rb-tile hold" onClick={() => setTab("planning")}>
          <span className="rb-k">New packaging</span>
          <strong className="rb-v">{k.plan}</strong>
          <em>In planning — do not buy as live</em>
        </button>
        <div className="rb-tile">
          <span className="rb-k">On-hand value</span>
          <strong className="rb-v">{money(k.value)}</strong>
          <em>Landed cost × qty · $0 until cost is entered</em>
        </div>
        <button type="button" className={"rb-tile" + (k.wasted || k.damaged ? " crit" : "")} onClick={() => setTab("waste")}>
          <span className="rb-k">Wasted / damaged</span>
          <strong className="rb-v">{(k.wasted + k.damaged).toLocaleString()}</strong>
          <em>
            {k.wasted.toLocaleString()} wasted · {k.damaged.toLocaleString()} damaged · {k.wasteSkus} SKUs
          </em>
        </button>
        <button type="button" className={"rb-tile" + (k.expiring ? " hold" : "")} onClick={() => setTab("expiring")}>
          <span className="rb-k">Labels / supplies expiring</span>
          <strong className="rb-v">{k.expiring}</strong>
          <em>Within 30 days or already expired</em>
        </button>
      </div>

      <div className="pack-filters">
        {(["all", "low", "order", "planning", "waste", "expiring"] as Tab[]).map((t) => (
          <button key={t} type="button" className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "all"
              ? "All"
              : t === "low"
                ? "Low stock"
                : t === "order"
                  ? "On order"
                  : t === "planning"
                    ? "Planning"
                    : t === "waste"
                      ? "Waste / damage"
                      : "Expiring"}
          </button>
        ))}
        <select title="Field" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="ALL">Every category</option>
          {PACK_CATS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input title="Find SKU, vendor, name" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find SKU, vendor, name" />
      </div>

      <div className="pack-list">
        {shown.map((it) => {
          const low = packLow(it);
          const on = open === it.id;
          const days = packDays(it);
          return (
            <article key={it.id} className={"pack-card" + (low ? " is-low" : "") + (it.status === "planning" ? " is-plan" : "") + (on ? " on" : "")}>
              <button type="button" className="pack-hit" onClick={() => setOpen(on ? null : it.id)}>
                {it.image ? <img src={it.image} alt="" /> : <span className="pack-ph">{it.category.slice(0, 3)}</span>}
                <div>
                  <b>{it.name}</b>
                  <em>
                    {it.sku || "No SKU"} · {it.category} · {it.uom}
                  </em>
                  <span>
                    On hand {it.on_hand.toLocaleString()}
                    {it.on_order ? ` · on order ${it.on_order.toLocaleString()}` : ""}
                    {days != null ? ` · ${days}d cover` : ""}
                  </span>
                  {low ? <strong className="fac-low">Low Stock</strong> : null}
                  {it.status === "planning" ? <strong className="pack-plan">Planning</strong> : null}
                  {(it.wasted || 0) + (it.damaged || 0) > 0 ? (
                    <strong className="fac-low">
                      Waste {it.wasted || 0} · Damaged {it.damaged || 0}
                    </strong>
                  ) : null}
                  {packExpiring(it) ? (
                    <strong className="fac-low">
                      {packExpiryDays(it)! < 0 ? "Expired" : `Expires in ${packExpiryDays(it)}d`}
                    </strong>
                  ) : null}
                </div>
              </button>
              {on ? <PackForm item={it} onSave={save} /> : null}
            </article>
          );
        })}
        {!shown.length ? <p className="rb-copy">Nothing in this filter.</p> : null}
      </div>

      <div className="pack-add">
        <input title="Field"
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          placeholder={tab === "planning" ? "Name the new packaging" : "Add SKU"}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add(tab === "planning" ? "planning" : "active");
          }}
        />
        <button type="button" onClick={() => void add(tab === "planning" ? "planning" : "active")}>
          {tab === "planning" ? "Add to planning" : "Add item"}
        </button>
      </div>
    </section>
  );
}

function PackForm({ item, onSave }: { item: PackItem; onSave: (it: PackItem) => void }) {
  const [form, setForm] = useState(item);
  const set = <K extends keyof PackItem>(k: K, v: PackItem[K]) => setForm((f) => ({ ...f, [k]: v }));
  const landed = packLanded(form);
  const days = packDays(form);
  return (
    <form
      className="pack-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <div className="pack-sec">Identity</div>
      <label>
        Image
        <input title="Field"
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 400_000) {
              alert("Image must be under 400 KB.");
              return;
            }
            const r = new FileReader();
            r.onload = () => set("image", String(r.result || ""));
            r.readAsDataURL(file);
          }}
        />
      </label>
      {form.image ? <img className="pack-preview" src={form.image} alt="" /> : null}
      <div className="pack-grid">
        <label>
          Name
          <input title="Field" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label>
          SKU
          <input title="Field" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
        </label>
        <label>
          Category
          <select title="Field" value={form.category} onChange={(e) => set("category", e.target.value)}>
            {PACK_CATS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          UOM
          <input title="Field" value={form.uom} onChange={(e) => set("uom", e.target.value)} />
        </label>
        <label>
          Status
          <select title="Field" value={form.status} onChange={(e) => set("status", e.target.value as PackStatus)}>
            <option value="active">Active</option>
            <option value="planning">Planning — new packaging</option>
            <option value="hold">Hold</option>
            <option value="discontinued">Discontinued</option>
          </select>
        </label>
        <label>
          Spec / size
          <input title="3.5g, 70mm, CR, etc." value={form.spec} onChange={(e) => set("spec", e.target.value)} placeholder="3.5g, 70mm, CR, etc." />
        </label>
      </div>

      <div className="pack-sec">Stock</div>
      <div className="pack-grid">
        <label>
          On-hand qty
          <input title="Field" type="number" min={0} value={form.on_hand} onChange={(e) => set("on_hand", Number(e.target.value) || 0)} />
        </label>
        <label>
          Min. on-hand
          <input title="Field" type="number" min={0} value={form.min_on_hand} onChange={(e) => set("min_on_hand", Number(e.target.value) || 0)} />
        </label>
        <label>
          Reorder point
          <input title="Field" type="number" min={0} value={form.reorder_point} onChange={(e) => set("reorder_point", Number(e.target.value) || 0)} />
        </label>
        <label>
          Par / max
          <input title="Field" type="number" min={0} value={form.par_max} onChange={(e) => set("par_max", Number(e.target.value) || 0)} />
        </label>
        <label>
          On order
          <input title="Field" type="number" min={0} value={form.on_order} onChange={(e) => set("on_order", Number(e.target.value) || 0)} />
        </label>
        <label>
          30-day usage
          <input title="Field" type="number" min={0} value={form.usage_30d} onChange={(e) => set("usage_30d", Number(e.target.value) || 0)} />
        </label>
        <label>
          Bin / location
          <input title="Field" value={form.bin} onChange={(e) => set("bin", e.target.value)} />
        </label>
        <label>
          Last count
          <input title="Field" type="date" value={form.last_count} onChange={(e) => set("last_count", e.target.value)} />
        </label>
      </div>
      <p className="rb-copy">
        {packLow(form) ? <span className="fac-low">Low Stock</span> : "At or above reorder."}
        {days != null ? ` · ${days} days of cover at current usage.` : " · File 30-day usage for days of cover."}
      </p>

      <div className="pack-sec">Waste · damage · expiry</div>
      <div className="pack-grid">
        <label>
          Wasted qty
          <input title="Field" type="number" min={0} value={form.wasted} onChange={(e) => set("wasted", Number(e.target.value) || 0)} />
        </label>
        <label>
          Damaged qty
          <input title="Field" type="number" min={0} value={form.damaged} onChange={(e) => set("damaged", Number(e.target.value) || 0)} />
        </label>
        <label>
          Expires
          <input title="Field" type="date" value={form.expires} onChange={(e) => set("expires", e.target.value)} />
        </label>
      </div>
      <label>
        Waste / damage note
        <input title="Cracked, misprint, expired adhesive…" value={form.waste_note} onChange={(e) => set("waste_note", e.target.value)} placeholder="Cracked, misprint, expired adhesive…" />
      </label>

      <div className="pack-sec">Money</div>
      <div className="pack-grid">
        <label>
          Unit cost
          <input title="Field" type="number" min={0} step="0.01" value={form.cost} onChange={(e) => set("cost", Number(e.target.value) || 0)} />
        </label>
        <label>
          Freight / unit
          <input title="Field" type="number" min={0} step="0.01" value={form.freight} onChange={(e) => set("freight", Number(e.target.value) || 0)} />
        </label>
        <label>
          MOQ
          <input title="Field" type="number" min={0} value={form.moq} onChange={(e) => set("moq", Number(e.target.value) || 0)} />
        </label>
        <label>
          Case pack
          <input title="Field" type="number" min={0} value={form.case_pack} onChange={(e) => set("case_pack", Number(e.target.value) || 0)} />
        </label>
      </div>
      <p className="rb-copy">
        Landed {money2(landed)} · on-hand {money2(landed * form.on_hand)} · on-order {money2(landed * form.on_order)}
      </p>

      <div className="pack-sec">Supply chain</div>
      <div className="pack-grid">
        <label>
          Primary vendor
          <input title="Field" value={form.vendor} onChange={(e) => set("vendor", e.target.value)} />
        </label>
        <label>
          Vendor contact
          <input title="Field" value={form.vendor_contact} onChange={(e) => set("vendor_contact", e.target.value)} />
        </label>
        <label>
          Lead time (days)
          <input title="Field" type="number" min={0} value={form.lead_days} onChange={(e) => set("lead_days", Number(e.target.value) || 0)} />
        </label>
        <label>
          Buyer
          <input title="Field" value={form.buyer} onChange={(e) => set("buyer", e.target.value)} />
        </label>
      </div>
      <label>
        Alternative suppliers
        <input title="Backup vendors" value={form.suppliers} onChange={(e) => set("suppliers", e.target.value)} placeholder="Backup vendors" />
      </label>
      <label>
        On-order / PO note
        <input title="PO · ETA · carrier" value={form.on_order_note} onChange={(e) => set("on_order_note", e.target.value)} placeholder="PO · ETA · carrier" />
      </label>
      <label>
        Notes
        <textarea title="Field" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
      </label>
      <button type="submit">Save item</button>
    </form>
  );
}

export function PackPage() {
  const [items, setItems] = useState<PackItem[]>(PACK_SEED);
  useEffect(() => {
    void loadFacility().then((data) => {
      if (data?.pack?.length) setItems(data.pack);
    });
  }, []);
  return <PackStock items={items} onChange={setItems} page />;
}
