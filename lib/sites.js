// Watchlist situs untuk di-scan (Fase 4) -- disimpan di tab "SiteStats"
// terpisah dari leads (lihat google-apps-script-updated.gs). Pola fetch/POST
// di sini sengaja sama dengan lib/leads.js supaya konsisten.

export async function fetchSites() {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  const res = await fetch(`${url}?secret=${encodeURIComponent(secret)}&resource=sites`, { method: "GET" });
  if (!res.ok) throw new Error("Gagal membaca watchlist situs dari spreadsheet.");

  const data = await res.json();
  if (data.ok === false) throw new Error(data.error ?? "Gagal membaca watchlist situs.");
  return data.sites ?? [];
}

// "url" harus URL LENGKAP ke halaman listing (mis. "https://situs.id/loker"),
// bukan cuma domain -- itu yang dipakai scraper (Fase 5) sebagai titik mulai.
export async function addSite(url_) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "addSite", url: url_, secret }),
  });
  const data = await res.json();
  if (data.ok === false) throw new Error(data.error ?? "Gagal menambah situs.");
  return data;
}

// Dipanggil oleh proses scraping (Fase 5) setelah selesai scan 1 situs.
export async function updateSiteStats(domain, { jobsFound, successRate, needsManualScrape } = {}) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url) throw new Error("GOOGLE_SHEETS_WEBHOOK_URL belum diset.");
  if (!secret) throw new Error("APPS_SCRIPT_SECRET belum diset.");

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "updateSiteStats", domain, jobsFound, successRate, needsManualScrape, secret }),
  });
}
