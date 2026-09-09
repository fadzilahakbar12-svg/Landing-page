// Riwayat snapshot harian -- dipakai untuk perbandingan day-to-day/
// week-on-week/monthly di dashboard. 1 baris per tanggal di tab StatsHistory,
// ditulis sekali/hari oleh /api/cron/snapshot-stats.

export async function fetchStatsHistory() {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  const res = await fetch(`${url}?secret=${encodeURIComponent(secret)}&resource=statsHistory`, { method: "GET" });
  if (!res.ok) throw new Error("Gagal membaca riwayat statistik.");
  const data = await res.json();
  if (data.ok === false) throw new Error(data.error ?? "Gagal membaca riwayat statistik.");
  return data.history ?? [];
}

export async function recordStatsSnapshot(snapshot) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "recordStatsSnapshot", ...snapshot, secret }),
  });
  const data = await res.json();
  if (data.ok === false) throw new Error(data.error ?? "Gagal mencatat snapshot statistik.");
  return data;
}
