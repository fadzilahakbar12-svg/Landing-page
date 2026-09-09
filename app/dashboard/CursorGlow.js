"use client";

import { useEffect, useRef } from "react";

// Latar neon interaktif yang mengikuti kursor. Warnanya (hijau/merah)
// SEPENUHNYA diatur lewat CSS var yang di-scope pada [data-engine] di elemen
// <main class="db-panel"> (lihat page.js) -- komponen ini sendiri tidak
// tahu/peduli status engine, cuma menggambar & menggerakkan lapisan glow.
// Sinkron otomatis dengan tombol Start/Stop Engine yang sudah ada lewat
// router.refresh() (lihat EngineToggle.js). TIDAK ada kontrol baru di sini.
export default function CursorGlow() {
  const rootRef = useRef(null);
  const glowARef = useRef(null);
  const glowBRef = useRef(null);
  const dotRef = useRef(null);
  const posRef = useRef({ mx: 0, my: 0, bx: 0, by: 0 });

  useEffect(() => {
    const pos = posRef.current;
    pos.mx = pos.bx = window.innerWidth / 2;
    pos.my = pos.by = window.innerHeight / 2;

    function handleMove(e) {
      pos.mx = e.clientX;
      pos.my = e.clientY;
      if (glowARef.current) glowARef.current.style.transform = `translate(${pos.mx}px, ${pos.my}px)`;
      if (dotRef.current) dotRef.current.style.transform = `translate(${pos.mx}px, ${pos.my}px)`;

      // Partikel di-append ke root komponen ini (BUKAN document.body) supaya
      // tetap mewarisi variabel warna --glow-1/--accent yang di-scope lewat
      // [data-engine] pada root -- kalau ditaruh di body, warnanya tidak
      // ikut berubah saat engine dimatikan.
      if (Math.random() > 0.6 && rootRef.current) {
        const p = document.createElement("div");
        p.className = "db-glow-particle";
        p.style.left = `${pos.mx + (Math.random() * 16 - 8)}px`;
        p.style.top = `${pos.my + (Math.random() * 16 - 8)}px`;
        rootRef.current.appendChild(p);
        setTimeout(() => p.remove(), 950);
      }
    }

    let raf;
    function animateB() {
      pos.bx += (pos.mx - pos.bx) * 0.08;
      pos.by += (pos.my - pos.by) * 0.08;
      if (glowBRef.current) glowBRef.current.style.transform = `translate(${pos.bx}px, ${pos.by}px)`;
      raf = requestAnimationFrame(animateB);
    }
    animateB();

    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="db-glow-root" ref={rootRef}>
      <div className="db-glow-a" ref={glowARef} />
      <div className="db-glow-b" ref={glowBRef} />
      <div className="db-glow-dot" ref={dotRef} />
    </div>
  );
}
