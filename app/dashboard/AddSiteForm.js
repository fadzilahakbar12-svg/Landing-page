"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddSiteForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const domain = value.trim();
    if (!domain) return;

    setStatus("loading");
    setError("");

    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Gagal menambah situs.");

      setValue("");
      setOpen(false);
      setStatus("idle");
      router.refresh(); // muat ulang data server component, termasuk tabel Performa Situs
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="db-add-site-btn">
        + Tambah Situs
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="db-add-site-form">
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://loker-yang-anda-temukan.id"
      />
      <button type="submit" disabled={status === "loading"} className="db-add-site-submit">
        {status === "loading" ? "..." : "Tambah"}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setError(""); }}
        className="db-add-site-cancel"
      >
        Batal
      </button>
      {error && <span className="db-add-site-error">{error}</span>}
    </form>
  );
}
