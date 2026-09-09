"use client";

import { createContext, useContext, useState } from "react";

// Sumber kebenaran client-side TUNGGAL untuk status engine, dipakai bareng
// oleh EngineToggle (tombol asli, tidak diubah desain/aksinya) dan
// CursorGlow + teks status -- supaya semuanya berubah SEKETIKA begitu tombol
// diklik, tidak perlu menunggu router.refresh() dari server selesai dulu
// (itu tetap jalan di belakang layar untuk data lain seperti leads/stats).
const EngineStateContext = createContext(null);

export function EngineStateProvider({ initialEnabled, children }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  return (
    <EngineStateContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </EngineStateContext.Provider>
  );
}

export function useEngineState() {
  return useContext(EngineStateContext);
}
