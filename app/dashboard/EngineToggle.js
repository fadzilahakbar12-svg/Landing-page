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
    <div className="relative inline-block">
      <button
        onClick={toggle}
        disabled={loading}
        className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
          enabled ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {loading ? "..." : enabled ? "⏹ Stop Engine" : "▶ Mulai Scrape"}
      </button>

      {/* Indikator pulse: hijau berdenyut saat engine jalan, abu-abu diam saat mati */}
      <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
        {enabled && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white ${
            enabled ? "bg-green-500" : "bg-zinc-400"
          }`}
        />
      </span>
    </div>
  );
}
