"use client";

import { useEngineState } from "./EngineStateContext";

// Sama seperti CursorGlow: baca dari context supaya teks ini berubah SEKETIKA
// saat tombol Start/Stop Engine diklik, tidak menunggu router.refresh().
export default function EngineStatusText({ initialEnabled }) {
  const engine = useEngineState();
  const enabled = engine ? engine.enabled : initialEnabled;

  return (
    <p className="db-engine-line">
      Engine: {enabled ? <span className="on">Jalan</span> : <span className="off">Berhenti</span>}
      {" "}— scrape otomatis, follow-up WA &amp; email cuma aktif kalau engine jalan.
    </p>
  );
}
