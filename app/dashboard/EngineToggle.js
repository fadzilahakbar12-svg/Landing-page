"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Saklar on/off untuk seluruh engine (scrape + follow-up WA + email). Ini
// TIDAK menjalankan proses apapun secara langsung -- cuma toggle 1 flag yang
// dicek di awal tiap cron (lihat lib/engine.js + 3 route /api/cron/*).
export default function EngineToggle({ initialEnabled }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const next = !enabled;
    try {
      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Gagal mengubah status engine.");
      setEnabled(data.enabled);
      router.refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="db-engine-wrap">
      <button onClick={toggle} disabled={loading} className={`db-engine-btn ${enabled ? "is-on" : "is-off"}`}>
        {loading ? "..." : enabled ? "⏹ Stop Engine" : "▶ Mulai Scrape"}
      </button>

      <span className="db-engine-dot-wrap">
        {enabled && <span className="db-engine-dot-ping" />}
        <span className={`db-engine-dot ${enabled ? "on" : "off"}`} />
      </span>
    </div>
  );
}
