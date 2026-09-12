/* Settings desk. The side-rail Settings category pointed at dept_dash_settings
   with no page mounted, so the click opened nothing. */
import React from "react";
import BotsPaidKey from "./bots-paid-key.jsx";

const TILES = [
  { key: "integrations", label: "Connections / Sync", why: "Metrc, Apex, ClickUp, and the optional Bots paid key." },
  { key: "app_secrets", label: "Keys & Connections", why: "Every named secret. Write-only. Last four characters only." },
  { key: "assistant_settings", label: "Assistant", why: "Name, face, who may use AI, paid API switch." },
  { key: "os_users", label: "Users", why: "Who is on the platform." },
  { key: "permissions", label: "Permissions", why: "Who can open which page." },
  { key: "business_rules", label: "Rules", why: "Owner-set business rules." },
  { key: "help", label: "Help", why: "How this OS is used." },
  { key: "settings", label: "My preferences", why: "Photo and theme for your account only." },
];

export default function SettingsDash({ go, role }) {
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Settings</h1>
          <div className="sub">Keys, connections, people, and the assistant. Open a desk.</div>
        </div>
      </div>
      <div style={{ maxWidth: 720, marginBottom: 16 }}>
        <BotsPaidKey role={role} />
      </div>
      <div className="cols2">
        {TILES.map((t) => (
          <button
            key={t.key}
            type="button"
            className="panel"
            onClick={() => go(t.key)}
            style={{ textAlign: "left", cursor: "pointer", maxWidth: "none" }}
          >
            <div className="ptitle" style={{ marginBottom: 4 }}>{t.label}</div>
            <div className="note">{t.why}</div>
          </button>
        ))}
      </div>
    </>
  );
}
