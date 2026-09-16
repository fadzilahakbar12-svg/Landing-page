// Firecrawl -- CUMA dipakai sebagai pengambil HTML untuk situs yang ditandai
// site.needsManualScrape (JS-heavy / pagination "Load More" yang fetch()
// biasa di lib/scraper.js tidak bisa tembus). Sekali HTML-nya di tangan,
// diproses lagi lewat lib/extractor.js yang sama persis dengan situs biasa --
// Firecrawl TIDAK menggantikan logic ekstraksi kontak kita.
//
// Dijaga tetap di free tier (1000 credit/bulan) lewat penghitung pemakaian
// di Apps Script (PropertiesService, reset otomatis tiap bulan) -- begitu
// kepakai >= FIRECRAWL_MONTHLY_CAP, panggilan berikutnya ditolak SEBELUM
// benar-benar hit API Firecrawl (bukan nunggu error dari mereka).
export async function getFirecrawlUsage() {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url || !secret) return { month: null, used: 0 };

  const res = await fetch(`${url}?secret=${encodeURIComponent(secret)}&resource=firecrawlUsage`, { method: "GET" });
  if (!res.ok) return { month: null, used: 0 };
  const data = await res.json();
  if (data.ok === false) return { month: null, used: 0 };
  return { month: data.month, used: data.used };
}

async function incrementFirecrawlUsage() {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url || !secret) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "incrementFirecrawlUsage", secret }),
  }).catch(() => {}); // pencatatan gagal tidak boleh menggagalkan scan-nya sendiri
}

const FETCH_TIMEOUT_MS = 20000; // Firecrawl render JS, wajar lebih lambat dari fetch() biasa

// Melempar error kalau: API key belum diset, kuota bulanan sudah tercapai,
// atau Firecrawl sendiri gagal (situs down, timeout render, dst) -- caller
// (lib/scraper.js) yang memutuskan bagaimana menanganinya (skip situs ini).
export async function fetchHtmlViaFirecrawl(pageUrl) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY belum diset.");

  const cap = Number(process.env.FIRECRAWL_MONTHLY_CAP || 900);
  const usage = await getFirecrawlUsage();
  if (usage.used >= cap) {
    throw new Error(`Kuota Firecrawl bulan ini sudah tercapai (${usage.used}/${cap}) -- coba lagi bulan depan.`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: pageUrl, formats: ["html"] }), // formats:["html"] = 1 credit, tidak minta markdown/json ekstra
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Firecrawl error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const html = data?.data?.html;
  if (!html) throw new Error("Firecrawl tidak mengembalikan HTML.");

  await incrementFirecrawlUsage(); // dihitung SETELAH sukses -- percobaan gagal tidak makan kuota
  return html;
}
