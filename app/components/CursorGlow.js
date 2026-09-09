"use client";

import { useEffect, useRef } from "react";

// Versi reusable dari efek glow di dashboard, TANPA logika on/off engine --
// dipakai di halaman publik (homepage, /cara-kerja) yang tidak punya konsep
// "engine". Warnanya diatur lewat CSS var --cg-1/--cg-2/--cg-accent yang
// didefinisikan di stylesheet masing-masing halaman (lihat cara-kerja/
// styles.css dan home.css), supaya tiap halaman bisa pakai token warnanya
// sendiri tanpa komponen ini perlu tahu apa-apa soal tema.
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

      if (Math.random() > 0.6 && rootRef.current) {
        const p = document.createElement("div");
        p.className = "cg-particle";
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
    <div className="cg-root" ref={rootRef}>
      <div className="cg-a" ref={glowARef} />
      <div className="cg-b" ref={glowBRef} />
      <div className="cg-dot" ref={dotRef} />
    </div>
  );
}
