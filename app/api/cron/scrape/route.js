import { fetchSites, updateSiteStats } from "@/lib/sites";
import { scanSite } from "@/lib/scraper";
import { getEngineState } from "@/lib/engine";
import { validateScanResult } from "@/lib/schemaValidator";
import { recordJobRun } from "@/lib/jobHealth";
import { getFirecrawlUsage } from "@/lib/firecrawl";
import { addLeadsBatch } from "@/lib/leads";

const JOB_NAME = "scrape";

// Default Next.js/Vercel jauh lebih pendek dari ini -- situs needsManualScrape
// (lewat Firecrawl, yang render JS dan bisa makan 15-30+ detik per halaman)
// butuh jatah lebih lega. 60 = maksimal yang diizinkan paket Vercel Hobby.
export const maxDuration = 60;

// 1 invocation = scan 1 situs saja (bukan seluruh watchlist sekaligus) --
// dijadwalkan jalan berkali-kali sepanjang jam kerja (lihat vercel.json),
// jadi watchlist ke-cover bertahap sepanjang hari tanpa 1 eksekusi jadi
// terlalu lama/berat. Situs bertanda needsManualScrape (pola "Load More"/JS
// berat, lihat detectLoadMoreButton di lib/extractor.js) TETAP ikut rotasi --
// lib/scraper.js otomatis mengarahkan situs itu lewat Firecrawl (yang bisa
// render JS), bukan di-skip permanen lagi.
const PRIORITY_ORDER = { Tinggi: 0, Sedang: 1, Rendah: 2, Baru: 3 };

function pickNextSite(sites) {
  const eligible = sites.filter((s) => s.startUrl);
  if (!eligible.length) return null;

  // Prioritas dulu, lalu di antara yang prioritasnya sama, dahulukan yang
  // PALING LAMA belum di-scan (atau belum pernah sama sekali) -- supaya
  // watchlist ter-cover merata, bukan situs yang sama terus tiap tick.
  eligible.sort((a, b) => {
    const pDiff = (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
    if (pDiff !== 0) return pDiff;
    const aTime = a.lastScanned ? new Date(a.lastScanned).getTime() : 0;
    const bTime = b.lastScanned ? new Date(b.lastScanned).getTime() : 0;
    return aTime - bTime;
  });
  return eligible[0];
}

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Jadwal cron ini tetap jalan seperti biasa terlepas dari status engine --
  // yang membedakan cuma apakah tick ini benar-benar ngerjain sesuatu atau
  // no-op. Ini yang membuat tombol "Mulai/Stop" di dashboard bisa instan
  // (cuma toggle 1 flag), bukan harus daftar/hapus jadwal cron sungguhan.
  const engineEnabled = await getEngineState();
  if (!engineEnabled) {
    await recordJobRun(JOB_NAME, { status: "skipped", meta: "engine off" });
    return Response.json({ ok: true, skipped: true, reason: "Engine sedang mati (belum diaktifkan dari dashboard)." });
  }

  const sites = await fetchSites();
  const site = pickNextSite(sites);
  if (!site) {
    await recordJobRun(JOB_NAME, { status: "skipped", meta: "no eligible site" });
    return Response.json({ ok: true, message: "Tidak ada situs eligible untuk di-scan (watchlist kosong atau semua perlu manual)." });
  }

  // Situs needsManualScrape lewat Firecrawl (lib/scraper.js) -- cek kuota
  // bulanan SEBELUM benar-benar mulai scan, bukan sesudahnya. scanSite()
  // sendiri menelan error per-halaman (try/catch di dalamnya, supaya 1
  // halaman gagal tidak menggagalkan seluruh scan situs), jadi kalau
  // dibiarkan, kegagalan "kuota habis" akan diam-diam jadi hasil kosong
  // (lastScanned ikut ke-update seolah beneran sudah di-scan) alih-alih
  // ketahuan jelas di sini.
  if (site.needsManualScrape) {
    const cap = Number(process.env.FIRECRAWL_MONTHLY_CAP || 900);
    const usage = await getFirecrawlUsage();
    if (usage.used >= cap) {
      const reason = `Kuota Firecrawl bulan ini sudah tercapai (${usage.used}/${cap}) -- situs "${site.domain}" (butuh Firecrawl) ditunda sampai bulan depan.`;
      await recordJobRun(JOB_NAME, { status: "skipped", meta: reason });
      return Response.json({ ok: true, skipped: true, domain: site.domain, reason });
    }
  }

  let result;
  try {
    result = await scanSite(site);
  } catch (err) {
    // Tetap catat lastScanned walau gagal total -- supaya situs ini tidak
    // terus-menerus "dipilih duluan" tiap tick karena dianggap paling lama
    // belum di-scan (lihat pickNextSite).
    await updateSiteStats(site.domain, { jobsFound: 0, successRate: 0 });
    await recordJobRun(JOB_NAME, { status: "error", error: err, meta: site.domain });
    return Response.json({ ok: false, domain: site.domain, error: String(err) }, { status: 502 });
  }

  // Schema Validator -- cek hasil scan SEBELUM dianggap "sukses begitu saja".
  // site (dari fetchSites di atas) masih punya successRate scan SEBELUMNYA di
  // sini, dipakai sebagai baseline pembanding.
  const validation = validateScanResult(site, result);
  if (validation.issues.length) {
    // console.warn (bukan .error) -- ini bukan kegagalan cron-nya, tapi sinyal
    // kualitas data yang perlu ditindaklanjuti manual. Prefix [SchemaValidator]
    // supaya gampang di-grep di Vercel logs.
    console.warn(`[SchemaValidator] ${site.domain}:`, validation.issues.join(" | "));
  }

  await updateSiteStats(site.domain, {
    jobsFound: result.jobsFound,
    successRate: result.successRate,
    needsManualScrape: result.needsManualScrape,
    schemaIssue: validation.schemaIssue,
  });

  // Kirim SEMUA lead yang lolos filter dalam 1 panggilan batch (bukan 1
  // request /api/lead per lead seperti sebelumnya) -- untuk 15 lead itu tadinya
  // 15 round-trip Apps Script TERPISAH, masing-masing men-scan ulang semua
  // LeadID yang ada. Salah satu penyebab utama scrape lambat/kena timeout,
  // lihat catatan di action "addLeadsBatch" Apps Script.
  let leadsSent = 0;
  if (result.leads.length) {
    try {
      const batchResult = await addLeadsBatch(
        result.leads.map((lead) => ({ name: lead.company, whatsapp: lead.whatsapp || "", email: lead.email || "" })),
        // Link ke HOMEPAGE situs sumber (bukan link halaman lowongan
        // spesifiknya) -- ini yang jadi isi kolom "source" di sheet, dan
        // domainnya dipakai Apps Script untuk bikin inisial LeadID (mis.
        // dealls.com -> "DS").
        `https://${site.domain}`
      );
      leadsSent = batchResult.added;
    } catch (err) {
      console.error(`[scrape] Gagal kirim batch lead untuk ${site.domain}:`, String(err));
    }
  }

  await recordJobRun(JOB_NAME, {
    status: validation.issues.length ? "ok-with-warnings" : "ok",
    error: validation.issues.length ? validation.schemaIssue : "",
    meta: `${site.domain} | jobsFound=${result.jobsFound} leadsSent=${leadsSent}`,
  });

  return Response.json({
    ok: true,
    domain: site.domain,
    jobsFound: result.jobsFound,
    successRate: result.successRate,
    needsManualScrape: result.needsManualScrape,
    leadsSent,
    schemaIssue: validation.schemaIssue || null,
  });
}
