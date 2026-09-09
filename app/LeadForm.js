"use client";

import { useState } from "react";

export default function LeadForm() {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const form = e.target;
    const name = form.name.value.trim();
    const whatsapp = form.whatsapp.value.trim();
    const email = form.email.value.trim();
    const website = form.website.value; // honeypot — real visitors never fill this

    if (!name || !whatsapp || !email) {
      setError("Semua kolom wajib diisi ya.");
      return;
    }

    setStatus("loading");

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, whatsapp, email, website }),
      });

      if (!res.ok) throw new Error("Gagal mengirim data.");

      setStatus("done");
      form.reset();
    } catch {
      setStatus("idle");
      setError("Gagal mengirim data. Coba lagi ya.");
    }
  }

  if (status === "done") {
    return (
      <div className="hm-done">
        <p>Terima kasih!</p>
        <p>Data kamu sudah kami terima. Kami akan segera menghubungi kamu.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="hm-form">
      {/* Honeypot — hidden from real visitors via CSS, bots fill every field blindly */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: "absolute", left: "-9999px", width: 0, height: 0, opacity: 0 }}
        aria-hidden="true"
      />

      <div className="hm-field">
        <label htmlFor="name">Nama</label>
        <input id="name" name="name" type="text" placeholder="Nama lengkap kamu" />
      </div>

      <div className="hm-field">
        <label htmlFor="whatsapp">Nomor WhatsApp</label>
        <input id="whatsapp" name="whatsapp" type="tel" placeholder="08xxxxxxxxxx" />
      </div>

      <div className="hm-field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" placeholder="kamu@email.com" />
      </div>

      {error && <p className="hm-error">{error}</p>}

      <button type="submit" disabled={status === "loading"} className="hm-submit">
        {status === "loading" ? "Mengirim..." : "Gabung Sekarang"}
      </button>
    </form>
  );
}
