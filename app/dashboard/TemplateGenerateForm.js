"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TemplateGenerateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState("whatsapp");
  const [stage, setStage] = useState("new");
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setError("");

    try {
      const res = await fetch("/api/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, stage }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Gagal generate template.");

      setOpen(false);
      setStatus("idle");
      router.refresh(); // muat ulang tabel Template dengan hasil baru
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="db-add-site-btn">
        ✨ Generate Template Baru
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="db-add-site-form">
      <select value={channel} onChange={(e) => setChannel(e.target.value)}>
        <option value="whatsapp">WhatsApp</option>
        <option value="email">Email</option>
      </select>
      <select value={stage} onChange={(e) => setStage(e.target.value)}>
        <option value="new">New (pesan pertama)</option>
        <option value="followup">Follow up</option>
      </select>
      <button type="submit" disabled={status === "loading"} className="db-add-site-submit">
        {status === "loading" ? "Generating..." : "Generate"}
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
