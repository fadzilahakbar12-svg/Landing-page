"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DedupeLeadsButton() {
  const router = useRouter();
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState(null);

  async function handleClick() {
    setStatus("loading");
    setError("");
    setLastResult(null);

    try {
      const res = await fetch("/api/leads/dedupe", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Gagal membersihkan duplikat.");

      setLastResult(data.removedCount);
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={status === "loading"}
        className="db-btn-ghost"
        style={{ cursor: "pointer", opacity: status === "loading" ? 0.6 : 1 }}
      >
        🧹 {status === "loading" ? "Membersihkan..." : "Bersihkan Duplikat"}
      </button>
      {lastResult !== null && (
        <span className="db-hint">
          {lastResult === 0 ? "Tidak ada duplikat." : `${lastResult} duplikat dihapus.`}
        </span>
      )}
      {error && <span className="db-hint" style={{ color: "var(--db-alert)" }}>{error}</span>}
    </>
  );
}
