// Scheduler/Uptime Agent -- lapisan pencatatan "job ini beneran jalan atau
// tidak" untuk tiap cron job (scrape, wa-followup, email-followup,
// snapshot-stats). Disimpan di tab JobHealth (1 baris per jobName, upsert),
// dibaca oleh /api/cron/uptime-check untuk deteksi silent failure (cron
// yang gagal jalan/error tanpa ketahuan) dan ditampilkan di dashboard.

export async function recordJobRun(jobName, { status, error, meta } = {}) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url || !secret) return; // jangan sampai kegagalan LOGGING menggagalkan cron itu sendiri

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: "recordJobRun",
        jobName,
        status: status || "",
        error: error ? String(error).slice(0, 500) : "",
        meta: meta || "",
        secret,
      }),
    });
  } catch {
    // Best-effort -- kalau pencatatan health-nya sendiri gagal (mis. Apps
    // Script lagi down), itu tidak boleh menjadikan cron job UTAMA gagal juga.
  }
}

export async function fetchJobHealth() {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  const res = await fetch(`${url}?secret=${encodeURIComponent(secret)}&resource=jobHealth`, { method: "GET" });
  if (!res.ok) throw new Error("Gagal membaca status kesehatan job.");

  const data = await res.json();
  if (data.ok === false) throw new Error(data.error ?? "Gagal membaca status kesehatan job.");
  return data.jobs ?? [];
}
