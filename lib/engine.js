// Saklar on/off tunggal untuk seluruh engine (scrape + follow-up WA + email).
// Dicek di AWAL tiap cron (/api/cron/scrape, wa-followup, email-followup) --
// jadwal cron tetap jalan seperti biasa, tapi kalau engine "off" cron cuma
// no-op (tidak scrape/kirim apapun). Tombol "Mulai/Stop" di dashboard cuma
// mengubah flag ini, tidak menjalankan proses apapun secara langsung.

export async function getEngineState() {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  const res = await fetch(`${url}?secret=${encodeURIComponent(secret)}&resource=engine`, { method: "GET" });
  if (!res.ok) throw new Error("Gagal membaca status engine.");
  const data = await res.json();
  if (data.ok === false) throw new Error(data.error ?? "Gagal membaca status engine.");
  return !!data.enabled;
}

export async function setEngineState(enabled) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "setEngineState", enabled: !!enabled, secret }),
  });
  const data = await res.json();
  if (data.ok === false) throw new Error(data.error ?? "Gagal mengubah status engine.");
  return !!data.enabled;
}
