import { parseHTML } from "linkedom";
import { collectJobLinksFromDoc, findNextPageUrl, detectLoadMoreButton, extractJobData } from "./extractor";
import { fetchHtmlViaFirecrawl } from "./firecrawl";

// Dibatasi kecil dengan sengaja -- 1 invocation cron cuma scan 1 situs (lihat
// app/api/cron/scrape/route.js), jadi tiap langkah harus cepat & tidak
// mendekati batas waktu eksekusi function serverless.
const MAX_LISTING_PAGES = 2;
const MAX_DETAIL_PAGES = 15;
const FETCH_TIMEOUT_MS = 10000;

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

// Scan 1 situs: kumpulkan link lowongan dari listing (maks MAX_LISTING_PAGES
// halaman), lalu ambil data (company/WA/email) dari maks MAX_DETAIL_PAGES
// link pertama. Sama persis logic-nya dengan Auto-Scan + Ambil Data di
// BarScraper -- cuma dijalankan di server, tanpa browser.
export async function scanSite(site) {
  const startUrl = site.startUrl;
  if (!startUrl) throw new Error(`Situs "${site.domain}" belum punya startUrl.`);

  const useFirecrawl = !!site.needsManualScrape;

  const visited = new Set();
  const jobLinks = new Set();
  let currentUrl = startUrl;
  let needsManualScrape = false;
  let pagesVisited = 0;
  let listingFetchFailed = false;

  while (currentUrl && pagesVisited < MAX_LISTING_PAGES && !visited.has(currentUrl)) {
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

  const jobLinksArr = Array.from(jobLinks).slice(0, MAX_DETAIL_PAGES);
  const leads = [];
  let successCount = 0;

  for (const link of jobLinksArr) {
    try {
      const html = await fetchHtml(link, useFirecrawl);
      const doc = parseDoc(html);
      const data = extractJobData(doc, link);
      if (data.company && (data.whatsapp || data.email)) {
        successCount++;
        leads.push(data);
      }
    } catch (err) {
      // Halaman detail gagal diambil (timeout/block/kuota Firecrawl habis) --
      // lewati, tidak fatal untuk keseluruhan scan situs ini.
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
