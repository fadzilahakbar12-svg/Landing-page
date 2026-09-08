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
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
      >
        + Tambah Situs
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://loker-yang-anda-temukan.id"
        className="w-64 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {status === "loading" ? "..." : "Tambah"}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setError(""); }}
        className="text-sm text-zinc-500 hover:text-zinc-800"
      >
        Batal
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
