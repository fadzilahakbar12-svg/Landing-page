// Verifikasi lisensi extension BarScraper -- TERBUKA/transparan, tampil di
// popup extension (bukan mekanisme tersembunyi). Cuma mencatat device ID
// acak + versi extension, untuk menghitung jumlah device aktif vs lisensi
// yang diterbitkan. TIDAK PERNAH menyentuh data leads/scrape apapun --
// disimpan di tab sheet TERPISAH dari leads ("LicenseCheckins").

export async function fetchLicenseCheckins() {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  const res = await fetch(`${url}?secret=${encodeURIComponent(secret)}&resource=licenseCheckins`, { method: "GET" });
  if (!res.ok) throw new Error("Gagal membaca license checkins.");
  const data = await res.json();
  if (data.ok === false) throw new Error(data.error ?? "Gagal membaca license checkins.");
  return data.checkins ?? [];
}

export async function recordLicenseCheckin({ deviceId, version }) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "recordLicenseCheckin", deviceId, version, secret }),
  });
  const data = await res.json();
  if (data.ok === false) throw new Error(data.error ?? "Gagal mencatat license checkin.");
  return data;
}
