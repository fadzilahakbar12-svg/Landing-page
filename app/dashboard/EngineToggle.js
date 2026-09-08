"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Jam & hari operasional: Senin-Jumat 09:00-18:00 WIB. Dipakai cuma untuk
// warning konfirmasi di tombol ini (testing) -- TIDAK mengubah kapan cron
// beneran jalan (itu diatur di vercel.json), jadi menyalakan engine di luar
// jam ini tetap valid, cuma minta konfirmasi ekstra dulu.
function isOperationalWindow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());

  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);

  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  const isWithinHours = hour >= 9 && hour < 18;
  return isWeekday && isWithinHours;
}

// Saklar on/off untuk seluruh engine (scrape + follow-up WA + email). Ini
// TIDAK menjalankan proses apapun secara langsung -- cuma toggle 1 flag yang
// dicek di awal tiap cron (lihat lib/engine.js + 3 route /api/cron/*).
export default function EngineToggle({ initialEnabled }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !enabled;

    if (next && !isOperationalWindow()) {
      const confirmed = window.confirm(
        "Anda menyalakan engine di luar jam operasional (Senin-Jumat, 09:00-18:00 WIB). Lanjutkan?"
      );
      if (!confirmed) return;
    }

    setLoading(true);
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
