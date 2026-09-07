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
      <div className="mt-8 w-full max-w-sm rounded-xl border border-green-200 bg-green-50 px-6 py-5 text-center">
        <p className="font-semibold text-green-800">Terima kasih!</p>
        <p className="mt-1 text-sm text-green-700">
          Data kamu sudah kami terima. Kami akan segera menghubungi kamu.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 flex w-full max-w-sm flex-col gap-3 text-left"
    >
      {/* Honeypot — hidden from real visitors via CSS, bots fill every field blindly */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
        aria-hidden="true"
      />

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-zinc-700">
          Nama
        </label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="Nama lengkap kamu"
          className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label htmlFor="whatsapp" className="mb-1 block text-sm font-medium text-zinc-700">
          Nomor WhatsApp
        </label>
        <input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          placeholder="08xxxxxxxxxx"
          className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="kamu@email.com"
          className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={status === "loading"}
        className="mt-2 rounded-full bg-blue-600 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
      >
        {status === "loading" ? "Mengirim..." : "Gabung Sekarang"}
      </button>
    </form>
  );
}
