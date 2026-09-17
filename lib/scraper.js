import { parseHTML } from "linkedom";
import { collectJobLinksFromDoc, findNextPageUrl, detectLoadMoreButton, extractJobData } from "./extractor";
import { fetchHtmlViaFirecrawl } from "./firecrawl";

// Dibatasi kecil dengan sengaja -- 1 invocation cron cuma scan 1 situs (lihat
// app/api/cron/scrape/route.js), jadi tiap langkah harus cepat & tidak
// mendekati batas waktu eksekusi function serverless.
const MAX_LISTING_PAGES = 2;
const MAX_DETAIL_PAGES = 15;
const FETCH_TIMEOUT_MS = 10000;

// Firecrawl RENDER halaman (bukan cuma fetch teks) -- diukur langsung lewat
// tes nyata, 1 halaman bisa makan 15-30+ detik. Fungsi ini juga punya batas
// waktu eksekusi (lihat maxDuration di app/api/cron/scrape/route.js, maksimal
// 60 detik di paket Vercel Hobby) -- kalau dipaksa scan sebanyak situs biasa
// (MAX_LISTING_PAGES/MAX_DETAIL_PAGES di atas), gampang kepotong paksa di
// tengah jalan. Jadi untuk situs yang lewat Firecrawl, jatahnya jauh lebih
// kecil per giliran -- situs itu tercakup bertahap lewat beberapa kali cron
// jalan, bukan sekaligus habis.
const MAX_LISTING_PAGES_FIRECRAWL = 1;
const MAX_DETAIL_PAGES_FIRECRAWL = 3;

async function fetchDirect(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadsBot/1.0; +auto-scraper)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// useFirecrawl: situs bertanda needsManualScrape (JS-heavy/"Load More") --
// fetch() polos tidak bisa render JS-nya, jadi diambil lewat Firecrawl
// (lib/firecrawl.js) yang render halamannya beneran. Situs lain tetap pakai
// fetch() langsung seperti biasa (gratis, tidak makan kuota Firecrawl).
async function fetchHtml(url, useFirecrawl) {
  return useFirecrawl ? fetchHtmlViaFirecrawl(url) : fetchDirect(url);
}

function parseDoc(html) {
  const { document } = parseHTML(html);
  return document;
}

// Halaman detail lowongan itu SALING BEBAS (fetch link A tidak butuh hasil
// link B) -- sebelumnya diambil satu-satu berurutan (await di dalam
// for-loop), jadi 15 halaman @ ~1-2 detik = 15-30 detik TERBUANG cuma
// nunggu giliran, salah satu penyebab scrape kena FUNCTION_INVOCATION_TIMEOUT
// (kejadian nyata di dealls.com, bukan teori). limit=5 -- jangan sekaligus
// SEMUA (bisa dianggap serangan/flood oleh situs target), cukup beberapa
// jalan bersamaan.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Scan 1 situs: kumpulkan link lowongan dari listing (maks MAX_LISTING_PAGES
// halaman), lalu ambil data (company/WA/email) dari maks MAX_DETAIL_PAGES
// link pertama. Sama persis logic-nya dengan Auto-Scan + Ambil Data di
// BarScraper -- cuma dijalankan di server, tanpa browser.
export async function scanSite(site) {
  const startUrl = site.startUrl;
  if (!startUrl) throw new Error(`Situs "${site.domain}" belum punya startUrl.`);

  const useFirecrawl = !!site.needsManualScrape;
  const maxListingPages = useFirecrawl ? MAX_LISTING_PAGES_FIRECRAWL : MAX_LISTING_PAGES;
  const maxDetailPages = useFirecrawl ? MAX_DETAIL_PAGES_FIRECRAWL : MAX_DETAIL_PAGES;

  const visited = new Set();
  const jobLinks = new Set();
  let currentUrl = startUrl;
  let needsManualScrape = false;
  let pagesVisited = 0;
  let listingFetchFailed = false;

  while (currentUrl && pagesVisited < maxListingPages && !visited.has(currentUrl)) {
    visited.add(currentUrl);
    let html;
    try {
      html = await fetchHtml(currentUrl, useFirecrawl);
    } catch (err) {
      if (pagesVisited === 0) listingFetchFailed = true; // gagal dari awal -- situs down/block bot
      break;
    }
    const doc = parseDoc(html);
    collectJobLinksFromDoc(doc, currentUrl).forEach((l) => jobLinks.add(l));
    // Kalau sudah lewat Firecrawl (render JS) tapi TETAP kedeteksi tombol
    // "Load More", berarti Firecrawl-nya cuma render sekali (tanpa klik) --
    // situs ini tetap butuh Firecrawl terus (jangan dianggap "sekarang bisa
    // fetch biasa"), jadi flag ini dibiarkan seperti apa adanya.
    if (detectLoadMoreButton(doc)) needsManualScrape = true;
    pagesVisited++;

    const next = findNextPageUrl(doc, currentUrl);
    if (!next || visited.has(next)) break;
    currentUrl = next;
  }

  const jobLinksArr = Array.from(jobLinks).slice(0, maxDetailPages);

  // Firecrawl TETAP berurutan (concurrency 1) -- itu API pihak ketiga
  // berbayar/pakai kuota, dan MAX_DETAIL_PAGES_FIRECRAWL sudah sengaja
  // kecil (3), jadi tidak butuh diparalel. fetch() langsung boleh sampai
  // 5 sekaligus, jauh lebih murah/cepat.
  const detailConcurrency = useFirecrawl ? 1 : 5;
  const detailResults = await mapWithConcurrency(jobLinksArr, detailConcurrency, async (link) => {
    try {
      const html = await fetchHtml(link, useFirecrawl);
      const doc = parseDoc(html);
      return extractJobData(doc, link);
    } catch (err) {
      // Halaman detail gagal diambil (timeout/block/kuota Firecrawl habis) --
      // lewati, tidak fatal untuk keseluruhan scan situs ini.
      return null;
    }
  });

  const leads = [];
  let successCount = 0;
  for (const data of detailResults) {
    if (data && data.company && (data.whatsapp || data.email)) {
      successCount++;
      leads.push(data);
    }
  }

  return {
    jobsFound: jobLinksArr.length,
    successRate: jobLinksArr.length ? successCount / jobLinksArr.length : 0,
    needsManualScrape: needsManualScrape || useFirecrawl, // sekali butuh Firecrawl, tetap butuh Firecrawl
    listingFetchFailed,
    leads,
  };
}
