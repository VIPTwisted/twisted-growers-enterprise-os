/* Brand locker. Company marketing and brand files. Any type. Not Metrc.
   Drop logos, ads, zips, video, gifs, docs. Signed-in people can see them. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import "./brand-locker.css";

const AREAS = [
  { id: "logos", name: "Logos" },
  { id: "marketing", name: "Marketing" },
  { id: "packaging", name: "Packaging" },
  { id: "photos", name: "Photos" },
  { id: "video", name: "Video" },
  { id: "documents", name: "Documents" },
  { id: "other", name: "Other" },
];

function safeName(name) {
  return String(name || "file").replace(/[^\w.-]+/g, "_").slice(0, 180);
}

function kindOf(type, name) {
  const t = String(type || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  if (t.startsWith("image/") || /\.(gif|png|jpe?g|webp|svg|apng)$/.test(n)) return "image";
  if (t.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/.test(n)) return "video";
  return "file";
}

export default function BrandLocker({ session }) {
  const [area, setArea] = useState("marketing");
  const [rows, setRows] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [hot, setHot] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("brand_assets")
      .select("id,at,area,file_name,content_type,size_bytes,storage_path,note,uploaded_by")
      .order("at", { ascending: false });
    if (error) {
      setLoadErr(error.message);
      setRows([]);
      return;
    }
    setLoadErr(null);
    setRows(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function storeFiles(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    setBusy(true);
    setMsg("");
    const notes = [];
    const uid = session?.user?.id ?? null;
    for (const f of files) {
      const path = `${area}/${Date.now()}_${safeName(f.name)}`;
      const up = await supabase.storage.from("brand").upload(path, f, {
        upsert: false,
        contentType: f.type || "application/octet-stream",
      });
      if (up.error) {
        notes.push(`${f.name}: ${up.error.message}`);
        continue;
      }
      const ins = await supabase.from("brand_assets").insert({
        area,
        file_name: f.name,
        content_type: f.type || null,
        size_bytes: f.size,
        storage_path: path,
        note: null,
        uploaded_by: uid,
      });
      if (ins.error) {
        notes.push(`${f.name}: stored the bytes, but the list row failed — ${ins.error.message}`);
        continue;
      }
      notes.push(`${f.name}: in ${AREAS.find((a) => a.id === area)?.name || area}.`);
    }
    setMsg(notes.join(" "));
    setBusy(false);
    load();
  }

  async function openFile(row) {
    const { data, error } = await supabase.storage.from("brand").createSignedUrl(row.storage_path, 600);
    if (error) {
      setMsg(error.message);
      return;
    }
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const shown = rows.filter((r) => r.area === area);
  const counts = Object.fromEntries(AREAS.map((a) => [a.id, rows.filter((r) => r.area === a.id).length]));

  return (
    <div className="brandlock">
      <header className="brandlock-head">
        <p className="brandlock-k">Twisted Growers · Brand locker</p>
        <h1>Brand and marketing files</h1>
        <p>
          Logos, ads, packaging, photos, video, gifs, zips, docs — any type.
          This is the company locker, not Metrc and not chat. Drop onto an area.
        </p>
      </header>

      <div className="brandlock-areas" role="tablist" aria-label="Brand areas">
        {AREAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={area === a.id}
            className={area === a.id ? "on" : ""}
            onClick={() => setArea(a.id)}
          >
            {a.name}
            <em>{counts[a.id] || 0}</em>
          </button>
        ))}
      </div>

      <section
        className={hot ? "brandlock-drop hot" : "brandlock-drop"}
        onDragOver={(e) => { e.preventDefault(); setHot(true); }}
        onDragLeave={() => setHot(false)}
        onDrop={(e) => { e.preventDefault(); setHot(false); storeFiles(e.dataTransfer?.files); }}
      >
        <p>Drop any file here for {AREAS.find((a) => a.id === area)?.name}.</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          aria-label="Choose any files for this brand area"
          style={{ display: "none" }}
          onChange={(e) => { storeFiles(e.target.files); e.target.value = ""; }}
        />
        <button type="button" className="brandlock-pick" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Storing…" : "Choose files"}
        </button>
      </section>

      {loadErr ? <p className="brandlock-err">{loadErr}</p> : null}
      {msg ? <p className="brandlock-msg">{msg}</p> : null}

      <ul className="brandlock-list">
        {shown.length === 0 && !loadErr ? (
          <li className="brandlock-empty">Nothing in {AREAS.find((a) => a.id === area)?.name} yet. Drop files above.</li>
        ) : null}
        {shown.map((r) => {
          const kind = kindOf(r.content_type, r.file_name);
          return (
            <li key={r.id}>
              <button type="button" className="brandlock-open" onClick={() => openFile(r)}>
                <span className="brandlock-name">{r.file_name}</span>
                <span className="brandlock-meta">
                  {kind}
                  {r.size_bytes != null ? ` · ${Number(r.size_bytes).toLocaleString()} bytes` : ""}
                  {r.at ? ` · ${new Date(r.at).toLocaleString()}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
